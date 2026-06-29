const db = require('../config/database');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');

class InventoryService {
  constructor() {
    this.lowStockThresholds = new Map();
    this.expiryAlerts = new Map();
    this.initialize();
  }

  /**
   * Initialize inventory service
   */
  async initialize() {
    await this.loadThresholds();
    this.startMonitoring();
    logger.info('Inventory service initialized');
  }

  /**
   * Load low stock thresholds
   */
  async loadThresholds() {
    try {
      const result = await db.query(`
        SELECT id, drug_id, reorder_level 
        FROM drug_inventory
        WHERE quantity_on_hand > 0
      `);

      for (const row of result.rows) {
        this.lowStockThresholds.set(row.id, row.reorder_level);
      }
    } catch (error) {
      logger.error('Failed to load inventory thresholds:', error);
    }
  }

  /**
   * Start monitoring inventory
   */
  startMonitoring() {
    // Check inventory every hour
    setInterval(() => {
      this.checkLowStock();
      this.checkExpiringItems();
    }, 60 * 60 * 1000);
  }

  /**
   * Check for low stock items
   */
  async checkLowStock() {
    try {
      const result = await db.query(`
        SELECT 
          di.*,
          d.drug_name,
          d.drug_code,
          f.facility_name,
          f.id as facility_id
        FROM drug_inventory di
        JOIN drugs d ON di.drug_id = d.id
        JOIN facilities f ON di.facility_id = f.id
        WHERE di.quantity_on_hand <= d.reorder_level
          AND di.quantity_on_hand > 0
      `);

      for (const item of result.rows) {
        await this.sendLowStockAlert(item);
      }
    } catch (error) {
      logger.error('Failed to check low stock:', error);
    }
  }

  /**
   * Check for expiring items
   */
  async checkExpiringItems() {
    try {
      const result = await db.query(`
        SELECT 
          di.*,
          d.drug_name,
          d.drug_code,
          f.facility_name,
          f.id as facility_id,
          EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry
        FROM drug_inventory di
        JOIN drugs d ON di.drug_id = d.id
        JOIN facilities f ON di.facility_id = f.id
        WHERE di.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
          AND di.quantity_on_hand > 0
      `);

      for (const item of result.rows) {
        await this.sendExpiryAlert(item);
      }
    } catch (error) {
      logger.error('Failed to check expiring items:', error);
    }
  }

