const Patient = require("../models/Patient");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");
const emailService = require("../config/email");
const { validationResult } = require("express-validator");

/**
 * Fields a client is allowed to set when registering a patient.
 * Everything else that happens to arrive in req.body is silently
 * dropped to prevent mass-assignment attacks.
 */
const REGISTRATION_ALLOWED_FIELDS = [
  "title",
  "first_name",
  "middle_name",
  "last_name",
  "date_of_birth",
  "gender",
  "marital_status",
  "phone_number",
  "alternate_phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "district",
  "region",
  "postal_code",
  "digital_address",
  "nhis_number",
  "nhis_expiry_date",
  "ghs_unique_identifier",
  "blood_group",
  "genotype",
  "allergies",
  "chronic_conditions",
  "current_medications",
  "surgical_history",
  "family_history",
  "social_history",
  "occupation",
  "employer_name",
  "nationality",
  "religion",
  "tribe",
  "hometown",
  "region_of_origin",
  "id_type",
  "id_number",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "emergency_contact_address",
  "patient_photo_url",
];

class PatientController {
  /**
   * @desc    Register a new patient
   * @route   POST /api/v1/patients
   * @access  Private (Records, Reception)
   */
  async register(req, res, next) {
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

      // Use an explicit allowlist to prevent mass assignment
      const patientData = {
        facility_id: req.user.facilityId,
        ...Object.fromEntries(
          Object.entries(req.body).filter(([key]) =>
            REGISTRATION_ALLOWED_FIELDS.includes(key)
          )
        ),
      };

      // Guard: reject duplicate phone_number to prevent double registration
      if (patientData.phone_number) {
        const existingByPhone = await Patient.findByPhone(patientData.phone_number);
        if (existingByPhone) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'DUPLICATE_PHONE',
              message: `A patient with phone number ${patientData.phone_number} already exists (${existingByPhone.patient_number})`
            }
          });
        }
      }

      const patient = await Patient.create(
        patientData,
        req.user.userId,
        req.user.facilityId
      );

      // Clear cache
      await redis.clearPattern("patients:*");

      // Send welcome email asynchronously — do not block the response on SMTP
      if (patient.email) {
        emailService.sendWelcomeEmail(patient).catch((emailError) => {
          logger.error("Failed to send welcome email:", emailError);
        });
      }

      res.status(201).json({
        success: true,
        data: patient.toJSON(),
        message: "Patient registered successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all patients with pagination
   * @route   GET /api/v1/patients
   * @access  Private
   */
  async getPatients(req, res, next) {
    try {
      const {
        page,
        limit,
        search,
        gender,
        blood_group,
        status,
        from_date,
        to_date,
        age_min,
        age_max,
      } = req.query;

      // Build cache key
      const cacheKey = `patients:${JSON.stringify(req.query)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }

      const result = await Patient.findAll(
        {
          search,
          gender,
          blood_group,
          status,
          facility_id: req.user.facilityId,
          from_date,
          to_date,
          age_min,
          age_max,
        },
        { page, limit }
      );

      // Cache for 5 minutes
      await redis.set(cacheKey, result, 300);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get single patient by ID
   * @route   GET /api/v1/patients/:id
   * @access  Private
   */
  async getPatient(req, res, next) {
    try {
      const { id } = req.params;

      // Check cache
      const cacheKey = `patient:${id}`;
      let patient = await redis.get(cacheKey);

      if (!patient) {
        patient = await Patient.findById(id);

        if (!patient) {
          return res.status(404).json({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No patient found with that ID. Please check the patient information and try again.",
            },
          });
        }

        // Verify facility access
        if (patient.facility_id !== req.user.facilityId) {
          return res.status(403).json({
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "You can only update patients registered at your facility.",
            },
          });
        }

        // Cache for 1 hour
        await redis.set(cacheKey, patient.toJSON(), 3600);
      }

      res.json({
        success: true,
        data: patient,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update patient
   * @route   PUT /api/v1/patients/:id
   * @access  Private (Records, Doctors)
   */
  async updatePatient(req, res, next) {
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

      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      // Verify facility access
      if (patient.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only update patients registered at your facility.",
          },
        });
      }

      const updatedPatient = await patient.update(req.body, req.user.userId);

      // Clear cache
      await redis.del(`patient:${id}`);
      await redis.clearPattern("patients:*");

      res.json({
        success: true,
        data: updatedPatient.toJSON(),
        message: "Patient updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Search patients
   * @route   GET /api/v1/patients/search
   * @access  Private
   */
  async searchPatients(req, res, next) {
    try {
      const { q } = req.query;

      if (!q || q.length < 3) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SEARCH",
            message: "Search query must be at least 3 characters",
          },
        });
      }

      const patients = await Patient.search(q, req.user.facilityId);

      res.json({
        success: true,
        data: patients,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient by patient number
   * @route   GET /api/v1/patients/number/:patientNumber
   * @access  Private
   */
  async getPatientByNumber(req, res, next) {
    try {
      const { patientNumber } = req.params;

      const patient = await Patient.findByPatientNumber(patientNumber);

      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      // Verify facility access
      if (patient.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only update patients registered at your facility.",
          },
        });
      }

      res.json({
        success: true,
        data: patient.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient by phone number
   * @route   GET /api/v1/patients/phone/:phone
   * @access  Private
   */
  async getPatientByPhone(req, res, next) {
    try {
      const { phone } = req.params;

      const patient = await Patient.findByPhone(phone);

      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      // Verify facility access
      if (patient.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only update patients registered at your facility.",
          },
        });
      }

      res.json({
        success: true,
        data: patient.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient by NHIS number
   * @route   GET /api/v1/patients/nhis/:nhisNumber
   * @access  Private
   */
  async getPatientByNHIS(req, res, next) {
    try {
      const { nhisNumber } = req.params;

      const patient = await Patient.findByNHIS(nhisNumber);

      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      // Verify facility access
      if (patient.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only update patients registered at your facility.",
          },
        });
      }

      res.json({
        success: true,
        data: patient.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add patient vitals
   * @route   POST /api/v1/patients/:id/vitals
   * @access  Private (Nurses)
   */
  async addVitals(req, res, next) {
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

      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      // Verify facility access
      if (patient.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only update patients registered at your facility.",
          },
        });
      }

      const vital = await patient.addVital(req.body, req.user.userId);

      // Clear patient cache
      await redis.del(`patient:${id}`);

      res.status(201).json({
        success: true,
        data: vital,
        message: "Vitals recorded successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient vitals
   * @route   GET /api/v1/patients/:id/vitals
   * @access  Private
   */
  async getVitals(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 20 } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const vitals = await patient.getVitals(limit);

      res.json({
        success: true,
        data: vitals,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add next of kin
   * @route   POST /api/v1/patients/:id/next-of-kin
   * @access  Private
   */
  async addNextOfKin(req, res, next) {
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

      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const kin = await patient.addNextOfKin(req.body);

      // Clear cache
      await redis.del(`patient:${id}`);

      res.status(201).json({
        success: true,
        data: kin,
        message: "Next of kin added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update next of kin
   * @route   PUT /api/v1/patients/:patientId/next-of-kin/:kinId
   * @access  Private
   */
  async updateNextOfKin(req, res, next) {
    try {
      const { patientId, kinId } = req.params;

      const patient = await Patient.findById(patientId);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const kin = await patient.updateNextOfKin(kinId, req.body);

      // Clear cache
      await redis.del(`patient:${patientId}`);

      res.json({
        success: true,
        data: kin,
        message: "Next of kin updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Delete next of kin
   * @route   DELETE /api/v1/patients/:patientId/next-of-kin/:kinId
   * @access  Private
   */
  async deleteNextOfKin(req, res, next) {
    try {
      const { patientId, kinId } = req.params;

      const patient = await Patient.findById(patientId);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      await patient.deleteNextOfKin(kinId);

      // Clear cache
      await redis.del(`patient:${patientId}`);

      res.json({
        success: true,
        message: "Next of kin deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add patient insurance
   * @route   POST /api/v1/patients/:id/insurance
   * @access  Private
   */
  async addInsurance(req, res, next) {
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

      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const insurance = await patient.addInsurance(req.body);

      // Clear cache
      await redis.del(`patient:${id}`);

      res.status(201).json({
        success: true,
        data: insurance,
        message: "Insurance added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update patient insurance
   * @route   PUT /api/v1/patients/:patientId/insurance/:insuranceId
   * @access  Private
   */
  async updateInsurance(req, res, next) {
    try {
      const { patientId, insuranceId } = req.params;

      const patient = await Patient.findById(patientId);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const insurance = await patient.updateInsurance(insuranceId, req.body);

      // Clear cache
      await redis.del(`patient:${patientId}`);

      res.json({
        success: true,
        data: insurance,
        message: "Insurance updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient visits
   * @route   GET /api/v1/patients/:id/visits
   * @access  Private
   */
  async getVisits(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const visits = await patient.getVisits(limit);

      res.json({
        success: true,
        data: visits,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient appointments
   * @route   GET /api/v1/patients/:id/appointments
   * @access  Private
   */
  async getAppointments(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10, upcoming = true } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const appointments = await patient.getAppointments(limit, !upcoming);

      res.json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient prescriptions
   * @route   GET /api/v1/patients/:id/prescriptions
   * @access  Private
   */
  async getPrescriptions(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const prescriptions = await patient.getPrescriptions(limit);

      res.json({
        success: true,
        data: prescriptions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient lab orders
   * @route   GET /api/v1/patients/:id/lab-orders
   * @access  Private
   */
  async getLabOrders(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const labOrders = await patient.getLabOrders(limit);

      res.json({
        success: true,
        data: labOrders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient bills
   * @route   GET /api/v1/patients/:id/bills
   * @access  Private
   */
  async getBills(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const bills = await patient.getBills(limit);

      res.json({
        success: true,
        data: bills,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient outstanding balance
   * @route   GET /api/v1/patients/:id/outstanding-balance
   * @access  Private
   */
  async getOutstandingBalance(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const outstanding = await patient.getOutstandingBalance();

      res.json({
        success: true,
        data: { outstanding },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient NHIS status
   * @route   GET /api/v1/patients/:id/nhis-status
   * @access  Private
   */
  async getNHISStatus(req, res, next) {
    try {
      const { id } = req.params;

      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No patient found with that ID. Please check the patient information and try again.",
          },
        });
      }

      const status = await patient.getNHISStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient dashboard
   * @route   GET /api/v1/patients/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const stats = await Patient.getDashboardStats(req.user.facilityId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Merge duplicate patient records
   * @route   POST /api/v1/patients/merge
   * @access  Private (Admin only)
   */
  async deactivatePatient(req, res, next) {
    try {
      const { id } = req.params;
      const patient = await Patient.hardDelete(id);
      if (!patient) {
        return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "No patient found with that ID. Please check and try again." } });
      }
      await redis.clearPattern("patients:*");
      await redis.del(`patient:${id}`);
      res.json({ success: true, message: "Patient deleted permanently" });
    } catch (error) {
      next(error);
    }
  }

  async mergePatients(req, res, next) {
    try {
      const { primaryId, secondaryIds } = req.body;

      if (!primaryId || !secondaryIds || !Array.isArray(secondaryIds)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATA",
            message: "Primary ID and secondary IDs array are required",
          },
        });
      }

      // Start transaction
      const result = await db.transaction(async (client) => {
        // Get primary patient
        const primary = await Patient.findById(primaryId);
        if (!primary) {
          throw new Error("Primary patient not found");
        }

        for (const secondaryId of secondaryIds) {
          const secondary = await Patient.findById(secondaryId);
          if (!secondary) continue;

          // Update all references to secondary patient
          await client.query(
            `
            UPDATE visits SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          await client.query(
            `
            UPDATE appointments SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          await client.query(
            `
            UPDATE diagnoses SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          await client.query(
            `
            UPDATE prescriptions SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          await client.query(
            `
            UPDATE lab_orders SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          await client.query(
            `
            UPDATE invoices SET patient_id = $1 WHERE patient_id = $2
          `,
            [primaryId, secondaryId]
          );

          // Mark secondary as merged
          await client.query(
            `
            UPDATE patients SET
              patient_status = 'Merged',
              merged_into = $1,
              updated_at = NOW()
            WHERE id = $2
          `,
            [primaryId, secondaryId]
          );
        }

        return { merged: secondaryIds.length };
      });

      // Clear cache
      await redis.clearPattern("patients:*");
      await redis.del(`patient:${primaryId}`);

      res.json({
        success: true,
        data: result,
        message: `Successfully merged ${result.merged} patient records`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Export patients
   * @route   GET /api/v1/patients/export
   * @access  Private (Admin only)
   */
  async exportPatients(req, res, next) {
    try {
      const { format = "json", from_date, to_date } = req.query;

      const filters = {
        facility_id: req.user.facilityId,
        from_date,
        to_date,
      };

      const patients = await Patient.findAll(filters, { limit: 10000 });

      if (format === "csv") {
        const csv = this.convertToCSV(patients.patients);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=patients.csv"
        );
        return res.send(csv);
      }

      res.json({
        success: true,
        data: patients.patients,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Convert patients to CSV
   * @access  Private
   */
  convertToCSV(patients) {
    if (patients.length === 0) return "";

    const headers = [
      "patient_number",
      "first_name",
      "last_name",
      "date_of_birth",
      "gender",
      "phone_number",
      "email",
      "nhis_number",
      "address",
      "city",
      "region",
      "registration_date",
    ];

    const csvRows = [];
    csvRows.push(headers.join(","));

    for (const patient of patients) {
      const values = headers.map((header) => {
        const value = patient[header];
        return value === null || value === undefined
          ? ""
          : `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(","));
    }

    return csvRows.join("\n");
  }
}

module.exports = new PatientController();
