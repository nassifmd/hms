const Pharmacy = require("../models/Pharmacy");
const Prescription = require("../models/Prescription");
const Audit = require("../models/Audit");
const Billing = require("../models/Billing");
const logger = require("../config/logger");
const redis = require("../config/redis");
const db = require("../config/database");
const { validationResult } = require("express-validator");

class PharmacyController {
  /**
   * @desc    Create new drug
   * @route   POST /api/v1/pharmacy/drugs
   * @access  Private (Pharmacist, Admin)
   */
  async createDrug(req, res, next) {
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

      const drug = await Pharmacy.createDrug(req.body);

      // Clear cache
      await redis.del("pharmacy:drugs:catalog");
      await redis.clearPattern("pharmacy:drugs:*");

      res.status(201).json({
        success: true,
        data: drug,
        message: "Drug created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get drug by ID
   * @route   GET /api/v1/pharmacy/drugs/:id
   * @access  Private
   */
  async getDrug(req, res, next) {
    try {
      const { id } = req.params;

      const drug = await Pharmacy.findDrugById(id);

      if (!drug) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Drug not found",
          },
        });
      }

      res.json({
        success: true,
        data: drug,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Search drugs
   * @route   GET /api/v1/pharmacy/drugs/search
   * @access  Private
   */
  async searchDrugs(req, res, next) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SEARCH",
            message: "Search query must be at least 2 characters",
          },
        });
      }

      const drugs = await Pharmacy.searchDrugs(q, req.user.facilityId);

      res.json({
        success: true,
        data: drugs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add inventory batch
   * @route   POST /api/v1/pharmacy/inventory
   * @access  Private (Pharmacist)
   */
  async addInventory(req, res, next) {
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

      const inventory = await Pharmacy.addInventory({
        ...req.body,
        facility_id: req.user.facilityId,
        received_by: req.user.userId,
      });

      // Clear cache
      await redis.del(`pharmacy:drug:${req.body.drug_id}`);
      await redis.clearPattern("pharmacy:inventory:*");

      res.status(201).json({
        success: true,
        data: inventory,
        message: "Inventory added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory
   * @route   GET /api/v1/pharmacy/inventory
   * @access  Private
   */
  async getInventory(req, res, next) {
    try {
      const { drug_id, low_stock_only, expiring_soon, expired_only, category } =
        req.query;

      const inventory = await Pharmacy.getInventory(req.user.facilityId, {
        drug_id,
        low_stock_only: low_stock_only === "true",
        expiring_soon: expiring_soon === "true",
        expired_only: expired_only === "true",
        category,
      });

      res.json({
        success: true,
        data: inventory,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update inventory
   * @route   PUT /api/v1/pharmacy/inventory/:id
   * @access  Private (Pharmacist)
   */
  async updateInventory(req, res, next) {
    try {
      const { id } = req.params;

      const updated = await Pharmacy.updateInventory(id, req.body);

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Inventory record not found",
          },
        });
      }

      // Clear cache
      await redis.clearPattern("pharmacy:inventory:*");

      res.json({
        success: true,
        data: updated,
        message: "Inventory updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Dispense medication
   * @route   POST /api/v1/pharmacy/dispense
   * @access  Private (Pharmacist)
   */
  async dispenseMedication(req, res, next) {
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

      const dispensing = await Pharmacy.dispense(
        {
          ...req.body,
          facility_id: req.user.facilityId,
        },
        req.user.userId
      );

      // Auto-bill dispensed drugs in a single batch transaction (eliminates N+1)
      if (
        dispensing.patient_id &&
        req.user.facilityId &&
        Array.isArray(dispensing.items) &&
        dispensing.items.length > 0
      ) {
        const billingItems = dispensing.items.map((item) => ({
          facilityId: req.user.facilityId,
          patientId: dispensing.patient_id,
          visitId: dispensing.visit_id || null,
          serviceType: "Drug",
          serviceId: item.drug_id || null,
          itemName: item.drug_name || item.name,
          itemCode: item.drug_code || null,
          quantity: item.quantity || 1,
          description: `Dispensed: ${item.drug_name || ""}`,
        }));

        Billing.batchAddToPatientInvoice(billingItems, req.user.userId).catch(
          (billingErr) => {
            logger.warn("Auto-billing failed for dispensed drugs", {
              error: billingErr.message,
              itemCount: billingItems.length,
            });
          }
        );
      }

      // Clear cache
      await redis.del(`prescription:${req.body.prescription_id}`);
      await redis.clearPattern("pharmacy:inventory:*");
      await redis.clearPattern("pharmacy:dispensing:*");

      res.status(201).json({
        success: true,
        data: dispensing,
        message: "Medication dispensed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get dispensing history
   * @route   GET /api/v1/pharmacy/dispensing/patient/:patientId
   * @access  Private
   */
  async getDispensingHistory(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 20 } = req.query;

      const history = await Pharmacy.getDispensingHistory(patientId, limit);

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get low stock alerts
   * @route   GET /api/v1/pharmacy/alerts/low-stock
   * @access  Private
   */
  async getLowStockAlerts(req, res, next) {
    try {
      const alerts = await Pharmacy.getLowStockAlert(req.user.facilityId);

      res.json({
        success: true,
        data: alerts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get expiry alerts
   * @route   GET /api/v1/pharmacy/alerts/expiry
   * @access  Private
   */
  async getExpiryAlerts(req, res, next) {
    try {
      const { days = 30 } = req.query;

      const alerts = await Pharmacy.getExpiryAlert(req.user.facilityId, days);

      res.json({
        success: true,
        data: alerts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get stock movements
   * @route   GET /api/v1/pharmacy/movements
   * @access  Private
   */
  async getStockMovements(req, res, next) {
    try {
      const {
        drug_id,
        movement_type,
        from_date,
        to_date,
        limit = 50,
      } = req.query;

      const movements = await Pharmacy.getStockMovements(req.user.facilityId, {
        drug_id,
        movement_type,
        from_date,
        to_date,
        limit,
      });

      res.json({
        success: true,
        data: movements,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Perform stock take
   * @route   POST /api/v1/pharmacy/stock-take
   * @access  Private (Pharmacist)
   */
  async performStockTake(req, res, next) {
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

      const discrepancies = await Pharmacy.performStockTake(
        {
          ...req.body,
          facility_id: req.user.facilityId,
        },
        req.user.userId
      );

      // Clear cache
      await redis.clearPattern("pharmacy:inventory:*");

      res.json({
        success: true,
        data: {
          discrepancies,
          count: discrepancies.length,
        },
        message: `Stock take completed with ${discrepancies.length} discrepancies`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory value
   * @route   GET /api/v1/pharmacy/reports/inventory-value
   * @access  Private
   */
  async getInventoryValue(req, res, next) {
    try {
      const value = await Pharmacy.getInventoryValue(req.user.facilityId);

      res.json({
        success: true,
        data: value,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get consumption report
   * @route   GET /api/v1/pharmacy/reports/consumption
   * @access  Private
   */
  async getConsumptionReport(req, res, next) {
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

      const report = await Pharmacy.getConsumptionReport(
        req.user.facilityId,
        start_date,
        end_date
      );

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get expiry report
   * @route   GET /api/v1/pharmacy/reports/expiry
   * @access  Private
   */
  async getExpiryReport(req, res, next) {
    try {
      const report = await Pharmacy.getExpiryReport(req.user.facilityId);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get pharmacy dashboard
   * @route   GET /api/v1/pharmacy/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(
        `
        WITH inventory_summary AS (
          SELECT
            COUNT(DISTINCT drug_id) as unique_drugs,
            SUM(quantity_on_hand) as total_units,
            SUM(quantity_on_hand * unit_cost) as total_value
          FROM drug_inventory
          WHERE facility_id = $1
        ),
        low_stock AS (
          SELECT COUNT(*) as count
          FROM drug_inventory di
          JOIN drugs d ON di.drug_id = d.id
          WHERE di.facility_id = $1
            AND di.quantity_on_hand <= d.reorder_level
        ),
        expiring_soon AS (
          SELECT COUNT(*) as count
          FROM drug_inventory
          WHERE facility_id = $1
            AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        ),
        today_dispensing AS (
          SELECT COUNT(*) as count
          FROM drug_dispensing
          WHERE dispensed_date::date = CURRENT_DATE
        ),
        top_dispensed AS (
          SELECT
            d.drug_name,
            COUNT(*) as dispense_count
          FROM drug_dispensing dd
          JOIN dispensing_items di ON dd.id = di.dispensing_id
          JOIN drug_inventory inv ON di.drug_inventory_id = inv.id
          JOIN drugs d ON inv.drug_id = d.id
          WHERE dd.dispensed_date >= NOW() - INTERVAL '30 days'
          GROUP BY d.drug_name
          ORDER BY dispense_count DESC
          LIMIT 5
        )
        SELECT
          (SELECT row_to_json(inventory_summary) FROM inventory_summary) as inventory,
          (SELECT count FROM low_stock) as low_stock_count,
          (SELECT count FROM expiring_soon) as expiring_soon_count,
          (SELECT count FROM today_dispensing) as today_dispensing,
          (SELECT json_agg(top_dispensed) FROM top_dispensed) as top_dispensed
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
   * @desc    Create purchase order
   * @route   POST /api/v1/pharmacy/purchase-orders
   * @access  Private (Pharmacist)
   */
  async createPurchaseOrder(req, res, next) {
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

      const po = await Pharmacy.createPurchaseOrder(
        {
          ...req.body,
          facility_id: req.user.facilityId,
        },
        req.user.userId
      );

      res.status(201).json({
        success: true,
        data: po,
        message: "Purchase order created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Receive purchase order
   * @route   PUT /api/v1/pharmacy/purchase-orders/:id/receive
   * @access  Private (Pharmacist)
   */
  async receivePurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;

      await Pharmacy.receivePurchaseOrder(
        id,
        {
          ...req.body,
          facility_id: req.user.facilityId,
        },
        req.user.userId
      );

      // Clear cache
      await redis.clearPattern("pharmacy:inventory:*");

      res.json({
        success: true,
        message: "Purchase order received successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PharmacyController();