  /**
   * Send low stock alert
   */
  async sendLowStockAlert(item) {
    const alertKey = `alert:low_stock:${item.id}`;
    const sent = await redis.get(alertKey);

    if (!sent) {
      // Get pharmacy users
      const pharmacists = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE u.facility_id = $1
          AND r.role_code = 'PHARMACIST'
          AND u.user_status = 'Active'
      `, [item.facility_id]);

      for (const pharmacist of pharmacists.rows) {
        await notificationService.send({
          userId: pharmacist.id,
          type: 'inventory_alert',
          title: 'Low Stock Alert',
          body: `${item.drug_name} (${item.drug_code}) is low on stock. Current quantity: ${item.quantity_on_hand}, Reorder level: ${item.reorder_level}`,
          channels: ['in_app', 'email'],
          data: { item }
        });
      }

      // Set alert cooldown (1 day)
      await redis.set(alertKey, 'sent', 86400);
    }
  }

  /**
   * Send expiry alert
   */
  async sendExpiryAlert(item) {
    const alertKey = `alert:expiry:${item.id}`;
    const sent = await redis.get(alertKey);

    if (!sent) {
      // Get pharmacy users
      const pharmacists = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE u.facility_id = $1
          AND r.role_code = 'PHARMACIST'
          AND u.user_status = 'Active'
      `, [item.facility_id]);

      const urgency = item.days_to_expiry <= 30 ? 'CRITICAL' : 'WARNING';

      for (const pharmacist of pharmacists.rows) {
        await notificationService.send({
          userId: pharmacist.id,
          type: 'inventory_alert',
          title: `${urgency} - Expiry Alert`,
          body: `${item.drug_name} (Batch: ${item.batch_number}) expires in ${item.days_to_expiry} days. Quantity: ${item.quantity_on_hand}`,
          channels: ['in_app', 'email'],
          data: { item, urgency }
        });
      }

      // Set alert cooldown (1 day for warning, 6 hours for critical)
      const ttl = item.days_to_expiry <= 30 ? 21600 : 86400;
      await redis.set(alertKey, 'sent', ttl);
    }
  }

  /**
   * Update inventory
   */
  async updateInventory(inventoryId, updateData, userId) {
    return db.transaction(async (client) => {
      // Get current inventory
      const current = await client.query(`
        SELECT * FROM drug_inventory WHERE id = $1
      `, [inventoryId]);

      if (current.rows.length === 0) {
        throw new AppError('Inventory record not found', 404, 'INVENTORY_NOT_FOUND');
      }

      // Update inventory
      const result = await client.query(`
        UPDATE drug_inventory 
        SET 
          quantity_on_hand = COALESCE($1, quantity_on_hand),
          unit_cost = COALESCE($2, unit_cost),
          selling_price = COALESCE($3, selling_price),
          location_in_pharmacy = COALESCE($4, location_in_pharmacy),
          updated_at = NOW(),
          updated_by = $5
        WHERE id = $6
        RETURNING *
      `, [
        updateData.quantity_on_hand,
        updateData.unit_cost,
        updateData.selling_price,
        updateData.location,
        userId,
        inventoryId
      ]);

      // Log movement if quantity changed
      if (updateData.quantity_on_hand !== undefined) {
        const quantityDiff = updateData.quantity_on_hand - current.rows[0].quantity_on_hand;
        
        if (quantityDiff !== 0) {
          await client.query(`
            INSERT INTO stock_movements (
              facility_id, item_type, item_id, batch_number,
              movement_type, quantity, unit_cost, reference_type,
              created_by, notes, created_at
            ) VALUES ($1, 'Drug', $2, $3, $4, $5, $6, 'Adjustment', $7, $8, NOW())
          `, [
            current.rows[0].facility_id,
            current.rows[0].drug_id,
            current.rows[0].batch_number,
            quantityDiff > 0 ? 'Receipt' : 'Issue',
            Math.abs(quantityDiff),
            result.rows[0].unit_cost,
            userId,
            `Manual adjustment: ${quantityDiff > 0 ? '+' : ''}${quantityDiff}`
          ]);
        }
      }

      return result.rows[0];
    });
  }

  /**
   * Receive stock
   */
  async receiveStock(receiptData, userId) {
    return db.transaction(async (client) => {
      const {
        facility_id,
        drug_id,
        batch_number,
        expiry_date,
        quantity,
        unit_cost,
        selling_price,
        location,
        po_id
      } = receiptData;

      // Check if batch already exists
      const existing = await client.query(`
        SELECT * FROM drug_inventory
        WHERE facility_id = $1 AND drug_id = $2 AND batch_number = $3
      `, [facility_id, drug_id, batch_number]);

      let inventory;

      if (existing.rows.length > 0) {
        // Update existing batch
        const result = await client.query(`
          UPDATE drug_inventory 
          SET 
            quantity_on_hand = quantity_on_hand + $1,
            unit_cost = $2,
            selling_price = COALESCE($3, selling_price),
            updated_at = NOW(),
            updated_by = $4
          WHERE id = $5
          RETURNING *
        `, [quantity, unit_cost, selling_price, userId, existing.rows[0].id]);
        
        inventory = result.rows[0];
      } else {
        // Create new batch
        const result = await client.query(`
          INSERT INTO drug_inventory (
            facility_id, drug_id, batch_number, expiry_date,
            quantity_on_hand, unit_cost, selling_price,
            location_in_pharmacy, received_date, received_by,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW(), NOW())
          RETURNING *
        `, [
          facility_id,
          drug_id,
          batch_number,
          expiry_date,
          quantity,
          unit_cost,
          selling_price,
          location,
          userId
        ]);
        
        inventory = result.rows[0];
      }

      // Log movement
      await client.query(`
        INSERT INTO stock_movements (
          facility_id, item_type, item_id, batch_number,
          movement_type, quantity, unit_cost, reference_type,
          reference_id, created_by, notes, created_at
        ) VALUES ($1, 'Drug', $2, $3, 'Receipt', $4, $5, 'Purchase Order', $6, $7, $8, NOW())
      `, [
        facility_id,
        drug_id,
        batch_number,
        quantity,
        unit_cost,
        po_id,
        userId,
        `Received from PO #${po_id}`
      ]);

      // Check if this is a reorder
      if (po_id) {
        await client.query(`
          UPDATE purchase_order_items 
          SET quantity_received = quantity_received + $1
          WHERE po_id = $2 AND item_id = $3
        `, [quantity, po_id, drug_id]);
      }

      return inventory;
    });
  }

  /**
   * Issue stock (dispense)
   */
  async issueStock(issueData, userId) {
    return db.transaction(async (client) => {
      const {
        facility_id,
        drug_id,
        batch_number,
        quantity,
        prescription_id,
        patient_id
      } = issueData;

      // Get available batches (FIFO)
      const batches = await client.query(`
        SELECT * FROM drug_inventory
        WHERE facility_id = $1
          AND drug_id = $2
          AND quantity_on_hand > 0
          AND expiry_date > NOW()
        ORDER BY expiry_date, received_date
      `, [facility_id, drug_id]);

      if (batches.rows.length === 0) {
        throw new AppError('No stock available', 400, 'NO_STOCK');
      }

      let remainingQuantity = quantity;
      const movements = [];

      for (const batch of batches.rows) {
        if (remainingQuantity <= 0) break;

        const issueQuantity = Math.min(batch.quantity_on_hand, remainingQuantity);

        // Update batch
        await client.query(`
          UPDATE drug_inventory 
          SET 
            quantity_on_hand = quantity_on_hand - $1,
            updated_at = NOW(),
            updated_by = $2
          WHERE id = $3
        `, [issueQuantity, userId, batch.id]);

        // Log movement
        const movement = await client.query(`
          INSERT INTO stock_movements (
            facility_id, item_type, item_id, batch_number,
            movement_type, quantity, unit_cost, reference_type,
            reference_id, created_by, notes, created_at
          ) VALUES ($1, 'Drug', $2, $3, 'Issue', $4, $5, 'Prescription', $6, $7, $8, NOW())
          RETURNING *
        `, [
          facility_id,
          drug_id,
          batch.batch_number,
          issueQuantity,
          batch.unit_cost,
          prescription_id,
          userId,
          `Dispensed for prescription #${prescription_id}`
        ]);

        movements.push(movement.rows[0]);
        remainingQuantity -= issueQuantity;
      }

      if (remainingQuantity > 0) {
        throw new AppError(`Insufficient stock. Short by ${remainingQuantity} units`, 400, 'INSUFFICIENT_STOCK');
      }

      return movements;
    });
  }

  /**
   * Transfer stock between facilities
   */
  async transferStock(transferData, userId) {
    return db.transaction(async (client) => {
      const {
        from_facility,
        to_facility,
        drug_id,
        batch_number,
        quantity,
        notes
      } = transferData;

      // Check source stock
      const source = await client.query(`
        SELECT * FROM drug_inventory
        WHERE facility_id = $1 AND drug_id = $2 AND batch_number = $3
      `, [from_facility, drug_id, batch_number]);

      if (source.rows.length === 0) {
        throw new AppError('Source batch not found', 404, 'SOURCE_NOT_FOUND');
      }

      if (source.rows[0].quantity_on_hand < quantity) {
        throw new AppError('Insufficient stock for transfer', 400, 'INSUFFICIENT_STOCK');
      }

      // Deduct from source
      await client.query(`
        UPDATE drug_inventory 
        SET 
          quantity_on_hand = quantity_on_hand - $1,
          updated_at = NOW(),
          updated_by = $2
        WHERE id = $3
      `, [quantity, userId, source.rows[0].id]);

      // Add to destination
      const destination = await client.query(`
        INSERT INTO drug_inventory (
          facility_id, drug_id, batch_number, expiry_date,
          quantity_on_hand, unit_cost, selling_price,
          location_in_pharmacy, received_date, received_by,
          notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, NOW(), NOW())
        RETURNING *
      `, [
        to_facility,
        drug_id,
        batch_number,
        source.rows[0].expiry_date,
        quantity,
        source.rows[0].unit_cost,
        source.rows[0].selling_price,
        'Received',
        userId,
        notes
      ]);

      // Log movements
      await client.query(`
        INSERT INTO stock_movements (
          facility_id, item_type, item_id, batch_number,
          movement_type, quantity, unit_cost, reference_type,
          created_by, notes, created_at
        ) VALUES 
          ($1, 'Drug', $2, $3, 'Transfer Out', $4, $5, 'Transfer', $6, $7, NOW()),
          ($8, 'Drug', $2, $3, 'Transfer In', $4, $5, 'Transfer', $6, $7, NOW())
      `, [
        from_facility, drug_id, batch_number, -quantity, source.rows[0].unit_cost,
        userId, `Transferred to facility ${to_facility}`,
        to_facility, drug_id, batch_number, quantity, source.rows[0].unit_cost,
        userId, `Received from facility ${from_facility}`
      ]);

      return {
        source: source.rows[0],
        destination: destination.rows[0]
      };
    });
  }

  /**
   * Get inventory value
   */
  async getInventoryValue(facilityId) {
    const result = await db.query(`
      SELECT 
        SUM(quantity_on_hand * unit_cost) as total_cost_value,
        SUM(quantity_on_hand * selling_price) as total_retail_value,
        COUNT(DISTINCT drug_id) as unique_items,
        SUM(quantity_on_hand) as total_units
      FROM drug_inventory
      WHERE facility_id = $1
        AND quantity_on_hand > 0
    `, [facilityId]);

    return result.rows[0];
  }

  /**
   * Get expiring items
   */
  async getExpiringItems(facilityId, days = 90) {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry,
        CASE 
          WHEN di.expiry_date < NOW() THEN 'Expired'
          WHEN di.expiry_date <= NOW() + INTERVAL '30 days' THEN 'Critical'
          WHEN di.expiry_date <= NOW() + INTERVAL '60 days' THEN 'Warning'
          ELSE 'Good'
        END as status
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE di.facility_id = $1
        AND di.expiry_date <= NOW() + $2::interval
        AND di.quantity_on_hand > 0
      ORDER BY di.expiry_date
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  /**
   * Get low stock items
   */
  async getLowStockItems(facilityId) {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        d.reorder_level,
        d.maximum_level,
        di.quantity_on_hand - d.reorder_level as below_reorder_by
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE di.facility_id = $1
        AND di.quantity_on_hand <= d.reorder_level
        AND di.quantity_on_hand > 0
      ORDER BY di.quantity_on_hand
    `, [facilityId]);

    return result.rows;
  }

  /**
   * Get inventory turnover rate
   */
  async getTurnoverRate(facilityId, startDate, endDate) {
    const result = await db.query(`
      WITH consumption AS (
        SELECT 
          di.drug_id,
          SUM(sm.quantity) as total_consumed
        FROM stock_movements sm
        JOIN drug_inventory di ON sm.item_id = di.drug_id
        WHERE sm.facility_id = $1
          AND sm.movement_type = 'Issue'
          AND sm.created_at BETWEEN $2 AND $3
        GROUP BY di.drug_id
      ),
      average_inventory AS (
        SELECT 
          drug_id,
          AVG(quantity_on_hand) as avg_quantity
        FROM drug_inventory
        WHERE facility_id = $1
        GROUP BY drug_id
      )
      SELECT 
        d.drug_name,
        d.drug_code,
        COALESCE(c.total_consumed, 0) as consumed,
        COALESCE(ai.avg_quantity, 0) as avg_inventory,
        CASE 
          WHEN COALESCE(ai.avg_quantity, 0) > 0 
          THEN COALESCE(c.total_consumed, 0) / ai.avg_quantity
          ELSE 0
        END as turnover_rate
      FROM drugs d
      LEFT JOIN consumption c ON d.id = c.drug_id
      LEFT JOIN average_inventory ai ON d.id = ai.drug_id
      WHERE d.is_active = true
      ORDER BY turnover_rate DESC
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }
}

module.exports = new InventoryService();