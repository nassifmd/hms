const db = require('../config/database');
const logger = require('../config/logger');

class Pharmacy {
  constructor(data = {}) {
    this.id = data.id;
    this.drug_code = data.drug_code;
    this.drug_name = data.drug_name;
    this.generic_name = data.generic_name;
    this.brand_name = data.brand_name;
    this.drug_category = data.drug_category;
    this.drug_class = data.drug_class;
    this.dosage_form = data.dosage_form;
    this.strength = data.strength;
    this.manufacturer = data.manufacturer;
    this.supplier_id = data.supplier_id;
    this.reorder_level = data.reorder_level;
    this.maximum_level = data.maximum_level;
    this.storage_conditions = data.storage_conditions;
    this.requires_prescription = data.requires_prescription || true;
    this.is_controlled_substance = data.is_controlled_substance || false;
    this.is_active = data.is_active !== false;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Drug Management
  static async createDrug(drugData) {
    const result = await db.query(`
      INSERT INTO drugs (
        drug_code, drug_name, generic_name, brand_name,
        drug_category, drug_class, dosage_form, strength,
        manufacturer, supplier_id, reorder_level, maximum_level,
        storage_conditions, requires_prescription, is_controlled_substance,
        is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING *
    `, [
      drugData.drug_code,
      drugData.drug_name,
      drugData.generic_name,
      drugData.brand_name,
      drugData.drug_category,
      drugData.drug_class,
      drugData.dosage_form,
      drugData.strength,
      drugData.manufacturer,
      drugData.supplier_id,
      drugData.reorder_level,
      drugData.maximum_level,
      drugData.storage_conditions,
      drugData.requires_prescription,
      drugData.is_controlled_substance || false,
      drugData.is_active !== false
    ]);

    logger.audit('DRUG_CREATED', null, 'pharmacy', {
      drugId: result.rows[0].id,
      drugCode: result.rows[0].drug_code,
      drugName: result.rows[0].drug_name
    });

    return new Pharmacy(result.rows[0]);
  }

  static async findDrugById(id) {
    const result = await db.query(`
      SELECT 
        d.*,
        json_build_object(
          'id', s.id,
          'name', s.supplier_name,
          'code', s.supplier_code
        ) as supplier,
        (
          SELECT json_agg(
            json_build_object(
              'id', di.id,
              'facility_id', di.facility_id,
              'batch_number', di.batch_number,
              'expiry_date', di.expiry_date,
              'quantity_on_hand', di.quantity_on_hand,
              'unit_cost', di.unit_cost,
              'selling_price', di.selling_price,
              'location', di.location_in_pharmacy
            )
          )
          FROM drug_inventory di
          WHERE di.drug_id = d.id
        ) as inventory
      FROM drugs d
      LEFT JOIN suppliers s ON d.supplier_id = s.id
      WHERE d.id = $1
    `, [id]);

    return result.rows[0] ? new Pharmacy(result.rows[0]) : null;
  }

  static async searchDrugs(query, facilityId = null) {
    const pattern = `%${query}%`;
    const fid = facilityId || null;

    const sql = `
      SELECT
        d.id,
        d.drug_code,
        d.drug_name,
        d.generic_name,
        d.brand_name,
        d.drug_category,
        d.dosage_form,
        d.strength,
        COALESCE((
          SELECT SUM(quantity_on_hand)
          FROM drug_inventory
          WHERE drug_id = d.id AND facility_id = $2
        ), 0) AS current_stock
      FROM drugs d
      WHERE d.is_active = true
        AND (d.drug_name ILIKE $1 OR d.generic_name ILIKE $1 OR d.drug_code ILIKE $1)

      UNION ALL

      SELECT
        i.id,
        i.item_code        AS drug_code,
        i.item_name        AS drug_name,
        NULL::text         AS generic_name,
        i.manufacturer     AS brand_name,
        i.category         AS drug_category,
        i.unit_of_measure  AS dosage_form,
        NULL::text         AS strength,
        COALESCE((
          SELECT SUM(quantity_on_hand)
          FROM inventory_batches
          WHERE item_id = i.id AND facility_id = $2
        ), 0) AS current_stock
      FROM inventory_items i
      WHERE i.is_active = true
        AND i.item_type = 'Medicine'
        AND (i.item_name ILIKE $1 OR i.item_code ILIKE $1 OR i.description ILIKE $1)

      ORDER BY drug_name
      LIMIT 50
    `;

    const result = await db.query(sql, [pattern, fid]);
    return result.rows;
  }

  // Inventory Management
  static async addInventory(inventoryData) {
    const result = await db.query(`
      INSERT INTO drug_inventory (
        facility_id, drug_id, batch_number, expiry_date,
        quantity_on_hand, unit_cost, selling_price,
        location_in_pharmacy, received_date, received_by,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [
      inventoryData.facility_id,
      inventoryData.drug_id,
      inventoryData.batch_number,
      inventoryData.expiry_date,
      inventoryData.quantity_on_hand,
      inventoryData.unit_cost,
      inventoryData.selling_price,
      inventoryData.location_in_pharmacy,
      inventoryData.received_date || new Date(),
      inventoryData.received_by
    ]);

    // Log stock movement
    await db.query(`
      INSERT INTO stock_movements (
        facility_id, item_type, item_id, batch_number,
        movement_type, quantity, unit_cost, reference_type,
        reference_id, created_by, created_at
      ) VALUES ($1, 'Drug', $2, $3, 'Receipt', $4, $5, 'PO', $6, $7, NOW())
    `, [
      inventoryData.facility_id,
      inventoryData.drug_id,
      inventoryData.batch_number,
      inventoryData.quantity_on_hand,
      inventoryData.unit_cost,
      inventoryData.po_id,
      inventoryData.received_by
    ]);

    return result.rows[0];
  }

  static async updateInventory(inventoryId, updateData) {
    const result = await db.query(`
      UPDATE drug_inventory 
      SET 
        quantity_on_hand = COALESCE($1, quantity_on_hand),
        unit_cost = COALESCE($2, unit_cost),
        selling_price = COALESCE($3, selling_price),
        location_in_pharmacy = COALESCE($4, location_in_pharmacy),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      updateData.quantity_on_hand,
      updateData.unit_cost,
      updateData.selling_price,
      updateData.location_in_pharmacy,
      inventoryId
    ]);

    return result.rows[0];
  }

