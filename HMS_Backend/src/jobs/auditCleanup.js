/**
 * Audit Log Cleanup Job
 * Cleans up old audit logs based on retention policy
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const notificationService = require('../services/notificationService');

class AuditCleanupJob {
  constructor() {
    this.name = 'audit-cleanup';
    this.schedule = '0 3 * * 0'; // Run at 3 AM every Sunday
    this.initialized = false;
    this.retentionDays = 365; // Keep audit logs for 1 year by default
    this.archiveDays = 90; // Archive logs older than 90 days
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
      // Archive old audit logs
      const archived = await this.archiveOldLogs();
      
      // Delete very old audit logs
      const deleted = await this.deleteOldLogs();

      // Archive system logs
      const systemLogsArchived = await this.archiveSystemLogs();

      // Clean up old job executions
      const jobLogsDeleted = await this.cleanupJobLogs();

      // Compact audit tables (optional - database specific)
      const compacted = await this.compactTables();

      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed in ${duration}ms`, {
        archived,
        deleted,
        systemLogsArchived,
        jobLogsDeleted,
        compacted
      });

      // Log job execution
      await this.logJobExecution(startTime, duration, {
        archived,
        deleted,
        systemLogsArchived,
        jobLogsDeleted,
        compacted
      });

      // Send summary to admins
      if (archived > 0 || deleted > 0) {
        await this.sendCleanupSummary({
          archived,
          deleted,
          systemLogsArchived,
          jobLogsDeleted
        });
      }

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
    }
  }

  /**
   * Archive old audit logs
   */
  async archiveOldLogs() {
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - this.archiveDays);

    // Create archive table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs_archive (LIKE audit_logs INCLUDING ALL)
    `);

    // Move old logs to archive
    const result = await db.query(`
      WITH moved AS (
        DELETE FROM audit_logs
        WHERE created_at < $1
        RETURNING *
      )
      INSERT INTO audit_logs_archive
      SELECT * FROM moved
      RETURNING id
    `, [archiveDate]);

    const count = result.rows.length;
    
    if (count > 0) {
      logger.info(`Archived ${count} audit logs older than ${this.archiveDays} days`);
    }

    return count;
  }

  /**
   * Delete very old audit logs
   */
  async deleteOldLogs() {
    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - this.retentionDays);

    const result = await db.query(`
      DELETE FROM audit_logs_archive
      WHERE created_at < $1
      RETURNING id
    `, [deleteDate]);

    const count = result.rows.length;
    
    if (count > 0) {
      logger.info(`Deleted ${count} archived audit logs older than ${this.retentionDays} days`);
    }

    return count;
  }

  /**
   * Archive old system logs
   */
  async archiveSystemLogs() {
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - 30); // Archive logs older than 30 days

    // Create archive table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_logs_archive (LIKE system_logs INCLUDING ALL)
    `);

    // Move old logs to archive
    const result = await db.query(`
      WITH moved AS (
        DELETE FROM system_logs
        WHERE created_at < $1
        RETURNING *
      )
      INSERT INTO system_logs_archive
      SELECT * FROM moved
      RETURNING id
    `, [archiveDate]);

    const count = result.rows.length;
    
    if (count > 0) {
      logger.info(`Archived ${count} system logs older than 30 days`);
    }

    return count;
  }

  /**
   * Clean up old job execution logs
   */
  async cleanupJobLogs() {
    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - 90); // Keep job logs for 90 days

    const result = await db.query(`
      DELETE FROM job_executions
      WHERE created_at < $1
      RETURNING id
    `, [deleteDate]);

    const count = result.rows.length;
    
    if (count > 0) {
      logger.info(`Deleted ${count} old job execution logs`);
    }

    return count;
  }

  /**
   * Compact audit tables (database specific)
   * This is a placeholder - actual implementation depends on database
   */
  async compactTables() {
    let compacted = 0;

    try {
      // PostgreSQL vacuum analyze
      if (process.env.DB_TYPE === 'postgresql') {
        await db.query('VACUUM ANALYZE audit_logs');
        await db.query('VACUUM ANALYZE audit_logs_archive');
        await db.query('VACUUM ANALYZE system_logs');
        compacted = 1;
        logger.info('Vacuum analyze completed on audit tables');
      }
    } catch (error) {
      logger.error('Failed to compact tables:', error);
    }

    return compacted;
  }

  /**
   * Get audit log statistics
   */
  async getAuditStats() {
    const result = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM audit_logs) as current_count,
        (SELECT COUNT(*) FROM audit_logs_archive) as archived_count,
        (SELECT MIN(created_at) FROM audit_logs) as oldest_current,
        (SELECT MAX(created_at) FROM audit_logs) as newest_current,
        (SELECT MIN(created_at) FROM audit_logs_archive) as oldest_archived,
        (SELECT MAX(created_at) FROM audit_logs_archive) as newest_archived,
        (SELECT pg_total_relation_size('audit_logs')) as current_size,
        (SELECT pg_total_relation_size('audit_logs_archive')) as archive_size
    `);

    return result.rows[0];
  }

  /**
   * Send cleanup summary to admins
   */
  async sendCleanupSummary(stats) {
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

      // Get audit stats
      const auditStats = await this.getAuditStats();

      for (const admin of admins.rows) {
        await notificationService.send({
          userId: admin.id,
          type: 'system_report',
          title: 'Audit Log Cleanup Summary',
          body: `Cleaned up ${stats.archived} archived and ${stats.deleted} deleted audit logs.`,
          channels: ['in_app', 'email'],
          data: {
            cleanup: stats,
            auditStats
          }
        });
      }
    } catch (error) {
      logger.error('Failed to send cleanup summary:', error);
    }
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
const auditCleanupJob = new AuditCleanupJob();
module.exports = auditCleanupJob;