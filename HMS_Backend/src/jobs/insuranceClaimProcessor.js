/**
 * Insurance Claim Processor Job
 * Processes pending insurance claims and checks status with ClaimsIT
 */

const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const claimsITService = require('../services/claimsITService');
const notificationService = require('../services/notificationService');
const { claimsQueue } = require('../services/queueService');

class InsuranceClaimProcessorJob {
  constructor() {
    this.name = 'insurance-claim-processor';
    this.schedule = '*/30 * * * *'; // Run every 30 minutes
    this.initialized = false;
    this.maxClaimsPerRun = 100;
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
    
    // Also set up queue processor
    this.setupQueueProcessor();
    
    this.initialized = true;
    logger.info(`Job ${this.name} scheduled with pattern: ${this.schedule}`);
  }

  /**
   * Set up queue processor for claims
   */
  setupQueueProcessor() {
    claimsQueue.process('submit', async (job) => {
      const { claimId } = job.data;
      
      try {
        logger.info(`Processing claim submission: ${claimId}`);
        
        // Submit to ClaimsIT
        const result = await claimsITService.submitClaim(claimId);
        
        // Send notification
        await this.sendClaimNotification(claimId, 'submitted', result);
        
        return result;
      } catch (error) {
        logger.error(`Failed to process claim ${claimId}:`, error);
        throw error;
      }
    });

    claimsQueue.process('check-status', async (job) => {
      const { claimsitClaimId } = job.data;
      
      try {
        logger.info(`Checking claim status: ${claimsitClaimId}`);
        
        const status = await claimsITService.checkClaimStatus(claimsitClaimId);
        
        return status;
      } catch (error) {
        logger.error(`Failed to check claim status ${claimsitClaimId}:`, error);
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
      // Process pending claims
      const pendingClaims = await this.getPendingClaims();
      
      if (pendingClaims.length > 0) {
        logger.info(`Found ${pendingClaims.length} pending claims`);
        await this.processPendingClaims(pendingClaims);
      }

      // Check status of submitted claims
      const submittedClaims = await this.getSubmittedClaims();
      
      if (submittedClaims.length > 0) {
        logger.info(`Checking status of ${submittedClaims.length} submitted claims`);
        await this.checkClaimsStatus(submittedClaims);
      }

      // Process rejected claims
      const rejectedClaims = await this.getRejectedClaims();
      
      if (rejectedClaims.length > 0) {
        logger.info(`Processing ${rejectedClaims.length} rejected claims`);
        await this.processRejectedClaims(rejectedClaims);
      }

      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed in ${duration}ms`);

      // Log job execution
      await this.logJobExecution(startTime, duration, {
        pending: pendingClaims.length,
        submitted: submittedClaims.length,
        rejected: rejectedClaims.length
      });

    } catch (error) {
      logger.error(`Error in ${this.name} job:`, error);
    }
  }

  /**
   * Get pending claims
   */
  async getPendingClaims() {
    const result = await db.query(`
      SELECT 
        ic.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number,
        p.email,
        pi.insurance_provider,
        pi.policy_number
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
      WHERE ic.status IN ('draft', 'validated')
        AND ic.created_at <= NOW() - INTERVAL '1 hour'
      ORDER BY ic.created_at
      LIMIT $1
    `, [this.maxClaimsPerRun]);

    return result.rows;
  }

  /**
   * Get submitted claims for status check
   */
  async getSubmittedClaims() {
    const result = await db.query(`
      SELECT *
      FROM insurance_claims
      WHERE status = 'submitted'
        AND submission_date <= NOW() - INTERVAL '1 day'
        AND claimsit_claim_id IS NOT NULL
      ORDER BY submission_date
      LIMIT $1
    `, [this.maxClaimsPerRun]);

    return result.rows;
  }

  /**
   * Get rejected claims for reprocessing
   */
  async getRejectedClaims() {
    const result = await db.query(`
      SELECT *
      FROM insurance_claims
      WHERE status = 'rejected'
        AND updated_at > NOW() - INTERVAL '7 days'
        AND resubmission_count < 3
      ORDER BY updated_at
      LIMIT $1
    `, [this.maxClaimsPerRun]);

    return result.rows;
  }

  /**
   * Process pending claims
   */
  async processPendingClaims(claims) {
    for (const claim of claims) {
      try {
        // Add to queue for processing
        await claimsQueue.add('submit', {
          claimId: claim.id
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        });

        logger.info(`Queued claim for submission: ${claim.id}`);
      } catch (error) {
        logger.error(`Failed to queue claim ${claim.id}:`, error);
      }
    }
  }

  /**
   * Check status of submitted claims
   */
  async checkClaimsStatus(claims) {
    for (const claim of claims) {
      try {
        // Add to queue for status check
        await claimsQueue.add('check-status', {
          claimsitClaimId: claim.claimsit_claim_id
        }, {
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 10000
          }
        });

        logger.info(`Queued claim for status check: ${claim.claimsit_claim_id}`);
      } catch (error) {
        logger.error(`Failed to queue status check for claim ${claim.id}:`, error);
      }
    }
  }

  /**
   * Process rejected claims
   */
  async processRejectedClaims(claims) {
    for (const claim of claims) {
      try {
        // Check if claim can be resubmitted
        if (claim.claimsit_claim_id) {
          const status = await claimsITService.checkClaimStatus(claim.claimsit_claim_id);
          
          if (status.can_resubmit) {
            // Increment resubmission count
            await db.query(`
              UPDATE insurance_claims 
              SET resubmission_count = resubmission_count + 1
              WHERE id = $1
            `, [claim.id]);

            // Resubmit claim
            await claimsQueue.add('submit', {
              claimId: claim.id
            }, {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000
              }
            });

            logger.info(`Queued rejected claim for resubmission: ${claim.id}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to process rejected claim ${claim.id}:`, error);
      }
    }
  }

  /**
   * Send claim notification
   */
  async sendClaimNotification(claimId, status, result) {
    try {
      const claim = await db.query(`
        SELECT 
          ic.*,
          p.id as patient_id,
          p.first_name || ' ' || p.last_name as patient_name
        FROM insurance_claims ic
        JOIN patients p ON ic.patient_id = p.id
        WHERE ic.id = $1
      `, [claimId]);

      if (claim.rows.length === 0) return;

      const claimData = claim.rows[0];

      // Notify patient if status changed
      if (['approved', 'paid', 'rejected'].includes(status)) {
        await notificationService.send({
          userId: claimData.patient_id,
          type: 'claim_update',
          title: `Claim ${status}`,
          body: `Your insurance claim #${claimData.claim_number} has been ${status}.`,
          channels: ['in_app', 'email'],
          data: { claim: claimData, result }
        });
      }

      // Notify insurance officers
      const officers = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.role_code IN ('INSURANCE', 'ACCOUNTS')
          AND u.user_status = 'active'
      `);

      for (const officer of officers.rows) {
        await notificationService.send({
          userId: officer.id,
          type: 'claim_update',
          title: `Claim ${status}`,
          body: `Claim #${claimData.claim_number} for ${claimData.patient_name} has been ${status}.`,
          channels: ['in_app'],
          data: { claim: claimData, result }
        });
      }
    } catch (error) {
      logger.error('Failed to send claim notification:', error);
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
const insuranceClaimProcessorJob = new InsuranceClaimProcessorJob();
module.exports = insuranceClaimProcessorJob;