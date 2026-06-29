/**
 * Inventory Alert Job
 * Monitors inventory levels and sends alerts for low stock and expiring items
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

class InventoryAlertJob {
  constructor() {
    this.name = 'inventory-alert';
    this.schedule = '0 */6 * * *'; // Run every 6 hours
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
      // Check low stock items
      const lowStockItems = await this.getLowStockItems();
      if (lowStockItems.length > 0) {
        logger.info(`Found ${lowStockItems.length} low stock items`);
        await this.processLowStockAlerts(lowStockItems);
      }

      // Check expiring items
      const expiringItems = await this.getExpiringItems();
      if (expiringItems.length > 0) {
        logger.info(`Found ${expiringItems.length} expiring items`);
        await this.processExpiryAlerts(expiringItems);
      }

      // Check expired items
      const expiredItems = await this.getExpiredItems();
      if (expiredItems.length > 0) {
        logger.info(`Found ${expiredItems.length} expired items`);
        await this.processExpiredAlerts(expiredItems);
      }

      // Check slow-moving items
      const slowMovingItems = await this.getSlowMovingItems();
      if (slowMovingItems.length > 0) {
        logger.info(`Found ${slowMovingItems.length} slow-moving items`);
        await this.processSlowMovingAlerts(slowMovingItems);
      }

      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed in ${duration}ms`, {
        lowStock: lowStockItems.length,
        expiring: expiringItems.length,
        expired: expiredItems.length,
        slowMoving: slowMovingItems.length
      });

      // Log job execution
      await this.logJobExecution(startTime, duration, {
        lowStock: lowStockItems.length,
        expiring: expiringItems.length,
        expired: expiredItems.length,
        slowMoving: slowMovingItems.length
      });

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
    }
  }

  /**
   * Get low stock items
   */
  async getLowStockItems() {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        d.drug_category,
        d.dosage_form,
        d.strength,
        d.reorder_level,
        d.maximum_level,
        f.id as facility_id,
        f.facility_name,
        f.email as facility_email,
        (
          SELECT json_agg(
            json_build_object(
              'id', b.id,
              'batch_number', b.batch_number,
              'expiry_date', b.expiry_date,
              'quantity', b.quantity_on_hand
            )
          )
          FROM drug_inventory b
          WHERE b.drug_id = d.id AND b.facility_id = di.facility_id
        ) as batches
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      JOIN facilities f ON di.facility_id = f.id
      WHERE di.quantity_on_hand <= d.reorder_level
        AND di.quantity_on_hand > 0
      ORDER BY (di.quantity_on_hand::float / d.reorder_level), di.expiry_date
    `);

    return result.rows;
  }

  /**
   * Get expiring items
   */
  async getExpiringItems() {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        d.drug_category,
        d.dosage_form,
        d.strength,
        f.id as facility_id,
        f.facility_name,
        f.email as facility_email,
        EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry,
        CASE 
          WHEN di.expiry_date <= NOW() + INTERVAL '30 days' THEN 'critical'
          WHEN di.expiry_date <= NOW() + INTERVAL '60 days' THEN 'warning'
          ELSE 'notice'
        END as alert_level
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      JOIN facilities f ON di.facility_id = f.id
      WHERE di.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
        AND di.quantity_on_hand > 0
      ORDER BY di.expiry_date
    `);

    return result.rows;
  }

  /**
   * Get expired items
   */
  async getExpiredItems() {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        d.drug_category,
        d.dosage_form,
        d.strength,
        f.id as facility_id,
        f.facility_name,
        f.email as facility_email,
        EXTRACT(DAY FROM NOW() - di.expiry_date) as days_expired
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      JOIN facilities f ON di.facility_id = f.id
      WHERE di.expiry_date < NOW()
        AND di.quantity_on_hand > 0
      ORDER BY di.expiry_date
    `);

    return result.rows;
  }

  /**
   * Get slow-moving items
   */
  async getSlowMovingItems() {
    const result = await db.query(`
      WITH monthly_consumption AS (
        SELECT 
          di.drug_id,
          di.facility_id,
          SUM(sm.quantity) as total_consumed
        FROM stock_movements sm
        JOIN drug_inventory di ON sm.item_id = di.drug_id
        WHERE sm.movement_type = 'issue'
          AND sm.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY di.drug_id, di.facility_id
      )
      SELECT 
        d.drug_name,
        d.drug_code,
        d.drug_category,
        d.dosage_form,
        d.strength,
        di.quantity_on_hand,
        COALESCE(mc.total_consumed, 0) as consumed_90d,
        CASE 
          WHEN COALESCE(mc.total_consumed, 0) = 0 THEN 'no_movement'
          WHEN di.quantity_on_hand > COALESCE(mc.total_consumed, 0) * 6 THEN 'slow'
          ELSE 'normal'
        END as status,
        f.id as facility_id,
        f.facility_name
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      JOIN facilities f ON di.facility_id = f.id
      LEFT JOIN monthly_consumption mc ON d.id = mc.drug_id AND f.id = mc.facility_id
      WHERE di.quantity_on_hand > 0
        AND (COALESCE(mc.total_consumed, 0) = 0 OR di.quantity_on_hand > COALESCE(mc.total_consumed, 0) * 6)
    `);

    return result.rows;
  }

  /**
   * Process low stock alerts
   */
  async processLowStockAlerts(items) {
    // Group by facility
    const byFacility = this.groupBy(items, 'facility_id');

    for (const [facilityId, facilityItems] of Object.entries(byFacility)) {
      try {
        // Get pharmacy staff for this facility
        const staff = await this.getPharmacyStaff(facilityId);

        // Send notifications to each staff member
        for (const member of staff) {
          await notificationService.send({
            userId: member.id,
            type: 'inventory_alert',
            title: 'Low Stock Alert',
            body: `${facilityItems.length} items are below reorder level.`,
            channels: ['in_app', 'email'],
            data: {
              alertType: 'low_stock',
              items: facilityItems.slice(0, 10), // Send top 10
              totalCount: facilityItems.length
            }
          });
        }

        // Send email to facility with full list
        if (facilityItems[0].facility_email) {
          await emailService.sendInventoryAlert(
            facilityItems[0].facility_name,
            facilityItems,
            'low_stock'
          );
        }

        // Log alerts
        await this.logAlerts('low_stock', facilityId, facilityItems);
      } catch (error) {
        logger.error(`Failed to process low stock alerts for facility ${facilityId}:`, error);
      }
    }
  }

  /**
   * Process expiry alerts
   */
  async processExpiryAlerts(items) {
    // Group by facility and alert level
    const byFacility = this.groupBy(items, 'facility_id');

    for (const [facilityId, facilityItems] of Object.entries(byFacility)) {
      try {
        const critical = facilityItems.filter(i => i.alert_level === 'critical');
        const warning = facilityItems.filter(i => i.alert_level === 'warning');
        const notice = facilityItems.filter(i => i.alert_level === 'notice');

        // Get pharmacy staff
        const staff = await this.getPharmacyStaff(facilityId);

        // Send notifications
        for (const member of staff) {
          const message = this.formatExpiryMessage(critical.length, warning.length, notice.length);
          
          await notificationService.send({
            userId: member.id,
            type: 'inventory_alert',
            title: 'Expiry Alert',
            body: message,
            channels: ['in_app', 'email'],
            data: {
              alertType: 'expiry',
              critical: critical.slice(0, 5),
              warning: warning.slice(0, 5),
              notice: notice.slice(0, 5),
              counts: {
                critical: critical.length,
                warning: warning.length,
                notice: notice.length
              }
            }
          });
        }

        // Send detailed email
        if (facilityItems[0].facility_email) {
          await emailService.sendInventoryAlert(
            facilityItems[0].facility_name,
            { critical, warning, notice },
            'expiry'
          );
        }

        // Log alerts
        await this.logAlerts('expiry', facilityId, facilityItems);
      } catch (error) {
        logger.error(`Failed to process expiry alerts for facility ${facilityId}:`, error);
      }
    }
  }

  /**
   * Process expired items alerts
   */
  async processExpiredAlerts(items) {
    // Group by facility
    const byFacility = this.groupBy(items, 'facility_id');

    for (const [facilityId, facilityItems] of Object.entries(byFacility)) {
      try {
        // Get pharmacy staff
        const staff = await this.getPharmacyStaff(facilityId);

        // Send urgent notifications
        for (const member of staff) {
          await notificationService.send({
            userId: member.id,
            type: 'inventory_alert',
            title: 'URGENT: Expired Items',
            body: `${facilityItems.length} items have expired and need immediate attention.`,
            priority: 'high',
            channels: ['in_app', 'email', 'sms'],
            data: {
              alertType: 'expired',
              items: facilityItems,
              totalCount: facilityItems.length
            }
          });
        }

        // Send email with full list
        if (facilityItems[0].facility_email) {
          await emailService.sendInventoryAlert(
            facilityItems[0].facility_name,
            facilityItems,
            'expired'
          );
        }

        // Log alerts
        await this.logAlerts('expired', facilityId, facilityItems);
      } catch (error) {
        logger.error(`Failed to process expired alerts for facility ${facilityId}:`, error);
      }
    }
  }

  /**
   * Process slow-moving items alerts
   */
  async processSlowMovingAlerts(items) {
    // Group by facility
    const byFacility = this.groupBy(items, 'facility_id');

    for (const [facilityId, facilityItems] of Object.entries(byFacility)) {
      try {
        // Get pharmacy staff
        const staff = await this.getPharmacyStaff(facilityId);

        // Send notifications
        for (const member of staff) {
          await notificationService.send({
            userId: member.id,
            type: 'inventory_alert',
            title: 'Slow-Moving Items',
            body: `${facilityItems.length} items show low turnover. Review stock levels.`,
            channels: ['in_app', 'email'],
            data: {
              alertType: 'slow_moving',
              items: facilityItems.slice(0, 10),
              totalCount: facilityItems.length
            }
          });
        }

        // Log alerts
        await this.logAlerts('slow_moving', facilityId, facilityItems);
      } catch (error) {
        logger.error(`Failed to process slow-moving alerts for facility ${facilityId}:`, error);
      }
    }
  }

  /**
   * Get pharmacy staff for facility
   */
  async getPharmacyStaff(facilityId) {
    const result = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.facility_id = $1
        AND r.role_code IN ('PHARMACIST', 'PHARMACY_TECH')
        AND u.user_status = 'active'
    `, [facilityId]);

    return result.rows;
  }

  /**
   * Format expiry message
   */
  formatExpiryMessage(critical, warning, notice) {
    const parts = [];
    if (critical > 0) parts.push(`${critical} critical (≤30 days)`);
    if (warning > 0) parts.push(`${warning} warning (31-60 days)`);
    if (notice > 0) parts.push(`${notice} notice (61-90 days)`);
    
    return `Expiring items: ${parts.join(', ')}`;
  }

  /**
   * Group array by key
   */
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const groupKey = item[key];
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    }, {});
  }

  /**
   * Log alerts to database
   */
  async logAlerts(alertType, facilityId, items) {
    await db.query(`
      INSERT INTO inventory_alerts (
        facility_id, alert_type, items_count, details, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      facilityId,
      alertType,
      items.length,
      JSON.stringify(items.slice(0, 20)) // Store first 20 items
    ]);
  }

  /**
   * Log job execution
   */
  async logJobExecution(startTime, duration, stats) {
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
      'success',
      JSON.stringify(stats)
    ]);
  }
}

// Create and export job instance
const inventoryAlertJob = new InventoryAlertJob();
module.exports = inventoryAlertJob;