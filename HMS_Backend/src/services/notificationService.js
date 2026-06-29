const emailService = require('./emailService');
const smsService = require('./smsService');
const db = require('../config/database');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

class NotificationService {
  constructor() {
    this.preferences = new Map();
    this.templates = new Map();
    this._systemChannelCache = null;
    this._systemChannelCacheAt = 0;
    this.initialize();
  }

  /**
   * Initialize notification service
   */
  async initialize() {
    try {
      await this.loadPreferences();
      await this.loadTemplates();
      logger.info('Notification service initialized');
    } catch (error) {
      logger.error('Failed to initialize notification service:', error);
    }
  }

  /**
   * Check system_settings to determine which notification channels are enabled.
   * Results are cached for 60 seconds to avoid hitting the DB on every notification.
   */
  async getSystemChannelFlags() {
    const now = Date.now();
    if (this._systemChannelCache && now - this._systemChannelCacheAt < 60_000) {
      return this._systemChannelCache;
    }
    const defaults = { email: true, sms: false };
    try {
      const tableCheck = await db.query("SELECT to_regclass('public.system_settings') AS name");
      if (!tableCheck.rows[0].name) return defaults;

      const result = await db.query(
        `SELECT setting_key, setting_value FROM system_settings
         WHERE setting_key IN ('email_notifications', 'sms_notifications')
         ORDER BY facility_id NULLS LAST`
      );
      for (const row of result.rows) {
        if (row.setting_key === 'email_notifications') defaults.email = row.setting_value === 'true';
        if (row.setting_key === 'sms_notifications') defaults.sms = row.setting_value === 'true';
      }
    } catch (err) {
      logger.warn('Could not read notification system settings, using defaults', { error: err.message });
    }
    this._systemChannelCache = defaults;
    this._systemChannelCacheAt = now;
    return defaults;
  }

  /**
   * Load notification preferences
   */
  async loadPreferences() {
    try {
      // Check if table exists before querying
      const tableCheck = await db.query("SELECT to_regclass('public.notification_preferences')");
      if (!tableCheck.rows[0].to_regclass) {
        logger.warn('notification_preferences table does not exist — skipping preference load');
        return;
      }

      const result = await db.query(`
        SELECT * FROM notification_preferences
        WHERE is_active = true
      `);
      
      for (const row of result.rows) {
        if (!this.preferences.has(row.user_id)) {
          this.preferences.set(row.user_id, []);
        }
        this.preferences.get(row.user_id).push(row);
      }
      
      logger.info(`Loaded ${result.rows.length} notification preferences`);
    } catch (error) {
      logger.error('Failed to load preferences:', error);
    }
  }

  /**
   * Load notification templates
   */
  async loadTemplates() {
    try {
      // Check if table exists before querying
      const tableCheck = await db.query("SELECT to_regclass('public.notification_templates')");
      if (!tableCheck.rows[0].to_regclass) {
        logger.warn('notification_templates table does not exist — skipping template load');
        return;
      }

      const result = await db.query(`
        SELECT * FROM notification_templates
        WHERE is_active = true
      `);
      
      for (const row of result.rows) {
        this.templates.set(row.template_key, row);
      }
      
      logger.info(`Loaded ${result.rows.length} notification templates`);
    } catch (error) {
      logger.error('Failed to load templates:', error);
    }
  }

