const db = require('../config/database');
const logger = require('../config/logger');

class Inventory {
  constructor(data = {}) {
    this.id = data.id;
    this.item_code = data.item_code;
    this.item_name = data.item_name;
    this.item_type = data.item_type;
    this.category = data.category;
    this.description = data.description;
    this.manufacturer = data.manufacturer;
    this.supplier_id = data.supplier_id;
    this.unit_of_measure = data.unit_of_measure;
    this.reorder_level = data.reorder_level;
    this.maximum_level = data.maximum_level;
    this.storage_location = data.storage_location;
    this.storage_conditions = data.storage_conditions;
    this.is_active = data.is_active !== false;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Item Management
  static async createItem(itemData) {
    const result = await db.query(`
      INSERT INTO inventory_items (
        item_code, item_name, item_type, category,
        description, manufacturer, supplier_id,
        unit_of_measure, reorder_level, maximum_level,
        storage_location, storage_conditions, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `, [
      itemData.item_code,
      itemData.item_name,
      itemData.item_type,
      itemData.category,
      itemData.description,
      itemData.manufacturer,
      itemData.supplier_id,
      itemData.unit_of_measure,
      itemData.reorder_level,
      itemData.maximum_level,
      itemData.storage_location,
      itemData.storage_conditions,
      itemData.is_active !== false
    ]);

    logger.audit('INVENTORY_ITEM_CREATED', null, 'inventory', {
      itemId: result.rows[0].id,
      itemCode: result.rows[0].item_code,
      itemName: result.rows[0].item_name
    });

    return result.rows[0];
  }

  static async findItemById(id) {
    const result = await db.query(`
      SELECT 
        i.*,
        json_build_object(
          'id', s.id,
          'name', s.supplier_name,
          'code', s.supplier_code,
          'contact', s.contact_person,
          'phone', s.phone_number
        ) as supplier,
        (
          SELECT json_agg(
            json_build_object(
              'id', b.id,
              'facility_id', b.facility_id,
              'batch_number', b.batch_number,
              'expiry_date', b.expiry_date,
              'quantity_on_hand', b.quantity_on_hand,
              'unit_cost', b.unit_cost,
              'manufacturing_date', b.manufacturing_date,
              'received_date', b.received_date,
              'location', b.location
            )
          )
          FROM inventory_batches b
          WHERE b.item_id = i.id AND b.quantity_on_hand > 0
        ) as batches
      FROM inventory_items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [id]);

    return result.rows[0];
  }

  static async searchItems(query, itemType = null) {
    let sql = `
      SELECT *
      FROM inventory_items
      WHERE 
        (item_name ILIKE $1 OR item_code ILIKE $1 OR description ILIKE $1)
    `;
    
    const params = [`%${query}%`];
    
    if (itemType) {
      sql += ` AND item_type = $2`;
      params.push(itemType);
    }
    
    sql += ` ORDER BY item_name LIMIT 50`;

    const result = await db.query(sql, params);
    return result.rows;
  }

  // Batch Management
  static async addBatch(batchData, userId) {
    return db.transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO inventory_batches (
          facility_id, item_id, batch_number, expiry_date,
          manufacturing_date, quantity_on_hand, unit_cost,
          received_date, received_by, location, stock_location, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING *
      `, [
        batchData.facility_id,
        batchData.item_id,
        batchData.batch_number,
        batchData.expiry_date,
        batchData.manufacturing_date,
        batchData.quantity_on_hand,
        batchData.unit_cost,
        batchData.received_date || new Date(),
        userId,
        batchData.location,
        batchData.stock_location || 'Store',
        batchData.notes
      ]);

      // Log stock movement
      await client.query(`
        INSERT INTO stock_movements (
          facility_id, item_type, item_id, batch_id,
          movement_type, quantity, unit_cost, reference_type,
          reference_id, created_by, notes, created_at
        ) VALUES ($1, $2, $3, $4, 'Receipt', $5, $6, 'Purchase Order', $7, $8, $9, NOW())
      `, [
        batchData.facility_id,
        batchData.item_type || 'General',
        batchData.item_id,
        result.rows[0].id,
        batchData.quantity_on_hand,
        batchData.unit_cost,
        batchData.po_id,
        userId,
        `Initial stock receipt - Batch: ${batchData.batch_number}`
      ]);

      logger.audit('INVENTORY_BATCH_ADDED', userId, 'inventory', {
        batchId: result.rows[0].id,
        itemId: batchData.item_id,
        batchNumber: batchData.batch_number,
        quantity: batchData.quantity_on_hand
      });

      return result.rows[0];
    });
  }

  static async getBatches(facilityId, filters = {}) {
    const {
      item_id,
      expiring_soon,
      low_stock,
      expired_only,
      stock_location
    } = filters;

    let conditions = ['b.facility_id = $1'];
    let params = [facilityId];
    let paramIndex = 2;

    if (item_id) {
      conditions.push(`b.item_id = $${paramIndex}`);
      params.push(item_id);
      paramIndex++;
    }

    if (stock_location && ['Store', 'Pharmacy'].includes(stock_location)) {
      conditions.push(`b.stock_location = $${paramIndex}`);
      params.push(stock_location);
      paramIndex++;
    }

    if (expiring_soon) {
      conditions.push(`b.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`);
    }

    if (expired_only) {
      conditions.push(`b.expiry_date < NOW()`);
    }

    if (low_stock) {
      conditions.push(`b.quantity_on_hand <= i.reorder_level`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(`
      SELECT 
        b.*,
        i.item_name,
        i.item_code,
        i.item_type,
        i.reorder_level,
        i.maximum_level,
        i.unit_of_measure,
        CASE 
          WHEN b.expiry_date < NOW() THEN 'Expired'
          WHEN b.expiry_date <= NOW() + INTERVAL '30 days' THEN 'Expiring Soon'
          WHEN b.quantity_on_hand <= i.reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as status,
        (b.quantity_on_hand * b.unit_cost) as batch_value
      FROM inventory_batches b
      JOIN inventory_items i ON b.item_id = i.id
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN b.expiry_date < NOW() THEN 1
          WHEN b.expiry_date <= NOW() + INTERVAL '30 days' THEN 2
          WHEN b.quantity_on_hand <= i.reorder_level THEN 3
          ELSE 4
        END,
        b.expiry_date
    `, params);

    return result.rows;
  }

  // Stock Movement
  static async recordMovement(movementData, userId) {
    return db.transaction(async (client) => {
      // Update batch quantity
      if (movementData.movement_type === 'Issue' || movementData.movement_type === 'Transfer') {
        await client.query(`
          UPDATE inventory_batches 
          SET 
            quantity_on_hand = quantity_on_hand - $1,
            updated_at = NOW()
          WHERE id = $2 AND quantity_on_hand >= $1
        `, [movementData.quantity, movementData.batch_id]);
      } else if (movementData.movement_type === 'Receipt') {
        await client.query(`
          UPDATE inventory_batches 
          SET 
            quantity_on_hand = quantity_on_hand + $1,
            updated_at = NOW()
          WHERE id = $2
        `, [movementData.quantity, movementData.batch_id]);
      }

      // Record movement
      const result = await client.query(`
        INSERT INTO stock_movements (
          facility_id, item_type, item_id, batch_id,
          movement_type, quantity, unit_cost, reference_type,
          reference_id, created_by, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING *
      `, [
        movementData.facility_id,
        movementData.item_type,
        movementData.item_id,
        movementData.batch_id,
        movementData.movement_type,
        movementData.quantity,
        movementData.unit_cost,
        movementData.reference_type,
        movementData.reference_id,
        userId,
        movementData.notes
      ]);

      return result.rows[0];
    });
  }

  static async getMovements(facilityId, filters = {}) {
    const {
      item_id,
      batch_id,
      movement_type,
      from_date,
      to_date,
      limit = 100
    } = filters;

    let conditions = ['facility_id = $1'];
    let params = [facilityId];
    let paramIndex = 2;

    if (item_id) {
      conditions.push(`item_id = $${paramIndex}`);
      params.push(item_id);
      paramIndex++;
    }

    if (batch_id) {
      conditions.push(`batch_id = $${paramIndex}`);
      params.push(batch_id);
      paramIndex++;
    }

    if (movement_type) {
      conditions.push(`movement_type = $${paramIndex}`);
      params.push(movement_type);
      paramIndex++;
    }

    if (from_date) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(to_date);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(`
      SELECT 
        sm.*,
        i.item_name,
        i.item_code,
        b.batch_number,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM stock_movements sm
      JOIN inventory_items i ON sm.item_id = i.id
      LEFT JOIN inventory_batches b ON sm.batch_id = b.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows;
  }

  // Stock Take
  static async performStockTake(stockTakeData, userId) {
    return db.transaction(async (client) => {
      const discrepancies = [];

      for (const item of stockTakeData.items) {
        const batch = await client.query(`
          SELECT * FROM inventory_batches
          WHERE id = $1
        `, [item.batch_id]);

        if (batch.rows.length === 0) continue;

        const currentQty = batch.rows[0].quantity_on_hand;
        const countedQty = item.counted_quantity;
        const variance = countedQty - currentQty;

        if (variance !== 0) {
          // Update batch
          await client.query(`
            UPDATE inventory_batches 
            SET quantity_on_hand = $1
            WHERE id = $2
          `, [countedQty, item.batch_id]);

          // Record adjustment movement
          await client.query(`
            INSERT INTO stock_movements (
              facility_id, item_type, item_id, batch_id,
              movement_type, quantity, reference_type, notes,
              created_by, created_at
            ) VALUES ($1, $2, $3, $4, 'Adjustment', $5, 'StockTake', $6, $7, NOW())
          `, [
            stockTakeData.facility_id,
            batch.rows[0].item_type,
            batch.rows[0].item_id,
            item.batch_id,
            variance,
            item.notes || `Stock take adjustment`,
            userId
          ]);

          discrepancies.push({
            batch_id: item.batch_id,
            batch_number: batch.rows[0].batch_number,
            item_name: batch.rows[0].item_name,
            expected: currentQty,
            counted: countedQty,
            variance
          });
        }
      }

      // Log stock take
      await client.query(`
        INSERT INTO stock_take_logs (
          facility_id, conducted_by, conducted_date,
          discrepancies_count, notes
        ) VALUES ($1, $2, NOW(), $3, $4)
      `, [
        stockTakeData.facility_id,
        userId,
        discrepancies.length,
        stockTakeData.notes
      ]);

      return discrepancies;
    });
  }

  // Suppliers
  static async addSupplier(supplierData) {
    const result = await db.query(`
      INSERT INTO suppliers (
        supplier_code, supplier_name, contact_person,
        phone_number, alternate_phone, email, address,
        city, region, tax_id, payment_terms, supply_categories,
        is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `, [
      supplierData.supplier_code,
      supplierData.supplier_name,
      supplierData.contact_person,
      supplierData.phone_number,
      supplierData.alternate_phone,
      supplierData.email,
      supplierData.address,
      supplierData.city,
      supplierData.region,
      supplierData.tax_id,
      supplierData.payment_terms,
      supplierData.supply_categories,
      supplierData.is_active !== false
    ]);

    return result.rows[0];
  }

  static async getSuppliers(active = true) {
    const result = await db.query(`
      SELECT *
      FROM suppliers
      WHERE is_active = $1 OR $1 IS NULL
      ORDER BY supplier_name
    `, [active]);

    return result.rows;
  }

  // Purchase Orders
  static async createPurchaseOrder(poData, userId) {
    return db.transaction(async (client) => {
      // Generate PO number
      const year = new Date().getFullYear();
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM '(\d+)$') AS INTEGER)), 0) + 1 as next_seq
        FROM purchase_orders
        WHERE po_number LIKE $1
      `, [`PO${year}%`]);
      
      const poNumber = `PO${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Calculate totals
      const subtotal = poData.items.reduce((sum, item) => 
        sum + (item.quantity_ordered * item.unit_price), 0);
      
      const total = subtotal + (poData.shipping_cost || 0) + (poData.tax_amount || 0);

      const result = await client.query(`
        INSERT INTO purchase_orders (
          po_number, supplier_id, facility_id, order_date,
          expected_delivery_date, order_status, subtotal,
          tax_amount, shipping_cost, total_amount, notes,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING *
      `, [
        poNumber,
        poData.supplier_id,
        poData.facility_id,
        poData.order_date || new Date(),
        poData.expected_delivery_date,
        'Draft',
        subtotal,
        poData.tax_amount || 0,
        poData.shipping_cost || 0,
        total,
        poData.notes,
        userId
      ]);

      const po = result.rows[0];

      // Add PO items
      for (const item of poData.items) {
        await client.query(`
          INSERT INTO purchase_order_items (
            po_id, item_type, item_id, item_code,
            item_name, quantity_ordered, unit_price,
            total_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          po.id,
          item.item_type,
          item.item_id,
          item.item_code,
          item.item_name,
          item.quantity_ordered,
          item.unit_price,
          item.quantity_ordered * item.unit_price
        ]);
      }

      logger.audit('PURCHASE_ORDER_CREATED', userId, 'inventory', {
        poId: po.id,
        poNumber: po.po_number,
        supplierId: poData.supplier_id
      });

      return po;
    });
  }

  static async receivePurchaseOrder(poId, receivingData, userId) {
    return db.transaction(async (client) => {
      // Update PO status
      await client.query(`
        UPDATE purchase_orders 
        SET 
          delivery_date = NOW(),
          order_status = 'Received',
          updated_at = NOW()
        WHERE id = $1
      `, [poId]);

      // Process each received item
      for (const item of receivingData.items) {
        // Add to inventory batches
        await client.query(`
          INSERT INTO inventory_batches (
            facility_id, item_id, batch_number, expiry_date,
            manufacturing_date, quantity_on_hand, unit_cost,
            received_date, received_by, location, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)
        `, [
          receivingData.facility_id,
          item.item_id,
          item.batch_number,
          item.expiry_date,
          item.manufacturing_date,
          item.quantity_received,
          item.unit_price,
          userId,
          item.location,
          item.notes
        ]);

        // Record movement
        await client.query(`
          INSERT INTO stock_movements (
            facility_id, item_type, item_id, movement_type,
            quantity, unit_cost, reference_type, reference_id,
            created_by, notes, created_at
          ) VALUES ($1, $2, $3, 'Receipt', $4, $5, 'Purchase Order', $6, $7, $8, NOW())
        `, [
          receivingData.facility_id,
          item.item_type,
          item.item_id,
          item.quantity_received,
          item.unit_price,
          poId,
          userId,
          `Received from PO`
        ]);
      }

      logger.audit('PURCHASE_ORDER_RECEIVED', userId, 'inventory', {
        poId,
        items: receivingData.items.length
      });

      return true;
    });
  }

  // Reports
  static async getInventoryValue(facilityId) {
    const result = await db.query(`
      SELECT 
        SUM(b.quantity_on_hand * b.unit_cost) as total_cost_value,
        COUNT(DISTINCT b.item_id) as unique_items,
        SUM(b.quantity_on_hand) as total_units,
        COUNT(b.id) as total_batches,
        SUM(CASE WHEN b.expiry_date < NOW() THEN b.quantity_on_hand * b.unit_cost ELSE 0 END) as expired_value
      FROM inventory_batches b
      WHERE b.facility_id = $1
        AND b.quantity_on_hand > 0
    `, [facilityId]);

    return result.rows[0];
  }

  static async getInventoryByCategory(facilityId) {
    const result = await db.query(`
      SELECT 
        i.item_type,
        i.category,
        COUNT(DISTINCT i.id) as item_count,
        SUM(b.quantity_on_hand) as total_quantity,
        SUM(b.quantity_on_hand * b.unit_cost) as total_value
      FROM inventory_items i
      LEFT JOIN inventory_batches b ON i.id = b.item_id AND b.facility_id = $1
      WHERE i.is_active = true
      GROUP BY i.item_type, i.category
      ORDER BY i.item_type, i.category
    `, [facilityId]);

    return result.rows;
  }

  static async getExpiryReport(facilityId, days = 90) {
    const result = await db.query(`
      SELECT 
        i.item_name,
        i.item_code,
        i.item_type,
        b.batch_number,
        b.expiry_date,
        b.quantity_on_hand,
        b.unit_cost,
        (b.quantity_on_hand * b.unit_cost) as value,
        EXTRACT(DAY FROM b.expiry_date - NOW()) as days_to_expiry,
        CASE 
          WHEN b.expiry_date < NOW() THEN 'Expired'
          WHEN b.expiry_date <= NOW() + INTERVAL '30 days' THEN 'Critical'
          WHEN b.expiry_date <= NOW() + INTERVAL '60 days' THEN 'Warning'
          ELSE 'Good'
        END as status
      FROM inventory_batches b
      JOIN inventory_items i ON b.item_id = i.id
      WHERE b.facility_id = $1
        AND b.expiry_date <= NOW() + $2::interval
        AND b.quantity_on_hand > 0
      ORDER BY b.expiry_date
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  static async getMovementSummary(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        movement_type,
        COUNT(*) as transaction_count,
        SUM(quantity) as total_quantity,
        SUM(quantity * unit_cost) as total_value,
        COUNT(DISTINCT item_id) as unique_items
      FROM stock_movements
      WHERE facility_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY movement_type
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }
}

module.exports = Inventory;