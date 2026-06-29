const db = require('../config/database');
const { generateLabOrderNumber } = require('../utils/generators');
const logger = require('../config/logger');

class LabOrder {
  constructor(data = {}) {
    this.id = data.id;
    this.order_number = data.order_number;
    this.visit_id = data.visit_id;
    this.patient_id = data.patient_id;
    this.ordered_by = data.ordered_by;
    this.order_date = data.order_date;
    this.priority = data.priority || 'Routine';
    this.facility_id = data.facility_id; // added property
    this.clinical_info = data.clinical_info;
    this.diagnosis = data.diagnosis;
    this.is_panel = data.is_panel || false;
    this.panel_id = data.panel_id;
    this.notes = data.notes;
    this.status = data.status || 'Pending';
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.items = data.items || [];
    this.results = data.results || [];
    // camelCase aliases for frontend compatibility
    this.patientId = data.patient_id;
    this.patientName = data.patient_name;
    this.requestedBy = data.requested_by;
    this.testName = data.test_names;
    this.createdAt = data.created_at;
  }

  static async create(orderData, userId) {
    return db.transaction(async (client) => {
      // Generate order number
      const orderNumber = await generateLabOrderNumber(client, orderData.facility_id);

      // Create lab order
      const result = await client.query(`
        INSERT INTO lab_orders (
          order_number, facility_id, visit_id, patient_id, ordered_by,
          priority, clinical_info, diagnosis, is_panel,
          panel_id, notes, status, order_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING *
      `, [
        orderNumber,
        orderData.facility_id,
        orderData.visit_id,
        orderData.patient_id,
        userId,
        orderData.priority || 'Routine',
        orderData.clinical_info,
        orderData.diagnosis,
        orderData.is_panel || false,
        orderData.panel_id,
        orderData.notes,
        'Pending'
      ]);

      const labOrder = result.rows[0];

      // Add tests
      if (orderData.tests && orderData.tests.length > 0) {
        for (const test of orderData.tests) {
          await client.query(`
            INSERT INTO lab_order_items (
              lab_order_id, test_id, status
            ) VALUES ($1, $2, 'Pending')
          `, [labOrder.id, test.test_id]);
        }
      }

      logger.audit('LAB_ORDER_CREATED', userId, 'lab_order', {
        orderId: labOrder.id,
        patientId: orderData.patient_id,
        orderNumber: labOrder.order_number
      });

      return new LabOrder(labOrder);
    });
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        lo.*,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'date_of_birth', p.date_of_birth,
          'gender', p.gender
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as ordered_by_user,
        (
          SELECT json_agg(
            json_build_object(
              'id', loi.id,
              'test_id', loi.test_id,
              'test_name', lt.test_name,
              'test_code', lt.test_code,
              'specimen_id', loi.specimen_id,
              'specimen_collected_at', loi.specimen_collected_at,
              'specimen_collected_by', loi.specimen_collected_by,
              'result_value', loi.result_value,
              'result_unit', loi.result_unit,
              'reference_range', lt.reference_range,
              'is_abnormal', loi.is_abnormal,
              'is_critical', loi.is_critical,
              'performed_by', loi.performed_by,
              'verified_by', loi.verified_by,
              'verified_at', loi.verified_at,
              'status', loi.status,
              'notes', loi.notes,
              'attachments', COALESCE(loi.attachments, '[]'::jsonb)
            )
          )
          FROM lab_order_items loi
          JOIN lab_tests lt ON loi.test_id = lt.id
          WHERE loi.lab_order_id = lo.id
        ) as items
      FROM lab_orders lo
      JOIN visits v ON lo.visit_id = v.id
      JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN users u ON lo.ordered_by = u.id
      WHERE lo.id = $1
    `, [id]);

    if (result.rows[0]) {
      const labOrder = new LabOrder(result.rows[0]);
      labOrder.items = result.rows[0].items || [];
      return labOrder;
    }
    return null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(`
      SELECT 
        lo.*,
        (
          SELECT json_agg(
            json_build_object(
              'test_name', lt.test_name,
              'result_value', loi.result_value,
              'status', loi.status
            )
          )
          FROM lab_order_items loi
          JOIN lab_tests lt ON loi.test_id = lt.id
          WHERE loi.lab_order_id = lo.id
        ) as items
      FROM lab_orders lo
      WHERE lo.patient_id = $1
      ORDER BY lo.order_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new LabOrder(row));
  }

  static async getOrders(facilityId, { status, search, limit = 30 } = {}) {
    const params = [facilityId];
    const conditions = ['lo.facility_id = $1'];
    let paramIdx = 2;

    if (status) {
      conditions.push(`lo.status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(
        p.first_name ILIKE $${paramIdx} OR
        p.last_name ILIKE $${paramIdx} OR
        p.patient_number ILIKE $${paramIdx} OR
        lo.order_number ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    params.push(Number(limit));

    const result = await db.query(`
      SELECT
        lo.*,
        p.first_name || ' ' || p.last_name AS patient_name,
        p.patient_number,
        u.first_name || ' ' || u.last_name AS requested_by,
        COALESCE((
          SELECT string_agg(lt.test_name, ', ' ORDER BY lt.test_name)
          FROM lab_order_items loi
          JOIN lab_tests lt ON loi.test_id = lt.id
          WHERE loi.lab_order_id = lo.id
        ), '') AS test_names
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN users u ON lo.ordered_by = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY lo.order_date DESC
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(row => new LabOrder(row));
  }

  static async getPendingOrders(facilityId) {
    const baseQuery = `
      SELECT 
        lo.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        u.first_name || ' ' || u.last_name as requested_by,
        (
          SELECT COUNT(*) 
          FROM lab_order_items 
          WHERE lab_order_id = lo.id AND status = 'Pending'
        ) as pending_items
      FROM lab_orders lo
      JOIN patients p ON lo.patient_id = p.id
      JOIN users u ON lo.ordered_by = u.id
      WHERE lo.facility_id = $1
        AND lo.status != 'Completed'
      ORDER BY 
        CASE lo.priority 
          WHEN 'STAT' THEN 1
          WHEN 'Urgent' THEN 2
          ELSE 3
        END,
        lo.order_date
    `;

    try {
      const result = await db.query(baseQuery, [facilityId]);
      return result.rows.map(row => new LabOrder(row));
    } catch (err) {
      if (err.code === '42703' && err.message.includes('facility_id')) {
        // column doesn't exist yet, fall back to visit join only
        const fallback = await db.query(`
          SELECT 
            lo.*,
            p.first_name || ' ' || p.last_name as patient_name,
            p.patient_number,
            u.first_name || ' ' || u.last_name as requested_by,
            (
              SELECT COUNT(*)
              FROM lab_order_items
              WHERE lab_order_id = lo.id AND status = 'Pending'
            ) as pending_items
          FROM lab_orders lo
          JOIN patients p ON lo.patient_id = p.id
          JOIN users u ON lo.ordered_by = u.id
          JOIN visits v ON lo.visit_id = v.id
          WHERE v.facility_id = $1
            AND lo.status != 'Completed'
          ORDER BY
            CASE lo.priority
              WHEN 'STAT' THEN 1
              WHEN 'Urgent' THEN 2
              ELSE 3
            END,
            lo.order_date
        `, [facilityId]);
        return fallback.rows.map(row => new LabOrder(row));
      }
      throw err;
    }
  }

  async collectSpecimen(itemId, specimenData, userId) {
    const result = await db.query(`
      UPDATE lab_order_items 
      SET 
        specimen_id = $1,
        specimen_collected_at = NOW(),
        specimen_collected_by = $2,
        status = 'Collected'
      WHERE id = $3 AND lab_order_id = $4
      RETURNING *
    `, [specimenData.specimen_id, userId, itemId, this.id]);

    // Update order status if all items collected
    const pendingItems = await db.query(`
      SELECT COUNT(*) as count
      FROM lab_order_items
      WHERE lab_order_id = $1 AND status = 'Pending'
    `, [this.id]);

    if (pendingItems.rows[0].count === '0') {
      await db.query(`
        UPDATE lab_orders 
        SET status = 'In Progress'
        WHERE id = $1
      `, [this.id]);
      this.status = 'In Progress';
    }

    return result.rows[0];
  }

  async enterResult(itemId, resultData, userId) {
    const result = await db.query(`
      UPDATE lab_order_items 
      SET 
        result_value = $1,
        is_abnormal = $2,
        is_critical = $3,
        performed_by = $4,
        performed_at = NOW(),
        attachments = $5,
        status = 'Completed'
      WHERE id = $6 AND lab_order_id = $7
      RETURNING *
    `, [
      resultData.result_value,
      resultData.is_abnormal || false,
      resultData.is_critical || false,
      userId,
      JSON.stringify(resultData.attachments || []),
      itemId,
      this.id
    ]);

    // Check if all items are completed
    const completedItems = await db.query(`
      SELECT COUNT(*) as count
      FROM lab_order_items
      WHERE lab_order_id = $1 AND status = 'Completed'
    `, [this.id]);

    const totalItems = await db.query(`
      SELECT COUNT(*) as count
      FROM lab_order_items
      WHERE lab_order_id = $1
    `, [this.id]);

    if (completedItems.rows[0].count === totalItems.rows[0].count) {
      await db.query(`
        UPDATE lab_orders 
        SET status = 'Completed'
        WHERE id = $1
      `, [this.id]);
      this.status = 'Completed';
    }

    // Check for critical results
    if (resultData.is_critical) {
      await this.alertCriticalResult(itemId, resultData);
    }

    return result.rows[0];
  }

  async verifyResult(itemId, userId) {
    const result = await db.query(`
      UPDATE lab_order_items 
      SET 
        verified_by = $1,
        verified_at = NOW()
      WHERE id = $2 AND lab_order_id = $3
      RETURNING *
    `, [userId, itemId, this.id]);

    return result.rows[0];
  }

  async alertCriticalResult(itemId, resultData) {
    // Get item details
    const item = await db.query(`
      SELECT 
        loi.*,
        lt.test_name,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number,
        u.first_name || ' ' || u.last_name as ordered_by_name
      FROM lab_order_items loi
      JOIN lab_tests lt ON loi.test_id = lt.id
      JOIN lab_orders lo ON loi.lab_order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN users u ON lo.ordered_by = u.id
      WHERE loi.id = $1
    `, [itemId]);

    // Log critical alert
    await db.query(`
      INSERT INTO critical_alerts (
        patient_id, lab_order_id, lab_item_id, test_name,
        result_value, alert_time, acknowledged
      ) VALUES ($1, $2, $3, $4, $5, NOW(), false)
    `, [
      this.patient_id,
      this.id,
      itemId,
      item.rows[0].test_name,
      resultData.result_value
    ]);

    // Here you would trigger notifications (SMS, email, etc.)
    logger.warn('Critical lab result detected', {
      patientId: this.patient_id,
      testName: item.rows[0].test_name,
      result: resultData.result_value
    });
  }

  async addComment(comment, userId) {
    const result = await db.query(`
      INSERT INTO lab_order_comments (
        lab_order_id, user_id, comment, created_at
      ) VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [this.id, userId, comment]);

    return result.rows[0];
  }

  async getComments() {
    const result = await db.query(`
      SELECT 
        c.*,
        u.first_name || ' ' || u.last_name as user_name
      FROM lab_order_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.lab_order_id = $1
      ORDER BY c.created_at DESC
    `, [this.id]);

    return result.rows;
  }

  async getResults() {
    const result = await db.query(`
      SELECT 
        loi.*,
        lt.test_name,
        lt.test_code,
        loi.result_unit AS unit,
        lt.reference_range,
        json_build_object(
          'id', u1.id,
          'name', u1.first_name || ' ' || u1.last_name
        ) as performed_by_user,
        json_build_object(
          'id', u2.id,
          'name', u2.first_name || ' ' || u2.last_name
        ) as verified_by_user
      FROM lab_order_items loi
      JOIN lab_tests lt ON loi.test_id = lt.id
      LEFT JOIN users u1 ON loi.performed_by = u1.id
      LEFT JOIN users u2 ON loi.verified_by = u2.id
      WHERE loi.lab_order_id = $1
      ORDER BY lt.test_name
    `, [this.id]);

    return result.rows;
  }

  async printReport() {
    const result = await this.getResults();
    
    // Format for printing
    return {
      order_number: this.order_number,
      order_date: this.order_date,
      patient: this.patient,
      ordered_by: this.ordered_by_user,
      clinical_info: this.clinical_info,
      diagnosis: this.diagnosis,
      results: result.map(r => {
        let flag = '';
        if (r.is_abnormal === true) flag = 'H';
        else if (r.is_abnormal === false) flag = 'L';

        return {
          test: r.test_name,
          result: r.result_value,
          unit: r.unit,
          reference: r.reference_range,
          flag,
          status: r.status
        };
      })
    };
  }

  static async getLabStats(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
        AVG(EXTRACT(EPOCH FROM (loi.verified_at - lo.order_date))/3600) as avg_turnaround_hours,
        COUNT(CASE WHEN loi.is_critical THEN 1 END) as critical_results
      FROM lab_orders lo
      JOIN visits v ON lo.visit_id = v.id
      LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      WHERE v.facility_id = $1
        AND lo.order_date BETWEEN $2 AND $3
    `, [facilityId, startDate, endDate]);

    return result.rows[0];
  }

  static async getTestFrequency(facilityId, days = 30) {
    const result = await db.query(`
      SELECT 
        lt.test_name,
        lt.test_code,
        COUNT(*) as order_count,
        COUNT(DISTINCT lo.patient_id) as unique_patients
      FROM lab_orders lo
      JOIN visits v ON lo.visit_id = v.id
      JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      JOIN lab_tests lt ON loi.test_id = lt.id
      WHERE v.facility_id = $1
        AND lo.order_date >= NOW() - $2::interval
      GROUP BY lt.test_name, lt.test_code
      ORDER BY order_count DESC
      LIMIT 20
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  toJSON() {
    return {
      id: this.id,
      order_number: this.order_number,
      order_date: this.order_date,
      facility_id: this.facility_id,
      priority: this.priority,
      status: this.status,
      clinical_info: this.clinical_info,
      diagnosis: this.diagnosis,
      items: this.items,
      results: this.results,
      // camelCase fields for frontend
      patientId: this.patientId,
      patientName: this.patientName,
      requestedBy: this.requestedBy,
      testName: this.testName,
      createdAt: this.createdAt,
    };
  }
}

// Lab Test Catalog Model
LabOrder.Test = class LabTest {
  static async findAll(active = true) {
    const result = await db.query(`
      SELECT * FROM lab_tests
      WHERE is_active = $1 OR $1 IS NULL
      ORDER BY test_category, test_name
    `, [active]);
    return result.rows;
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT * FROM lab_tests WHERE id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(testData) {
    const result = await db.query(`
      INSERT INTO lab_tests (
        test_code, test_name, test_category, specimen_type,
        collection_method, container_type, volume_required,
        turnaround_time_hours, reference_range, critical_ranges,
        instructions, interpretation_guidance, price, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      testData.test_code,
      testData.test_name,
      testData.test_category,
      testData.specimen_type,
      testData.collection_method,
      testData.container_type,
      testData.volume_required,
      testData.turnaround_time_hours,
      testData.reference_range,
      testData.critical_ranges,
      testData.instructions,
      testData.interpretation_guidance,
      testData.price,
      testData.is_active !== false
    ]);
    return result.rows[0];
  }

  static async search(query) {
    const result = await db.query(`
      SELECT * FROM lab_tests
      WHERE test_name ILIKE $1 OR test_code ILIKE $1
      ORDER BY test_name
      LIMIT 50
    `, [`%${query}%`]);
    return result.rows;
  }
};

// Lab Panels Model
LabOrder.Panel = class LabPanel {
  static async findAll(active = true) {
    const result = await db.query(`
      SELECT 
        lp.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', lt.id,
              'test_code', lt.test_code,
              'test_name', lt.test_name
            )
          )
          FROM panel_tests pt
          JOIN lab_tests lt ON pt.test_id = lt.id
          WHERE pt.panel_id = lp.id
        ) as tests
      FROM lab_panels lp
      WHERE lp.is_active = $1 OR $1 IS NULL
      ORDER BY lp.panel_name
    `, [active]);
    return result.rows;
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        lp.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', lt.id,
              'test_code', lt.test_code,
              'test_name', lt.test_name,
              'price', lt.price
            )
          )
          FROM panel_tests pt
          JOIN lab_tests lt ON pt.test_id = lt.id
          WHERE pt.panel_id = lp.id
        ) as tests
      FROM lab_panels lp
      WHERE lp.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(panelData) {
    return db.transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO lab_panels (
          panel_code, panel_name, description, price, is_active
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        panelData.panel_code,
        panelData.panel_name,
        panelData.description,
        panelData.price,
        panelData.is_active !== false
      ]);

      const panel = result.rows[0];

      // Add tests to panel
      if (panelData.tests && panelData.tests.length > 0) {
        for (const testId of panelData.tests) {
          await client.query(`
            INSERT INTO panel_tests (panel_id, test_id)
            VALUES ($1, $2)
          `, [panel.id, testId]);
        }
      }

      return panel;
    });
  }
};

module.exports = LabOrder;