const Visit = require('../models/Visit');
const Diagnosis = require('../models/Diagnosis');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Audit = require('../models/Audit');
const Billing = require('../models/Billing');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { validationResult } = require('express-validator');

class ClinicalController {
  /**
   * @desc    Create a new visit
   * @route   POST /api/v1/clinical/visits
   * @access  Private (Reception, Nurses, Doctors)
   */
  async createVisit(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg
          }
        });
      }

      const visitData = {
        ...req.body,
        facility_id: req.user.facilityId
      };

      const visit = await Visit.create(visitData, req.user.userId);

      // If created from an appointment, link the appointment to this visit
      if (req.body.appointment_id) {
        try {
          const Appointment = require('../models/Appointment');
          const appt = await Appointment.findById(req.body.appointment_id);
          if (appt && appt.facility_id === req.user.facilityId) {
            await appt.linkToVisit(visit.id);
          }
        } catch (_) { /* non-fatal */ }
      }

      // Auto-bill the consultation fee (fire-and-forget)
      if (req.user.facilityId && visitData.patient_id) {
        Billing.addToPatientInvoice({
          facilityId: req.user.facilityId,
          patientId: visitData.patient_id,
          visitId: visit.id,
          serviceType: visitData.visit_type === 'Emergency' ? 'Consultation' : (visitData.visit_type || 'Consultation'),
          serviceId: visit.id,
          itemName: `${visitData.visit_type || 'Consultation'} - ${visitData.chief_complaint || 'Visit'}`,
          itemCode: null,
          quantity: 1,
        }, req.user.userId).catch((billingErr) => {
          logger.warn('Auto-billing failed for consultation', { error: billingErr.message, visitId: visit.id });
        });
      }

      // Clear cache
      await redis.clearPattern('visits:*');
      await redis.del(`patient:${visitData.patient_id}`);

      res.status(201).json({
        success: true,
        data: visit,
        message: 'Visit created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get visits list
   * @route   GET /api/v1/clinical/visits
   * @access  Private
   */
  async getVisits(req, res, next) {
    try {
      const { date, search, limit = 30 } = req.query;
      const rows = await Visit.findAll(req.user.facilityId, { date, search, limit });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get visit by ID
   * @route   GET /api/v1/clinical/visits/:id
   * @access  Private
   */
  async getVisit(req, res, next) {
    try {
      const { id } = req.params;

      // Serve from cache when available — all write operations already call
      // redis.del(`visit:${id}`) so the cached value is always fresh.
      const cacheKey = `visit:${id}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedVisit = JSON.parse(cached);
        if (cachedVisit.facility_id !== req.user.facilityId) {
          return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied to this visit' }
          });
        }
        return res.json({ success: true, data: cachedVisit });
      }

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      // Verify facility access
      if (visit.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this visit'
          }
        });
      }

      // Cache for 120 s — short enough that stale reads are negligible
      await redis.set(cacheKey, JSON.stringify(visit), 120);

      res.json({
        success: true,
        data: visit
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update visit
   * @route   PUT /api/v1/clinical/visits/:id
   * @access  Private (Doctors, Nurses)
   */
  async updateVisit(req, res, next) {
    try {
      const { id } = req.params;

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      // Verify facility access
      if (visit.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this visit'
          }
        });
      }

      const updated = await visit.update(req.body, req.user.userId);

      // Clear cache
      await redis.del(`visit:${id}`);
      await redis.del(`patient:${visit.patient_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Visit updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Triage patient
   * @route   PUT /api/v1/clinical/visits/:id/triage
   * @access  Private (Nurses)
   */
  async triageVisit(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg
          }
        });
      }

      const { id } = req.params;

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      // Verify facility access
      if (visit.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this visit'
          }
        });
      }

      await visit.triage(req.body, req.user.userId);

      // Clear cache
      await redis.del(`visit:${id}`);

      res.json({
        success: true,
        message: 'Triage completed successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add diagnosis to visit
   * @route   POST /api/v1/clinical/visits/:id/diagnoses
   * @access  Private (Doctors)
   */
  async addDiagnosis(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg
          }
        });
      }

      const { id } = req.params;

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      // Verify facility access
      if (visit.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this visit'
          }
        });
      }

      const diagnosis = await visit.addDiagnosis(req.body, req.user.userId);

      // Clear cache
      await redis.del(`visit:${id}`);
      await redis.del(`patient:${visit.patient_id}`);

      res.status(201).json({
        success: true,
        data: diagnosis,
        message: 'Diagnosis added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get diagnoses for visit
   * @route   GET /api/v1/clinical/visits/:id/diagnoses
   * @access  Private
   */
  async getDiagnoses(req, res, next) {
    try {
      const { id } = req.params;

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      const diagnoses = await Diagnosis.findByVisit(id);

      res.json({
        success: true,
        data: diagnoses
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get single diagnosis by ID
   * @route   GET /api/v1/clinical/diagnoses/:id
   * @access  Private
   */
  async getDiagnosis(req, res, next) {
    try {
      const { id } = req.params;

      const diagnosis = await Diagnosis.findById(id);

      if (!diagnosis) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Diagnosis not found' }
        });
      }

      // Verify facility access via visit
      const visit = await Visit.findById(diagnosis.visit_id);
      if (visit && visit.facility_id !== req.user.facilityId && !req.user.roles.includes('SYS_ADMIN')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied to this diagnosis' }
        });
      }

      res.json({ success: true, data: diagnosis });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update diagnosis
   * @route   PUT /api/v1/clinical/diagnoses/:id
   * @access  Private (Doctors)
   */
  async updateDiagnosis(req, res, next) {
    try {
      const { id } = req.params;

      const diagnosis = await Diagnosis.findById(id);

      if (!diagnosis) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Diagnosis not found'
          }
        });
      }

      const updated = await diagnosis.update(req.body, req.user.userId);

      // Clear cache
      await redis.del(`visit:${diagnosis.visit_id}`);
      await redis.del(`patient:${diagnosis.patient_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Diagnosis updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Confirm diagnosis
   * @route   PUT /api/v1/clinical/diagnoses/:id/confirm
   * @access  Private (Doctors)
   */
  async confirmDiagnosis(req, res, next) {
    try {
      const { id } = req.params;

      const diagnosis = await Diagnosis.findById(id);

      if (!diagnosis) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Diagnosis not found'
          }
        });
      }

      await diagnosis.confirm(req.user.userId);

      // Clear cache
      await redis.del(`visit:${diagnosis.visit_id}`);

      res.json({
        success: true,
        message: 'Diagnosis confirmed successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create prescription
   * @route   POST /api/v1/clinical/prescriptions
   * @access  Private (Doctors)
   */
  async createPrescription(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg
          }
        });
      }

      const prescription = await Prescription.create(req.body, req.user.userId);

      // Clear cache
      await redis.del(`visit:${req.body.visit_id}`);
      await redis.del(`patient:${req.body.patient_id}`);

      res.status(201).json({
        success: true,
        data: prescription,
        message: 'Prescription created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get prescription by ID
   * @route   GET /api/v1/clinical/prescriptions/:id
   * @access  Private
   */
  async getPrescription(req, res, next) {
    try {
      const { id } = req.params;

      const prescription = await Prescription.findById(id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found'
          }
        });
      }

      res.json({
        success: true,
        data: prescription
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update prescription
   * @route   PUT /api/v1/clinical/prescriptions/:id
   * @access  Private (Doctors)
   */
  async updatePrescription(req, res, next) {
    try {
      const { id } = req.params;

      const prescription = await Prescription.findById(id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found'
          }
        });
      }

      // Update prescription (simplified - you'd need to implement update method)
      const updated = await db.query(`
        UPDATE prescriptions 
        SET notes = COALESCE($1, notes)
        WHERE id = $2
        RETURNING *
      `, [req.body.notes, id]);

      // Clear cache
      await redis.del(`prescription:${id}`);

      res.json({
        success: true,
        data: updated.rows[0],
        message: 'Prescription updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add item to prescription
   * @route   POST /api/v1/clinical/prescriptions/:id/items
   * @access  Private (Doctors)
   */
  async addPrescriptionItem(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.array()[0].msg
          }
        });
      }

      const { id } = req.params;

      const prescription = await Prescription.findById(id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found'
          }
        });
      }

      const item = await prescription.addItem(req.body);

      // Clear cache
      await redis.del(`prescription:${id}`);

      res.status(201).json({
        success: true,
        data: item,
        message: 'Item added to prescription successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update prescription item
   * @route   PUT /api/v1/clinical/prescriptions/:prescriptionId/items/:itemId
   * @access  Private (Doctors)
   */
  async updatePrescriptionItem(req, res, next) {
    try {
      const { prescriptionId, itemId } = req.params;

      const prescription = await Prescription.findById(prescriptionId);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found'
          }
        });
      }

      const item = await prescription.updateItem(itemId, req.body);

      // Clear cache
      await redis.del(`prescription:${prescriptionId}`);

      res.json({
        success: true,
        data: item,
        message: 'Prescription item updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Remove prescription item
   * @route   DELETE /api/v1/clinical/prescriptions/:prescriptionId/items/:itemId
   * @access  Private (Doctors)
   */
  async removePrescriptionItem(req, res, next) {
    try {
      const { prescriptionId, itemId } = req.params;

      const prescription = await Prescription.findById(prescriptionId);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found'
          }
        });
      }

      await prescription.removeItem(itemId);

      // Clear cache
      await redis.del(`prescription:${prescriptionId}`);

      res.json({
        success: true,
        message: 'Prescription item removed successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get active visits
   * @route   GET /api/v1/clinical/visits/active
   * @access  Private
   */
  async getActiveVisits(req, res, next) {
    try {
      // if facilityId is null (e.g. system admin) the model will return all active
      // visits rather than filtering by facility
      const visits = await Visit.getActiveVisits(req.user.facilityId);

      res.json({
        success: true,
        data: visits
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient visits
   * @route   GET /api/v1/clinical/patients/:patientId/visits
   * @access  Private
   */
  async getPatientVisits(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const visits = await Visit.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: visits
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient diagnoses
   * @route   GET /api/v1/clinical/patients/:patientId/diagnoses
   * @access  Private
   */
  async getPatientDiagnoses(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 20 } = req.query;

      const diagnoses = await Diagnosis.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: diagnoses
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient prescriptions
   * @route   GET /api/v1/clinical/patients/:patientId/prescriptions
   * @access  Private
   */
  async getPatientPrescriptions(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const prescriptions = await Prescription.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: prescriptions
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Discharge patient
   * @route   PUT /api/v1/clinical/visits/:id/discharge
   * @access  Private (Doctors)
   */
  async dischargePatient(req, res, next) {
    try {
      const { id } = req.params;
      const { discharge_notes } = req.body;

      if (!discharge_notes) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_NOTES',
            message: 'Discharge notes are required'
          }
        });
      }

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      await visit.discharge({ notes: discharge_notes }, req.user.userId);

      // Clear cache
      await redis.del(`visit:${id}`);
      await redis.del(`patient:${visit.patient_id}`);

      res.json({
        success: true,
        message: 'Patient discharged successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Transfer patient
   * @route   PUT /api/v1/clinical/visits/:id/transfer
   * @access  Private (Doctors)
   */
  async transferPatient(req, res, next) {
    try {
      const { id } = req.params;
      const { department_id, reason } = req.body;

      if (!department_id || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_INFO',
            message: 'Department ID and reason are required'
          }
        });
      }

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      await visit.transfer(department_id, reason, req.user.userId);

      // Clear cache
      await redis.del(`visit:${id}`);

      res.json({
        success: true,
        message: 'Patient transferred successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get visit timeline
   * @route   GET /api/v1/clinical/visits/:id/timeline
   * @access  Private
   */
  async getVisitTimeline(req, res, next) {
    try {
      const { id } = req.params;

      const visit = await Visit.findById(id);

      if (!visit) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Visit not found'
          }
        });
      }

      const timeline = await visit.getTimeline();

      res.json({
        success: true,
        data: timeline
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get common diagnoses
   * @route   GET /api/v1/clinical/analytics/common-diagnoses
   * @access  Private
   */
  async getCommonDiagnoses(req, res, next) {
    try {
      const { limit = 10, days = 90 } = req.query;

      const diagnoses = await Diagnosis.getCommonDiagnoses(req.user.facilityId, limit, days);

      res.json({
        success: true,
        data: diagnoses
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get diagnosis trends
   * @route   GET /api/v1/clinical/analytics/diagnosis-trends
   * @access  Private
   */
  async getDiagnosisTrends(req, res, next) {
    try {
      const { diagnosis_code, months = 12 } = req.query;

      if (!diagnosis_code) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CODE',
            message: 'Diagnosis code is required'
          }
        });
      }

      const trends = await Diagnosis.getDiagnosisTrends(req.user.facilityId, diagnosis_code, months);

      res.json({
        success: true,
        data: trends
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Search diagnoses
   * @route   GET /api/v1/clinical/diagnoses/search
   * @access  Private
   */
  async searchDiagnoses(req, res, next) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SEARCH',
            message: 'Search query must be at least 2 characters'
          }
        });
      }

      const diagnoses = await Diagnosis.search(q, req.user.facilityId);

      res.json({
        success: true,
        data: diagnoses
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get pending prescriptions
   * @route   GET /api/v1/clinical/prescriptions/pending
   * @access  Private (Pharmacy)
   */
  async getPendingPrescriptions(req, res, next) {
    try {
      const { status, search, limit } = req.query;
      const prescriptions = await Prescription.getPendingDispensing(
        req.user.facilityId,
        { status, search, limit: limit ? parseInt(limit, 10) : 50 }
      );

      res.json({
        success: true,
        data: prescriptions
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get prescription statistics
   * @route   GET /api/v1/clinical/analytics/prescription-stats
   * @access  Private
   */
  async getPrescriptionStats(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const stats = await Prescription.getPrescriptionStats(req.user.facilityId, start_date, end_date);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get department visit statistics
   * @route   GET /api/v1/clinical/analytics/department-stats
   * @access  Private
   */
  async getDepartmentStats(req, res, next) {
    try {
      const { department_id, start_date, end_date } = req.query;

      if (!department_id || !start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Department ID, start date, and end date are required'
          }
        });
      }

      const stats = await Visit.getDepartmentStats(department_id, start_date, end_date);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Export clinical data
   * @route   GET /api/v1/clinical/export
   * @access  Private (Admin only)
   */
  async exportClinicalData(req, res, next) {
    try {
      const { patient_id, from_date, to_date, type = 'visits' } = req.query;

      let data;
      
      if (type === 'visits') {
        const visits = await db.query(`
          SELECT 
            v.*,
            d.diagnosis_name,
            p.prescription_number
          FROM visits v
          LEFT JOIN diagnoses d ON v.id = d.visit_id
          LEFT JOIN prescriptions p ON v.id = p.visit_id
          WHERE v.facility_id = $1
            AND ($2::uuid IS NULL OR v.patient_id = $2)
            AND v.visit_date BETWEEN $3 AND $4
          ORDER BY v.visit_date
        `, [req.user.facilityId, patient_id, from_date, to_date]);
        data = visits.rows;
      } else if (type === 'diagnoses') {
        const diagnoses = await Diagnosis.findByPatient(patient_id, 1000);
        data = diagnoses;
      } else if (type === 'prescriptions') {
        const prescriptions = await Prescription.findByPatient(patient_id, 1000);
        data = prescriptions;
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ClinicalController();