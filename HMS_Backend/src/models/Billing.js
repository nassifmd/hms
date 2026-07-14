const db = require('../config/database');
const { generateInvoiceNumber } = require('../utils/generators');
const logger = require('../config/logger');

class Billing {
  constructor(data = {}) {
    this.id = data.id;
    this.invoice_number = data.invoice_number;
    this.visit_id = data.visit_id;
    this.patient_id = data.patient_id;
    this.facility_id = data.facility_id;
    this.invoice_date = data.invoice_date;
    this.due_date = data.due_date;
    this.subtotal = parseFloat(data.subtotal) || 0;
    this.discount_amount = parseFloat(data.discount_amount) || 0;
    this.discount_percentage = parseFloat(data.discount_percentage);
    this.discount_reason = data.discount_reason;
    this.tax_amount = parseFloat(data.tax_amount) || 0;
    this.tax_percentage = parseFloat(data.tax_percentage);
    this.total_amount = parseFloat(data.total_amount) || 0;
    this.amount_paid = parseFloat(data.amount_paid) || 0;
    this.balance_due = parseFloat(data.balance_due) || 0;
    this.payment_status = data.payment_status || 'Pending';
    this.insurance_claim_id = data.insurance_claim_id;
    this.insurance_coverage = parseFloat(data.insurance_coverage) || 0;
    this.patient_responsibility = parseFloat(data.patient_responsibility) || 0;
    this.notes = data.notes;
    this.created_by = data.created_by;
    this.voided = data.voided || false;
    this.voided_by = data.voided_by;
    this.voided_reason = data.voided_reason;
    this.voided_date = data.voided_date;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.items = data.items || [];
    this.payments = data.payments || [];
  }

