const Dental = require('../models/Dental');
const Patient = require('../models/Patient');
const Visit = require('../models/Visit');
const Audit = require('../models/Audit');
const Billing = require('../models/Billing');
const logger = require('../config/logger');
const redis = require('../config/redis');
const db = require('../config/database');
const { validationResult } = require('express-validator');

class DentalController {
  /**
   * @desc    Create a new dental chart
   * @route   POST /api/v1/dental/charts
   * @access  Private (Dentists, Dental Surgeons)
   */
  async createChart(req, res, next) {
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

      const chartData = {
        ...req.body,
        patient_id: req.body.patient_id,
        visit_id: req.body.visit_id
      };

      const chart = await Dental.createChart(chartData, req.user.userId);

      // Clear cache
      await redis.del(`patient:${chartData.patient_id}`);
      await redis.clearPattern('dental:*');

      res.status(201).json({
        success: true,
        data: chart,
        message: 'Dental chart created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dental chart by ID
   * @route   GET /api/v1/dental/charts/:id
   * @access  Private
   */
  async getChart(req, res, next) {
    try {
      const { id } = req.params;

      const chart = await Dental.findChartById(id);

      if (!chart) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Dental chart not found'
          }
        });
      }

      res.json({
        success: true,
        data: chart
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient dental charts
   * @route   GET /api/v1/dental/patients/:patientId/charts
   * @access  Private
   */
  async getPatientCharts(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 5 } = req.query;

      const charts = await Dental.findChartsByPatient(patientId, limit);

      res.json({
        success: true,
        data: charts
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update tooth status
   * @route   PUT /api/v1/dental/charts/:chartId/teeth/:toothNumber
   * @access  Private (Dentists)
   */
  async updateTooth(req, res, next) {
    try {
      const { chartId, toothNumber } = req.params;

      const chart = await Dental.findChartById(chartId);

      if (!chart) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Dental chart not found'
          }
        });
      }

      const updated = await chart.updateTooth(parseInt(toothNumber), req.body);

      // Clear cache
      await redis.del(`dental:chart:${chartId}`);
      await redis.del(`patient:${chart.patient_id}`);

      res.json({
        success: true,
        data: updated,
        message: 'Tooth status updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create dental procedure
   * @route   POST /api/v1/dental/procedures
   * @access  Private (Dentists, Dental Surgeons)
   */
  async createProcedure(req, res, next) {
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

      const procedure = await Dental.createProcedure(req.body, req.user.userId);

      // Auto-bill the procedure (fire-and-forget; billing failure must not break this endpoint)
      if (req.user.facilityId && req.body.patient_id) {
        Billing.addToPatientInvoice({
          facilityId: req.user.facilityId,
          patientId: req.body.patient_id,
          visitId: req.body.visit_id || null,
          serviceType: 'Procedure',
          serviceId: procedure.id,
          itemName: procedure.procedure_name || procedure.procedure_type,
          itemCode: procedure.procedure_code || null,
          description: procedure.notes || null,
          quantity: 1,
        }, req.user.userId).catch((billingErr) => {
          logger.warn('Auto-billing failed for dental procedure', { error: billingErr.message, procedureId: procedure.id });
        });
      }

      // Clear cache — use the resolved chart id from the saved procedure row
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.del(`dental:chart:${procedure.dental_chart_id || req.body.dental_chart_id}`);

      res.status(201).json({
        success: true,
        data: procedure,
        message: 'Dental procedure recorded successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dental procedure by ID
   * @route   GET /api/v1/dental/procedures/:id
   * @access  Private
   */
  async getProcedure(req, res, next) {
    try {
      const { id } = req.params;

      const procedure = await Dental.findProcedureById(id);

      if (!procedure) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Dental procedure not found'
          }
        });
      }

      res.json({
        success: true,
        data: procedure
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient dental procedures
   * @route   GET /api/v1/dental/patients/:patientId/procedures
   * @access  Private
   */
  async getPatientProcedures(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 20 } = req.query;

      const procedures = await Dental.getPatientProcedures(patientId, limit);

      res.json({
        success: true,
        data: procedures
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dental procedure catalog
   * @route   GET /api/v1/dental/catalog
   * @access  Private
   */
  async getProcedureCatalog(req, res, next) {
    try {
      const { active = true } = req.query;

      const catalog = await Dental.getProcedureCatalog(active);

      res.json({
        success: true,
        data: catalog
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create procedure catalog item
   * @route   POST /api/v1/dental/catalog
   * @access  Private (Admin only)
   */
  async createProcedureCatalog(req, res, next) {
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

      const procedure = await Dental.createProcedureCatalog(req.body);

      // Clear cache
      await redis.del('dental:catalog');

      res.status(201).json({
        success: true,
        data: procedure,
        message: 'Procedure added to catalog successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create treatment plan
   * @route   POST /api/v1/dental/charts/:chartId/treatment-plan
   * @access  Private (Dentists)
   */
  async createTreatmentPlan(req, res, next) {
    try {
      const { chartId } = req.params;

      const chart = await Dental.findChartById(chartId);

      if (!chart) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Dental chart not found'
          }
        });
      }

      const plan = await chart.createTreatmentPlan(req.body, req.user.userId);

      // Auto-bill the treatment plan if an estimated cost is provided
      if (req.user.facilityId && chart.patient_id && plan.estimated_cost) {
        Billing.addToPatientInvoice({
          facilityId: req.user.facilityId,
          patientId: chart.patient_id,
          visitId: req.body.visit_id || null,
          serviceType: 'Procedure',
          serviceId: plan.id,
          itemName: plan.treatment_description || 'Dental Treatment Plan',
          itemCode: null,
          description: plan.diagnosis || null,
          quantity: 1,
          unitPrice: parseFloat(plan.estimated_cost),
        }, req.user.userId).catch((billingErr) => {
          logger.warn('Auto-billing failed for treatment plan', { error: billingErr.message, planId: plan.id });
        });
      }

      res.status(201).json({
        success: true,
        data: plan,
        message: 'Treatment plan created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get tooth treatment history
   * @route   GET /api/v1/dental/patients/:patientId/teeth/:toothNumber/history
   * @access  Private
   */
  async getToothHistory(req, res, next) {
    try {
      const { patientId, toothNumber } = req.params;

      const patient = await Patient.findById(patientId);

      if (!patient) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Patient not found'
          }
        });
      }

      // Get treatment history for specific tooth
      const history = await db.query(`
        SELECT 
          dp.*,
          p.procedure_name,
          u.first_name || ' ' || u.last_name as dentist_name,
          v.visit_date
        FROM patient_dental_procedures dp
        JOIN dental_procedures p ON dp.procedure_id = p.id
        LEFT JOIN users u ON dp.performed_by = u.id
        LEFT JOIN visits v ON dp.visit_id = v.id
        WHERE dp.patient_id = $1 AND dp.tooth_number = $2
        ORDER BY dp.procedure_date DESC
      `, [patientId, toothNumber]);

      res.json({
        success: true,
        data: history.rows
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dental statistics
   * @route   GET /api/v1/dental/stats
   * @access  Private
   */
  async getStats(req, res, next) {
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

      const procedureStats = await Dental.getProcedureStats(req.user.facilityId, start_date, end_date);
      const toothStats = await Dental.getToothStatistics(req.user.facilityId);

      res.json({
        success: true,
        data: {
          procedures: procedureStats,
          tooth_distribution: toothStats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dental dashboard
   * @route   GET /api/v1/dental/dashboard
   * @access  Private
   */
  /**
   * @desc    Get patients who have had a dental procedure today
   * @route   GET /api/v1/dental/today-patients
   * @access  Private
   */
  /**
   * @desc    Get today's dental appointments
   * @route   GET /api/v1/dental/today-appointments
   * @access  Private
   */
  async getTodayAppointments(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const result = await db.query(`
        SELECT
          a.id,
          a.start_time,
          a.end_time,
          a.status,
          a.appointment_type,
          a.notes,
          pt.id          AS patient_id,
          pt.patient_number,
          pt.first_name,
          pt.last_name,
          pt.gender,
          pt.phone_number,
          u.first_name || ' ' || u.last_name AS doctor_name
        FROM appointments a
        JOIN departments d  ON a.department_id = d.id
        JOIN patients   pt ON a.patient_id = pt.id
        LEFT JOIN users u   ON a.doctor_id = u.id
        WHERE d.department_code = 'DENTAL'
          AND a.appointment_date = CURRENT_DATE
          AND a.facility_id = $1
        ORDER BY a.start_time ASC NULLS LAST, pt.last_name ASC
      `, [facilityId]);

      res.json({ success: true, data: result.rows });
    } catch (error) {
      next(error);
    }
  }

  async getTodayPatients(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const result = await db.query(`
        SELECT DISTINCT ON (pt.id)
          pt.id,
          pt.patient_number,
          pt.first_name,
          pt.last_name,
          pt.gender,
          pt.phone_number,
          dp.procedure_name AS last_procedure,
          pdp.outcome        AS status,
          pdp.procedure_date,
          u.first_name || ' ' || u.last_name AS dentist_name
        FROM patient_dental_procedures pdp
        JOIN patients pt ON pdp.patient_id = pt.id
        JOIN dental_procedures dp ON pdp.procedure_id = dp.id
        LEFT JOIN users u ON pdp.performed_by = u.id
        LEFT JOIN visits v ON pdp.visit_id = v.id
        WHERE pdp.procedure_date::date = CURRENT_DATE
          AND (v.facility_id = $1 OR pt.facility_id = $1)
        ORDER BY pt.id, pdp.procedure_date DESC
      `, [facilityId]);

      res.json({ success: true, data: result.rows });
    } catch (error) {
      next(error);
    }
  }

  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(`
        WITH today_appointments AS (
          SELECT COUNT(*) as count
          FROM appointments a
          JOIN departments d ON a.department_id = d.id
          WHERE d.department_code = 'DENTAL'
            AND a.appointment_date = CURRENT_DATE
            AND a.facility_id = $1
        ),
        pending_procedures AS (
          SELECT COUNT(*) as count
          FROM patient_dental_procedures dp
          JOIN patients pt ON dp.patient_id = pt.id
          LEFT JOIN visits v ON dp.visit_id = v.id
          WHERE (v.facility_id = $1 OR pt.facility_id = $1)
            AND dp.follow_up_required = true
            AND dp.follow_up_date >= CURRENT_DATE
        ),
        common_procedures AS (
          SELECT 
            p.procedure_name,
            COUNT(*) as count
          FROM patient_dental_procedures dp
          JOIN dental_procedures p ON dp.procedure_id = p.id
          JOIN patients pt ON dp.patient_id = pt.id
          LEFT JOIN visits v ON dp.visit_id = v.id
          WHERE (v.facility_id = $1 OR pt.facility_id = $1)
            AND dp.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY p.procedure_name
          ORDER BY count DESC
          LIMIT 5
        )
        SELECT 
          (SELECT count FROM today_appointments) as today_appointments,
          (SELECT count FROM pending_procedures) as pending_followups,
          (SELECT json_agg(common_procedures) FROM common_procedures) as top_procedures
      `, [facilityId]);

      res.json({
        success: true,
        data: stats.rows[0]
      });

    } catch (error) {
      next(error);
    }
  }
  /**
   * @desc    Create prescription for a dental procedure
   * @route   POST /api/v1/dental/procedures/:id/prescriptions
   * @access  Private (Dentists)
   */
  async createPrescription(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg } });
      }

      const { id: procedureId } = req.params;
      const { patient_id, items, notes } = req.body;

      // Verify procedure exists and belongs to this facility
      const procCheck = await db.query(
        `SELECT pdp.id, pdp.patient_id FROM patient_dental_procedures pdp
         JOIN patients pt ON pdp.patient_id = pt.id
         WHERE pdp.id = $1 AND pt.facility_id = $2`,
        [procedureId, req.user.facilityId]
      );
      if (!procCheck.rows.length) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Procedure not found' } });
      }

      const resolvedPatientId = patient_id || procCheck.rows[0].patient_id;

      // Generate prescription number
      const numResult = await db.query(
        `SELECT 'RX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(COALESCE(COUNT(*) + 1, 1)::text, 4, '0') AS num
         FROM prescriptions WHERE prescription_date::date = CURRENT_DATE`
      );
      const prescriptionNumber = numResult.rows[0].num;

      const result = await db.transaction(async (client) => {
        const presResult = await client.query(
          `INSERT INTO prescriptions (prescription_number, patient_id, prescribed_by, prescription_date, notes)
           VALUES ($1, $2, $3, NOW(), $4) RETURNING id`,
          [prescriptionNumber, resolvedPatientId, req.user.userId, `[dental:${procedureId}] ${notes || ''}`]
        );
        const prescriptionId = presResult.rows[0].id;

        for (const item of (items || [])) {
          await client.query(
            `INSERT INTO prescription_items (prescription_id, medication_name, dosage, frequency, duration, route, instructions)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [prescriptionId, item.medication_name, item.dosage, item.frequency, item.duration || null, item.route || 'Oral', item.instructions || null]
          );
        }
        return prescriptionId;
      });

      res.status(201).json({
        success: true,
        data: { prescription_id: result },
        message: 'Prescription created successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create X-ray imaging request for a dental procedure
   * @route   POST /api/v1/dental/procedures/:id/xray-request
   * @access  Private (Dentists)
   */
  async createXrayRequest(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg } });
      }

      const { id: procedureId } = req.params;
      const { imaging_type, notes } = req.body;

      // Verify procedure and get patient info
      const procCheck = await db.query(
        `SELECT pdp.id, pdp.patient_id FROM patient_dental_procedures pdp
         JOIN patients pt ON pdp.patient_id = pt.id
         WHERE pdp.id = $1 AND pt.facility_id = $2`,
        [procedureId, req.user.facilityId]
      );
      if (!procCheck.rows.length) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Procedure not found' } });
      }

      const { patient_id } = procCheck.rows[0];

      const result = await db.query(
        `INSERT INTO dental_imaging_requests (procedure_id, patient_id, imaging_type, notes, requested_by, facility_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [procedureId, patient_id, imaging_type, notes || null, req.user.userId, req.user.facilityId]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'X-ray request created successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Upload attachment (X-ray image / result PDF) for a dental procedure
   * @route   POST /api/v1/dental/procedures/:id/attachments
   * @access  Private (Dentists)
   */
  async uploadAttachment(req, res, next) {
    try {
      const { id: procedureId } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
      }

      // Verify procedure and get patient info
      const procCheck = await db.query(
        `SELECT pdp.id, pdp.patient_id FROM patient_dental_procedures pdp
         JOIN patients pt ON pdp.patient_id = pt.id
         WHERE pdp.id = $1 AND pt.facility_id = $2`,
        [procedureId, req.user.facilityId]
      );
      if (!procCheck.rows.length) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Procedure not found' } });
      }

      const { patient_id } = procCheck.rows[0];
      const file = req.file;
      const relativePath = `dental/${file.filename}`;

      const result = await db.query(
        `INSERT INTO dental_procedure_attachments (procedure_id, patient_id, file_name, file_path, file_type, file_size, description, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [procedureId, patient_id, file.originalname, relativePath, file.mimetype, file.size, req.body.description || null, req.user.userId]
      );

      res.status(201).json({
        success: true,
        data: { ...result.rows[0], url: `/uploads/dental/${file.filename}` },
        message: 'Attachment uploaded successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all post-procedure actions (prescriptions, X-ray requests, attachments)
   * @route   GET /api/v1/dental/procedures/:id/actions
   * @access  Private
   */
  async getProcedureActions(req, res, next) {
    try {
      const { id: procedureId } = req.params;

      const [prescriptions, xrayRequests, attachments] = await Promise.all([
        db.query(
          `SELECT p.id, p.prescription_number, p.prescription_date, p.notes,
                  json_agg(json_build_object(
                    'medication_name', pi.medication_name,
                    'dosage', pi.dosage,
                    'frequency', pi.frequency,
                    'duration', pi.duration,
                    'route', pi.route,
                    'instructions', pi.instructions
                  ) ORDER BY pi.id) FILTER (WHERE pi.id IS NOT NULL) as items
           FROM prescriptions p
           LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
           WHERE p.notes LIKE $1
           GROUP BY p.id ORDER BY p.prescription_date DESC`,
          [`[dental:${procedureId}]%`]
        ),
        db.query(
          `SELECT id, imaging_type, notes, status, requested_at
           FROM dental_imaging_requests WHERE procedure_id = $1 ORDER BY requested_at DESC`,
          [procedureId]
        ),
        db.query(
          `SELECT id, file_name, file_path, file_type, file_size, description, uploaded_at,
                  '/uploads/' || file_path AS url
           FROM dental_procedure_attachments WHERE procedure_id = $1 ORDER BY uploaded_at DESC`,
          [procedureId]
        )
      ]);

      res.json({
        success: true,
        data: {
          prescriptions: prescriptions.rows,
          xray_requests: xrayRequests.rows,
          attachments: attachments.rows
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient treatment plans
   * @route   GET /api/v1/dental/patients/:patientId/treatment-plans
   * @access  Private
   */
  async getPatientTreatmentPlans(req, res, next) {
    try {
      const plans = await Dental.getPatientTreatmentPlans(req.params.patientId);
      res.json({ success: true, data: plans });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update treatment plan status/notes
   * @route   PATCH /api/v1/dental/treatment-plans/:planId
   * @access  Private
   */
  async updateTreatmentPlan(req, res, next) {
    try {
      const plan = await Dental.updateTreatmentPlan(req.params.planId, req.body);
      if (!plan) return res.status(404).json({ success: false, message: 'Treatment plan not found' });
      res.json({ success: true, data: plan });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get full chart (with teeth) by chart ID
   * @route   GET /api/v1/dental/charts/:id/full
   * @access  Private
   */
  async getChartFull(req, res, next) {
    try {
      const chart = await Dental.findChartById(req.params.id);
      if (!chart) return res.status(404).json({ success: false, message: 'Chart not found' });
      res.json({ success: true, data: chart });
    } catch (error) {
      next(error);
    }
  }

  // ── BPE (Basic Periodontal Examination) ──

  /**
   * @desc    Create BPE examination for a dental chart
   * @route   POST /api/v1/dental/charts/:chartId/bpe
   * @access  Private (Dentists)
   */
  async createBPE(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg } });
      }

      const { chartId } = req.params;

      const chart = await Dental.findChartById(chartId);
      if (!chart) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dental chart not found' } });
      }

      const bpe = await Dental.createBPE({
        dental_chart_id: chartId,
        patient_id: chart.patient_id,
        ...req.body,
      }, req.user.userId);

      await redis.del(`dental:chart:${chartId}`);

      res.status(201).json({
        success: true,
        data: bpe,
        message: 'BPE examination recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get BPE examinations for a dental chart
   * @route   GET /api/v1/dental/charts/:chartId/bpe
   * @access  Private
   */
  async getChartBPE(req, res, next) {
    try {
      const bpeList = await Dental.getBPEByChart(req.params.chartId);
      res.json({ success: true, data: bpeList });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get BPE examination history for a patient
   * @route   GET /api/v1/dental/patients/:patientId/bpe
   * @access  Private
   */
  async getPatientBPE(req, res, next) {
    try {
      const bpeList = await Dental.getBPEByPatient(req.params.patientId);
      res.json({ success: true, data: bpeList });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DentalController();