  /**
   * Send notification
   */
  async send(notification) {
    const {
      userId,
      type,
      title,
      body,
      data = {},
      channels = ['in_app', 'email', 'sms'],
      priority = 'normal',
      expiresAt = null
    } = notification;

    const notificationId = uuidv4();
    const results = [];

    try {
      // Get user preferences
      const userPrefs = this.preferences.get(userId) || [];

      // Check system-level channel flags (admin settings)
      const systemFlags = await this.getSystemChannelFlags();

      // Filter enabled channels (system settings → then user preferences)
      const enabledChannels = channels.filter(channel => {
        // System-level kill switch: if admin disabled email/sms, skip it
        if (channel === 'email' && !systemFlags.email) return false;
        if (channel === 'sms' && !systemFlags.sms) return false;
        // User-level preferences
        const prefs = userPrefs.find(p => p.channel === channel);
        return prefs ? prefs.enabled : true;
      });

      // Send via each enabled channel
      for (const channel of enabledChannels) {
        try {
          const result = await this.sendViaChannel(channel, {
            userId,
            title,
            body,
            data,
            priority,
            notificationId
          });
          results.push({ channel, success: true, result });
        } catch (error) {
          logger.error(`Failed to send via ${channel}:`, error);
          results.push({ channel, success: false, error: error.message });
        }
      }

      // Save to database
      await this.saveNotification({
        id: notificationId,
        userId,
        type,
        title,
        body,
        data,
        channels: enabledChannels,
        priority,
        expiresAt,
        results
      });

      logger.info('Notification sent', {
        notificationId,
        userId,
        type,
        channels: enabledChannels
      });

      return {
        success: true,
        notificationId,
        results
      };
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw new AppError('Failed to send notification', 500, 'NOTIFICATION_FAILED');
    }
  }

  /**
   * Send via specific channel
   */
  async sendViaChannel(channel, notification) {
    const { userId, title, body, data, priority, notificationId } = notification;

    switch (channel) {
      case 'email':
        return this.sendEmail(userId, title, body, data);
      
      case 'sms':
        return this.sendSMS(userId, body, data);
      
      case 'in_app':
        return this.sendInApp(userId, {
          id: notificationId,
          title,
          body,
          data,
          priority,
          timestamp: new Date().toISOString()
        });
      
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }

  /**
   * Send email notification
   */
  async sendEmail(userId, title, body, data) {
    // Get user email
    const user = await db.query(`
      SELECT email, first_name, last_name FROM users WHERE id = $1
    `, [userId]);

    if (!user.rows.length || !user.rows[0].email) {
      throw new Error('User email not found');
    }

    const template = this.templates.get('email_default');
    
    const emailData = {
      name: `${user.rows[0].first_name} ${user.rows[0].last_name}`,
      title,
      body,
      ...data
    };

    return emailService.sendEmail({
      to: user.rows[0].email,
      subject: title,
      template: template?.template_name || 'default',
      data: emailData
    });
  }

  /**
   * Send SMS notification
   */
  async sendSMS(userId, body, data) {
    // Get user phone
    const user = await db.query(`
      SELECT phone_number FROM users WHERE id = $1
    `, [userId]);

    if (!user.rows.length || !user.rows[0].phone_number) {
      throw new Error('User phone number not found');
    }

    // Truncate SMS if too long
    const smsBody = body.length > 160 ? body.substring(0, 157) + '...' : body;

    return smsService.sendSMS(user.rows[0].phone_number, smsBody);
  }

  /**
   * Send in-app notification
   */
  async sendInApp(userId, notification) {
    // Store in Redis for real-time access
    const key = `notifications:${userId}`;
    await redis.lpush(key, notification);
    await redis.ltrim(key, 0, 49); // Keep last 50 notifications

    // Store in database for persistence
    await db.query(`
      INSERT INTO in_app_notifications (
        id, user_id, title, body, data, priority, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      notification.id,
      userId,
      notification.title,
      notification.body,
      JSON.stringify(notification.data),
      notification.priority
    ]);

    return { success: true };
  }

  /**
   * Save notification to database
   */
  async saveNotification(notification) {
    await db.query(`
      INSERT INTO notifications (
        id, user_id, type, title, body, data,
        channels, priority, expires_at, results, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      notification.id,
      notification.userId,
      notification.type,
      notification.title,
      notification.body,
      JSON.stringify(notification.data),
      notification.channels,
      notification.priority,
      notification.expiresAt,
      JSON.stringify(notification.results)
    ]);
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      unreadOnly = false,
      types = []
    } = options;

    let query = `
      SELECT * FROM in_app_notifications
      WHERE user_id = $1
    `;
    const params = [userId];

    if (unreadOnly) {
      query += ` AND read_at IS NULL`;
    }

    if (types.length > 0) {
      query += ` AND type = ANY($${params.length + 1})`;
      params.push(types);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    await db.query(`
      UPDATE in_app_notifications 
      SET read_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [notificationId, userId]);

    // Update Redis cache
    const key = `notifications:${userId}`;
    const notifications = await redis.lrange(key, 0, -1);
    
    for (let i = 0; i < notifications.length; i++) {
      const notif = JSON.parse(notifications[i]);
      if (notif.id === notificationId) {
        notif.read = true;
        await redis.lset(key, i, JSON.stringify(notif));
        break;
      }
    }

    return true;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    await db.query(`
      UPDATE in_app_notifications 
      SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL
    `, [userId]);

    // Update Redis cache
    const key = `notifications:${userId}`;
    const notifications = await redis.lrange(key, 0, -1);
    
    for (let i = 0; i < notifications.length; i++) {
      const notif = JSON.parse(notifications[i]);
      notif.read = true;
      await redis.lset(key, i, JSON.stringify(notif));
    }

    return true;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    const result = await db.query(`
      SELECT COUNT(*) as count
      FROM in_app_notifications
      WHERE user_id = $1 AND read_at IS NULL
    `, [userId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    await db.query(`
      DELETE FROM in_app_notifications
      WHERE id = $1 AND user_id = $2
    `, [notificationId, userId]);

    // Remove from Redis
    const key = `notifications:${userId}`;
    const notifications = await redis.lrange(key, 0, -1);
    
    for (let i = 0; i < notifications.length; i++) {
      const notif = JSON.parse(notifications[i]);
      if (notif.id === notificationId) {
        await redis.lrem(key, 1, notifications[i]);
        break;
      }
    }

    return true;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(userId, preferences) {
    await db.transaction(async (client) => {
      // Deactivate existing preferences
      await client.query(`
        UPDATE notification_preferences 
        SET is_active = false
        WHERE user_id = $1
      `, [userId]);

      // Insert new preferences
      for (const pref of preferences) {
        await client.query(`
          INSERT INTO notification_preferences (
            user_id, channel, type, enabled, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [userId, pref.channel, pref.type, pref.enabled]);
      }
    });