  static async getInventory(facilityId, filters = {}) {
    const {
      drug_id,
      low_stock_only,
      expiring_soon,
      expired_only,
      category
    } = filters;

    let conditions = ['di.facility_id = $1'];
    let params = [facilityId];
    let paramIndex = 2;

    if (drug_id) {
      conditions.push(`di.drug_id = $${paramIndex}`);
      params.push(drug_id);
      paramIndex++;
    }

    if (low_stock_only) {
      conditions.push(`di.quantity_on_hand <= d.reorder_level`);
    }

    if (expiring_soon) {
      conditions.push(`di.expiry_date <= NOW() + INTERVAL '30 days'`);
    }

    if (expired_only) {
      conditions.push(`di.expiry_date < NOW()`);
    }

    if (category) {
      conditions.push(`d.drug_category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.generic_name,
        d.drug_code,
        d.drug_category,
        d.dosage_form,
        d.strength,
        d.reorder_level,
        d.maximum_level,
        CASE 
          WHEN di.expiry_date < NOW() THEN 'Expired'
          WHEN di.expiry_date <= NOW() + INTERVAL '30 days' THEN 'Expiring Soon'
          WHEN di.quantity_on_hand <= d.reorder_level THEN 'Low Stock'
          ELSE 'In Stock'
        END as stock_status,
        (di.quantity_on_hand * di.unit_cost) as inventory_value
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN di.expiry_date < NOW() THEN 1
          WHEN di.expiry_date <= NOW() + INTERVAL '30 days' THEN 2
          WHEN di.quantity_on_hand <= d.reorder_level THEN 3
          ELSE 4
        END,
        di.expiry_date
    `, params);

    return result.rows;
  }

  static async getLowStockAlert(facilityId) {
    const result = await db.query(`
      SELECT 
        d.drug_name,
        d.drug_code,
        d.strength,
        d.dosage_form,
        d.reorder_level,
        SUM(di.quantity_on_hand) as total_stock,
        MIN(di.expiry_date) as earliest_expiry,
        COUNT(di.id) as batch_count
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE di.facility_id = $1
      GROUP BY d.id, d.drug_name, d.drug_code, d.strength, 
               d.dosage_form, d.reorder_level
      HAVING SUM(di.quantity_on_hand) <= d.reorder_level
      ORDER BY total_stock
    `, [facilityId]);

    return result.rows;
  }

  static async getExpiryAlert(facilityId, days = 30) {
    const result = await db.query(`
      SELECT 
        di.*,
        d.drug_name,
        d.drug_code,
        d.strength,
        d.dosage_form,
        EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE di.facility_id = $1
        AND di.expiry_date BETWEEN NOW() AND NOW() + $2::interval
        AND di.quantity_on_hand > 0
      ORDER BY di.expiry_date
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  // Dispensing
  static async dispense(dispensingData, userId) {
    const { AppError } = require('../utils/errors');
    return db.transaction(async (client) => {
      // basic referential integrity checks to produce readable errors
      const patientCheck = await client.query(
        'SELECT id FROM patients WHERE id = $1',
        [dispensingData.patient_id]
      );
      if (patientCheck.rowCount === 0) {
        throw new AppError('Patient not found', 404, 'REFERENCE_NOT_FOUND');
      }

      const presCheck = await client.query(
        'SELECT patient_id FROM prescriptions WHERE id = $1',
        [dispensingData.prescription_id]
      );
      if (presCheck.rowCount === 0) {
        throw new AppError('Prescription not found', 404, 'REFERENCE_NOT_FOUND');
      }
      if (presCheck.rows[0].patient_id !== dispensingData.patient_id) {
        throw new AppError('Prescription does not belong to patient', 400, 'REFERENCE_MISMATCH');
      }

      // Serialize dispensing number generation to prevent duplicate key errors
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('dispensing_number_seq'))`);

      // Generate dispensing number
      const year = new Date().getFullYear();
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(dispensing_number FROM '(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
        FROM drug_dispensing
        WHERE dispensing_number LIKE $1
      `, [`DISP${year}%`]);
      
      const dispensingNumber = `DISP${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Create dispensing record
      let dispensingResult;
      try {
        dispensingResult = await client.query(`
          INSERT INTO drug_dispensing (
            dispensing_number, prescription_id, patient_id,
            dispensed_by, notes, dispensed_date
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING id
        `, [
          dispensingNumber,
          dispensingData.prescription_id,
          dispensingData.patient_id,
          userId,
          dispensingData.notes
        ]);
      } catch (err) {
        // convert postgres foreign-key errors into application errors
        if (err.code === '23503') {
          throw new AppError('Referenced record not found', 404, 'REFERENCE_NOT_FOUND');
        }
        throw err;
      }

      const dispensingId = dispensingResult.rows[0].id;

      // Resolve items: if the caller didn't provide inventory_id for each item,
      // auto-resolve from the prescription using FEFO (First Expired, First Out).
      // Stock may live in either drug_inventory (pharmacy module) or
      // inventory_batches (general inventory module).  We check drug_inventory
      // first, then fall back to inventory_batches.
      // Each resolved item carries { inventory_id, quantity, source } where
      // source is 'drug_inventory' | 'inventory_batch'.
      let resolvedItems = dispensingData.items;
      if (!resolvedItems || resolvedItems.length === 0 || !resolvedItems[0].inventory_id) {
        const rxItems = await client.query(
          `SELECT id, medication_name, quantity FROM prescription_items WHERE prescription_id = $1`,
          [dispensingData.prescription_id]
        );
        resolvedItems = [];
        for (const rxItem of rxItems.rows) {
          const medName = rxItem.medication_name;
          const qty = rxItem.quantity ?? 1;  // default to 1 if quantity not specified

          // ── 1. Try drug_inventory (pharmacy catalogue) ──────────────────────
          const drugInv = await client.query(`
            SELECT di.id
            FROM drug_inventory di
            JOIN drugs d ON di.drug_id = d.id
            WHERE di.facility_id = $1
              AND (
                d.drug_name    ILIKE '%' || $2 || '%'
                OR d.generic_name ILIKE '%' || $2 || '%'
                OR $2::text ILIKE '%' || d.drug_name    || '%'
                OR $2::text ILIKE '%' || COALESCE(d.generic_name,'') || '%'
              )
              AND (di.expiry_date IS NULL OR di.expiry_date > CURRENT_DATE)
              AND di.quantity_on_hand >= $3
            ORDER BY di.expiry_date ASC
            LIMIT 1
          `, [dispensingData.facility_id, medName, qty]);

          if (drugInv.rows.length > 0) {
            resolvedItems.push({ inventory_id: drugInv.rows[0].id, quantity: qty, source: 'drug_inventory' });
            continue;
          }

          // ── 2. Fall back to inventory_batches (general inventory — Pharmacy location only) ───────────
          const batchInv = await client.query(`
            SELECT b.id
            FROM inventory_batches b
            JOIN inventory_items i ON b.item_id = i.id
            WHERE b.facility_id = $1
              AND b.stock_location = 'Pharmacy'
              AND (
                i.item_name ILIKE '%' || $2 || '%'
                OR $2::text ILIKE '%' || i.item_name || '%'
              )
              AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
              AND b.quantity_on_hand >= $3
            ORDER BY b.expiry_date ASC NULLS LAST
            LIMIT 1
          `, [dispensingData.facility_id, medName, qty]);

          if (batchInv.rows.length > 0) {
            resolvedItems.push({ inventory_id: batchInv.rows[0].id, quantity: qty, source: 'inventory_batch' });
            continue;
          }

          throw new AppError(`Insufficient stock for ${medName}`, 400, 'INSUFFICIENT_STOCK');
        }
      }

      // Process each item — deduct from the correct stock table
      for (const item of resolvedItems) {
        const source = item.source ?? 'drug_inventory';

        if (source === 'inventory_batch') {
          // ── inventory_batches path ─────────────────────────────────────────
          const batch = await client.query(`
            SELECT b.id, b.quantity_on_hand, i.item_name
            FROM inventory_batches b
            JOIN inventory_items i ON b.item_id = i.id
            WHERE b.id = $1 AND b.quantity_on_hand >= $2
          `, [item.inventory_id, item.quantity]);

          if (batch.rows.length === 0) {
            const nameRow = await client.query(
              `SELECT i.item_name FROM inventory_batches b JOIN inventory_items i ON b.item_id = i.id WHERE b.id = $1`,
              [item.inventory_id]
            );
            throw new AppError(
              `Insufficient stock for ${nameRow.rows[0]?.item_name ?? item.inventory_id}`,
              400, 'INSUFFICIENT_STOCK'
            );
          }

          await client.query(`
            UPDATE inventory_batches SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
            WHERE id = $2
          `, [item.quantity, item.inventory_id]);

          await client.query(`
            INSERT INTO dispensing_items (dispensing_id, inventory_batch_id, quantity_dispensed)
            VALUES ($1, $2, $3)
          `, [dispensingId, item.inventory_id, item.quantity]);

          await client.query(`
            INSERT INTO stock_movements (
              facility_id, item_type, item_id, batch_number,
              movement_type, quantity, reference_type, reference_id,
              batch_id, created_by, created_at
            )
            SELECT b.facility_id, 'Medicine', b.item_id, b.batch_number,
                   'Dispense', $1, 'Dispensing', $2, b.id, $3, NOW()
            FROM inventory_batches b WHERE b.id = $4
          `, [item.quantity, dispensingId, userId, item.inventory_id]);

        } else {
          // ── drug_inventory path ────────────────────────────────────────────
          const inventory = await client.query(`
            SELECT di.id, di.quantity_on_hand, d.drug_name
            FROM drug_inventory di
            JOIN drugs d ON di.drug_id = d.id
            WHERE di.id = $1 AND di.quantity_on_hand >= $2
          `, [item.inventory_id, item.quantity]);

          if (inventory.rows.length === 0) {
            const nameRow = await client.query(
              `SELECT d.drug_name FROM drug_inventory di JOIN drugs d ON di.drug_id = d.id WHERE di.id = $1`,
              [item.inventory_id]
            );
            throw new AppError(
              `Insufficient stock for ${nameRow.rows[0]?.drug_name ?? item.inventory_id}`,
              400, 'INSUFFICIENT_STOCK'
            );
          }

          await client.query(`
            UPDATE drug_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
            WHERE id = $2
          `, [item.quantity, item.inventory_id]);

          await client.query(`
            INSERT INTO dispensing_items (dispensing_id, drug_inventory_id, quantity_dispensed)
            VALUES ($1, $2, $3)
          `, [dispensingId, item.inventory_id, item.quantity]);

          await client.query(`
            INSERT INTO stock_movements (
              facility_id, item_type, item_id, batch_number,
              movement_type, quantity, reference_type, reference_id,
              created_by, created_at
            )
            SELECT $1, 'Drug', di.drug_id, di.batch_number,
                   'Dispense', $2, 'Dispensing', $3, $4, NOW()
            FROM drug_inventory di WHERE di.id = $5
          `, [dispensingData.facility_id, item.quantity, dispensingId, userId, item.inventory_id]);
        }
      }

      // Update prescription if linked
      if (dispensingData.prescription_id) {
        // mark prescription as dispensed; table does not have updated_at column
        await client.query(`
          UPDATE prescriptions 
          SET 
            is_dispensed = true,
            dispensed_by = $1,
            dispensed_date = NOW()
          WHERE id = $2
        `, [userId, dispensingData.prescription_id]);
      }

      logger.audit('DRUGS_DISPENSED', userId, 'pharmacy', {
        dispensingId,
        dispensingNumber,
        patientId: dispensingData.patient_id,
        items: resolvedItems.length
      });

      return {
        dispensing_number: dispensingNumber,
        dispensing_id: dispensingId
      };
    });
  }

  static async getDispensingHistory(patientId, limit = 20) {
    const result = await db.query(`
      SELECT 
        dd.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as dispensed_by_user,
        (
          SELECT json_agg(
            json_build_object(
              'drug_name', d.drug_name,
              'strength', d.strength,
              'quantity', di.quantity_dispensed,
              'batch_number', inv.batch_number
            )
          )
          FROM dispensing_items di
          JOIN drug_inventory inv ON di.drug_inventory_id = inv.id
          JOIN drugs d ON inv.drug_id = d.id
          WHERE di.dispensing_id = dd.id
        ) as items
      FROM drug_dispensing dd
      LEFT JOIN users u ON dd.dispensed_by = u.id
      WHERE dd.patient_id = $1
      ORDER BY dd.dispensed_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows;
  }

  // Stock Movement
  static async getStockMovements(facilityId, filters = {}) {
    const {
      drug_id,
      movement_type,
      from_date,
      to_date,
      limit = 50
    } = filters;

    let conditions = ['facility_id = $1'];
    let params = [facilityId];
    let paramIndex = 2;

    if (drug_id) {
      conditions.push(`item_id = $${paramIndex}`);
      params.push(drug_id);
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
        d.drug_name,
        d.drug_code
      FROM stock_movements sm
      JOIN drugs d ON sm.item_id = d.id
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
        const inventory = await client.query(`
          SELECT * FROM drug_inventory
          WHERE id = $1
        `, [item.inventory_id]);

        if (inventory.rows.length === 0) continue;

        const currentQty = inventory.rows[0].quantity_on_hand;
        const countedQty = item.counted_quantity;
        const variance = countedQty - currentQty;

        if (variance !== 0) {
          // Update inventory
          await client.query(`
            UPDATE drug_inventory 
            SET quantity_on_hand = $1
            WHERE id = $2
          `, [countedQty, item.inventory_id]);

          // Record adjustment movement
          await client.query(`
            INSERT INTO stock_movements (
              facility_id, item_type, item_id, batch_number,
              movement_type, quantity, reference_type, notes,
              created_by, created_at
            ) 
            SELECT $1, 'Drug', di.drug_id, di.batch_number,
                   'Adjustment', $2, 'StockTake', $3, $4, NOW()
            FROM drug_inventory di
            WHERE di.id = $5
          `, [
            stockTakeData.facility_id,
            variance,
            item.notes || `Stock take adjustment`,
            userId,
            item.inventory_id
          ]);

          discrepancies.push({
            inventory_id: item.inventory_id,
            drug_name: inventory.rows[0].drug_name,
            batch_number: inventory.rows[0].batch_number,
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

  // Reports
  static async getInventoryValue(facilityId) {
    const result = await db.query(`
      SELECT 
        SUM(di.quantity_on_hand * di.unit_cost) as total_cost_value,
        SUM(di.quantity_on_hand * di.selling_price) as total_selling_value,
        COUNT(DISTINCT di.drug_id) as unique_drugs,
        SUM(di.quantity_on_hand) as total_units
      FROM drug_inventory di
      WHERE di.facility_id = $1
        AND di.quantity_on_hand > 0
    `, [facilityId]);

    return result.rows[0];
  }

  static async getConsumptionReport(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        d.id,
        d.drug_name,
        d.drug_code,
        d.strength,
        d.dosage_form,
        SUM(di.quantity_dispensed) as total_dispensed,
        COUNT(DISTINCT dd.id) as dispensing_events,
        SUM(di.quantity_dispensed * inv.unit_cost) as total_cost,
        AVG(di.quantity_dispensed) as avg_per_dispense
      FROM dispensing_items di
      JOIN drug_inventory inv ON di.drug_inventory_id = inv.id
      JOIN drugs d ON inv.drug_id = d.id
      JOIN drug_dispensing dd ON di.dispensing_id = dd.id
      WHERE inv.facility_id = $1
        AND dd.dispensed_date BETWEEN $2 AND $3
      GROUP BY d.id, d.drug_name, d.drug_code, d.strength, d.dosage_form
      ORDER BY total_dispensed DESC
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }

  static async getExpiryReport(facilityId) {
    const result = await db.query(`
      SELECT 
        d.drug_name,
        d.drug_code,
        d.strength,
        di.batch_number,
        di.expiry_date,
        di.quantity_on_hand,
        di.unit_cost,
        di.quantity_on_hand * di.unit_cost as value,
        EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry,
        CASE 
          WHEN di.expiry_date < NOW() THEN 'Expired'
          WHEN di.expiry_date <= NOW() + INTERVAL '30 days' THEN 'Critical'
          WHEN di.expiry_date <= NOW() + INTERVAL '90 days' THEN 'Warning'
          ELSE 'Good'
        END as status
      FROM drug_inventory di
      JOIN drugs d ON di.drug_id = d.id
      WHERE di.facility_id = $1
        AND di.quantity_on_hand > 0
      ORDER BY di.expiry_date
    `, [facilityId]);

    return result.rows;
  }
}

module.exports = Pharmacy;