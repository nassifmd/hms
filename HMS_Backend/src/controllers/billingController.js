const Billing = require('../models/Billing');
const Patient = require('../models/Patient');
const Visit = require('../models/Visit');
const Audit = require('../models/Audit');
const db = require('../config/database');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { validationResult } = require('express-validator');

class BillingController {
  /**
   * @desc    Get invoices list with optional filters
   * @route   GET /api/v1/billing/invoices
   * @access  Private
   */
  async getInvoices(req, res, next) {
    try {
      const facilityId = req.user.facilityId;
      const { status, search, limit = 30, offset = 0 } = req.query;

      const invoices = await Billing.getInvoices({
        facilityId,
        status,
        search,
        limit: Math.min(parseInt(limit) || 30, 100),
        offset: parseInt(offset) || 0,
      });

      res.json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get service catalog items for a given service type (for price-entry autocomplete)
   * @route   GET /api/v1/billing/services?service_type=Procedure&search=ext
   * @access  Private
   */
  async getServiceCatalog(req, res, next) {
    try {
      const { service_type, search } = req.query;
      if (!service_type) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'service_type is required' } });
      }
      const items = await Billing.getServiceCatalog(service_type, search || '', req.user.facilityId);
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }

  // ─── Service Price Management ──────────────────────────────────────────────

  /**
   * @desc    Get service prices
   * @route   GET /api/v1/billing/service-prices
   * @access  Private (Accounts, Admin)
   */
  async getServicePrices(req, res, next) {
    try {
      const facilityId = req.user.facilityId;
      const { service_type, search } = req.query;
      const prices = await Billing.getServicePrices(facilityId, { serviceType: service_type, search });
      res.json({ success: true, data: prices });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create or update a service price
   * @route   POST /api/v1/billing/service-prices  (create)
   * @route   PUT  /api/v1/billing/service-prices/:id (update)
   * @access  Private (Accounts, Admin)
   */
  async upsertServicePrice(req, res, next) {
    try {
      const facilityId = req.user.facilityId;
      const data = { ...req.body };

      // Merge :id from route params when updating
      if (req.params.id) data.id = req.params.id;

      // Auto-select/create default price list when caller did not supply one
      if (!data.price_list_id) {
        const lists = await Billing.getPriceLists(facilityId);
        const activeList = lists.find((l) => l.is_active);
        if (activeList) {
          data.price_list_id = activeList.id;
        } else {
          const newList = await Billing.createPriceList({
            facility_id: facilityId,
            price_list_code: 'DEFAULT',
            price_list_name: 'Default Price List',
            price_list_type: 'General',
            is_active: true,
          }, req.user.userId);
          data.price_list_id = newList.id;
        }
      }

      const price = await Billing.upsertServicePrice(data);
      res.status(data.id ? 200 : 201).json({ success: true, data: price });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Delete a service price
   * @route   DELETE /api/v1/billing/service-prices/:id
   * @access  Private (Accounts, Admin)
   */
  async deleteServicePrice(req, res, next) {
    try {
      await Billing.deleteServicePrice(req.params.id);
      res.json({ success: true, message: 'Service price deleted' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get price lists for current facility
   * @route   GET /api/v1/billing/price-lists
   * @access  Private
   */
  async getPriceLists(req, res, next) {
    try {
      const lists = await Billing.getPriceLists(req.user.facilityId);
      res.json({ success: true, data: lists });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create a price list
   * @route   POST /api/v1/billing/price-lists
   * @access  Private (Accounts, Admin)
   */
  async createPriceList(req, res, next) {
    try {
      const list = await Billing.createPriceList(
        { ...req.body, facility_id: req.user.facilityId },
        req.user.userId
      );
      res.status(201).json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────

  /**
   * @desc    Create new invoice
   * @route   POST /api/v1/billing/invoices
   * @access  Private (Accounts, Cashier)
   */
  async createInvoice(req, res, next) {
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

      const invoiceData = {
        ...req.body,
        facility_id: req.user.facilityId
      };

      const invoice = await Billing.createInvoice(invoiceData, req.user.userId);

      // Clear cache
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.clearPattern('billing:invoices:*');

      res.status(201).json({
        success: true,
        data: invoice,
        message: 'Invoice created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get invoice by ID
   * @route   GET /api/v1/billing/invoices/:id
   * @access  Private
   */
  async getInvoice(req, res, next) {
    try {
      const { id } = req.params;

      const invoice = await Billing.findInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found'
          }
        });
      }

      // Verify facility access
      if (invoice.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied to this invoice'
          }
        });
      }

      res.json({
        success: true,
        data: invoice
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all services a patient received on a given date (for cashier billing)
   * @route   GET /api/v1/billing/patients/:patientId/visit-services
   * @access  Private
   */
  async getPatientVisitServices(req, res, next) {
    try {
      const { patientId } = req.params;

      const items = await Billing.getPatientVisitServices(patientId, req.user.facilityId);
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient invoices
   * @route   GET /api/v1/billing/patients/:patientId/invoices
   * @access  Private
   */
  async getPatientInvoices(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const invoices = await Billing.findByPatient(patientId, limit);

      res.json({
        success: true,
        data: invoices
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get outstanding invoices
   * @route   GET /api/v1/billing/invoices/outstanding
   * @access  Private
   */
  async getOutstandingInvoices(req, res, next) {
    try {
      // facilityId may be null for system users; let model decide how to handle
      const invoices = await Billing.getOutstandingInvoices(req.user.facilityId);

      res.json({
        success: true,
        data: invoices
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add payment to invoice
   * @route   POST /api/v1/billing/payments
   * @access  Private (Cashier)
   */
  async addPayment(req, res, next) {
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

      const payment = await Billing.addPayment(req.body, req.user.userId);

      // Clear cache
      await redis.del(`billing:invoice:${req.body.invoice_id}`);
      await redis.del(`patient:${req.body.patient_id}`);
      await redis.clearPattern('billing:invoices:outstanding');

      res.status(201).json({
        success: true,
        data: payment,
        message: 'Payment added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get payment by ID
   * @route   GET /api/v1/billing/payments/:id
   * @access  Private
   */
  async getPayment(req, res, next) {
    try {
      const { id } = req.params;

      const payment = await Billing.findPaymentById(id);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Payment not found'
          }
        });
      }

      res.json({
        success: true,
        data: payment
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Void payment
   * @route   PUT /api/v1/billing/payments/:id/void
   * @access  Private (Accounts, Admin)
   */
  async voidPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Void reason is required'
          }
        });
      }

      await Billing.voidPayment(id, reason, req.user.userId);

      // Clear cache
      await redis.clearPattern('billing:*');

      res.json({
        success: true,
        message: 'Payment voided successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add item to invoice
   * @route   POST /api/v1/billing/invoices/:id/items
   * @access  Private (Accounts)
   */
  async addInvoiceItem(req, res, next) {
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

      const invoice = await Billing.findInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found'
          }
        });
      }

      const billingInvoice = new Billing(invoice);
      const item = await billingInvoice.addItem(req.body);

      // Clear cache
      await redis.del(`billing:invoice:${id}`);

      res.status(201).json({
        success: true,
        data: item,
        message: 'Item added to invoice successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Remove item from invoice
   * @route   DELETE /api/v1/billing/invoices/:invoiceId/items/:itemId
   * @access  Private (Accounts)
   */
  async removeInvoiceItem(req, res, next) {
    try {
      const { invoiceId, itemId } = req.params;

      const invoice = await Billing.findInvoiceById(invoiceId);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found'
          }
        });
      }

      const billingInvoice = new Billing(invoice);
      await billingInvoice.removeItem(itemId);

      // Clear cache
      await redis.del(`billing:invoice:${invoiceId}`);

      res.json({
        success: true,
        message: 'Item removed from invoice successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Apply discount to invoice
   * @route   PUT /api/v1/billing/invoices/:id/discount
   * @access  Private (Accounts, Admin)
   */
  async applyDiscount(req, res, next) {
    try {
      const { id } = req.params;
      const { percentage, reason } = req.body;

      if (!percentage || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_INFO',
            message: 'Discount percentage and reason are required'
          }
        });
      }

      const invoice = await Billing.findInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found'
          }
        });
      }

      const billingInvoice = new Billing(invoice);
      await billingInvoice.applyDiscount(percentage, reason, req.user.userId);

      // Clear cache
      await redis.del(`billing:invoice:${id}`);

      res.json({
        success: true,
        message: 'Discount applied successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Void invoice
   * @route   PUT /api/v1/billing/invoices/:id/void
   * @access  Private (Accounts, Admin)
   */
  async voidInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Void reason is required'
          }
        });
      }

      const invoice = await Billing.findInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Invoice not found'
          }
        });
      }

      if (invoice.payment_status === 'Paid') {
        return res.status(409).json({
          success: false,
          error: { code: 'INVOICE_PAID', message: 'Paid invoices cannot be voided' }
        });
      }

      const billingInvoice = new Billing(invoice);
      await billingInvoice.void(reason, req.user.userId);

      // Clear cache
      await redis.del(`billing:invoice:${id}`);
      await redis.clearPattern('billing:invoices:outstanding');

      res.json({
        success: true,
        message: 'Invoice voided successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get daily revenue
   * @route   GET /api/v1/billing/reports/daily-revenue
   * @access  Private
   */
  async getDailyRevenue(req, res, next) {
    try {
      const { date } = req.query;

      const reportDate = date || new Date().toISOString().split('T')[0];
      const revenue = await Billing.getDailyRevenue(req.user.facilityId, reportDate);

      res.json({
        success: true,
        data: revenue
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get revenue by period
   * @route   GET /api/v1/billing/reports/revenue-by-period
   * @access  Private
   */
  async getRevenueByPeriod(req, res, next) {
    try {
      const { start_date, end_date, interval = 'day' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const revenue = await Billing.getRevenueByPeriod(req.user.facilityId, start_date, end_date, interval);

      res.json({
        success: true,
        data: revenue
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get outstanding report
   * @route   GET /api/v1/billing/reports/outstanding
   * @access  Private
   */
  async getOutstandingReport(req, res, next) {
    try {
      const report = await Billing.getOutstandingReport(req.user.facilityId);

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get insurance billing report
   * @route   GET /api/v1/billing/reports/insurance
   * @access  Private
   */
  async getInsuranceBillingReport(req, res, next) {
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

      const report = await Billing.getInsuranceBillingReport(req.user.facilityId, start_date, end_date);

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get payment methods breakdown
   * @route   GET /api/v1/billing/reports/payment-methods
   * @access  Private
   */
  async getPaymentMethodsBreakdown(req, res, next) {
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

      const breakdown = await Billing.getPaymentMethodsBreakdown(req.user.facilityId, start_date, end_date);

      res.json({
        success: true,
        data: breakdown
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get billing dashboard
   * @route   GET /api/v1/billing/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(`
        WITH revenue_today AS (
          SELECT COALESCE(SUM(amount), 0) as total
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND DATE(p.payment_date) = CURRENT_DATE
            AND p.voided = false
        ),
        revenue_month AS (
          SELECT COALESCE(SUM(amount), 0) as total
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= DATE_TRUNC('month', CURRENT_DATE)
            AND p.voided = false
        ),
        outstanding_total AS (
          SELECT COALESCE(SUM(balance_due), 0) as total
          FROM invoices
          WHERE facility_id = $1
            AND balance_due > 0
            AND voided = false
        ),
        invoice_counts AS (
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN balance_due <= 0 THEN 1 END) as paid,
            COUNT(CASE WHEN balance_due > 0 AND due_date >= CURRENT_DATE THEN 1 END) as pending,
            COUNT(CASE WHEN balance_due > 0 AND due_date < CURRENT_DATE THEN 1 END) as overdue
          FROM invoices
          WHERE facility_id = $1
            AND voided = false
        ),
        recent_payments AS (
          SELECT 
            p.*,
            i.invoice_number,
            pt.first_name || ' ' || pt.last_name as patient_name
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          JOIN patients pt ON i.patient_id = pt.id
          WHERE i.facility_id = $1
            AND p.voided = false
          ORDER BY p.payment_date DESC
          LIMIT 10
        )
        SELECT 
          (SELECT total FROM revenue_today) as revenue_today,
          (SELECT total FROM revenue_month) as revenue_month,
          (SELECT total FROM outstanding_total) as outstanding_total,
          (SELECT row_to_json(invoice_counts) FROM invoice_counts) as invoice_stats,
          (SELECT json_agg(recent_payments) FROM recent_payments) as recent_payments
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
   * @desc    Generate receipt
   * @route   GET /api/v1/billing/payments/:id/receipt
   * @access  Private
   */
  async generateReceipt(req, res, next) {
    try {
      const { id } = req.params;

      const payment = await Billing.findPaymentById(id);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Payment not found'
          }
        });
      }

      const invoice = await Billing.findInvoiceById(payment.invoice_id);

      // Generate receipt data
      const receipt = {
        receipt_number: payment.payment_number,
        date: payment.payment_date,
        patient: invoice.patient,
        payment_method: payment.payment_method,
        amount: payment.amount,
        items: invoice.items,
        total: invoice.total_amount,
        paid: invoice.amount_paid,
        balance: invoice.balance_due,
        facility: {
          name: process.env.FACILITY_NAME,
          address: process.env.FACILITY_ADDRESS,
          phone: process.env.FACILITY_PHONE,
          vat: process.env.FACILITY_VAT
        }
      };

      res.json({
        success: true,
        data: receipt
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BillingController();