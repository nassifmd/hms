const axios = require("axios");
const db = require("../config/database");
const logger = require("../config/logger");
const redis = require("../config/redis");
const { AppError } = require("../middleware/errorHandler");

class NHISVerificationService {
  constructor() {
    this.baseURL = process.env.NHIS_API_URL || "https://api.nhis.gov.gh/v1";
    this.apiKey = process.env.NHIS_API_KEY;
    this.clientId = process.env.NHIS_CLIENT_ID;
    this.client = null;
    this.initialize();
  }

  /**
   * Initialize NHIS verification service
   */
  initialize() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": this.apiKey,
        "X-Client-ID": this.clientId,
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error("NHIS API Error:", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );

    logger.info("NHIS verification service initialized");
  }

  /**
   * Verify NHIS number
   */
  async verifyNHIS(nhisNumber, patientId = null) {
    try {
      // Check cache first
      const cacheKey = `nhis:verify:${nhisNumber}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug("NHIS verification cache hit", { nhisNumber });
        return cached;
      }

      // Validate NHIS number format
      if (!this.validateNHISFormat(nhisNumber)) {
        throw new AppError(
          "Invalid NHIS number format",
          400,
          "INVALID_NHIS_FORMAT"
        );
      }

      // Call NHIS API
      const response = await this.client.post("/verify", {
        nhis_number: nhisNumber,
        timestamp: new Date().toISOString(),
      });

      const result = {
        valid: response.data.valid,
        status: response.data.status,
        firstName: response.data.first_name,
        lastName: response.data.last_name,
        dateOfBirth: response.data.date_of_birth,
        gender: response.data.gender,
        membershipType: response.data.membership_type,
        expiryDate: response.data.expiry_date,
        region: response.data.region,
        district: response.data.district,
        scheme: response.data.scheme,
        verificationDate: new Date().toISOString(),
      };

      // Cache result for 1 hour
      await redis.set(cacheKey, result, 3600);

      // Log verification
      if (patientId) {
        await this.logVerification(patientId, nhisNumber, result);
      }

      return result;
    } catch (error) {
      logger.error("NHIS verification failed:", error);

      return {
        valid: false,
        error:
          error.response?.data?.message || "Verification service unavailable",
        verificationDate: new Date().toISOString(),
      };
    }
  }

  /**
   * Batch verify NHIS numbers
   */
  async batchVerify(nhisNumbers, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;

    for (let i = 0; i < nhisNumbers.length; i += batchSize) {
      const batch = nhisNumbers.slice(i, i + batchSize);

      const batchPromises = batch.map(async (nhisNumber) => {
        try {
          const result = await this.verifyNHIS(nhisNumber);
          return { nhisNumber, success: true, result };
        } catch (error) {
          return { nhisNumber, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map((r) => r.value));

      // Rate limiting - wait between batches
      if (i + batchSize < nhisNumbers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Validate NHIS number format
   */
  validateNHISFormat(nhisNumber) {
    // NHIS format: NHIS/12345678 or 12345678
    const pattern = /^(NHIS\/)?\d{6,10}$/i;
    return pattern.test(nhisNumber);
  }

  /**
   * Extract NHIS number components
   */
  parseNHISNumber(nhisNumber) {
    const clean = nhisNumber.replace(/^NHIS\//i, "");
    return {
      full: nhisNumber,
      clean,
      isValid: this.validateNHISFormat(nhisNumber),
    };
  }

  /**
   * Check member eligibility for service
   */
  async checkEligibility(nhisNumber, serviceCode) {
    try {
      const cacheKey = `nhis:eligibility:${nhisNumber}:${serviceCode}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return cached;
      }

      const response = await this.client.post("/eligibility", {
        nhis_number: nhisNumber,
        service_code: serviceCode,
        timestamp: new Date().toISOString(),
      });

      const result = {
        eligible: response.data.eligible,
        coverage: response.data.coverage_percentage,
        copay: response.data.copay_amount,
        limit: response.data.benefit_limit,
        authorizationRequired: response.data.authorization_required,
        preAuthNumber: response.data.pre_authorization_number,
        expiryDate: response.data.expiry_date,
      };

      // Cache for 5 minutes
      await redis.set(cacheKey, result, 300);

      return result;
    } catch (error) {
      logger.error("Eligibility check failed:", error);
      throw new AppError(
        "Failed to check eligibility",
        503,
        "ELIGIBILITY_CHECK_FAILED"
      );
    }
  }

  /**
   * Get member details
   */
  async getMemberDetails(nhisNumber) {
    try {
      const cacheKey = `nhis:member:${nhisNumber}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return cached;
      }

      const response = await this.client.get(`/members/${nhisNumber}`);

      const result = {
        nhisNumber: response.data.nhis_number,
        firstName: response.data.first_name,
        lastName: response.data.last_name,
        otherNames: response.data.other_names,
        dateOfBirth: response.data.date_of_birth,
        gender: response.data.gender,
        membershipType: response.data.membership_type,
        membershipStatus: response.data.membership_status,
        enrollmentDate: response.data.enrollment_date,
        expiryDate: response.data.expiry_date,
        region: response.data.region,
        district: response.data.district,
        scheme: response.data.scheme,
        photo: response.data.photo_url,
      };

      // Cache for 24 hours
      await redis.set(cacheKey, result, 86400);

      return result;
    } catch (error) {
      logger.error("Failed to get member details:", error);
      throw new AppError(
        "Failed to get member details",
        503,
        "MEMBER_DETAILS_FAILED"
      );
    }
  }

  /**
   * Log verification attempt
   */
  async logVerification(patientId, nhisNumber, result) {
    try {
      // store a simple representation of the result object (stringify)
      const responseData = JSON.stringify(result);

      await db.query(
        `
        INSERT INTO nhis_verification_logs (
          patient_id, nhis_number, verification_status,
          response_data, verification_date
        ) VALUES ($1, $2, $3, $4, NOW())
      `,
        [
          patientId,
          nhisNumber,
          result && result.valid ? "VERIFIED" : "FAILED",
          responseData,
        ]
      );
    } catch (error) {
      logger.error("Failed to log NHIS verification:", error);
    }
  }

  /**
   * Get verification history
   */
  async getVerificationHistory(patientId, limit = 20) {
    try {
      const result = await db.query(
        `
        SELECT *, verification_date as verified_at
        FROM nhis_verification_logs
        WHERE patient_id = $1
        ORDER BY verification_date DESC
        LIMIT $2
      `,
        [patientId, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error("Failed to get verification history:", error);
      throw new AppError(
        "Failed to get verification history",
        500,
        "HISTORY_FETCH_FAILED"
      );
    }
  }

  /**
   * Get NHIS statistics
   */
  async getStatistics(facilityId, period = "month") {
    try {
      const interval = period === "month" ? "30 days" : "7 days";

      const result = await db.query(
        `
        SELECT
          COUNT(*) as total_verifications,
          COUNT(CASE WHEN verification_status = 'VERIFIED' THEN 1 END) as successful,
          COUNT(CASE WHEN verification_status = 'FAILED' THEN 1 END) as failed,
          COUNT(DISTINCT patient_id) as unique_patients
        FROM nhis_verification_logs
        WHERE verification_date >= NOW() - $1::interval
      `,
        [`${interval}`]
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Failed to get NHIS statistics:", error);
      throw new AppError("Failed to get statistics", 500, "STATS_FETCH_FAILED");
    }
  }

  /**
   * Sync NHIS member data with local records
   */
  async syncMemberData(patientId, nhisNumber) {
    try {
      const memberDetails = await this.getMemberDetails(nhisNumber);

      if (memberDetails) {
        await db.query(
          `
          UPDATE patients
          SET
            first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            date_of_birth = COALESCE($3, date_of_birth),
            gender = COALESCE($4, gender),
            nhis_expiry_date = $5,
            updated_at = NOW()
          WHERE id = $6
        `,
          [
            memberDetails.firstName,
            memberDetails.lastName,
            memberDetails.dateOfBirth,
            memberDetails.gender,
            memberDetails.expiryDate,
            patientId,
          ]
        );

        logger.info("NHIS member data synced", { patientId, nhisNumber });
      }

      return memberDetails;
    } catch (error) {
      logger.error("Failed to sync NHIS member data:", error);
      throw new AppError("Failed to sync member data", 503, "SYNC_FAILED");
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    try {
      const startTime = Date.now();
      await this.client.get("/health");
      const latency = Date.now() - startTime;

      return {
        initialized: true,
        online: true,
        latency,
        baseURL: this.baseURL,
      };
    } catch (error) {
      return {
        initialized: true,
        online: false,
        error: error.message,
        baseURL: this.baseURL,
      };
    }
  }
}

module.exports = new NHISVerificationService();
