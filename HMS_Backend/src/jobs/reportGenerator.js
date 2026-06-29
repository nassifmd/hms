/**
 * Report Generator Job
 * Generates scheduled reports and sends them to recipients
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const reportService = require('../services/reportService');
const emailService = require('../services/emailService');
const { reportQueue } = require('../services/queueService');
const moment = require('moment');

class ReportGeneratorJob {
  constructor() {
    this.name = 'report-generator';
    this.schedule = '0 * * * *'; // Run every hour
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
   * Set up queue processor for reports
   */
  setupQueueProcessor() {
    reportQueue.process('generate', async (job) => {
      const { reportType, params, format, userId, scheduleId } = job.data;
      
      try {
        logger.info(`Generating report: ${reportType}`);
        
        // Generate report
        const report = await reportService.generateReport(reportType, params, { format });
        
        // Save report record
        const reportRecord = await this.saveReport({
          reportType,
          params,
          format,
          userId,
          scheduleId,
          data: report
        });

        // Send to recipients if scheduled
        if (scheduleId) {
          await this.sendReportToRecipients(reportRecord);
        }

        return reportRecord;
      } catch (error) {
        logger.error(`Failed to generate report ${reportType}:`, error);
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
      // Get scheduled reports due for generation
      const scheduledReports = await this.getScheduledReports();
      
      if (scheduledReports.length === 0) {
        logger.info('No scheduled reports due');
        return;
      }

      logger.info(`Found ${scheduledReports.length} scheduled reports`);

      for (const schedule of scheduledReports) {
        try {
          await this.processScheduledReport(schedule);
        } catch (error) {
          logger.error(`Failed to process scheduled report ${schedule.id}:`, error);
        }
      }

      // Clean up old reports
      await this.cleanupOldReports();

      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed in ${duration}ms`);

      // Log job execution
      await this.logJobExecution(startTime, duration, {
        processed: scheduledReports.length
      });

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
    }
  }

  /**
   * Get scheduled reports due for generation
   */
  async getScheduledReports() {
    const result = await db.query(`
      SELECT *
      FROM report_schedules
      WHERE is_active = true
        AND next_run_at <= NOW()
      ORDER BY next_run_at
      LIMIT 50
    `);

    return result.rows;
  }

  /**
   * Process a scheduled report
   */
  async processScheduledReport(schedule) {
    logger.info(`Processing scheduled report: ${schedule.id}`);

    // Calculate date range based on frequency
    const dateRange = this.calculateDateRange(schedule);

    const params = {
      ...schedule.filters,
      start_date: dateRange.startDate,
      end_date: dateRange.endDate
    };

    // Queue report generation
    const job = await reportQueue.add('generate', {
      reportType: schedule.report_type,
      params,
      format: schedule.format,
      userId: schedule.created_by,
      scheduleId: schedule.id
    }, {
      attempts: 2,
      timeout: 60000 // 1 minute
    });

    // Update next run time
    await this.updateNextRunTime(schedule);

    logger.info(`Queued report generation for schedule ${schedule.id}`, {
      jobId: job.id,
      dateRange
    });
  }

  /**
   * Calculate date range based on frequency
   */
  calculateDateRange(schedule) {
    const now = moment();
    let startDate, endDate;

    // frequency may be stored as a separate column or within the JSON
    // configuration object; prefer the column but fall back to parsing.
    const freq = schedule.frequency || (schedule.schedule_config && schedule.schedule_config.frequency);

    switch (freq) {
      case 'daily':
        startDate = now.clone().subtract(1, 'day').startOf('day').toDate();
        endDate = now.clone().subtract(1, 'day').endOf('day').toDate();
        break;

      case 'weekly':
        startDate = now.clone().subtract(1, 'week').startOf('week').toDate();
        endDate = now.clone().subtract(1, 'week').endOf('week').toDate();
        break;

      case 'monthly':
        startDate = now.clone().subtract(1, 'month').startOf('month').toDate();
        endDate = now.clone().subtract(1, 'month').endOf('month').toDate();
        break;

      case 'quarterly':
        startDate = now.clone().subtract(1, 'quarter').startOf('quarter').toDate();
        endDate = now.clone().subtract(1, 'quarter').endOf('quarter').toDate();
        break;

      case 'yearly':
        startDate = now.clone().subtract(1, 'year').startOf('year').toDate();
        endDate = now.clone().subtract(1, 'year').endOf('year').toDate();
        break;

      default:
        // Custom range from schedule
        startDate = schedule.filters?.start_date || now.clone().subtract(30, 'days').toDate();
        endDate = schedule.filters?.end_date || now.toDate();
    }

    return { startDate, endDate };
  }

  /**
   * Update next run time for schedule
   */
  async updateNextRunTime(schedule) {
    const nextRun = this.calculateNextRunTime(schedule);
    
    await db.query(`
      UPDATE report_schedules
      SET 
        last_run_at = NOW(),
        next_run_at = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [nextRun, schedule.id]);
  }

  /**
   * Calculate next run time
   */
  calculateNextRunTime(schedule) {
    const now = moment();
    const freq = schedule.frequency || (schedule.schedule_config && schedule.schedule_config.frequency);

    switch (freq) {
      case 'daily':
        return now.add(1, 'day').toDate();
      case 'weekly':
        return now.add(1, 'week').toDate();
      case 'monthly':
        return now.add(1, 'month').toDate();
      case 'quarterly':
        return now.add(3, 'months').toDate();
      case 'yearly':
        return now.add(1, 'year').toDate();
      default:
        return now.add(1, 'day').toDate();
    }
  }

  /**
   * Save report to database
   */
  async saveReport(data) {
    const result = await db.query(`
      INSERT INTO generated_reports (
        report_type, params, format, file_path,
        file_size, created_by, schedule_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      data.reportType,
      JSON.stringify(data.params),
      data.format,
      data.data.path || null,
      data.data.size || null,
      data.userId,
      data.scheduleId
    ]);

    return result.rows[0];
  }

  /**
   * Send report to recipients
   */
  async sendReportToRecipients(report) {
    try {
      // Get schedule details
      const schedule = await db.query(`
        SELECT * FROM report_schedules WHERE id = $1
      `, [report.schedule_id]);

      if (schedule.rows.length === 0) return;

      const scheduleData = schedule.rows[0];
      const recipients = scheduleData.recipients;

      if (!recipients || recipients.length === 0) return;

      // Send email with report
      await emailService.sendEmail({
        to: recipients,
        subject: `Scheduled Report: ${report.report_type}`,
        template: 'scheduled-report',
        data: {
          reportType: report.report_type,
          generatedAt: report.created_at,
          format: report.format,
          downloadLink: `${process.env.API_URL}/reports/download/${report.id}`
        },
        attachments: report.file_path ? [{
          path: report.file_path,
          filename: `${report.report_type}_${moment(report.created_at).format('YYYYMMDD')}.${report.format}`
        }] : []
      });

      logger.info(`Report sent to ${recipients.length} recipients`, {
        reportId: report.id,
        recipients: recipients.length
      });
    } catch (error) {
      logger.error('Failed to send report to recipients:', error);
    }
  }

  /**
   * Clean up old reports
   */
  async cleanupOldReports() {
    const retentionDays = 30; // Keep reports for 30 days

    const result = await db.query(`
      DELETE FROM generated_reports
      WHERE created_at < NOW() - $1::interval
      RETURNING id
    `, [`${retentionDays} days`]);

    if (result.rows.length > 0) {
      logger.info(`Cleaned up ${result.rows.length} old reports`);
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
const reportGeneratorJob = new ReportGeneratorJob();
module.exports = reportGeneratorJob;