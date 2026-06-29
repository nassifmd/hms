const EyeClinic = require('../models/EyeClinic');
const Patient = require('../models/Patient');
const Visit = require('../models/Visit');
const Audit = require('../models/Audit');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { validationResult } = require('express-validator');
const db = require('../config/database'); // needed for inline queries (updateOpticalItem)


class EyeController {
  /**
   * @desc    Create eye examination
   * @route   POST /api/v1/eye/examinations
   * @access  Private (Optometrists, Ophthalmologists)
   */
  async createExamination(req, res, next) {
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

      const examination = await EyeClinic.createExamination(req.body, req.user.userId);

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.clearPattern('eye:*');

      res.status(201).json({
        success: true,
        data: examination,
        message: 'Eye examination recorded successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get eye examination by ID
   * @route   GET /api/v1/eye/examinations/:id
   * @access  Private
   */
  async getExamination(req, res, next) {
    try {
      const { id } = req.params;

      const examination = await EyeClinic.findExaminationById(id);

      if (!examination) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Eye examination not found'
          }
        });
      }

      res.json({
        success: true,
        data: examination
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient eye examinations
   * @route   GET /api/v1/eye/patients/:patientId/examinations
   * @access  Private
   */
  async getPatientExaminations(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const examinations = await EyeClinic.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: examinations
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create glasses prescription
   * @route   POST /api/v1/eye/prescriptions
   * @access  Private (Optometrists, Ophthalmologists)
   */
  async createGlassesPrescription(req, res, next) {
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

      const prescription = await EyeClinic.createGlassesPrescription(req.body, req.user.userId);

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.del(`eye:exam:${req.body.eye_examination_id}`);

      res.status(201).json({
        success: true,
        data: prescription,
        message: 'Glasses prescription created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get glasses prescription by ID
   * @route   GET /api/v1/eye/prescriptions/:id
   * @access  Private
   */
  async getGlassesPrescription(req, res, next) {
    try {
      const { id } = req.params;

      const prescription = await EyeClinic.findGlassesPrescriptionById(id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Glasses prescription not found'
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
   * @desc    Get patient glasses prescriptions
   * @route   GET /api/v1/eye/patients/:patientId/prescriptions
   * @access  Private
   */
  async getPatientPrescriptions(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const prescriptions = await EyeClinic.getPatientPrescriptions(patientId, limit);

      res.json({
        success: true,
        data: prescriptions
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Mark glasses as dispensed
   * @route   PUT /api/v1/eye/prescriptions/:id/dispense
   * @access  Private (Optical Technician)
   */
  async dispenseGlasses(req, res, next) {
    try {
      const { id } = req.params;

      const prescription = await EyeClinic.findGlassesPrescriptionById(id);

      if (!prescription) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Glasses prescription not found'
          }
        });
      }

      const eyePrescription = new EyeClinic(prescription);
      await eyePrescription.markAsDispensed(req.user.userId);

      // Clear cache
      await redis.del(`eye:prescription:${id}`);

      res.json({
        success: true,
        message: 'Glasses marked as dispensed successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add optical inventory item
   * @route   POST /api/v1/eye/inventory
   * @access  Private (Optical Technician, Admin)
   */
  async addOpticalItem(req, res, next) {
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

      const item = await EyeClinic.addOpticalItem({
        ...req.body,
        facility_id: req.user.facilityId
      });

      // Clear cache
      await redis.del('eye:inventory');

      res.status(201).json({
        success: true,
        data: item,
        message: 'Optical inventory item added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get optical inventory
   * @route   GET /api/v1/eye/inventory
   * @access  Private
   */
  async getOpticalInventory(req, res, next) {
    try {
      const {
        item_type,
        low_stock_only,
        search
      } = req.query;

      const inventory = await EyeClinic.getOpticalInventory(req.user.facilityId, {
        item_type,
        low_stock_only: low_stock_only === 'true',
        search
      });

      res.json({
        success: true,
        data: inventory
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update optical inventory item
   * @route   PUT /api/v1/eye/inventory/:id
   * @access  Private (Optical Technician)
   */
  async updateOpticalItem(req, res, next) {
    try {
      const { id } = req.params;

      // build dynamic SET clause from allowed updatable columns
      const allowed = [
        'item_type','item_code','item_name','brand','model','color',
        'size','material','quantity_on_hand','unit_cost','selling_price',
        'supplier_id','reorder_level','location','is_active'
      ];
      const setClauses = [];
      const params = [];
      let idx = 1;
      allowed.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          setClauses.push(`${field} = $${idx}`);
          params.push(req.body[field]);
          idx++;
        }
      });

      if (setClauses.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' }
        });
      }

      setClauses.push('updated_at = NOW()');

      let queryText = `
        UPDATE optical_inventory
        SET ${setClauses.join(', ')}
        WHERE id = $${idx}`;
      params.push(id);
      idx++;

      if (req.user.facilityId) {
        queryText += ` AND facility_id = $${idx}`;
        params.push(req.user.facilityId);
        idx++;
      } else {
        logger.warn('updateOpticalItem called with no facilityId', { user: req.user.userId });
      }

      queryText += `\n        RETURNING *\n      `;
      const result = await db.query(queryText, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Inventory item not found'
          }
        });
      }

      // Clear cache
      await redis.del('eye:inventory');

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Inventory item updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create visual field test
   * @route   POST /api/v1/eye/visual-field-tests
   * @access  Private (Optometrists, Ophthalmologists)
   */
  async createVisualFieldTest(req, res, next) {
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

      const test = await EyeClinic.createVisualFieldTest(req.body, req.user.userId);

      res.status(201).json({
        success: true,
        data: test,
        message: 'Visual field test recorded successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get eye examination statistics
   * @route   GET /api/v1/eye/stats
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

      const stats = await EyeClinic.getExaminationStats(req.user.facilityId, start_date, end_date);
      const commonDiagnoses = await EyeClinic.getCommonDiagnoses(req.user.facilityId);

      res.json({
        success: true,
        data: {
          ...stats,
          common_diagnoses: commonDiagnoses
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get eye clinic dashboard
   * @route   GET /api/v1/eye/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(`
        WITH today_appointments AS (
          SELECT COUNT(*) as count
          FROM appointments a
          JOIN departments d ON a.department_id = d.id
          WHERE d.department_code = 'EYE'
            AND a.appointment_date = CURRENT_DATE
            AND a.facility_id = $1
        ),
        pending_prescriptions AS (
          SELECT COUNT(*) as count
          FROM glasses_prescriptions
          WHERE is_dispensed = false
            AND prescription_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        recent_exams AS (
          SELECT 
            COUNT(*) as total_exams,
            AVG(iop_right) as avg_iop
          FROM eye_examinations e
          JOIN visits v ON e.visit_id = v.id
          WHERE v.facility_id = $1
            AND e.examination_date >= NOW() - INTERVAL '30 days'
        )
        SELECT 
          (SELECT count FROM today_appointments) as today_appointments,
          (SELECT count FROM pending_prescriptions) as pending_prescriptions,
          (SELECT total_exams FROM recent_exams) as exams_last_30_days,
          (SELECT avg_iop FROM recent_exams) as average_iop
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
   * @desc    Calculate spherical equivalent
   * @route   POST /api/v1/eye/calculate/spherical-equivalent
   * @access  Private
   */
  async calculateSphericalEquivalent(req, res, next) {
    try {
      const { sphere_right, cylinder_right, sphere_left, cylinder_left } = req.body;

      const result = {
        right: sphere_right + (cylinder_right / 2),
        left: sphere_left + (cylinder_left / 2)
      };

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Convert visual acuity
   * @route   POST /api/v1/eye/convert/visual-acuity
   * @access  Private
   */
  async convertVisualAcuity(req, res, next) {
    try {
      const { value, from_format, to_format } = req.body;

      // Conversion logic
      let converted;
      if (from_format === 'snellen' && to_format === 'decimal') {
        const [num, denom] = value.split('/').map(Number);
        converted = num / denom;
      } else if (from_format === 'decimal' && to_format === 'snellen') {
        // Approximate conversion
        const decimal = parseFloat(value);
        if (decimal >= 1.0) converted = '20/20';
        else if (decimal >= 0.8) converted = '20/25';
        else if (decimal >= 0.63) converted = '20/30';
        else if (decimal >= 0.5) converted = '20/40';
        else if (decimal >= 0.4) converted = '20/50';
        else if (decimal >= 0.33) converted = '20/60';
        else converted = '20/200';
      }

      res.json({
        success: true,
        data: {
          original: value,
          converted,
          from_format,
          to_format
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EyeController();