    // Reload preferences
    await this.loadPreferences();

    return preferences;
  }

  /**
   * Get notification templates
   */
  getTemplates() {
    return Array.from(this.templates.entries()).map(([key, value]) => ({
      key,
      ...value
    }));
  }

  /**
   * Create notification template
   */
  async createTemplate(templateData) {
    const result = await db.query(`
      INSERT INTO notification_templates (
        template_key, template_name, subject, body,
        channel, variables, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      templateData.template_key,
      templateData.template_name,
      templateData.subject,
      templateData.body,
      templateData.channel,
      JSON.stringify(templateData.variables || []),
      templateData.is_active !== false
    ]);

    // Reload templates
    await this.loadTemplates();

    return result.rows[0];
  }

  /**
   * Send appointment reminder notification
   */
  async sendAppointmentReminder(appointment, patient, doctor) {
    const title = 'Appointment Reminder';
    const body = `You have an appointment with Dr. ${doctor.last_name} on ${new Date(appointment.appointment_date).toLocaleDateString('en-GH')} at ${appointment.start_time}.`;

    return this.send({
      userId: patient.id,
      type: 'appointment_reminder',
      title,
      body,
      data: { appointment, doctor }
    });
  }

  /**
   * Send lab result notification
   */
  async sendLabResultNotification(patient, labOrder, results) {
    const title = 'Lab Results Ready';
    const body = `Your lab results for order #${labOrder.order_number} are ready.`;

    return this.send({
      userId: patient.id,
      type: 'lab_result',
      title,
      body,
      data: { labOrder, results }
    });
  }

  /**
   * Send payment confirmation notification
   */
  async sendPaymentConfirmation(patient, payment, invoice) {
    const title = 'Payment Confirmed';
    const body = `Payment of GHS ${payment.amount} for invoice #${invoice.invoice_number} has been received.`;

    return this.send({
      userId: patient.id,
      type: 'payment_confirmation',
      title,
      body,
      data: { payment, invoice }
    });
  }

  /**
   * Send prescription ready notification
   */
  async sendPrescriptionReady(patient, prescription) {
    const title = 'Prescription Ready';
    const body = `Your prescription #${prescription.prescription_number} is ready for pickup.`;

    return this.send({
      userId: patient.id,
      type: 'prescription_ready',
      title,
      body,
      data: { prescription }
    });
  }
}

module.exports = new NotificationService();