const db = require("../config/database");
const { generateClaimNumber } = require("../utils/generators");
const logger = require("../config/logger");

class Insurance {
  constructor(data = {}) {
    this.id = data.id;
    this.claim_number = data.claim_number;
    this.claimsit_claim_id = data.claimsit_claim_id;
    this.patient_id = data.patient_id;
    this.patient_insurance_id = data.patient_insurance_id;
    this.visit_id = data.visit_id;
    this.invoice_id = data.invoice_id;
    this.facility_id = data.facility_id;
    this.claim_date = data.claim_date;
    this.submission_date = data.submission_date;
    this.total_amount = parseFloat(data.total_amount) || 0;
    this.approved_amount = parseFloat(data.approved_amount);
    this.paid_amount = parseFloat(data.paid_amount);
    this.status = data.status || "Draft";
    this.validation_response = data.validation_response;
    this.rejection_reason = data.rejection_reason;
    this.resubmission_count = data.resubmission_count || 0;
    this.submitted_by = data.submitted_by;
    this.processed_by = data.processed_by;
    this.processed_date = data.processed_date;
    this.notes = data.notes;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    // Joined fields from getPendingClaims / findByPatient
    this.patient_name = data.patient_name ?? null;
    this.patient_number = data.patient_number ?? null;
    this.insurance_provider = data.insurance_provider ?? null;
    // Rich JSON fields from findClaimById
    this.patient = data.patient ?? null;
    this.patient_insurance = data.patient_insurance ?? null;
    this.visit = data.visit ?? null;
    this.invoice = data.invoice ?? null;
    this.items = data.items ?? null;
    this.status_history = data.status_history ?? null;
  }

  // Claim Management
  static async createClaim(claimData, userId) {
    return db.transaction(async (client) => {
      // Generate claim number
      const claimNumber = await generateClaimNumber(
        client,
        claimData.facility_id
      );

      const result = await client.query(
        `
        INSERT INTO insurance_claims (
          claim_number, patient_id, patient_insurance_id,
          visit_id, invoice_id, facility_id, claim_date,
          total_amount, status, submitted_by, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *
      `,
        [
          claimNumber,
          claimData.patient_id,
          claimData.patient_insurance_id,
          claimData.visit_id,
          claimData.invoice_id,
          claimData.facility_id,
          claimData.claim_date || new Date(),
          claimData.total_amount,
          "Draft",
          userId,
          claimData.notes,
        ]
      );

      const claim = result.rows[0];

      // Add claim items from invoice
      if (claimData.invoice_id) {
        await client.query(
          `
          INSERT INTO claim_items (
            claim_id, invoice_item_id, service_code,
            service_description, quantity, unit_price,
            total_price
          )
          SELECT
            $1, ii.id,
            CASE
              WHEN ii.item_type = 'Consultation' THEN 'CONS001'
              WHEN ii.item_type = 'Lab' THEN lt.test_code
              WHEN ii.item_type = 'Drug' THEN d.drug_code
              ELSE ii.item_code
            END,
            ii.item_name,
            ii.quantity,
            ii.unit_price,
            ii.total_price
          FROM invoice_items ii
          LEFT JOIN lab_tests lt ON ii.item_id = lt.id AND ii.item_type = 'Lab'
          LEFT JOIN drugs d ON ii.item_id = d.id AND ii.item_type = 'Drug'
          WHERE ii.invoice_id = $2
        `,
          [claim.id, claimData.invoice_id]
        );
      }

      logger.audit("INSURANCE_CLAIM_CREATED", userId, "insurance", {
        claimId: claim.id,
        claimNumber: claim.claim_number,
        patientId: claimData.patient_id,
      });

      return new Insurance(claim);
    });
  }

  static async findClaimById(id) {
    const result = await db.query(
      `
      SELECT
        ic.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'nhis_number', p.nhis_number
        ) as patient,
        json_build_object(
          'id', pi.id,
          'provider', pi.insurance_provider,
          'policy_number', pi.policy_number,
          'expiry_date', pi.expiry_date
        ) as patient_insurance,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit,
        json_build_object(
          'id', i.id,
          'invoice_number', i.invoice_number,
          'total_amount', i.total_amount
        ) as invoice,
        (
          SELECT json_agg(
            json_build_object(
              'id', ci.id,
              'service_code', ci.service_code,
              'service_description', ci.service_description,
              'quantity', ci.quantity,
              'unit_price', ci.unit_price,
              'total_price', ci.total_price,
              'approved_price', ci.approved_price,
              'rejection_reason', ci.rejection_reason
            )
          )
          FROM claim_items ci
          WHERE ci.claim_id = ic.id
        ) as items,
        (
          SELECT json_agg(
            json_build_object(
              'id', csh.id,
              'status', csh.status,
              'notes', csh.notes,
              'changed_at', csh.status_date,
              'changed_by', u.first_name || ' ' || u.last_name
            ) ORDER BY csh.status_date DESC
          )
          FROM claim_status_history csh
          LEFT JOIN users u ON csh.changed_by = u.id
          WHERE csh.claim_id = ic.id
        ) as status_history
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
      LEFT JOIN visits v ON ic.visit_id = v.id
      LEFT JOIN invoices i ON ic.invoice_id = i.id
      WHERE ic.id = $1
    `,
      [id]
    );

    return result.rows[0] ? new Insurance(result.rows[0]) : null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(
      `
      SELECT *
      FROM insurance_claims
      WHERE patient_id = $1
      ORDER BY claim_date DESC
      LIMIT $2
    `,
      [patientId, limit]
    );

    return result.rows.map((row) => new Insurance(row));
  }

