/**
 * Data Backup Job
 * Performs automated database backups
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const backupService = require('../services/backupService');
const notificationService = require('../services/notificationService');
const { backupQueue } = require('../services/queueService');

class DataBackupJob {
  constructor() {
    this.name = 'data-backup';
    this.schedule = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily
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
    
    // Set up queue processor
    this.setupQueueProcessor();
    
    this.initialized = true;
    logger.info(`Job ${this.name} scheduled with pattern: ${this.schedule}`);
  }

  /**
   * Set up queue processor for backups
   */
  setupQueueProcessor() {
    backupQueue.process('backup', async (job) => {
      const { type, options } = job.data;
      
      try {
        logger.info(`Starting backup: ${type}`);
        
        const result = await backupService.createBackup({
          type,
          ...options
        });
        
        // Log backup record
        await this.logBackupRecord(result);
        
        // Send notification if requested
        if (options?.notify) {
          await this.sendBackupNotification(result);
        }
        
        return result;
      } catch (error) {
        logger.error(`Backup failed:`, error);
        throw error;
      }
    });

    backupQueue.process('cleanup', async () => {
      try {
        logger.info('Starting backup cleanup');
        
        const result = await backupService.cleanupOldBackups();
        
        return result;
      } catch (error) {
        logger.error('Backup cleanup failed:', error);
        throw error;
      }
    });
  }

  /**
   * Execute the job
   */
  async execute() {
    const startTime = Date.now();
    logger.info(`Starting ${this.name} job`);

    try {
      // Create full database backup
      const backupJob = await backupQueue.add('backup', {
        type: 'full',
        options: {
          compress: true,
          notify: true
        }
      }, {
        attempts: 2,
        timeout: 300000 // 5 minutes
      });

      logger.info(`Backup job queued: ${backupJob.id}`);

      // Clean up old backups
      const cleanupJob = await backupQueue.add('cleanup', {}, {
        attempts: 1,
        timeout: 60000 // 1 minute
      });

      logger.info(`Cleanup job queued: ${cleanupJob.id}`);

      // Wait for backup to complete
      const backupResult = await backupJob.finished();
      
      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed in ${duration}ms`, {
        backup: backupResult.path,
        size: backupResult.sizeFormatted
      });

      // Log job execution
      await this.logJobExecution(startTime, duration, {
        backup: backupResult.path,
        size: backupResult.size
      });

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
      
      // Send error notification
      await this.sendErrorNotification(error);
    }
  }

  /**
   * Log backup record to database
   */
  async logBackupRecord(backup) {
    await db.query(`
      INSERT INTO backup_history (
        filename, backup_type, size, path,
        status, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      backup.filename,
      backup.type,
      backup.size,
      backup.path,
      'success'
    ]);
  }

  /**
   * Send backup notification
   */
  async sendBackupNotification(backup) {
    try {
      // Get admin users
      const admins = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.role_code = 'SYS_ADMIN'
          AND u.user_status = 'active'
      `);

      for (const admin of admins.rows) {
        await notificationService.send({
          userId: admin.id,
          type: 'backup_completed',
          title: 'Backup Completed',
          body: `Database backup completed successfully. Size: ${backup.sizeFormatted}`,
          channels: ['in_app', 'email'],
          data: backup
        });
      }
    } catch (error) {
      logger.error('Failed to send backup notification:', error);
    }
  }

  /**
   * Send error notification
   */
  async sendErrorNotification(error) {
    try {
      // Get admin users
      const admins = await db.query(`
        SELECT u.id, u.email
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.role_code = 'SYS_ADMIN'
          AND u.user_status = 'active'
      `);

      for (const admin of admins.rows) {
        await notificationService.send({
          userId: admin.id,
          type: 'system_alert',
          title: 'Backup Failed',
          body: `Database backup failed: ${error.message}`,
          priority: 'high',
          channels: ['in_app', 'email'],
          data: { error: error.message }
        });
      }
    } catch (notifyError) {
      logger.error('Failed to send error notification:', notifyError);
    }
  }

  /**
   * Log job execution
   */
  async logJobExecution(startTime, duration, result) {
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
      JSON.stringify(result)
    ]);
  }
}

// Create and export job instance
const dataBackupJob = new DataBackupJob();
module.exports = dataBackupJob;