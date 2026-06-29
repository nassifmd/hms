const Inventory = require('../models/Inventory');
const Audit = require('../models/Audit');
const logger = require('../config/logger');
const redis = require('../config/redis');
const db = require('../config/database');
const { validationResult } = require('express-validator');

class InventoryController {
  /**
   * @desc    List inventory items
   * @route   GET /api/v1/inventory/items
   * @access  Private
   */
  async getItems(req, res, next) {
    try {
      const facilityId = req.user.facilityId;
      const { search, category, item_type, stock_location, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // countParams: filter values only (no facilityId), placeholders start at $1
      const countConditions = ['i.is_active = true'];
      const countParams = [];
      let cp = 1;

      // mainParams: facilityId first ($1 for JOIN), filter values from $2 onward
      const mainConditions = ['i.is_active = true'];
      const mainParams = [facilityId];
      let p = 2;

      if (search) {
        const pattern = `%${search}%`;
        countConditions.push(`(i.item_name ILIKE $${cp} OR i.item_code ILIKE $${cp} OR i.description ILIKE $${cp})`);
        countParams.push(pattern);
        cp++;
        mainConditions.push(`(i.item_name ILIKE $${p} OR i.item_code ILIKE $${p} OR i.description ILIKE $${p})`);
        mainParams.push(pattern);
        p++;
      }
      if (category) {
        countConditions.push(`i.category = $${cp}`);
        countParams.push(category);
        cp++;
        mainConditions.push(`i.category = $${p}`);
        mainParams.push(category);
        p++;
      }
      if (item_type) {
        countConditions.push(`i.item_type = $${cp}`);
        countParams.push(item_type);
        cp++;
        mainConditions.push(`i.item_type = $${p}`);
        mainParams.push(item_type);
        p++;
      }

      // stock_location filter: 'Store' or 'Pharmacy'
      // When filtering by location we also need to filter the count query
      // (the count query doesn't join batches, so we use a subquery)
      let batchLocationFilter = '';
      if (stock_location && ['Store', 'Pharmacy'].includes(stock_location)) {
        batchLocationFilter = ` AND b.stock_location = $${p}`;
        mainParams.push(stock_location);
        p++;
      }

      const countWhere = countConditions.join(' AND ');
      const where = mainConditions.join(' AND ');

      // When stock_location is given, count only items that have at least one batch in that location
      let countSql;
      if (stock_location && ['Store', 'Pharmacy'].includes(stock_location)) {
        countSql = `
          SELECT COUNT(DISTINCT i.id)
          FROM inventory_items i
          JOIN inventory_batches b ON b.item_id = i.id AND b.facility_id = $${cp} AND b.stock_location = $${cp + 1} AND b.quantity_on_hand > 0
          WHERE ${countWhere}`;
        countParams.push(facilityId, stock_location);
        cp += 2;
      } else {
        countSql = `SELECT COUNT(DISTINCT i.id) FROM inventory_items i WHERE ${countWhere}`;
      }

      const countResult = await db.query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count);

      const result = await db.query(`
        SELECT
          i.id,
          i.item_name        AS name,
          i.item_code        AS sku,
          i.item_type,
          i.category,
          i.unit_of_measure  AS unit,
          i.reorder_level    AS "minimumStock",
          COALESCE(SUM(b.quantity_on_hand), 0)                                       AS "currentStock",
          COALESCE(AVG(NULLIF(b.unit_cost, 0)), 0)                                   AS "unitPrice",
          MIN(CASE WHEN b.expiry_date > NOW() THEN b.expiry_date END)               AS "expiryDate",
          s.supplier_name    AS supplier,
          CASE
            WHEN COALESCE(SUM(b.quantity_on_hand), 0) = 0              THEN 'Out of Stock'
            WHEN MIN(b.expiry_date) < NOW()
              AND COALESCE(SUM(b.quantity_on_hand), 0) > 0             THEN 'Expired'
            WHEN COALESCE(SUM(b.quantity_on_hand), 0) <= i.reorder_level THEN 'Low Stock'
            ELSE 'In Stock'
          END AS status
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON b.item_id = i.id AND b.facility_id = $1${batchLocationFilter}
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE ${where}
        GROUP BY i.id, i.item_name, i.item_code, i.item_type, i.category,
                 i.unit_of_measure, i.reorder_level, s.supplier_name
        ORDER BY i.item_name
        LIMIT $${p} OFFSET $${p + 1}
      `, [...mainParams, parseInt(limit), offset]);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create new inventory item
   * @route   POST /api/v1/inventory/items
   * @access  Private (Admin, Inventory Manager)
   */
  async createItem(req, res, next) {
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

      const item = await Inventory.createItem(req.body);

      // Clear cache
      await redis.del('inventory:items:catalog');
      await redis.clearPattern('inventory:items:*');

      res.status(201).json({
        success: true,
        data: item,
        message: 'Inventory item created successfully'
      });

    } catch (error) {
      // Duplicate item code
      if (error.code === '23505' && error.constraint === 'inventory_items_item_code_key') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ITEM_CODE',
            message: 'An inventory item with this Item Code / SKU already exists. Please use a different code.'
          }
        });
      }
      next(error);
    }
  }

  /**
   * @desc    Get inventory item by ID
   * @route   GET /api/v1/inventory/items/:id
   * @access  Private
   */
  async getItem(req, res, next) {
    try {
      const { id } = req.params;

      const item = await Inventory.findItemById(id);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Inventory item not found'
          }
        });
      }

      res.json({
        success: true,
        data: item
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Search inventory items
   * @route   GET /api/v1/inventory/items/search
   * @access  Private
   */
  async searchItems(req, res, next) {
    try {
      const { q, item_type } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SEARCH',
            message: 'Search query must be at least 2 characters'
          }
        });
      }

      const items = await Inventory.searchItems(q, item_type);

      res.json({
        success: true,
        data: items
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add inventory batch
   * @route   POST /api/v1/inventory/batches
   * @access  Private (Inventory Manager)
   */
  async addBatch(req, res, next) {
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

      const batch = await Inventory.addBatch({
        ...req.body,
        facility_id: req.user.facilityId,
        stock_location: 'Store'
      }, req.user.userId);

      // Clear cache
      await redis.del(`inventory:item:${req.body.item_id}`);
      await redis.clearPattern('inventory:batches:*');

      res.status(201).json({
        success: true,
        data: batch,
        message: 'Inventory batch added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory batches
   * @route   GET /api/v1/inventory/batches
   * @access  Private
   */
  async getBatches(req, res, next) {
    try {
      const {
        item_id,
        expiring_soon,
        low_stock,
        expired_only,
        stock_location
      } = req.query;

      const batches = await Inventory.getBatches(req.user.facilityId, {
        item_id,
        expiring_soon: expiring_soon === 'true',
        low_stock: low_stock === 'true',
        expired_only: expired_only === 'true',
        stock_location
      });

      res.json({
        success: true,
        data: batches
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Record stock movement
   * @route   POST /api/v1/inventory/movements
   * @access  Private (Inventory Manager)
   */
  async recordMovement(req, res, next) {
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

      const movement = await Inventory.recordMovement({
        ...req.body,
        facility_id: req.user.facilityId
      }, req.user.userId);

      // Clear cache
      await redis.del(`inventory:item:${req.body.item_id}`);
      await redis.clearPattern('inventory:movements:*');

      res.status(201).json({
        success: true,
        data: movement,
        message: 'Stock movement recorded successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get stock movements
   * @route   GET /api/v1/inventory/movements
   * @access  Private
   */
  async getMovements(req, res, next) {
    try {
      const {
        item_id,
        batch_id,
        movement_type,
        from_date,
        to_date,
        limit = 100
      } = req.query;

      const movements = await Inventory.getMovements(req.user.facilityId, {
        item_id,
        batch_id,
        movement_type,
        from_date,
        to_date,
        limit
      });

      res.json({
        success: true,
        data: movements
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Perform stock take
   * @route   POST /api/v1/inventory/stock-take
   * @access  Private (Inventory Manager)
   */
  async performStockTake(req, res, next) {
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

      const discrepancies = await Inventory.performStockTake({
        ...req.body,
        facility_id: req.user.facilityId
      }, req.user.userId);

      // Clear cache
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      res.json({
        success: true,
        data: {
          discrepancies,
          count: discrepancies.length
        },
        message: `Stock take completed with ${discrepancies.length} discrepancies`
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Add supplier
   * @route   POST /api/v1/inventory/suppliers
   * @access  Private (Admin, Inventory Manager)
   */
  async addSupplier(req, res, next) {
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

      const supplier = await Inventory.addSupplier(req.body);

      // Clear cache
      await redis.del('inventory:suppliers');

      res.status(201).json({
        success: true,
        data: supplier,
        message: 'Supplier added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get suppliers
   * @route   GET /api/v1/inventory/suppliers
   * @access  Private
   */
  async getSuppliers(req, res, next) {
    try {
      const { active = true } = req.query;

      const suppliers = await Inventory.getSuppliers(active);

      res.json({
        success: true,
        data: suppliers
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create purchase order
   * @route   POST /api/v1/inventory/purchase-orders
   * @access  Private (Inventory Manager)
   */
  async createPurchaseOrder(req, res, next) {
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

      const po = await Inventory.createPurchaseOrder({
        ...req.body,
        facility_id: req.user.facilityId
      }, req.user.userId);

      res.status(201).json({
        success: true,
        data: po,
        message: 'Purchase order created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Receive purchase order
   * @route   PUT /api/v1/inventory/purchase-orders/:id/receive
   * @access  Private (Inventory Manager)
   */
  async receivePurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;

      await Inventory.receivePurchaseOrder(id, {
        ...req.body,
        facility_id: req.user.facilityId
      }, req.user.userId);

      // Clear cache
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      res.json({
        success: true,
        message: 'Purchase order received successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory value report
   * @route   GET /api/v1/inventory/reports/value
   * @access  Private
   */
  async getInventoryValue(req, res, next) {
    try {
      const value = await Inventory.getInventoryValue(req.user.facilityId);

      res.json({
        success: true,
        data: value
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory by category
   * @route   GET /api/v1/inventory/reports/by-category
   * @access  Private
   */
  async getInventoryByCategory(req, res, next) {
    try {
      const report = await Inventory.getInventoryByCategory(req.user.facilityId);

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get expiry report
   * @route   GET /api/v1/inventory/reports/expiry
   * @access  Private
   */
  async getExpiryReport(req, res, next) {
    try {
      const { days = 90 } = req.query;

      const report = await Inventory.getExpiryReport(req.user.facilityId, days);

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get movement summary
   * @route   GET /api/v1/inventory/reports/movements
   * @access  Private
   */
  async getMovementSummary(req, res, next) {
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

      const summary = await Inventory.getMovementSummary(req.user.facilityId, start_date, end_date);

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get inventory dashboard
   * @route   GET /api/v1/inventory/dashboard
   * @access  Private
   */
  async getDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;
      const { stock_location } = req.query;
      const validLoc = (stock_location === 'Store' || stock_location === 'Pharmacy') ? stock_location : null;
      const locFilter = validLoc ? `AND stock_location = '${validLoc}'` : '';
      const locFilterB = validLoc ? `AND b.stock_location = '${validLoc}'` : '';

      const stats = await db.query(`
        WITH inventory_summary AS (
          SELECT 
            COUNT(DISTINCT item_id) as unique_items,
            SUM(quantity_on_hand) as total_units,
            SUM(quantity_on_hand * unit_cost) as total_value,
            COUNT(DISTINCT id) as total_batches
          FROM inventory_batches
          WHERE facility_id = $1
            AND quantity_on_hand > 0
            ${locFilter}
        ),
        low_stock_count AS (
          SELECT COUNT(*) as count
          FROM inventory_batches b
          JOIN inventory_items i ON b.item_id = i.id
          WHERE b.facility_id = $1
            AND b.quantity_on_hand <= i.reorder_level
            AND b.quantity_on_hand > 0
            ${locFilterB}
        ),
        expiring_count AS (
          SELECT COUNT(*) as count
          FROM inventory_batches
          WHERE facility_id = $1
            AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
            AND quantity_on_hand > 0
            ${locFilter}
        ),
        expired_count AS (
          SELECT COUNT(*) as count,
                 SUM(quantity_on_hand * unit_cost) as value
          FROM inventory_batches
          WHERE facility_id = $1
            AND expiry_date < NOW()
            AND quantity_on_hand > 0
            ${locFilter}
        ),
        recent_movements AS (
          SELECT 
            sm.*,
            i.item_name,
            u.first_name || ' ' || u.last_name as created_by_name
          FROM stock_movements sm
          LEFT JOIN inventory_items i ON sm.item_id = i.id
          LEFT JOIN users u ON sm.created_by = u.id
          WHERE sm.facility_id = $1
          ORDER BY sm.created_at DESC
          LIMIT 10
        ),
        top_items AS (
          SELECT 
            i.item_name,
            SUM(sm.quantity) as total_moved
          FROM stock_movements sm
          JOIN inventory_items i ON sm.item_id = i.id
          WHERE sm.facility_id = $1
            AND sm.movement_type = 'Issue'
            AND sm.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY i.item_name
          ORDER BY total_moved DESC
          LIMIT 5
        )
        SELECT 
          (SELECT row_to_json(inventory_summary) FROM inventory_summary) as summary,
          (SELECT count FROM low_stock_count) as low_stock_items,
          (SELECT count FROM expiring_count) as expiring_soon,
          (SELECT row_to_json(expired_count) FROM expired_count) as expired,
          (SELECT json_agg(recent_movements) FROM recent_movements) as recent_movements,
          (SELECT json_agg(top_items) FROM top_items) as top_items
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
   * @desc    Update inventory item
   * @route   PUT /api/v1/inventory/items/:id
   * @access  Private (Inventory Manager)
   */
  async updateItem(req, res, next) {
    try {
      const { id } = req.params;

      // Capture old values for audit trail
      const oldResult = await db.query(
        `SELECT item_name, category, item_type, description, manufacturer,
                unit_of_measure, reorder_level, maximum_level,
                storage_location, storage_conditions
         FROM inventory_items WHERE id = $1`,
        [id]
      );
      if (oldResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Inventory item not found' }
        });
      }

      const result = await db.query(`
        UPDATE inventory_items
        SET
          item_name          = COALESCE($1,  item_name),
          category           = COALESCE($2,  category),
          item_type          = COALESCE($3,  item_type),
          description        = COALESCE($4,  description),
          manufacturer       = COALESCE($5,  manufacturer),
          unit_of_measure    = COALESCE($6,  unit_of_measure),
          reorder_level      = COALESCE($7,  reorder_level),
          maximum_level      = COALESCE($8,  maximum_level),
          storage_location   = COALESCE($9,  storage_location),
          storage_conditions = COALESCE($10, storage_conditions),
          updated_at         = NOW()
        WHERE id = $11
        RETURNING *
      `, [
        req.body.item_name        || null,
        req.body.category         || null,
        req.body.item_type        || null,
        req.body.description      ?? null,
        req.body.manufacturer     ?? null,
        req.body.unit_of_measure  || null,
        req.body.reorder_level    ?? null,
        req.body.maximum_level    ?? null,
        req.body.storage_location ?? null,
        req.body.storage_conditions ?? null,
        id
      ]);

      // Write audit entry
      await Audit.logChange(
        req.user.userId,
        'inventory_items',
        id,
        oldResult.rows[0],
        result.rows[0],
        req
      );

      // Clear cache
      await redis.del(`inventory:item:${id}`);
      await redis.del('inventory:items:catalog');
      await redis.clearPattern('inventory:items:*');

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
   * @desc    Get item edit history and stock movements
   * @route   GET /api/v1/inventory/items/:id/history
   * @access  Private
   */
  async getItemHistory(req, res, next) {
    try {
      const { id } = req.params;

      const [editsResult, movementsResult] = await Promise.all([
        db.query(
          `SELECT al.id, al.action, al.old_values, al.new_values, al.created_at,
                  u.first_name || ' ' || u.last_name AS user_name
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           WHERE al.table_name = 'inventory_items'
             AND al.record_id = $1
           ORDER BY al.created_at DESC
           LIMIT 100`,
          [id]
        ),
        db.query(
          `SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost,
                  sm.reference_type, sm.notes, sm.created_at,
                  u.first_name || ' ' || u.last_name AS user_name,
                  ib.batch_number
           FROM stock_movements sm
           LEFT JOIN users u ON sm.created_by = u.id
           LEFT JOIN inventory_batches ib ON sm.batch_id = ib.id
           WHERE sm.item_id = $1
           ORDER BY sm.created_at DESC
           LIMIT 200`,
          [id]
        )
      ]);

      res.json({
        success: true,
        data: {
          edits: editsResult.rows,
          movements: movementsResult.rows
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update batch
   * @route   PUT /api/v1/inventory/batches/:id
   * @access  Private (Inventory Manager)
   */
  async updateBatch(req, res, next) {
    try {
      const { id } = req.params;

      const result = await db.query(`
        UPDATE inventory_batches 
        SET 
          quantity_on_hand = COALESCE($1, quantity_on_hand),
          unit_cost = COALESCE($2, unit_cost),
          location = COALESCE($3, location),
          updated_at = NOW()
        WHERE id = $4 AND facility_id = $5
        RETURNING *
      `, [
        req.body.quantity_on_hand,
        req.body.unit_cost,
        req.body.location,
        id,
        req.user.facilityId
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Batch not found'
          }
        });
      }

      // Clear cache
      await redis.clearPattern('inventory:batches:*');

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Batch updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Adjust batch stock quantity (stock correction)
   * @route   PATCH /api/v1/inventory/batches/:id/adjust
   * @access  Private (Inventory Manager, Admin)
   */
  async adjustBatch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg }
        });
      }

      const { id } = req.params;
      const { new_quantity, reason } = req.body;

      // Fetch current batch + item_type
      const existing = await db.query(`
        SELECT b.*, i.item_type
        FROM inventory_batches b
        JOIN inventory_items i ON b.item_id = i.id
        WHERE b.id = $1 AND b.facility_id = $2
      `, [id, req.user.facilityId]);

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' }
        });
      }

      const batch = existing.rows[0];
      const diff = Number(new_quantity) - Number(batch.quantity_on_hand);

      if (diff === 0) {
        return res.json({ success: true, data: batch, message: 'No change — quantity is already correct' });
      }

      // Update quantity
      const result = await db.query(`
        UPDATE inventory_batches
        SET quantity_on_hand = $1, updated_at = NOW()
        WHERE id = $2 AND facility_id = $3
        RETURNING *
      `, [new_quantity, id, req.user.facilityId]);

      // Record adjustment movement for audit trail
      await db.query(`
        INSERT INTO stock_movements (
          facility_id, item_type, item_id, batch_id,
          movement_type, quantity, unit_cost, reference_type,
          created_by, notes, created_at
        ) VALUES ($1, $2, $3, $4, 'Adjustment', $5, $6, 'Manual Adjustment', $7, $8, NOW())
      `, [
        req.user.facilityId,
        batch.item_type,
        batch.item_id,
        id,
        Math.round(Math.abs(diff)),
        batch.unit_cost,
        req.user.userId,
        `Correction ${diff > 0 ? '+' : ''}${diff} | ${reason}`
      ]);

      // Clear cache
      await redis.del(`inventory:item:${batch.item_id}`);
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Stock adjusted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Delete batch (soft delete by setting quantity to 0)
   * @route   DELETE /api/v1/inventory/batches/:id
   * @access  Private (Admin only)
   */
  async deleteBatch(req, res, next) {
    try {
      const { id } = req.params;

      // Fetch first so we have item_id, item_type, and current quantity for the audit movement
      const existing = await db.query(`
        SELECT b.*, i.item_type
        FROM inventory_batches b
        JOIN inventory_items i ON b.item_id = i.id
        WHERE b.id = $1 AND b.facility_id = $2
      `, [id, req.user.facilityId]);

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' }
        });
      }

      const batch = existing.rows[0];

      await db.query(`
        UPDATE inventory_batches
        SET quantity_on_hand = 0, updated_at = NOW()
        WHERE id = $1
      `, [id]);

      if (batch.quantity_on_hand > 0) {
        await db.query(`
          INSERT INTO stock_movements (
            facility_id, item_type, item_id, batch_id,
            movement_type, quantity, unit_cost, reference_type,
            created_by, notes, created_at
          ) VALUES ($1, $2, $3, $4, 'Disposal', $5, $6, 'Manual', $7, $8, NOW())
        `, [
          req.user.facilityId,
          batch.item_type,
          batch.item_id,
          id,
          batch.quantity_on_hand,
          batch.unit_cost,
          req.user.userId,
          'Batch deleted — quantity disposed'
        ]);
      }

      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      res.json({ success: true, message: 'Batch deleted successfully' });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Dispose all expired batches for an item
   * @route   POST /api/v1/inventory/items/:id/dispose-expired
   * @access  Private (Inventory Manager, Admin)
   */
  async disposeExpiredBatches(req, res, next) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // Fetch all expired batches with stock remaining
      const expired = await db.query(`
        SELECT b.id, b.batch_number, b.quantity_on_hand, b.unit_cost,
               i.item_type, i.item_name
        FROM inventory_batches b
        JOIN inventory_items i ON b.item_id = i.id
        WHERE b.item_id = $1
          AND b.facility_id = $2
          AND b.expiry_date < NOW()
          AND b.quantity_on_hand > 0
      `, [id, req.user.facilityId]);

      if (expired.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_EXPIRED_STOCK', message: 'No expired batches with remaining stock found' }
        });
      }

      const disposalNote = notes?.trim() || 'Expired stock disposal';

      // Record movement first (before delete, so batch still exists for FK join)
      // then hard-delete the batch row (FK is ON DELETE SET NULL so movement record is preserved)
      for (const batch of expired.rows) {
        // quantity_on_hand is NUMERIC(10,2) in DB so pg returns it as a string — cast to int
        const qty = Math.round(Number(batch.quantity_on_hand));

        await db.query(`
          INSERT INTO stock_movements (
            facility_id, item_type, item_id, batch_id,
            movement_type, quantity, unit_cost, reference_type,
            created_by, notes, created_at
          ) VALUES ($1, $2, $3, $4, 'Disposal', $5, $6, 'Expired Stock', $7, $8, NOW())
        `, [
          req.user.facilityId,
          batch.item_type,
          id,
          batch.id,
          qty,
          batch.unit_cost,
          req.user.userId,
          `${disposalNote} — Batch ${batch.batch_number}`
        ]);

        // Hard-delete the batch row (FK batch_id in stock_movements is ON DELETE SET NULL)
        await db.query(`DELETE FROM inventory_batches WHERE id = $1`, [batch.id]);
      }

      await redis.del(`inventory:item:${id}`);
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      const totalDisposed = expired.rows.reduce((sum, b) => sum + Number(b.quantity_on_hand), 0);

      res.json({
        success: true,
        message: `${expired.rows.length} expired batch(es) disposed (${totalDisposed} units written off)`,
        data: { batches_disposed: expired.rows.length, units_disposed: totalDisposed }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Stock adjustment — add or remove units with a reason (FEFO for removals)
   * @route   POST /api/v1/inventory/items/:id/adjustment
   * @access  Private (Inventory Manager, Admin)
   */
  async stockAdjustment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg }
        });
      }

      const { id } = req.params;
      const { direction, quantity, reason, notes, stock_location } = req.body;

      const itemResult = await db.query(
        `SELECT item_type, item_name FROM inventory_items WHERE id = $1 AND is_active = true`,
        [id]
      );
      if (!itemResult.rows.length) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Inventory item not found' }
        });
      }

      const { item_type } = itemResult.rows[0];
      const note = notes?.trim() ? `${reason} | ${notes.trim()}` : reason;
      const loc = (stock_location === 'Store' || stock_location === 'Pharmacy') ? stock_location : null;

      if (direction === 'remove') {
        await adjustRemove(id, quantity, reason, note, item_type, req, loc);
      } else {
        await adjustAdd(id, quantity, reason, note, item_type, req, loc);
      }

      await redis.del(`inventory:item:${id}`);
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      res.json({
        success: true,
        message: `${direction === 'add' ? 'Added' : 'Removed'} ${quantity} unit(s) — ${reason}`
      });

    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { code: error.code ?? 'BAD_REQUEST', message: error.message }
        });
      }
      next(error);
    }
  }

  /**
   * @desc    Transfer stock from Store → Pharmacy (FEFO)
   * @route   POST /api/v1/inventory/transfer
   * @access  Private (Inventory Manager, Pharmacist)
   */
  async transferToPharmacy(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg }
        });
      }

      const facilityId = req.user.facilityId;
      const userId = req.user.userId;
      const { item_id, quantity, notes } = req.body;

      // Verify item exists
      const itemResult = await db.query(
        `SELECT item_type, item_name FROM inventory_items WHERE id = $1 AND is_active = true`,
        [item_id]
      );
      if (!itemResult.rows.length) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Inventory item not found' }
        });
      }

      const { item_type, item_name } = itemResult.rows[0];

      // Fetch Store batches (FEFO)
      const storeBatches = await db.query(`
        SELECT id, batch_number, quantity_on_hand, unit_cost, expiry_date, manufacturing_date, location
        FROM inventory_batches
        WHERE item_id = $1 AND facility_id = $2
          AND stock_location = 'Store'
          AND quantity_on_hand > 0
        ORDER BY expiry_date ASC NULLS LAST, created_at ASC
      `, [item_id, facilityId]);

      const totalAvailable = storeBatches.rows.reduce((s, b) => s + Number(b.quantity_on_hand), 0);
      if (quantity > totalAvailable) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Cannot transfer ${quantity} units — only ${Math.floor(totalAvailable)} available in Store`
          }
        });
      }

      const transferNote = notes?.trim() || `Transfer Store → Pharmacy`;

      // Deduct from Store batches (FEFO) and create/add to Pharmacy batches
      let remaining = quantity;
      for (const batch of storeBatches.rows) {
        if (remaining <= 0) break;
        const deduct = Math.min(Math.round(Number(batch.quantity_on_hand)), remaining);

        // Deduct from Store batch
        await db.query(
          `UPDATE inventory_batches SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW() WHERE id = $2`,
          [deduct, batch.id]
        );

        // Find or create matching Pharmacy batch (prefix PH- to avoid unique constraint on batch_number)
        const pharmBatchNumber = `PH-${batch.batch_number}`;
        const existingPharmBatch = await db.query(`
          SELECT id FROM inventory_batches
          WHERE item_id = $1 AND facility_id = $2
            AND stock_location = 'Pharmacy'
            AND batch_number = $3
        `, [item_id, facilityId, pharmBatchNumber]);

        let pharmBatchId;
        if (existingPharmBatch.rows.length > 0) {
          pharmBatchId = existingPharmBatch.rows[0].id;
          await db.query(
            `UPDATE inventory_batches SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW() WHERE id = $2`,
            [deduct, pharmBatchId]
          );
        } else {
          const newBatch = await db.query(`
            INSERT INTO inventory_batches (
              facility_id, item_id, batch_number, expiry_date,
              manufacturing_date, quantity_on_hand, unit_cost,
              received_date, received_by, location, stock_location, notes,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, 'Pharmacy', $10, NOW(), NOW())
            RETURNING id
          `, [
            facilityId, item_id, pharmBatchNumber, batch.expiry_date,
            batch.manufacturing_date, deduct, batch.unit_cost,
            userId, batch.location, `Transferred from Store (original batch: ${batch.batch_number})`
          ]);
          pharmBatchId = newBatch.rows[0].id;
        }

        // Log Transfer movement
        await db.query(`
          INSERT INTO stock_movements (
            facility_id, item_type, item_id, batch_id,
            movement_type, quantity, unit_cost, reference_type,
            created_by, notes, created_at
          ) VALUES ($1, $2, $3, $4, 'Transfer', $5, $6, 'Store to Pharmacy', $7, $8, NOW())
        `, [facilityId, item_type, item_id, batch.id, deduct, batch.unit_cost, userId, transferNote]);

        remaining -= deduct;
      }

      // Log the transfer record
      await db.query(`
        INSERT INTO inventory_transfers (
          facility_id, item_id, from_location, to_location,
          quantity, notes, transferred_by, created_at
        ) VALUES ($1, $2, 'Store', 'Pharmacy', $3, $4, $5, NOW())
      `, [facilityId, item_id, quantity, transferNote, userId]);

      // Clear cache
      await redis.del(`inventory:item:${item_id}`);
      await redis.clearPattern('inventory:batches:*');
      await redis.clearPattern('inventory:movements:*');

      logger.audit('INVENTORY_TRANSFER', userId, 'inventory', {
        itemId: item_id,
        itemName: item_name,
        quantity,
        from: 'Store',
        to: 'Pharmacy'
      });

      res.json({
        success: true,
        message: `${quantity} unit(s) of ${item_name} transferred from Store to Pharmacy`
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get catalog items for a given inventory category
   * @route   GET /api/v1/inventory/catalog?category=Medication
   * @access  Private
   */
  async getCatalog(req, res, next) {
    try {
      const { category } = req.query;
      let rows = [];

      if (category === 'Medication') {
        const result = await db.query(
          `SELECT id, drug_name AS name, drug_code AS code, dosage_form, strength
           FROM drugs
           WHERE is_active = true
           ORDER BY drug_name`,
          []
        );
        rows = result.rows;
      } else if (category === 'Reagent') {
        const result = await db.query(
          `SELECT id, test_name AS name, test_code AS code, test_category
           FROM lab_tests
           WHERE is_active = true
           ORDER BY test_name`,
          []
        );
        rows = result.rows;
      } else if (category === 'Equipment' || category === 'Consumable' || category === 'PPE') {
        const result = await db.query(
          `SELECT id, procedure_name AS name, procedure_code AS code, procedure_category
           FROM procedures
           WHERE is_active = true
           ORDER BY procedure_name`,
          []
        );
        rows = result.rows;
      }

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InventoryController();

// ─── Module-level helpers (avoid `this` binding issues with Express) ──────────

async function adjustRemove(itemId, quantity, reason, note, item_type, req, stockLocation) {
  let locCondition = '';
  const params = [itemId, req.user.facilityId];
  if (stockLocation) {
    locCondition = ' AND stock_location = $3';
    params.push(stockLocation);
  }

  const batches = await db.query(`
    SELECT id, quantity_on_hand, unit_cost
    FROM inventory_batches
    WHERE item_id = $1 AND facility_id = $2 AND quantity_on_hand > 0${locCondition}
    ORDER BY expiry_date ASC NULLS LAST, created_at ASC
  `, params);

  const totalAvailable = batches.rows.reduce((s, b) => s + Number(b.quantity_on_hand), 0);
  if (quantity > totalAvailable) {
    const err = new Error(`Cannot remove ${quantity} units — only ${Math.floor(totalAvailable)} available`);
    err.statusCode = 400;
    err.code = 'INSUFFICIENT_STOCK';
    throw err;
  }

  let remaining = quantity;
  for (const batch of batches.rows) {
    if (remaining <= 0) break;
    const deduct = Math.min(Math.round(Number(batch.quantity_on_hand)), remaining);
    await db.query(
      `UPDATE inventory_batches SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW() WHERE id = $2`,
      [deduct, batch.id]
    );
    await db.query(`
      INSERT INTO stock_movements (
        facility_id, item_type, item_id, batch_id,
        movement_type, quantity, unit_cost, reference_type,
        created_by, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'Adjustment', $5, $6, $7, $8, $9, NOW())
    `, [req.user.facilityId, item_type, itemId, batch.id, deduct, batch.unit_cost, reason, req.user.userId, note]);
    remaining -= deduct;
  }
}

async function adjustAdd(itemId, quantity, reason, note, item_type, req, stockLocation) {
  let locCondition = '';
  const params = [itemId, req.user.facilityId];
  if (stockLocation) {
    locCondition = ' AND stock_location = $3';
    params.push(stockLocation);
  }

  const batchResult = await db.query(`
    SELECT id, unit_cost FROM inventory_batches
    WHERE item_id = $1 AND facility_id = $2
      AND (expiry_date IS NULL OR expiry_date >= NOW())${locCondition}
    ORDER BY created_at DESC
    LIMIT 1
  `, params);

  if (!batchResult.rows.length) {
    const err = new Error('No active batch found. Use "Receive Stock" to add a batch first.');
    err.statusCode = 400;
    err.code = 'NO_ACTIVE_BATCH';
    throw err;
  }

  const batch = batchResult.rows[0];
  await db.query(
    `UPDATE inventory_batches SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW() WHERE id = $2`,
    [quantity, batch.id]
  );
  await db.query(`
    INSERT INTO stock_movements (
      facility_id, item_type, item_id, batch_id,
      movement_type, quantity, unit_cost, reference_type,
      created_by, notes, created_at
    ) VALUES ($1, $2, $3, $4, 'Adjustment', $5, $6, $7, $8, $9, NOW())
  `, [req.user.facilityId, item_type, itemId, batch.id, quantity, batch.unit_cost, reason, req.user.userId, note]);
}