  static async getPendingClaims(facilityId) {
    // facilityId may be null for sys admin or in tests – when it's null we
    // don't filter on facility so that all pending claims are returned.
    let baseQuery = `
      SELECT
        ic.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        pi.insurance_provider,
        i.total_amount
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
      JOIN invoices i ON ic.invoice_id = i.id
      WHERE ic.status IN ('Draft', 'Validated', 'Submitted')
    `;

    const params = [];
    if (facilityId) {
      baseQuery += `
        AND ic.facility_id = $1
      `;
      params.push(facilityId);
    }

    baseQuery += `
      ORDER BY
        CASE ic.status
          WHEN 'Draft' THEN 1
          WHEN 'Validated' THEN 2
          ELSE 3
        END,
        ic.claim_date
    `;

    const result = await db.query(baseQuery, params);
    return result.rows.map((row) => new Insurance(row));
  }

  // Claim Operations
  async submit(userId) {
    const result = await db.query(
      `
      UPDATE insurance_claims
      SET
        status = 'Submitted',
        submission_date = NOW(),
        submitted_by = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [userId, this.id]
    );

    await this.addStatusHistory(
      "Submitted",
      "Claim submitted to insurer",
      userId
    );

    Object.assign(this, result.rows[0]);
    return this;
  }

  async validate(validationResponse) {
    const result = await db.query(
      `
      UPDATE insurance_claims
      SET
        status = 'Validated',
        validation_response = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [validationResponse, this.id]
    );

    await this.addStatusHistory("Validated", "Claim validated", null);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async approve(approvedAmount, userId) {
    const result = await db.query(
      `
      UPDATE insurance_claims
      SET
        status = 'Approved',
        approved_amount = $1,
        processed_by = $2,
        processed_date = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [approvedAmount, userId, this.id]
    );

    await this.addStatusHistory(
      "Approved",
      `Approved amount: ${approvedAmount}`,
      userId
    );

    Object.assign(this, result.rows[0]);
    return this;
  }

  async reject(reason, userId) {
    const result = await db.query(
      `
      UPDATE insurance_claims
      SET
        status = 'Rejected',
        rejection_reason = $1,
        processed_by = $2,
        processed_date = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [reason, userId, this.id]
    );

    await this.addStatusHistory("Rejected", reason, userId);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async markAsPaid(paidAmount, userId) {
    const result = await db.query(
      `
      UPDATE insurance_claims
      SET
        status = 'Paid',
        paid_amount = $1,
        processed_by = $2,
        processed_date = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [paidAmount, userId, this.id]
    );

    await this.addStatusHistory(
      "Paid",
      `Payment received: ${paidAmount}`,
      userId
    );

    // Update linked invoice
    if (this.invoice_id) {
      await db.query(
        `
        UPDATE invoices
        SET
          insurance_coverage = $1,
          patient_responsibility = total_amount - $1,
          updated_at = NOW()
        WHERE id = $2
      `,
        [paidAmount, this.invoice_id]
      );
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  async addStatusHistory(status, notes, userId) {
    await db.query(
      `
      INSERT INTO claim_status_history (
        claim_id, status, notes, changed_by, status_date
      ) VALUES ($1, $2, $3, $4, NOW())
    `,
      [this.id, status, notes, userId]
    );
  }

  async getStatusHistory() {
    const result = await db.query(
      `
      SELECT
        csh.id,
        csh.claim_id,
        csh.status,
        csh.notes,
        csh.changed_by,
        csh.status_date as changed_at,
        u.first_name || ' ' || u.last_name as changed_by_name
      FROM claim_status_history csh
      LEFT JOIN users u ON csh.changed_by = u.id
      WHERE csh.claim_id = $1
      ORDER BY csh.status_date DESC
    `,
      [this.id]
    );

    return result.rows;
  }

  async updateItem(itemId, updateData) {
    const result = await db.query(
      `
      UPDATE claim_items
      SET
        approved_price = COALESCE($1, approved_price),
        rejection_reason = COALESCE($2, rejection_reason)
      WHERE id = $3 AND claim_id = $4
      RETURNING *
    `,
      [updateData.approved_price, updateData.rejection_reason, itemId, this.id]
    );

    return result.rows[0];
  }

  // NHIS Verification
  static async logNHISVerification(verificationData) {
    const result = await db.query(
      `
      INSERT INTO nhis_verification_logs (
        patient_id, nhis_number, verification_status,
        response_data, verified_by, verification_date
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `,
      [
        verificationData.patient_id,
        verificationData.nhis_number,
        verificationData.verification_status,
        verificationData.response_data,
        verificationData.verified_by,
      ]
    );

    return result.rows[0];
  }

  static async getNHISVerificationHistory(patientId, limit = 10) {
    const result = await db.query(
      `
      SELECT *, verification_date as verified_at
      FROM nhis_verification_logs
      WHERE patient_id = $1
      ORDER BY verification_date DESC
      LIMIT $2
    `,
      [patientId, limit]
    );

    return result.rows;
  }

  // Patient Insurance Management
  static async addPatientInsurance(insuranceData, userId) {
    const result = await db.query(
      `
      INSERT INTO patient_insurance (
        patient_id, insurance_provider, policy_number,
        insurance_type, plan_name, start_date, expiry_date,
        is_active, is_verified, verified_by, verified_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
      [
        insuranceData.patient_id,
        insuranceData.insurance_provider,
        insuranceData.policy_number,
        insuranceData.insurance_type,
        insuranceData.plan_name,
        insuranceData.start_date,
        insuranceData.expiry_date,
        insuranceData.is_active !== false,
        insuranceData.is_verified || false,
        userId,
        insuranceData.is_verified ? new Date() : null,
      ]
    );

    logger.audit("PATIENT_INSURANCE_ADDED", userId, "insurance", {
      insuranceId: result.rows[0].id,
      patientId: insuranceData.patient_id,
      provider: insuranceData.insurance_provider,
    });

    return result.rows[0];
  }

  static async getPatientActiveInsurance(patientId) {
    const result = await db.query(
      `
      SELECT *
      FROM patient_insurance
      WHERE patient_id = $1
        AND is_active = true
        AND expiry_date >= CURRENT_DATE
      ORDER BY
        CASE insurance_type
          WHEN 'NHIS' THEN 1
          ELSE 2
        END,
        created_at DESC
      LIMIT 1
    `,
      [patientId]
    );

    return result.rows[0];
  }

  // Reports
  static async getClaimStats(facilityId, startDate, endDate) {
    const result = await db.query(
      `
      SELECT
        COUNT(*) as total_claims,
        SUM(total_amount) as total_claimed,
        SUM(approved_amount) as total_approved,
        SUM(paid_amount) as total_paid,
        AVG(approved_amount / NULLIF(total_amount, 0)) * 100 as avg_approval_rate,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'Rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN status = 'Paid' THEN 1 END) as paid_count
      FROM insurance_claims
      WHERE facility_id = $1
        AND claim_date BETWEEN $2 AND $3
    `,
      [facilityId, startDate, endDate]
    );

    return result.rows[0];
  }

  static async getClaimsByProvider(facilityId, startDate, endDate) {
    const result = await db.query(
      `
      SELECT
        pi.insurance_provider,
        COUNT(ic.id) as claim_count,
        SUM(ic.total_amount) as total_claimed,
        SUM(ic.approved_amount) as total_approved,
        SUM(ic.paid_amount) as total_paid,
        AVG(ic.approved_amount / NULLIF(ic.total_amount, 0)) * 100 as approval_rate
      FROM insurance_claims ic
      JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
      WHERE ic.facility_id = $1
        AND ic.claim_date BETWEEN $2 AND $3
      GROUP BY pi.insurance_provider
      ORDER BY total_claimed DESC
    `,
      [facilityId, startDate, endDate]
    );

    return result.rows;
  }

  static async getRejectionAnalysis(facilityId, startDate, endDate) {
    const result = await db.query(
      `
      SELECT
        rejection_reason,
        COUNT(*) as count,
        SUM(total_amount) as amount_affected
      FROM insurance_claims
      WHERE facility_id = $1
        AND status = 'Rejected'
        AND claim_date BETWEEN $2 AND $3
      GROUP BY rejection_reason
      ORDER BY count DESC
    `,
      [facilityId, startDate, endDate]
    );

    return result.rows;
  }

  toJSON() {
    return {
      id: this.id,
      claim_number: this.claim_number,
      claimsit_claim_id: this.claimsit_claim_id,
      patient_id: this.patient_id,
      patient_insurance_id: this.patient_insurance_id,
      visit_id: this.visit_id,
      invoice_id: this.invoice_id,
      claim_date: this.claim_date,
      submission_date: this.submission_date,
      total_amount: this.total_amount,
      approved_amount: this.approved_amount,
      paid_amount: this.paid_amount,
      status: this.status,
      rejection_reason: this.rejection_reason,
      notes: this.notes,
      // Flat joined fields (pending queue)
      patient_name: this.patient_name,
      patient_number: this.patient_number,
      insurance_provider: this.insurance_provider,
      // Rich nested fields (detail view)
      patient: this.patient,
      patient_insurance: this.patient_insurance,
      visit: this.visit,
      invoice: this.invoice,
      items: this.items,
      status_history: this.status_history,
    };
  }
}

module.exports = Insurance;
