const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { claimsQueue } = require('./queueService');

// exports directory for claim JSON files
const EXPORT_DIR = path.join(__dirname, '../exports/claims');


class ClaimsITService {
  constructor() {
    // configuration values left for backwards compatibility but not used
    this.providerCode = process.env.PROVIDER_CODE;
    this.facilityCode = process.env.FACILITY_CODE;

    // ensure export directory exists
    try {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    } catch (e) {
      logger.error('Unable to create claim export directory', e);
    }
  }

  // no external API to initialize; export occurs locally

  // authentication no longer required; this method kept for compatibility
  async getAccessToken() {
    throw new AppError('ClaimsIT API not available', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Prepare claim data for submission
   */
  async prepareClaimData(claimId) {
    const result = await db.query(`
      SELECT 
        ic.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'date_of_birth', p.date_of_birth,
          'gender', p.gender,
          'nhis_number', p.nhis_number,
          'phone_number', p.phone_number
        ) as patient,
        json_build_object(
          'provider', pi.insurance_provider,
          'policy_number', pi.policy_number,
          'membership_number', pi.membership_number,
          'start_date', pi.start_date,
          'expiry_date', pi.expiry_date
        ) as insurance,
        (
          SELECT json_agg(
            json_build_object(
              'service_code', ci.service_code,
              'service_description', ci.service_description,
              'quantity', ci.quantity,
              'unit_price', ci.unit_price,
              'total', ci.total_price,
              'diagnosis_code', d.diagnosis_code,
              'procedure_date', v.visit_date,
              'provider_name', u.first_name || ' ' || u.last_name,
              'provider_license', u.professional_license_number
            )
          )
          FROM claim_items ci
          LEFT JOIN invoice_items ii ON ci.invoice_item_id = ii.id
          LEFT JOIN visits v ON ii.visit_id = v.id
          LEFT JOIN diagnoses d ON v.id = d.visit_id
          LEFT JOIN users u ON v.created_by = u.id
          WHERE ci.claim_id = ic.id
        ) as services
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
      WHERE ic.id = $1
    `, [claimId]);

    if (result.rows.length === 0) {
      throw new AppError('Claim not found', 404, 'CLAIM_NOT_FOUND');
    }

    const claim = result.rows[0];

    return {
      claim_reference: claim.claim_number,
      provider_code: this.providerCode,
      facility_code: this.facilityCode,
      submission_date: new Date().toISOString(),
      patient: claim.patient,
      insurance: claim.insurance,
      services: claim.services,
      total_amount: parseFloat(claim.total_amount),
      diagnosis_codes: [...new Set(claim.services?.map(s => s.diagnosis_code).filter(Boolean))],
      encounter_date: claim.visit_date,
      encounter_type: claim.visit_type
    };
  }

  /**
   * "Submit" claim by exporting JSON that can be imported into external platform.
   */
  async submitClaim(claimId) {
    try {
      const claimData = await this.prepareClaimData(claimId);

      // write JSON file to export directory
      const fileName = `claim-${claimId}.json`;
      const filePath = path.join(EXPORT_DIR, fileName);

      try {
        await fs.promises.writeFile(filePath, JSON.stringify(claimData, null, 2));
      } catch (fsErr) {
        logger.error('Failed to write claim export file', { claimId, error: fsErr.message });
        throw new AppError('Failed to export claim data', 500, 'CLAIM_EXPORT_FAILED');
      }

      // update local record to indicate exported
      await db.query(`
        UPDATE insurance_claims 
        SET 
          status = 'Submitted',
          submission_date = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [claimId]);

      await db.query(`
        INSERT INTO claim_status_history (
          claim_id, status, notes, status_date
        ) VALUES ($1, 'Submitted', 'Exported JSON for ClaimsIT', NOW())
      `, [claimId]);

      logger.info('Claim exported to JSON file', { claimId, filePath });

      return {
        success: true,
        claimId,
        file: filePath,
        status: 'exported'
      };
    } catch (error) {
      // Update claim with error
      // record failure; if the enum doesn't include 'Failed' we fallback
      try {
        await db.query(`
          UPDATE insurance_claims 
          SET 
            status = 'Failed',
            validation_response = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [error.response?.data || error.message, claimId]);
      } catch (dbErr) {
        if (dbErr.message && dbErr.message.includes('claim_status_type')) {
          logger.warn('Fallback writing claim status to Rejected due to enum issue', {
            claimId,
            dbError: dbErr.message
          });
          await db.query(`
            UPDATE insurance_claims 
            SET 
              status = 'Rejected',
              validation_response = $1,
              updated_at = NOW()
            WHERE id = $2
          `, [error.response?.data || error.message, claimId]);
        } else {
          throw dbErr;
        }
      }

      throw new AppError('Failed to submit claim to ClaimsIT', 503, 'CLAIMSIT_SUBMIT_FAILED');
    }
  }

  /**
   * Validate claim with ClaimsIT
   */
  async validateClaim(claimId) {
    // prepare data (even though it's unused right now) to keep interface consistent
    const claimData = await this.prepareClaimData(claimId);

    // no external validation available
    throw new AppError('ClaimsIT validation not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Check claim status
   */
  async checkClaimStatus(claimsitClaimId) {
    try {
      const response = await this.client.get(`/claims/${claimsitClaimId}/status`);

      // Update local claim
      await db.query(`
        UPDATE insurance_claims 
        SET 
          status = $1,
          approved_amount = $2,
          paid_amount = $3,
          updated_at = NOW()
        WHERE claimsit_claim_id = $4
      `, [
        response.data.status,
        response.data.approved_amount,
        response.data.paid_amount,
        claimsitClaimId
      ]);

      // Log status history
      await db.query(`
        INSERT INTO claim_status_history (
          claim_id, status, notes, status_date
        ) 
        SELECT id, $1, $2, NOW()
        FROM insurance_claims
        WHERE claimsit_claim_id = $3
      `, [response.data.status, response.data.notes, claimsitClaimId]);

      return response.data;
    } catch (error) {
      logger.error('Failed to check claim status:', error);
      throw new AppError('Failed to check claim status', 503, 'CLAIMSIT_STATUS_FAILED');
    }
  }

  /**
   * Verify NHIS number
   */
  async verifyNHIS(/*nhisNumber, patientId*/) {
    // external NHIS verification not available in offline workflow
    throw new AppError('NHIS verification not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Check patient eligibility
   */
  async checkEligibility(/*patientId, serviceType*/) {
    throw new AppError('Eligibility check not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Get tariff rates
   */
  async getTariff(/*serviceCode, date = new Date()*/) {
    throw new AppError('Tariff lookup not available', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Process pending claims (batch job)
   */
  async processPendingClaims() {
    const pendingClaims = await db.query(`
      SELECT * FROM insurance_claims 
      WHERE status IN ('Draft', 'Validated')
        AND created_at <= NOW() - INTERVAL '1 hour'
      ORDER BY created_at
      LIMIT 50
    `);

    const results = [];

    for (const claim of pendingClaims.rows) {
      try {
        // Add to queue for processing
        const job = await claimsQueue.add('submit', {
          claimId: claim.id
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        });

        results.push({
          claimId: claim.id,
          jobId: job.id,
          status: 'queued'
        });
      } catch (error) {
        logger.error('Failed to queue claim:', {
          claimId: claim.id,
          error: error.message
        });
        
        results.push({
          claimId: claim.id,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Process rejected claims
   */
  async processRejectedClaims() {
    const rejectedClaims = await db.query(`
      SELECT * FROM insurance_claims 
      WHERE status = 'Rejected' 
        AND updated_at > NOW() - INTERVAL '7 days'
        AND resubmission_count < 3
    `);

    for (const claim of rejectedClaims.rows) {
      try {
        const status = await this.checkClaimStatus(claim.claimsit_claim_id);
        
        if (status.can_resubmit) {
          await db.query(`
            UPDATE insurance_claims 
            SET 
              resubmission_count = resubmission_count + 1,
              updated_at = NOW()
            WHERE id = $1
          `, [claim.id]);

          await this.submitClaim(claim.id);
        }
      } catch (error) {
        logger.error('Error processing rejected claim:', {
          claimId: claim.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Generate claim report
   */
  async generateClaimReport(/*startDate, endDate*/) {
    throw new AppError('Report generation not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Get provider dashboard
   */
  async getDashboard() {
    throw new AppError('Dashboard not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Handle webhook from ClaimsIT
   */
  async handleWebhook(/*payload, signature*/) {
    // webhook support removed since ClaimsIT API is offline
    throw new AppError('Webhooks not supported', 501, 'CLAIMSIT_NOT_IMPLEMENTED');
  }

  /**
   * Handle claim approved webhook
   */
  async handleClaimApproved(payload) {
    await db.query(`
      UPDATE insurance_claims 
      SET 
        status = 'Approved',
        approved_amount = $1,
        updated_at = NOW()
      WHERE claimsit_claim_id = $2
    `, [payload.approved_amount, payload.claim_id]);

    await db.query(`
      INSERT INTO claim_status_history (
        claim_id, status, notes, status_date
      ) 
      SELECT id, 'Approved', $1, NOW()
      FROM insurance_claims
      WHERE claimsit_claim_id = $2
    `, [payload.notes, payload.claim_id]);
  }

  /**
   * Handle claim rejected webhook
   */
  async handleClaimRejected(payload) {
    await db.query(`
      UPDATE insurance_claims 
      SET 
        status = 'Rejected',
        rejection_reason = $1,
        updated_at = NOW()
      WHERE claimsit_claim_id = $2
    `, [payload.reason, payload.claim_id]);

    await db.query(`
      INSERT INTO claim_status_history (
        claim_id, status, notes, status_date
      ) 
      SELECT id, 'Rejected', $1, NOW()
      FROM insurance_claims
      WHERE claimsit_claim_id = $2
    `, [payload.reason, payload.claim_id]);
  }

  /**
   * Handle claim paid webhook
   */
  async handleClaimPaid(payload) {
    await db.query(`
      UPDATE insurance_claims 
      SET 
        status = 'Paid',
        paid_amount = $1,
        payment_date = $2,
        updated_at = NOW()
      WHERE claimsit_claim_id = $3
    `, [payload.amount, payload.payment_date, payload.claim_id]);

    // Update linked invoice
    await db.query(`
      UPDATE invoices i
      SET 
        insurance_coverage = $1,
        patient_responsibility = i.total_amount - $1,
        updated_at = NOW()
      FROM insurance_claims ic
      WHERE ic.id = i.insurance_claim_id
        AND ic.claimsit_claim_id = $2
    `, [payload.amount, payload.claim_id]);
  }

  /**
   * Handle eligibility updated webhook
   */
  async handleEligibilityUpdated(payload) {
    await db.query(`
      UPDATE patient_insurance 
      SET 
        is_verified = $1,
        updated_at = NOW()
      WHERE policy_number = $2
    `, [payload.status === 'ACTIVE', payload.policy_number]);
  }

  /**
   * Get service status
   */
  async getStatus() {
    try {
      const token = await this.getAccessToken();
      return {
        initialized: true,
        authenticated: !!token,
        baseURL: this.baseURL,
        tokenExpiry: this.tokenExpiry
      };
    } catch (error) {
      return {
        initialized: true,
        authenticated: false,
        error: error.message
      };
    }
  }
}

module.exports = new ClaimsITService();