  // Invoice Management
  static async createInvoice(invoiceData, userId) {
    return db.transaction(async (client) => {
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(client, invoiceData.facility_id);

      // Calculate totals
      let subtotal = 0;
      if (invoiceData.items) {
        subtotal = invoiceData.items.reduce((sum, item) => 
          sum + (item.quantity * item.unit_price), 0);
      }

      const discountAmount = invoiceData.discount_percentage 
        ? subtotal * (invoiceData.discount_percentage / 100)
        : invoiceData.discount_amount || 0;

      const taxAmount = invoiceData.tax_percentage
        ? (subtotal - discountAmount) * (invoiceData.tax_percentage / 100)
        : invoiceData.tax_amount || 0;

      const totalAmount = subtotal - discountAmount + taxAmount;
      const patientResponsibility = totalAmount - (invoiceData.insurance_coverage || 0);

      // Create invoice
      const result = await client.query(`
        INSERT INTO invoices (
          invoice_number, visit_id, patient_id, facility_id,
          invoice_date, due_date, subtotal, discount_amount,
          discount_percentage, discount_reason, tax_amount,
          tax_percentage, total_amount, amount_paid, balance_due,
          payment_status, insurance_claim_id, insurance_coverage,
          patient_responsibility, notes, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
        RETURNING *
      `, [
        invoiceNumber,
        invoiceData.visit_id,
        invoiceData.patient_id,
        invoiceData.facility_id,
        invoiceData.invoice_date || new Date(),
        invoiceData.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        subtotal,
        discountAmount,
        invoiceData.discount_percentage,
        invoiceData.discount_reason,
        taxAmount,
        invoiceData.tax_percentage,
        totalAmount,
        0, // amount_paid
        totalAmount, // balance_due initially equals total
        'Pending',
        invoiceData.insurance_claim_id,
        invoiceData.insurance_coverage || 0,
        patientResponsibility,
        invoiceData.notes,
        userId
      ]);

      const invoice = result.rows[0];

      // Add invoice items
      if (invoiceData.items && invoiceData.items.length > 0) {
        for (const item of invoiceData.items) {
          const itemTotal = item.quantity * item.unit_price;
          
          await client.query(`
            INSERT INTO invoice_items (
              invoice_id, item_type, item_id, item_code,
              item_name, description, quantity, unit_price,
              discount_amount, tax_amount, total_price,
              is_insurance_covered, insurance_coverage_percentage
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            invoice.id,
            item.item_type,
            item.item_id,
            item.item_code,
            item.item_name,
            item.description,
            item.quantity,
            item.unit_price,
            item.discount_amount || 0,
            item.tax_amount || 0,
            itemTotal - (item.discount_amount || 0) + (item.tax_amount || 0),
            item.is_insurance_covered || false,
            item.insurance_coverage_percentage
          ]);
        }
      }

      logger.audit('INVOICE_CREATED', userId, 'billing', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        patientId: invoiceData.patient_id,
        amount: totalAmount
      });

      return new Billing(invoice);
    });
  }

  static async findInvoiceById(id) {
    const result = await db.query(`
      SELECT 
        i.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'phone', p.phone_number,
          'nhis_number', p.nhis_number
        ) as patient,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as created_by_user,
        json_build_object(
          'id', ic.id,
          'claim_number', ic.claim_number,
          'status', ic.status
        ) as insurance_claim,
        json_build_object(
          'id', f.id,
          'name', f.facility_name
        ) as facility,
        (
          SELECT json_agg(
            json_build_object(
              'id', ii.id,
              'item_type', ii.item_type,
              'item_name', ii.item_name,
              'description', ii.description,
              'quantity', ii.quantity,
              'unit_price', ii.unit_price,
              'discount_amount', ii.discount_amount,
              'tax_amount', ii.tax_amount,
              'total_price', ii.total_price,
              'is_insurance_covered', ii.is_insurance_covered
            )
          )
          FROM invoice_items ii
          WHERE ii.invoice_id = i.id
        ) as items,
        (
          SELECT json_agg(
            json_build_object(
              'id', py.id,
              'payment_number', py.payment_number,
              'payment_date', py.payment_date,
              'payment_method', py.payment_method,
              'amount', py.amount,
              'reference', py.payment_reference
            )
          )
          FROM payments py
          WHERE py.invoice_id = i.id AND py.voided = false
        ) as payments
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      LEFT JOIN visits v ON i.visit_id = v.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN insurance_claims ic ON i.insurance_claim_id = ic.id
      LEFT JOIN facilities f ON i.facility_id = f.id
      WHERE i.id = $1 AND i.voided = false
    `, [id]);

    if (result.rows[0]) {
      const invoice = new Billing(result.rows[0]);
      invoice.items = result.rows[0].items || [];
      invoice.payments = result.rows[0].payments || [];
      invoice.facility = result.rows[0].facility;
      invoice.patient = result.rows[0].patient;
      invoice.visit = result.rows[0].visit;
      invoice.created_by_user = result.rows[0].created_by_user;
      invoice.insurance_claim = result.rows[0].insurance_claim;
      return invoice;
    }
    return null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(`
      SELECT 
        i.*,
        (
          SELECT COALESCE(SUM(amount), 0)
          FROM payments
          WHERE invoice_id = i.id AND voided = false
        ) as paid_amount,
        i.total_amount - (
          SELECT COALESCE(SUM(amount), 0)
          FROM payments
          WHERE invoice_id = i.id AND voided = false
        ) as outstanding
      FROM invoices i
      WHERE i.patient_id = $1 AND i.voided = false
      ORDER BY i.invoice_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Billing(row));
  }

  /**
   * Ensure invoices past their due date are marked overdue in the database.
   * This is a best‑effort convenience; the field is mainly used for reporting but
   * having the value in the row makes it easier to filter from other queries.
   */
  static async refreshOverdueStatuses(facilityId) {
    try {
      await db.query(`
        UPDATE invoices
        SET payment_status = 'Overdue'
        WHERE due_date < CURRENT_DATE
          AND payment_status != 'Paid'
          AND payment_status != 'Overdue'
          AND voided = false
          AND facility_id = $1
      `, [facilityId]);
    } catch (err) {
      // enum may not yet include 'Overdue'; ignore that particular error
      if (err.code === '22P02' && err.message.includes('invalid input value for enum')) {
        logger.warn('Unable to mark invoices overdue, enum value missing');
        return;
      }
      throw err;
    }
  }

  static async getOutstandingInvoices(facilityId = null) {
    // keep stored status in sync with due dates (optionally per‑facility)
    await Billing.refreshOverdueStatuses(facilityId);

    let query = `
      SELECT 
        i.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        p.phone_number,
        i.total_amount - COALESCE((
          SELECT SUM(amount) FROM payments 
          WHERE invoice_id = i.id AND voided = false
        ), 0) as outstanding
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE i.balance_due > 0
        AND i.voided = false
    `;
    const params = [];
    if (facilityId) {
      query += ` AND i.facility_id = $1`;
      params.push(facilityId);
    }
    query += `
      ORDER BY 
        CASE 
          WHEN i.due_date < CURRENT_DATE AND i.balance_due > 0 THEN 1
          WHEN i.payment_status = 'Partially Paid' THEN 2
          ELSE 3
        END,
        i.due_date
    `;

    const result = await db.query(query, params);
    return result.rows.map(row => new Billing(row));
  }

  // Payment Processing
  static async addPayment(paymentData, userId) {
    return db.transaction(async (client) => {
      // Generate payment number — serialize with an advisory lock to prevent race conditions
      const year = new Date().getFullYear();
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('payment_number_gen'))`);
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number FROM 8) AS BIGINT)), 0) + 1 as next_seq
        FROM payments
        WHERE payment_number LIKE $1
          AND LENGTH(payment_number) = 13
      `, [`PAY${year}%`]);
      
      const paymentNumber = `PAY${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Get invoice
      const invoice = await client.query(`
        SELECT * FROM invoices 
        WHERE id = $1 AND voided = false
        FOR UPDATE
      `, [paymentData.invoice_id]);

      if (invoice.rows.length === 0) {
        throw new Error('Invoice not found');
      }

      const currentInvoice = invoice.rows[0];
      const currentPaid = parseFloat(currentInvoice.amount_paid) || 0;
      const totalAmount = parseFloat(currentInvoice.total_amount);
      const balanceDue = parseFloat(currentInvoice.balance_due) || 0;

      // Prevent overpayment
      if (paymentData.amount > balanceDue) {
        throw new Error('Payment amount exceeds the outstanding balance. Please adjust the amount.');
      }

      const newPaid = currentPaid + parseFloat(paymentData.amount);
      
      // Determine payment status
      let paymentStatus = currentInvoice.payment_status;
      if (newPaid >= totalAmount) {
        paymentStatus = 'Paid';
      } else if (newPaid > 0) {
        paymentStatus = 'Partially Paid';
      }

      // Create payment record
      const paymentResult = await client.query(`
        INSERT INTO payments (
          payment_number, invoice_id, patient_id, payment_date,
          payment_method, payment_reference, amount,
          mobile_money_provider, mobile_money_number,
          card_last_four, bank_name, cheque_number,
          receipt_number, received_by, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        RETURNING *
      `, [
        paymentNumber,
        paymentData.invoice_id,
        paymentData.patient_id,
        paymentData.payment_date || new Date(),
        paymentData.payment_method,
        paymentData.payment_reference,
        paymentData.amount,
        paymentData.mobile_money_provider,
        paymentData.mobile_money_number,
        paymentData.card_last_four,
        paymentData.bank_name,
        paymentData.cheque_number,
        paymentData.receipt_number,
        userId,
        paymentData.notes
      ]);

      // Update invoice
      await client.query(`
        UPDATE invoices 
        SET 
          amount_paid = $1,
          balance_due = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [
        newPaid,
        Math.max(0, totalAmount - newPaid),
        paymentStatus,
        paymentData.invoice_id
      ]);

      logger.audit('PAYMENT_ADDED', userId, 'billing', {
        paymentId: paymentResult.rows[0].id,
        paymentNumber,
        invoiceId: paymentData.invoice_id,
        amount: paymentData.amount
      });

      return paymentResult.rows[0];
    });
  }

  static async findPaymentById(id) {
    const result = await db.query(`
      SELECT 
        p.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as received_by_user,
        json_build_object(
          'id', i.id,
          'invoice_number', i.invoice_number,
          'total_amount', i.total_amount
        ) as invoice
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      JOIN invoices i ON p.invoice_id = i.id
      WHERE p.id = $1 AND p.voided = false
    `, [id]);

    return result.rows[0];
  }

  static async voidPayment(paymentId, reason, userId) {
    return db.transaction(async (client) => {
      // Get payment
      const payment = await client.query(`
        SELECT * FROM payments 
        WHERE id = $1 AND voided = false
        FOR UPDATE
      `, [paymentId]);

      if (payment.rows.length === 0) {
        throw new Error('Payment not found');
      }

      // Void payment
      await client.query(`
        UPDATE payments 
        SET 
          voided = true,
          voided_by = $1,
          voided_reason = $2,
          voided_date = NOW()
        WHERE id = $3
      `, [userId, reason, paymentId]);

      // Update invoice
      await client.query(`
        UPDATE invoices 
        SET 
          amount_paid = amount_paid - $1,
          balance_due = balance_due + $1,
          payment_status = CASE 
            WHEN amount_paid - $1 <= 0 THEN 'Pending'
            WHEN amount_paid - $1 < total_amount THEN 'Partially Paid'
            ELSE payment_status
          END,
          updated_at = NOW()
        WHERE id = $2
      `, [payment.rows[0].amount, payment.rows[0].invoice_id]);

      logger.audit('PAYMENT_VOIDED', userId, 'billing', {
        paymentId,
        reason,
        amount: payment.rows[0].amount
      });

      return true;
    });
  }

  // Invoice Operations
  async addItem(itemData) {
    const itemTotal = itemData.quantity * itemData.unit_price;
    
    const result = await db.query(`
      INSERT INTO invoice_items (
        invoice_id, item_type, item_id, item_code,
        item_name, description, quantity, unit_price,
        discount_amount, tax_amount, total_price,
        is_insurance_covered, insurance_coverage_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      this.id,
      itemData.item_type,
      itemData.item_id,
      itemData.item_code,
      itemData.item_name,
      itemData.description,
      itemData.quantity,
      itemData.unit_price,
      itemData.discount_amount || 0,
      itemData.tax_amount || 0,
      itemTotal - (itemData.discount_amount || 0) + (itemData.tax_amount || 0),
      itemData.is_insurance_covered || false,
      itemData.insurance_coverage_percentage
    ]);

    // Recalculate invoice totals
    await this.recalculateTotals();

    return result.rows[0];
  }

  async removeItem(itemId) {
    await db.query(`
      DELETE FROM invoice_items
      WHERE id = $1 AND invoice_id = $2
    `, [itemId, this.id]);

    // Recalculate invoice totals
    await this.recalculateTotals();
  }

  async recalculateTotals() {
    // Get all items
    const items = await db.query(`
      SELECT * FROM invoice_items WHERE invoice_id = $1
    `, [this.id]);

    // Calculate new subtotal
    const subtotal = items.rows.reduce((sum, item) => 
      sum + (item.quantity * item.unit_price), 0);

    // Apply discount
    const discountAmount = this.discount_percentage 
      ? subtotal * (this.discount_percentage / 100)
      : this.discount_amount;

    // Apply tax
    const taxAmount = this.tax_percentage
      ? (subtotal - discountAmount) * (this.tax_percentage / 100)
      : this.tax_amount;

    const totalAmount = subtotal - discountAmount + taxAmount;
    const balanceDue = totalAmount - this.amount_paid;

    // Update invoice
    const result = await db.query(`
      UPDATE invoices 
      SET 
        subtotal = $1,
        discount_amount = $2,
        tax_amount = $3,
        total_amount = $4,
        balance_due = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [subtotal, discountAmount, taxAmount, totalAmount, balanceDue, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async applyDiscount(percentage, reason, userId) {
    const result = await db.query(`
      UPDATE invoices 
      SET 
        discount_percentage = $1,
        discount_reason = $2,
        updated_at = NOW(),
        updated_by = $3
      WHERE id = $4
      RETURNING *
    `, [percentage, reason, userId, this.id]);

    Object.assign(this, result.rows[0]);
    await this.recalculateTotals();
    
    return this;
  }

  async void(reason, userId) {
    const result = await db.query(`
      UPDATE invoices 
      SET 
        voided = true,
        voided_by = $1,
        voided_reason = $2,
        voided_date = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [userId, reason, this.id]);

    Object.assign(this, result.rows[0]);

    logger.audit('INVOICE_VOIDED', userId, 'billing', {
      invoiceId: this.id,
      invoiceNumber: this.invoice_number,
      reason
    });

    return this;
  }

  // Reports
  // ─── Invoice List ────────────────────────────────────────────────────────────

  static async getInvoices({ facilityId, status, search, limit = 30, offset = 0 }) {
    const params = [facilityId];
    const conditions = ['i.facility_id = $1', 'i.voided = false'];

    if (status) {
      params.push(status);
      conditions.push(`i.payment_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(
        `(i.invoice_number ILIKE $${idx} OR p.first_name || ' ' || p.last_name ILIKE $${idx} OR p.patient_number ILIKE $${idx})`
      );
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await db.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        i.amount_paid,
        i.balance_due,
        i.payment_status,
        i.patient_id,
        i.visit_id,
        i.created_at,
        p.first_name || ' ' || p.last_name AS patient_name,
        p.patient_number,
        p.phone_number
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.invoice_date DESC, i.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params);

    return result.rows;
  }

  // ─── Service Price Management ─────────────────────────────────────────────────

  static async getPriceLists(facilityId) {
    const result = await db.query(`
      SELECT
        pl.*,
        COUNT(sp.id)::int AS price_count
      FROM price_lists pl
      LEFT JOIN service_prices sp ON sp.price_list_id = pl.id
      WHERE pl.facility_id = $1
      GROUP BY pl.id
      ORDER BY pl.is_active DESC, pl.created_at DESC
    `, [facilityId]);
    return result.rows;
  }

  static async createPriceList(data, userId) {
    const result = await db.query(`
      INSERT INTO price_lists (facility_id, price_list_code, price_list_name, price_list_type, valid_from, valid_to, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [
      data.facility_id,
      data.price_list_code,
      data.price_list_name,
      data.price_list_type || 'General',
      data.valid_from || new Date(),
      data.valid_to || null,
      data.is_active ?? true,
    ]);
    return result.rows[0];
  }

  static async getServicePrices(facilityId, { serviceType, search } = {}) {
    const params = [facilityId];
    const conditions = ['pl.facility_id = $1'];

    if (serviceType) {
      params.push(serviceType);
      conditions.push(`sp.service_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(sp.service_name ILIKE $${idx} OR sp.service_code ILIKE $${idx})`);
    }

    const result = await db.query(`
      SELECT
        sp.*,
        pl.price_list_name,
        pl.price_list_code,
        pl.is_active AS price_list_active
      FROM service_prices sp
      JOIN price_lists pl ON sp.price_list_id = pl.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sp.service_type, sp.service_name
    `, params);
    return result.rows;
  }

  static async upsertServicePrice(data) {
    if (data.id) {
      const result = await db.query(`
        UPDATE service_prices
        SET service_type = $1, service_id = $2, service_code = $3, service_name = $4,
            price = $5, nhis_tariff = $6, discount_allowed = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [
        data.service_type, data.service_id || null, data.service_code,
        data.service_name, data.price, data.nhis_tariff || 0,
        data.discount_allowed ?? true, data.id,
      ]);
      return result.rows[0];
    }

    const result = await db.query(`
      INSERT INTO service_prices (price_list_id, service_type, service_id, service_code, service_name, price, nhis_tariff, discount_allowed, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `, [
      data.price_list_id, data.service_type, data.service_id || null,
      data.service_code, data.service_name, data.price,
      data.nhis_tariff || 0, data.discount_allowed ?? true,
    ]);
    return result.rows[0];
  }

  static async deleteServicePrice(id) {
    await db.query(`DELETE FROM service_prices WHERE id = $1`, [id]);
  }

  // ─── Service Catalog (for price-entry autocomplete) ──────────────────────────

  /**
   * Returns a uniform list of { id, code, name, category } items for a given
   * service type so the billing UI can populate a searchable dropdown.
   */
  static async getServiceCatalog(serviceType, search = '', facilityId = null) {
    const pattern = search ? `%${search}%` : '%';

    switch (serviceType) {
      case 'Procedure': {
        // Union general procedures (clinical) and dental procedures so both
        // sources appear in the search dropdown.
        const result = await db.query(`
          SELECT id, procedure_code AS code, procedure_name AS name,
                 COALESCE(procedure_category, 'General') AS category,
                 'General' AS source
          FROM procedures
          WHERE is_active = true
            AND (procedure_name ILIKE $1 OR procedure_code ILIKE $1)
          UNION ALL
          SELECT id, procedure_code AS code, procedure_name AS name,
                 COALESCE(procedure_category, 'Dental') AS category,
                 'Dental' AS source
          FROM dental_procedures
          WHERE is_active = true
            AND (procedure_name ILIKE $1 OR procedure_code ILIKE $1)
          ORDER BY source, category, name
          LIMIT 100
        `, [pattern]);
        return result.rows;
      }

      case 'Lab': {
        const result = await db.query(`
          SELECT id, test_code AS code, test_name AS name, test_category AS category
          FROM lab_tests
          WHERE is_active = true
            AND (test_name ILIKE $1 OR test_code ILIKE $1)
          ORDER BY test_category, test_name
          LIMIT 50
        `, [pattern]);
        return result.rows;
      }

      case 'Drug': {
        const fid = facilityId || null;
        const result = await db.query(`
          SELECT id, drug_code AS code, drug_name AS name, drug_category AS category
          FROM drugs
          WHERE is_active = true
            AND (drug_name ILIKE $1 OR generic_name ILIKE $1 OR drug_code ILIKE $1)
          UNION ALL
          SELECT id, item_code AS code, item_name AS name, category
          FROM inventory_items
          WHERE is_active = true
            AND item_type = 'Medicine'
            AND (item_name ILIKE $1 OR item_code ILIKE $1)
          ORDER BY name
          LIMIT 50
        `, [pattern]);
        return result.rows;
      }

      case 'Radiology': {
        // Generic fallback: return names from existing service_prices of this type for reuse
        const result = await db.query(`
          SELECT DISTINCT ON (sp.service_name)
            sp.service_id AS id, sp.service_code AS code, sp.service_name AS name, NULL AS category
          FROM service_prices sp
          JOIN price_lists pl ON sp.price_list_id = pl.id
          WHERE sp.service_type = 'Radiology'
            ${facilityId ? 'AND pl.facility_id = $2' : ''}
            AND (sp.service_name ILIKE $1 OR sp.service_code ILIKE $1)
          ORDER BY sp.service_name
          LIMIT 50
        `, facilityId ? [pattern, facilityId] : [pattern]);
        return result.rows;
      }

      default:
        return [];
    }
  }

  // ─── Patient visit services (for cashier billing) ────────────────────────────

  /**
   * Return all services a patient received on a given date so a cashier can
   * select which ones to add to an invoice.  Sources: consultations (visits),
   * lab orders, dental procedures, dispensed medications.
   * Each row: { service_type, reference_id, reference_number, item_code, item_name,
   *             category, quantity, unit_price, service_date }
   */
  static async getPatientVisitServices(patientId, facilityId) {
    // Sub-query that resolves the facility's active price for a given type+code
    const priceSubQuery = `(
      SELECT sp2.price
      FROM service_prices sp2
      JOIN price_lists pl2 ON sp2.price_list_id = pl2.id
      WHERE pl2.facility_id = $2
        AND pl2.is_active = true
        AND sp2.service_type = svc_type_param
        AND sp2.service_code = svc_code_param
      ORDER BY pl2.created_at DESC
      LIMIT 1
    )`;

    const result = await db.query(`
      SELECT * FROM (

        -- ── Consultations / visits ──
        SELECT
          'Consultation'         AS service_type,
          v.id::text             AS reference_id,
          v.visit_number         AS reference_number,
          'CONS'                 AS item_code,
          CONCAT('Consultation (', COALESCE(v.visit_type::text, 'General'), ')') AS item_name,
          NULL                   AS category,
          1::numeric             AS quantity,
          COALESCE(
            (SELECT sp.price FROM service_prices sp
             JOIN price_lists pl ON sp.price_list_id = pl.id
             WHERE pl.facility_id = $2 AND pl.is_active = true
               AND sp.service_type = 'Consultation'
             ORDER BY pl.created_at DESC LIMIT 1),
            0
          )                      AS unit_price,
          v.visit_date::date     AS service_date
        FROM visits v
        WHERE v.patient_id = $1
          AND v.facility_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.patient_id = $1
              AND (inv.visit_id = v.id OR ii.item_id = v.id)
              AND ii.item_type = 'Consultation'
              AND COALESCE(inv.voided, false) = false
          )

        UNION ALL

        -- ── Lab tests ──
        SELECT
          'Lab'                  AS service_type,
          loi.id::text           AS reference_id,
          lo.order_number        AS reference_number,
          lt.test_code           AS item_code,
          lt.test_name           AS item_name,
          lt.test_category       AS category,
          1::numeric             AS quantity,
          COALESCE(
            (SELECT sp.price FROM service_prices sp
             JOIN price_lists pl ON sp.price_list_id = pl.id
             WHERE pl.facility_id = $2 AND pl.is_active = true
               AND sp.service_type = 'Lab' AND sp.service_code = lt.test_code
             ORDER BY pl.created_at DESC LIMIT 1),
            lt.price,
            0
          )                      AS unit_price,
          lo.order_date::date    AS service_date
        FROM lab_orders lo
        JOIN lab_order_items loi ON loi.lab_order_id = lo.id
        JOIN lab_tests lt ON lt.id = loi.test_id
        WHERE lo.patient_id = $1
          AND lo.facility_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.patient_id = $1
              AND ii.item_id = loi.id
              AND COALESCE(inv.voided, false) = false
          )

        UNION ALL

        -- ── Dental procedures ──
        SELECT
          'Procedure'              AS service_type,
          pdp.id::text             AS reference_id,
          NULL                     AS reference_number,
          dp.procedure_code        AS item_code,
          dp.procedure_name        AS item_name,
          dp.procedure_category    AS category,
          1::numeric               AS quantity,
          COALESCE(
            (SELECT sp.price FROM service_prices sp
             JOIN price_lists pl ON sp.price_list_id = pl.id
             WHERE pl.facility_id = $2 AND pl.is_active = true
               AND sp.service_type = 'Procedure' AND sp.service_code = dp.procedure_code
             ORDER BY pl.created_at DESC LIMIT 1),
            dp.price,
            0
          )                        AS unit_price,
          pdp.procedure_date::date AS service_date
        FROM patient_dental_procedures pdp
        JOIN dental_procedures dp ON dp.id = pdp.procedure_id
        WHERE pdp.patient_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.patient_id = $1
              AND ii.item_id = pdp.id
              AND COALESCE(inv.voided, false) = false
          )

        UNION ALL

        -- ── Dispensed medications ──
        SELECT
          'Drug'                              AS service_type,
          di.id::text                         AS reference_id,
          dd.dispensing_number                AS reference_number,
          COALESCE(dr.drug_code, ii.item_code, 'DRUG') AS item_code,
          COALESCE(dr.drug_name, ii.item_name, 'Medication') AS item_name,
          COALESCE(dr.drug_category, 'Drug') AS category,
          di.quantity_dispensed::numeric      AS quantity,
          COALESCE(
            (SELECT sp.price FROM service_prices sp
             JOIN price_lists pl ON sp.price_list_id = pl.id
             WHERE pl.facility_id = $2 AND pl.is_active = true
               AND sp.service_type = 'Drug'
               AND sp.service_code = COALESCE(dr.drug_code, ii.item_code)
             ORDER BY pl.created_at DESC LIMIT 1),
            dinv.selling_price,
            0
          )                                   AS unit_price,
          dd.dispensed_date::date             AS service_date
        FROM drug_dispensing dd
        JOIN dispensing_items di ON di.dispensing_id = dd.id
        LEFT JOIN drug_inventory dinv ON dinv.id = di.drug_inventory_id
        LEFT JOIN drugs dr ON dr.id = dinv.drug_id
        LEFT JOIN inventory_batches ib ON ib.id = di.inventory_batch_id
        LEFT JOIN inventory_items ii ON ii.id = ib.item_id
        WHERE dd.patient_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.patient_id = $1
              AND ii.item_id = di.id
              AND COALESCE(inv.voided, false) = false
          )

        UNION ALL

        -- ── Dental treatment plans ──
        SELECT
          'Procedure'                AS service_type,
          dtp.id::text               AS reference_id,
          NULL                       AS reference_number,
          'TX-PLAN'                  AS item_code,
          COALESCE(dtp.treatment_description, 'Dental Treatment Plan') AS item_name,
          'Treatment Plan'           AS category,
          1::numeric                 AS quantity,
          COALESCE(dtp.estimated_cost, 0) AS unit_price,
          dtp.plan_date::date        AS service_date
        FROM dental_treatment_plans dtp
        WHERE dtp.patient_id = $1
          AND COALESCE(dtp.estimated_cost, 0) > 0
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            WHERE inv.patient_id = $1
              AND ii.item_id = dtp.id
              AND COALESCE(inv.voided, false) = false
          )

      ) AS all_services
      ORDER BY service_date, service_type, item_name
    `, [patientId, facilityId]);

    return result.rows;
  }

  // ─── Auto-billing helper ──────────────────────────────────────────────────────

  /**
   * Look up the configured price for a service.  Returns null when no price is set.
   * When serviceId is provided, matches exactly.  When null, falls back to the
   * first active price of that service type (covers Consultation, Ward, Other).
   */
  static async lookupServicePrice(facilityId, serviceType, serviceId) {
    const base = `
      SELECT sp.price, sp.service_code, sp.service_name, sp.nhis_tariff, sp.discount_allowed
      FROM service_prices sp
      JOIN price_lists pl ON sp.price_list_id = pl.id
      WHERE pl.facility_id = $1
        AND pl.is_active = true
        AND (pl.valid_to IS NULL OR pl.valid_to >= CURRENT_DATE)
        AND sp.service_type = $2
    `;

    if (serviceId) {
      const exact = await db.query(`${base} AND sp.service_id = $3 LIMIT 1`, [facilityId, serviceType, serviceId]);
      if (exact.rows[0]) return exact.rows[0];
    }

    // Fall back to any price for this service type (free-text services like Consultation)
    const fallback = await db.query(`${base} ORDER BY sp.created_at ASC LIMIT 1`, [facilityId, serviceType]);
    return fallback.rows[0] || null;
  }

  /**
   * Auto-bill a rendered service.  Finds (or creates) an open invoice for the
   * patient/visit, then appends the line item.  Silently returns null when no
   * price is configured so as not to disrupt the calling workflow.
   */
  static async addToPatientInvoice({ facilityId, patientId, visitId, serviceType, serviceId, itemName, itemCode, quantity = 1, description, unitPrice: overridePrice }, userId) {
    // Allow callers to supply a known price (e.g. treatment plan estimated_cost);
    // otherwise look it up from the facility price list.
    let priceInfo;
    if (overridePrice != null) {
      priceInfo = { price: overridePrice, service_code: itemCode || null, service_name: itemName || serviceType };
    } else {
      priceInfo = await Billing.lookupServicePrice(facilityId, serviceType, serviceId);
      if (!priceInfo) return null;
    }

    // Find open invoice for patient+visit
    const qParams = [patientId, facilityId];
    let visitClause = '';
    if (visitId) {
      qParams.push(visitId);
      visitClause = `AND (visit_id = $${qParams.length} OR visit_id IS NULL)`;
    }

    const existingResult = await db.query(`
      SELECT id FROM invoices
      WHERE patient_id = $1
        AND facility_id = $2
        ${visitClause}
        AND payment_status IN ('Pending', 'Partially Paid')
        AND voided = false
      ORDER BY created_at DESC
      LIMIT 1
    `, qParams);

    if (existingResult.rows.length === 0) {
      // Create a new invoice with this single item
      return Billing.createInvoice({
        patient_id: patientId,
        facility_id: facilityId,
        visit_id: visitId || null,
        items: [{
          item_type: serviceType,
          item_id: serviceId || null,
          item_code: itemCode || priceInfo.service_code,
          item_name: itemName || priceInfo.service_name,
          description: description || null,
          quantity,
          unit_price: parseFloat(priceInfo.price),
        }],
      }, userId);
    }

    const invoiceId = existingResult.rows[0].id;
    const unitPrice = parseFloat(priceInfo.price);
    const itemTotal = quantity * unitPrice;

    await db.transaction(async (client) => {
      await client.query(`
        INSERT INTO invoice_items (invoice_id, item_type, item_id, item_code, item_name, description, quantity, unit_price, discount_amount, tax_amount, total_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9)
      `, [invoiceId, serviceType, serviceId || null, itemCode || priceInfo.service_code,
          itemName || priceInfo.service_name, description || null,
          quantity, unitPrice, itemTotal]);

      // Recalculate invoice totals
      const totalsResult = await client.query(`
        SELECT COALESCE(SUM(total_price), 0) AS new_subtotal
        FROM invoice_items WHERE invoice_id = $1
      `, [invoiceId]);
      const newSubtotal = parseFloat(totalsResult.rows[0].new_subtotal);

      const invResult = await client.query(
        `SELECT discount_percentage, discount_amount, tax_percentage, tax_amount, amount_paid FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      const inv = invResult.rows[0];
      const discAmt = inv.discount_percentage
        ? newSubtotal * parseFloat(inv.discount_percentage) / 100
        : parseFloat(inv.discount_amount) || 0;
      const taxAmt = inv.tax_percentage
        ? (newSubtotal - discAmt) * parseFloat(inv.tax_percentage) / 100
        : parseFloat(inv.tax_amount) || 0;
      const newTotal = newSubtotal - discAmt + taxAmt;
      const amountPaid = parseFloat(inv.amount_paid) || 0;
      const newBalance = Math.max(0, newTotal - amountPaid);

      let status = 'Pending';
      if (amountPaid >= newTotal && newTotal > 0) status = 'Paid';
      else if (amountPaid > 0) status = 'Partially Paid';

      await client.query(`
        UPDATE invoices
        SET subtotal = $1, total_amount = $2, balance_due = $3, payment_status = $4, updated_at = NOW()
        WHERE id = $5
      `, [newSubtotal, newTotal, newBalance, status, invoiceId]);
    });

    return { invoiceId, itemAdded: true };
  }

  /**
   * Batch-add multiple chargeable items to a patient's invoice in a single transaction.
   * Eliminates the N+1 query pattern caused by calling addToPatientInvoice() per item.
   */
  static async batchAddToPatientInvoice(items, userId) {
    if (!items || items.length === 0) return [];

    const { facilityId, patientId, visitId } = items[0];

    // Resolve prices for all items (parallelised)
    const priceResults = await Promise.all(
      items.map((item) =>
        item.unitPrice != null
          ? Promise.resolve({ price: item.unitPrice, service_code: item.itemCode || null, service_name: item.itemName || item.serviceType })
          : Billing.lookupServicePrice(facilityId, item.serviceType, item.serviceId)
      )
    );

    return db.transaction(async (client) => {
      // Find open invoice for patient+visit
      const qParams = [patientId, facilityId];
      let visitClause = '';
      if (visitId) {
        qParams.push(visitId);
        visitClause = `AND (visit_id = $${qParams.length} OR visit_id IS NULL)`;
      }

      const existingResult = await client.query(`
        SELECT id FROM invoices
        WHERE patient_id = $1
          AND facility_id = $2
          ${visitClause}
          AND payment_status IN ('Pending', 'Partially Paid')
          AND voided = false
        ORDER BY created_at DESC
        LIMIT 1
      `, qParams);

      let invoiceId;

      if (existingResult.rows.length === 0) {
        // Create a new invoice with all items
        const newInvoice = await Billing.createInvoice({
          patient_id: patientId,
          facility_id: facilityId,
          visit_id: visitId || null,
          items: items.map((item, i) => ({
            item_type: item.serviceType,
            item_id: item.serviceId || null,
            item_code: item.itemCode || priceResults[i].service_code,
            item_name: item.itemName || priceResults[i].service_name,
            description: item.description || null,
            quantity: item.quantity || 1,
            unit_price: parseFloat(priceResults[i].price),
          })),
        }, userId);
        return [newInvoice];
      }

      invoiceId = existingResult.rows[0].id;

      // Batch INSERT all items into the existing invoice
      const insertValues = [];
      const insertParams = [];
      let paramIdx = 1;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const priceInfo = priceResults[i];
        const unitPrice = parseFloat(priceInfo.price);
        const qty = item.quantity || 1;
        const itemTotal = qty * unitPrice;

        insertValues.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, 0, 0, $${paramIdx + 8})`);
        insertParams.push(
          invoiceId,
          item.serviceType,
          item.serviceId || null,
          item.itemCode || priceInfo.service_code,
          item.itemName || priceInfo.service_name,
          item.description || null,
          qty,
          unitPrice,
          itemTotal
        );
        paramIdx += 9;
      }

      await client.query(`
        INSERT INTO invoice_items (invoice_id, item_type, item_id, item_code, item_name, description, quantity, unit_price, discount_amount, tax_amount, total_price)
        VALUES ${insertValues.join(', ')}
      `, insertParams);

      // Single recalculation of invoice totals
      const totalsResult = await client.query(`
        SELECT COALESCE(SUM(total_price), 0) AS new_subtotal
        FROM invoice_items WHERE invoice_id = $1
      `, [invoiceId]);
      const newSubtotal = parseFloat(totalsResult.rows[0].new_subtotal);

      const invResult = await client.query(
        `SELECT discount_percentage, discount_amount, tax_percentage, tax_amount, amount_paid FROM invoices WHERE id = $1`,
        [invoiceId]
      );
      const inv = invResult.rows[0];
      const discAmt = inv.discount_percentage
        ? newSubtotal * parseFloat(inv.discount_percentage) / 100
        : parseFloat(inv.discount_amount) || 0;
      const taxAmt = inv.tax_percentage
        ? (newSubtotal - discAmt) * parseFloat(inv.tax_percentage) / 100
        : parseFloat(inv.tax_amount) || 0;
      const newTotal = newSubtotal - discAmt + taxAmt;
      const amountPaid = parseFloat(inv.amount_paid) || 0;
      const newBalance = Math.max(0, newTotal - amountPaid);

      let status = 'Pending';
      if (amountPaid >= newTotal && newTotal > 0) status = 'Paid';
      else if (amountPaid > 0) status = 'Partially Paid';

      await client.query(`
        UPDATE invoices
        SET subtotal = $1, total_amount = $2, balance_due = $3, payment_status = $4, updated_at = NOW()
        WHERE id = $5
      `, [newSubtotal, newTotal, newBalance, status, invoiceId]);

      return { invoiceId, itemsAdded: items.length };
    });
  }

  // ─── Reports ──────────────────────────────────────────────────────────────────

  static async getDailyRevenue(facilityId, date) {
    const result = await db.query(`
      SELECT 
        COALESCE(SUM(p.amount), 0) as total_collected,
        COUNT(DISTINCT p.id) as transaction_count,
        COUNT(DISTINCT p.patient_id) as patient_count,
        json_agg(
          json_build_object(
            'payment_method', p.payment_method,
            'total', SUM(p.amount) OVER (PARTITION BY p.payment_method)
          )
        ) FILTER (WHERE p.payment_method IS NOT NULL) as payment_method_breakdown
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.facility_id = $1
        AND DATE(p.payment_date) = $2
        AND p.voided = false
    `, [facilityId, date]);

    return result.rows[0];
  }

  static async getRevenueByPeriod(facilityId, startDate, endDate, interval = 'day') {
    let intervalFormat;
    switch(interval) {
      case 'day': intervalFormat = 'YYYY-MM-DD'; break;
      case 'week': intervalFormat = 'YYYY-WW'; break;
      case 'month': intervalFormat = 'YYYY-MM'; break;
      default: intervalFormat = 'YYYY-MM-DD';
    }

    const result = await db.query(`
      SELECT 
        TO_CHAR(p.payment_date, $1) as period,
        COUNT(*) as transaction_count,
        SUM(p.amount) as total_collected,
        AVG(p.amount) as average_transaction,
        COUNT(DISTINCT p.patient_id) as unique_patients
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.facility_id = $2
        AND p.payment_date BETWEEN $3 AND $4
        AND p.voided = false
      GROUP BY TO_CHAR(p.payment_date, $1)
      ORDER BY period
    `, [intervalFormat, facilityId, startDate, endDate]);

    return result.rows;
  }

  static async getOutstandingReport(facilityId) {
    const result = await db.query(`
      SELECT 
        SUM(i.balance_due) as total_outstanding,
        COUNT(i.id) as invoice_count,
        COUNT(DISTINCT i.patient_id) as patient_count,
        AVG(i.balance_due) as average_outstanding,
        SUM(CASE WHEN i.due_date < CURRENT_DATE THEN i.balance_due ELSE 0 END) as overdue_amount,
        COUNT(CASE WHEN i.due_date < CURRENT_DATE THEN 1 END) as overdue_count
      FROM invoices i
      WHERE i.facility_id = $1
        AND i.balance_due > 0
        AND i.voided = false
    `, [facilityId]);

    return result.rows[0];
  }

  static async getInsuranceBillingReport(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        pi.insurance_provider,
        COUNT(DISTINCT i.id) as invoice_count,
        SUM(i.insurance_coverage) as total_claimed,
        SUM(CASE WHEN ic.status = 'Paid' THEN ic.paid_amount ELSE 0 END) as total_received,
        COUNT(DISTINCT ic.id) as claim_count,
        AVG(EXTRACT(DAY FROM (ic.processed_date - i.invoice_date))) as avg_payment_days
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      LEFT JOIN patient_insurance pi ON p.id = pi.patient_id
      LEFT JOIN insurance_claims ic ON i.insurance_claim_id = ic.id
      WHERE i.facility_id = $1
        AND i.invoice_date BETWEEN $2 AND $3
        AND i.insurance_coverage > 0
      GROUP BY pi.insurance_provider
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }

  // Payment Methods Breakdown
  static async getPaymentMethodsBreakdown(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        p.payment_method,
        COUNT(*) as transaction_count,
        SUM(p.amount) as total_amount,
        AVG(p.amount) as average_amount,
        COUNT(DISTINCT p.patient_id) as unique_patients
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.facility_id = $1
        AND p.payment_date BETWEEN $2 AND $3
        AND p.voided = false
      GROUP BY p.payment_method
      ORDER BY total_amount DESC
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }

  toJSON() {
    return {
      id: this.id,
      invoice_number: this.invoice_number,
      visit_id: this.visit_id,
      patient_id: this.patient_id,
      facility_id: this.facility_id,
      invoice_date: this.invoice_date,
      due_date: this.due_date,
      subtotal: this.subtotal,
      discount_amount: this.discount_amount,
      discount_percentage: this.discount_percentage,
      discount_reason: this.discount_reason,
      tax_amount: this.tax_amount,
      tax_percentage: this.tax_percentage,
      total_amount: this.total_amount,
      amount_paid: this.amount_paid,
      balance_due: this.balance_due,
      payment_status: this.payment_status,
      insurance_coverage: this.insurance_coverage,
      patient_responsibility: this.patient_responsibility,
      notes: this.notes,
      voided: this.voided,
      voided_reason: this.voided_reason,
      voided_date: this.voided_date,
      created_by: this.created_by,
      created_at: this.created_at,
      updated_at: this.updated_at,
      items: this.items,
      payments: this.payments,
      patient: this.patient,
      visit: this.visit,
      created_by_user: this.created_by_user,
      insurance_claim: this.insurance_claim,
      facility: this.facility,
    };
  }
}

module.exports = Billing;