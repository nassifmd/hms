const Insurance = require("../models/Insurance");
const Patient = require("../models/Patient");
const Billing = require("../models/Billing");
const claimsITService = require("../services/claimsITService");
const nhisVerificationService = require("../services/nhisVerificationService");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");
const db = require("../config/database");
const { validationResult } = require("express-validator");

class InsuranceController {
  /**
   * @desc    Create new insurance claim
   * @route   POST /api/v1/insurance/claims
   * @access  Private (Accounts, Insurance Officer)
   */
  async createClaim(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const claimData = {
        ...req.body,
        facility_id: req.user.facilityId,
      };

      // verify that patient exists
      const patient = await Patient.findById(claimData.patient_id);
      if (!patient) {
        const err = new Error("Referenced record not found");
        err.code = "REFERENCE_NOT_FOUND";
        throw err;
      }

      // ensure provided patient_insurance_id belongs to patient
      if (claimData.patient_insurance_id) {
        const pi = await db.query(
          "SELECT id FROM patient_insurance WHERE id = $1 AND patient_id = $2",
          [claimData.patient_insurance_id, claimData.patient_id]
        );
        if (pi.rows.length === 0) {
          const err = new Error("Referenced record not found");
          err.code = "REFERENCE_NOT_FOUND";
          throw err;
        }
      }

      // if client did not supply total_amount but invoice_id exists, fetch it
      if (
        (!claimData.total_amount || claimData.total_amount === 0) &&
        claimData.invoice_id
      ) {
        const invoice = await Billing.findInvoiceById(claimData.invoice_id);
        if (invoice) {
          claimData.total_amount = invoice.total_amount;
        }
      }

      // final validation: total_amount must now be present and positive
      if (!claimData.total_amount || claimData.total_amount <= 0) {
        const err = new Error("total_amount is required");
        err.code = "REQUIRED_FIELD";
        throw err;
      }

      const claim = await Insurance.createClaim(claimData, req.user.userId);

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.clearPattern("insurance:claims:*");

      res.status(201).json({
        success: true,
        data: claim,
        message: "Insurance claim created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get claim by ID
   * @route   GET /api/v1/insurance/claims/:id
   * @access  Private
   */
  async getClaim(req, res, next) {
    try {
      const { id } = req.params;

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      // Verify facility access
      if (claim.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this claim",
          },
        });
      }

      res.json({
        success: true,
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient claims
   * @route   GET /api/v1/insurance/patients/:patientId/claims
   * @access  Private
   */
  async getPatientClaims(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const claims = await Insurance.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: claims,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get pending claims
   * @route   GET /api/v1/insurance/claims/pending
   * @access  Private
   */
  async getPendingClaims(req, res, next) {
    try {
      const { facilityId } = req.user;

      if (!facilityId) {
        // log once so we can debug missing facility ids in tokens
        req.log && req.log.warn("getPendingClaims called with null facilityId");
      }

      const claims = await Insurance.getPendingClaims(facilityId);

      res.json({
        success: true,
        data: claims,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Submit claim to ClaimsIT
   * @route   POST /api/v1/insurance/claims/:id/submit
   * @access  Private (Insurance Officer)
   */
  async submitClaim(req, res, next) {
    try {
      const { id } = req.params;

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      // "Submit" means export JSON for offline ClaimsIT import
      const result = await claimsITService.submitClaim(id);

      // mark claim locally as processed by insurer user
      const insuranceClaim = new Insurance(claim);
      await insuranceClaim.submit(req.user.userId);

      // Clear cache
      await redis.del(`insurance:claim:${id}`);

      res.json({
        success: true,
        data: result,
        message: `Claim exported to file ${result.file}`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Validate claim with ClaimsIT
   * @route   POST /api/v1/insurance/claims/:id/validate
   * @access  Private (Insurance Officer)
   */
  async validateClaim(req, res, next) {
    try {
      const { id } = req.params;

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      // Prepare claim data
      const claimData = await claimsITService.prepareClaimData(id);

      // Validate with ClaimsIT
      const validation = await claimsITService.validateClaim(claimData);

      if (validation.valid) {
        const insuranceClaim = new Insurance(claim);
        await insuranceClaim.validate(validation);
      }

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Approve claim
   * @route   PUT /api/v1/insurance/claims/:id/approve
   * @access  Private (Insurance Officer, Admin)
   */
  async approveClaim(req, res, next) {
    try {
      const { id } = req.params;
      const { approved_amount } = req.body;

      if (!approved_amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_AMOUNT",
            message: "Approved amount is required",
          },
        });
      }

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      const insuranceClaim = new Insurance(claim);
      await insuranceClaim.approve(approved_amount, req.user.userId);

      // Clear cache
      await redis.del(`insurance:claim:${id}`);

      res.json({
        success: true,
        message: "Claim approved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Reject claim
   * @route   PUT /api/v1/insurance/claims/:id/reject
   * @access  Private (Insurance Officer, Admin)
   */
  async rejectClaim(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_REASON",
            message: "Rejection reason is required",
          },
        });
      }

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      const insuranceClaim = new Insurance(claim);
      await insuranceClaim.reject(reason, req.user.userId);

      // Clear cache
      await redis.del(`insurance:claim:${id}`);

      res.json({
        success: true,
        message: "Claim rejected successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Mark claim as paid
   * @route   PUT /api/v1/insurance/claims/:id/paid
   * @access  Private (Accounts)
   */
  async markAsPaid(req, res, next) {
    try {
      const { id } = req.params;
      const { paid_amount } = req.body;

      if (!paid_amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_AMOUNT",
            message: "Paid amount is required",
          },
        });
      }

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      const insuranceClaim = new Insurance(claim);
      await insuranceClaim.markAsPaid(paid_amount, req.user.userId);

      // Clear cache
      await redis.del(`insurance:claim:${id}`);
      await redis.del(`billing:invoice:${claim.invoice_id}`);

      res.json({
        success: true,
        message: "Claim marked as paid successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update claim item
   * @route   PUT /api/v1/insurance/claims/:claimId/items/:itemId
   * @access  Private (Insurance Officer)
   */
  async updateClaimItem(req, res, next) {
    try {
      const { claimId, itemId } = req.params;

      const claim = await Insurance.findClaimById(claimId);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      const insuranceClaim = new Insurance(claim);
      const updated = await insuranceClaim.updateItem(itemId, req.body);

      // Clear cache
      await redis.del(`insurance:claim:${claimId}`);

      res.json({
        success: true,
        data: updated,
        message: "Claim item updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get claim status history
   * @route   GET /api/v1/insurance/claims/:id/history
   * @access  Private
   */
  async getClaimHistory(req, res, next) {
    try {
      const { id } = req.params;

      const claim = await Insurance.findClaimById(id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      const insuranceClaim = new Insurance(claim);
      const history = await insuranceClaim.getStatusHistory();

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add patient insurance
   * @route   POST /api/v1/insurance/patient-insurance
   * @access  Private (Records, Insurance Officer)
   */
  async addPatientInsurance(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const insurance = await Insurance.addPatientInsurance(
        req.body,
        req.user.userId
      );

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);

      res.status(201).json({
        success: true,
        data: insurance,
        message: "Patient insurance added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient active insurance
   * @route   GET /api/v1/insurance/patients/:patientId/active
   * @access  Private
   */
  async getPatientActiveInsurance(req, res, next) {
    try {
      const { patientId } = req.params;

      const insurance = await Insurance.getPatientActiveInsurance(patientId);

      res.json({
        success: true,
        data: insurance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Verify NHIS number
   * @route   POST /api/v1/insurance/verify-nhis
   * @access  Private
   */
  async verifyNHIS(req, res, next) {
    try {
      const { nhis_number, patient_id } = req.body;

      if (!nhis_number) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_NHIS",
            message: "NHIS number is required",
          },
        });
      }

      // use dedicated NHIS service for verification
      const result = await nhisVerificationService.verifyNHIS(
        nhis_number,
        patient_id
      );

      // Log verification
      await Insurance.logNHISVerification({
        patient_id,
        nhis_number,
        verification_status: result.valid ? "Verified" : "Invalid",
        response_data: result,
        verified_by: req.user.userId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Check patient eligibility
   * @route   GET /api/v1/insurance/patients/:patientId/eligibility
   * @access  Private
   */
  async checkEligibility(req, res, next) {
    try {
      const { patientId } = req.params;
      const { service_type } = req.query;

      const eligibility = await claimsITService.checkEligibility(
        patientId,
        service_type
      );

      res.json({
        success: true,
        data: eligibility,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get NHIS verification history
   * @route   GET /api/v1/insurance/patients/:patientId/nhis-history
   * @access  Private
   */
  async getNHISVerificationHistory(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const history = await Insurance.getNHISVerificationHistory(
        patientId,
        limit
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get claim statistics
   * @route   GET /api/v1/insurance/stats
   * @access  Private
   */
  async getClaimStats(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_DATES",
            message: "Start date and end date are required",
          },
        });
      }

      const stats = await Insurance.getClaimStats(
        req.user.facilityId,
        start_date,
        end_date
      );
      const byProvider = await Insurance.getClaimsByProvider(
        req.user.facilityId,
        start_date,
        end_date
      );
      const rejections = await Insurance.getRejectionAnalysis(
        req.user.facilityId,
        start_date,
        end_date
      );

      res.json({
        success: true,
        data: {
          summary: stats,
          by_provider: byProvider,
          rejections: rejections,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get insurance dashboard
   * @route   GET /api/v1/insurance/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(
        `
        WITH claim_summary AS (
          SELECT
            COUNT(*) as total_claims,
            SUM(CASE WHEN status = 'Pending' THEN 1 END) as pending_claims,
            SUM(CASE WHEN status = 'Submitted' THEN 1 END) as submitted_claims,
            SUM(CASE WHEN status = 'Approved' THEN 1 END) as approved_claims,
            SUM(CASE WHEN status = 'Rejected' THEN 1 END) as rejected_claims,
            SUM(CASE WHEN status = 'Paid' THEN 1 END) as paid_claims,
            COALESCE(SUM(total_amount), 0) as total_amount,
            COALESCE(SUM(paid_amount), 0) as total_paid
          FROM insurance_claims
          WHERE facility_id = $1
            AND created_at >= NOW() - INTERVAL '30 days'
        ),
        by_provider AS (
          SELECT
            pi.insurance_provider,
            COUNT(*) as claim_count,
            SUM(ic.total_amount) as total_amount
          FROM insurance_claims ic
          JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
          WHERE ic.facility_id = $1
            AND ic.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY pi.insurance_provider
          ORDER BY claim_count DESC
          LIMIT 5
        ),
        recent_claims AS (
          SELECT
            ic.*,
            p.first_name || ' ' || p.last_name as patient_name,
            pi.insurance_provider
          FROM insurance_claims ic
          JOIN patients p ON ic.patient_id = p.id
          JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
          WHERE ic.facility_id = $1
          ORDER BY ic.created_at DESC
          LIMIT 10
        )
        SELECT
          (SELECT row_to_json(claim_summary) FROM claim_summary) as summary,
          (SELECT json_agg(by_provider) FROM by_provider) as top_providers,
          (SELECT json_agg(recent_claims) FROM recent_claims) as recent_claims
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: stats.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Sync claim status with ClaimsIT
   * @route   POST /api/v1/insurance/sync
   * @access  Private (Insurance Officer)
   */
  async syncClaimStatus(req, res, next) {
    try {
      const { claim_id } = req.body;

      if (!claim_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_CLAIM_ID",
            message: "Claim ID is required",
          },
        });
      }

      const claim = await Insurance.findClaimById(claim_id);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Claim not found",
          },
        });
      }

      if (!claim.claimsit_claim_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: "NO_CLAIMSIT_ID",
            message: "Claim does not have a ClaimsIT ID",
          },
        });
      }

      const status = await claimsITService.checkClaimStatus(
        claim.claimsit_claim_id
      );

      res.json({
        success: true,
        data: status,
        message: "Claim status synced successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get tariff rates
   * @route   GET /api/v1/insurance/tariff/:serviceCode
   * @access  Private
   */
  async getTariff(req, res, next) {
    try {
      const { serviceCode } = req.params;
      const { date } = req.query;

      const tariff = await claimsITService.getTariff(serviceCode, date);

      res.json({
        success: true,
        data: tariff,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Handle ClaimsIT webhook
   * @route   POST /api/v1/insurance/webhook
   * @access  Public (with signature verification)
   */
  async handleWebhook(req, res, next) {
    try {
      const signature = req.headers["x-claimsit-signature"];

      if (!signature) {
        return res.status(401).json({
          success: false,
          error: {
            code: "MISSING_SIGNATURE",
            message: "Webhook signature is required",
          },
        });
      }

      const result = await claimsITService.handleWebhook(req.body, signature);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InsuranceController();
