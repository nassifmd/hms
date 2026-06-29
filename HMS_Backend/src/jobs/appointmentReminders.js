/**
 * Appointment Reminders Job
 * Sends reminders for upcoming appointments via SMS and email
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const notificationService = require('../services/notificationService');
const { queueService } = require('../services/queueService');

class AppointmentRemindersJob {
  constructor() {
    this.name = 'appointment-reminders';
    this.schedule = '*/15 * * * *'; // Run every 15 minutes
    this.initialized = false;
  }

  /**
   * Initialize the job
   */
  async initialize() {
    if (this.initialized) return;
    
    logger.info(`Initializing job: ${this.name}`);
    
    // Schedule the job
    cron.schedule(this.schedule, async () => {
      await this.execute();
    });
    
    this.initialized = true;
    logger.info(`Job ${this.name} scheduled with pattern: ${this.schedule}`);
  }

  /**
   * Execute the job
   */
  async execute() {
    const startTime = Date.now();
    logger.info(`Starting ${this.name} job`);

    try {
      const reminders = await this.getPendingReminders();
      
      if (reminders.length === 0) {
        logger.info(`No pending reminders found`);
        return;
      }

      logger.info(`Found ${reminders.length} pending reminders`);

      const results = {
        total: reminders.length,
        sent: 0,
        failed: 0,
        details: []
      };

      // Process reminders in batches
      const batchSize = 50;
      for (let i = 0; i < reminders.length; i += batchSize) {
        const batch = reminders.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch);
        
        results.sent += batchResults.sent;
        results.failed += batchResults.failed;
        results.details.push(...batchResults.details);
        
        // Small delay between batches
        if (i + batchSize < reminders.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed`, {
        duration: `${duration}ms`,
        ...results
      });

      // Log summary to database
      await this.logJobExecution(startTime, duration, results);

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
    }
  }

  /**
   * Get pending appointment reminders
   */
  async getPendingReminders() {
    const result = await db.query(`
      SELECT 
        r.*,
        a.id as appointment_id,
        a.appointment_number,
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.patient_id,
        a.doctor_id,
        a.department_id,
        a.status as appointment_status,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.phone_number as patient_phone,
        p.email as patient_email,
        p.preferred_language,
        d.first_name as doctor_first_name,
        d.last_name as doctor_last_name,
        d.specialization,
        dept.department_name,
        f.facility_name,
        f.phone_number as facility_phone,
        f.address as facility_address
      FROM appointment_reminders r
      JOIN appointments a ON r.appointment_id = a.id
      JOIN patients p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      JOIN departments dept ON a.department_id = dept.id
      JOIN facilities f ON a.facility_id = f.id
      WHERE r.status = 'pending'
        AND r.scheduled_time <= NOW() + INTERVAL '5 minutes'
        AND r.scheduled_time >= NOW() - INTERVAL '60 minutes'
        AND a.status IN ('scheduled', 'confirmed')
      ORDER BY r.scheduled_time
      LIMIT 500
    `);

    return result.rows;
  }

  /**
   * Process a batch of reminders
   */
  async processBatch(reminders) {
    const results = {
      sent: 0,
      failed: 0,
      details: []
    };

    const promises = reminders.map(async (reminder) => {
      try {
        const sent = await this.sendReminder(reminder);
        
        if (sent) {
          await this.markReminderSent(reminder.id);
          results.sent++;
          results.details.push({
            id: reminder.id,
            appointmentId: reminder.appointment_id,
            type: reminder.reminder_type,
            status: 'sent'
          });
        } else {
          results.failed++;
          results.details.push({
            id: reminder.id,
            appointmentId: reminder.appointment_id,
            type: reminder.reminder_type,
            status: 'failed'
          });
        }
      } catch (error) {
        logger.error(`Failed to send reminder ${reminder.id}:`, error);
        results.failed++;
        results.details.push({
          id: reminder.id,
          appointmentId: reminder.appointment_id,
          type: reminder.reminder_type,
          status: 'error',
          error: error.message
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Send reminder based on type
   */
  async sendReminder(reminder) {
    const patientName = `${reminder.patient_first_name} ${reminder.patient_last_name}`;
    const doctorName = `${reminder.doctor_first_name} ${reminder.doctor_last_name}`;
    const appointmentDate = new Date(reminder.appointment_date).toLocaleDateString('en-GH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const messageData = {
      patientName,
      doctorName,
      department: reminder.department_name,
      date: appointmentDate,
      time: reminder.start_time,
      endTime: reminder.end_time,
      facility: reminder.facility_name,
      facilityPhone: reminder.facility_phone,
      facilityAddress: reminder.facility_address,
      appointmentNumber: reminder.appointment_number,
      confirmationLink: `${process.env.APP_URL}/appointments/${reminder.appointment_id}/confirm`,
      rescheduleLink: `${process.env.APP_URL}/appointments/${reminder.appointment_id}/reschedule`,
      cancelLink: `${process.env.APP_URL}/appointments/${reminder.appointment_id}/cancel`
    };

    let sent = false;

    switch (reminder.reminder_type) {
      case 'email':
        if (reminder.patient_email) {
          await emailService.sendAppointmentReminder(messageData, reminder.patient_email);
          sent = true;
        }
        break;

      case 'sms':
        if (reminder.patient_phone) {
          const smsMessage = this.formatSmsMessage(messageData);
          await smsService.sendSMS(reminder.patient_phone, smsMessage);
          sent = true;
        }
        break;

      case 'push':
        // Send push notification if supported
        await notificationService.send({
          userId: reminder.patient_id,
          type: 'appointment_reminder',
          title: 'Appointment Reminder',
          body: `You have an appointment with Dr. ${reminder.doctor_last_name} tomorrow at ${reminder.start_time}`,
          data: messageData,
          channels: ['push']
        });
        sent = true;
        break;

      case 'in_app':
        await notificationService.send({
          userId: reminder.patient_id,
          type: 'appointment_reminder',
          title: 'Appointment Reminder',
          body: `You have an appointment with Dr. ${reminder.doctor_last_name} on ${appointmentDate} at ${reminder.start_time}`,
          data: messageData,
          channels: ['in_app']
        });
        sent = true;
        break;

      default:
        logger.warn(`Unknown reminder type: ${reminder.reminder_type}`);
    }

    return sent;
  }

  /**
   * Format SMS message
   */
  formatSmsMessage(data) {
    const message = `Reminder: You have an appointment with Dr. ${data.doctorName} on ${data.date} at ${data.time} at ${data.facility}. Reply 1 to confirm, 2 to reschedule, 3 to cancel.`;
    
    // Truncate if too long (SMS limit is 160 characters)
    if (message.length > 160) {
      return message.substring(0, 157) + '...';
    }
    
    return message;
  }

  /**
   * Mark reminder as sent
   */
  async markReminderSent(reminderId) {
    await db.query(`
      UPDATE appointment_reminders 
      SET 
        status = 'sent',
        sent_time = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [reminderId]);
  }

  /**
   * Log job execution
   */
  async logJobExecution(startTime, duration, results) {
    await db.query(`
      INSERT INTO job_executions (
        job_name, start_time, end_time, duration,
        status, results, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      this.name,
      new Date(startTime),
      new Date(),
      duration,
      results.failed === 0 ? 'success' : 'partial',
      JSON.stringify(results)
    ]);
  }
}

// Create and export job instance
const appointmentRemindersJob = new AppointmentRemindersJob();
module.exports = appointmentRemindersJob;