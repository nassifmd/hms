const LabOrder = require('../models/LabOrder');
const Patient = require('../models/Patient');
const Audit = require('../models/Audit');
const Billing = require('../models/Billing');
const logger = require('../config/logger');
const redis = require('../config/redis');
const path = require('path');
const db = require('../config/database');
const { validationResult } = require('express-validator');

class LabController {
  /**
   * @desc    Create lab order
   * @route   POST /api/v1/lab/orders
   * @access  Private (Doctors)
   */
  async createOrder(req, res, next) {
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

      const orderData = {
        ...req.body,
        facility_id: req.user.facilityId
      };

      const order = await LabOrder.create(orderData, req.user.userId);

      // Auto-bill ordered tests (fire-and-forget)
      if (req.user.facilityId && order.patient_id && Array.isArray(order.tests)) {
        for (const test of order.tests) {
          Billing.addToPatientInvoice({
            facilityId: req.user.facilityId,
            patientId: order.patient_id,
            visitId: order.visit_id || null,
            serviceType: 'Lab',
            serviceId: test.test_id || null,
            itemName: test.test_name || test.name,
            itemCode: test.test_code || null,
            quantity: 1,
          }, req.user.userId).catch((billingErr) => {
            logger.warn('Auto-billing failed for lab test', { error: billingErr.message, orderId: order.id, testId: test.test_id });
          });
        }
      }

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.clearPattern('lab:orders:*');

      res.status(201).json({
        success: true,
        data: order,
        message: 'Lab order created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab order by ID
   * @route   GET /api/v1/lab/orders/:id
   * @access  Private
   */
  async getOrder(req, res, next) {
    try {
      const { id } = req.params;

      const order = await LabOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      res.json({
        success: true,
        data: order
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient lab orders
   * @route   GET /api/v1/lab/patients/:patientId/orders
   * @access  Private
   */
  async getPatientOrders(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const orders = await LabOrder.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: orders
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get pending lab orders
   * @route   GET /api/v1/lab/orders/pending
   * @access  Private (Lab Technician)
   */
  async getOrders(req, res, next) {
    try {
      const { status, search, limit } = req.query;
      const orders = await LabOrder.getOrders(req.user.facilityId, {
        status: status || undefined,
        search: search || undefined,
        limit: limit ? parseInt(limit, 10) : 30,
      });
      res.json({ success: true, data: orders });
    } catch (error) {
      next(error);
    }
  }

  async getPendingOrders(req, res, next) {
    try {
      const orders = await LabOrder.getPendingOrders(req.user.facilityId);

      res.json({
        success: true,
        data: orders
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Collect specimen
   * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/collect
   * @access  Private (Lab Technician)
   */
  async collectSpecimen(req, res, next) {
    try {
      const { orderId, itemId } = req.params;

      const order = await LabOrder.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      await labOrder.collectSpecimen(itemId, req.body, req.user.userId);

      // Clear cache
      await redis.del(`lab:order:${orderId}`);

      res.json({
        success: true,
        message: 'Specimen collected successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Enter test result
   * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/result
   * @access  Private (Lab Technician)
   */
  async enterResult(req, res, next) {
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

      const { orderId, itemId } = req.params;

      const order = await LabOrder.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);

      // Build attachment metadata from any uploaded files
      const attachments = (req.files || []).map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/lab-results/${f.filename}`,
        uploadedAt: new Date().toISOString(),
      }));

      await labOrder.enterResult(itemId, { ...req.body, attachments }, req.user.userId);

      // Clear cache
      await redis.del(`lab:order:${orderId}`);
      await redis.del(`patient:${order.patient_id}`);

      res.json({
        success: true,
        message: 'Result entered successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Verify test result
   * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/verify
   * @access  Private (Lab Technician Supervisor)
   */
  async verifyResult(req, res, next) {
    try {
      const { orderId, itemId } = req.params;

      const order = await LabOrder.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      await labOrder.verifyResult(itemId, req.user.userId);

      // Clear cache
      await redis.del(`lab:order:${orderId}`);

      res.json({
        success: true,
        message: 'Result verified successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add comment to lab order
   * @route   POST /api/v1/lab/orders/:id/comments
   * @access  Private
   */
  async addComment(req, res, next) {
    try {
      const { id } = req.params;
      const { comment } = req.body;

      if (!comment) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_COMMENT',
            message: 'Comment is required'
          }
        });
      }

      const order = await LabOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      const result = await labOrder.addComment(comment, req.user.userId);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Comment added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab order comments
   * @route   GET /api/v1/lab/orders/:id/comments
   * @access  Private
   */
  async getComments(req, res, next) {
    try {
      const { id } = req.params;

      const order = await LabOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      const comments = await labOrder.getComments();

      res.json({
        success: true,
        data: comments
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get test results
   * @route   GET /api/v1/lab/orders/:id/results
   * @access  Private
   */
  async getResults(req, res, next) {
    try {
      const { id } = req.params;

      const order = await LabOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      const results = await labOrder.getResults();

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Print lab report
   * @route   GET /api/v1/lab/orders/:id/print
   * @access  Private
   */
  async printReport(req, res, next) {
    try {
      const { id } = req.params;

      const order = await LabOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lab order not found'
          }
        });
      }

      const labOrder = new LabOrder(order);
      const report = await labOrder.printReport();

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab tests catalog
   * @route   GET /api/v1/lab/tests
   * @access  Private
   */
  async getTestCatalog(req, res, next) {
    try {
      const { active = true } = req.query;

      const tests = await LabOrder.Test.findAll(active);

      res.json({
        success: true,
        data: tests
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create lab test
   * @route   POST /api/v1/lab/tests
   * @access  Private (Admin)
   */
  async createTest(req, res, next) {
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

      const test = await LabOrder.Test.create(req.body);

      // Clear cache
      await redis.del('lab:tests:catalog');

      res.status(201).json({
        success: true,
        data: test,
        message: 'Lab test created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Search lab tests
   * @route   GET /api/v1/lab/tests/search
   * @access  Private
   */
  async searchTests(req, res, next) {
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

      const tests = await LabOrder.Test.search(q);

      res.json({
        success: true,
        data: tests
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab panels
   * @route   GET /api/v1/lab/panels
   * @access  Private
   */
  async getPanels(req, res, next) {
    try {
      const { active = true } = req.query;

      const panels = await LabOrder.Panel.findAll(active);

      res.json({
        success: true,
        data: panels
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create lab panel
   * @route   POST /api/v1/lab/panels
   * @access  Private (Admin)
   */
  async createPanel(req, res, next) {
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

      const panel = await LabOrder.Panel.create(req.body);

      // Clear cache
      await redis.del('lab:panels:catalog');

      res.status(201).json({
        success: true,
        data: panel,
        message: 'Lab panel created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab statistics
   * @route   GET /api/v1/lab/stats
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

      const stats = await LabOrder.getLabStats(req.user.facilityId, start_date, end_date);
      const testFrequency = await LabOrder.getTestFrequency(req.user.facilityId);

      res.json({
        success: true,
        data: {
          ...stats,
          test_frequency: testFrequency
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get lab dashboard
   * @route   GET /api/v1/lab/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(`
        WITH pending_counts AS (
          SELECT 
            COUNT(*) as pending_orders,
            COUNT(DISTINCT patient_id) as pending_patients
          FROM lab_orders
          WHERE status IN ('Pending', 'In Progress')
            AND facility_id = $1
        ),
        today_stats AS (
          SELECT 
            (SELECT COUNT(*) FROM lab_orders WHERE DATE(order_date) = CURRENT_DATE AND facility_id = $1) as today_orders,
            (SELECT COUNT(DISTINCT lo.id)
             FROM lab_orders lo
             JOIN lab_order_items loi ON lo.id = loi.lab_order_id
             WHERE lo.status = 'Completed'
               AND DATE(loi.performed_at) = CURRENT_DATE
               AND lo.facility_id = $1) as today_completed
        ),
        critical_results AS (
          SELECT COUNT(*) as count
          FROM lab_order_items loi
          JOIN lab_orders lo ON lo.id = loi.lab_order_id
          WHERE loi.is_critical = true
            AND loi.performed_at >= NOW() - INTERVAL '24 hours'
            AND lo.facility_id = $1
        ),
        avg_turnaround AS (
          SELECT 
            AVG(EXTRACT(EPOCH FROM (loi.performed_at - lo.order_date))/60) as avg_minutes
          FROM lab_orders lo
          JOIN lab_order_items loi ON lo.id = loi.lab_order_id
          WHERE loi.performed_at >= NOW() - INTERVAL '7 days'
            AND lo.facility_id = $1
        )
        SELECT 
          COALESCE((SELECT pending_orders FROM pending_counts), 0) as pending_orders,
          COALESCE((SELECT pending_patients FROM pending_counts), 0) as pending_patients,
          COALESCE((SELECT today_orders FROM today_stats), 0) as today_orders,
          COALESCE((SELECT today_completed FROM today_stats), 0) as completed_today,
          COALESCE((SELECT count FROM critical_results), 0) as critical_alerts,
          COALESCE(ROUND((SELECT avg_minutes FROM avg_turnaround))::int, 0) as average_turnaround
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
   * @desc    Get critical alerts
   * @route   GET /api/v1/lab/alerts/critical
   * @access  Private
   */
  async getCriticalAlerts(req, res, next) {
    try {
      const alerts = await db.query(`
        SELECT 
          ca.*,
          p.first_name || ' ' || p.last_name as patient_name,
          p.patient_number,
          p.phone_number,
          u.first_name || ' ' || u.last_name as ordered_by
        FROM critical_alerts ca
        JOIN patients p ON ca.patient_id = p.id
        JOIN lab_orders lo ON ca.lab_order_id = lo.id
        JOIN users u ON lo.ordered_by = u.id
        WHERE ca.acknowledged = false
        ORDER BY ca.alert_time DESC
      `);

      res.json({
        success: true,
        data: alerts.rows
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Acknowledge critical alert
   * @route   PUT /api/v1/lab/alerts/:id/acknowledge
   * @access  Private
   */
  async acknowledgeAlert(req, res, next) {
    try {
      const { id } = req.params;

      await db.query(`
        UPDATE critical_alerts 
        SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
        WHERE id = $2
      `, [req.user.userId, id]);

      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LabController();