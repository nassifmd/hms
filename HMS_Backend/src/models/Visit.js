const db = require('../config/database');
const { generateVisitNumber } = require('../utils/generators');
const logger = require('../config/logger');

class Visit {
  constructor(data = {}) {
    this.id = data.id;
    this.visit_number = data.visit_number;
    this.patient_id = data.patient_id;
    this.facility_id = data.facility_id;
    this.department_id = data.department_id;
    this.visit_type = data.visit_type;
    this.visit_date = data.visit_date;
    this.check_in_time = data.check_in_time;
    this.check_out_time = data.check_out_time;
    this.triage_time = data.triage_time;
    this.consultation_time = data.consultation_time;
    this.referred_by = data.referred_by;
    this.referring_facility = data.referring_facility;
    this.referring_reason = data.referring_reason;
    this.chief_complaint = data.chief_complaint;
    this.presenting_complaint = data.presenting_complaint;
    this.history_of_presenting_illness = data.history_of_presenting_illness;
    this.triage_notes = data.triage_notes;
    this.triage_by = data.triage_by;
    this.consultation_notes = data.consultation_notes;
    this.diagnosis = data.diagnosis;
    this.treatment_plan = data.treatment_plan;
    this.discharge_notes = data.discharge_notes;
    this.discharge_date = data.discharge_date;
    this.discharge_by = data.discharge_by;
    this.visit_status = data.visit_status || 'Active';
    this.is_emergency = data.is_emergency || false;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;

    // Computed / joined fields from findById subqueries
    this.patient            = data.patient            ?? null;
    this.department         = data.department         ?? null;
    this.facility           = data.facility           ?? null;
    this.triage_by_user     = data.triage_by_user     ?? null;
    this.created_by_user    = data.created_by_user    ?? null;
    this.vitals             = data.vitals             ?? [];
    this.diagnoses          = data.diagnoses          ?? [];
    this.prescriptions      = data.prescriptions      ?? [];
    this.lab_orders         = data.lab_orders         ?? [];
    this.invoices           = data.invoices           ?? [];
    // Flat fields added by list queries
    this.patient_name       = data.patient_name       ?? null;
    this.patient_number     = data.patient_number     ?? null;
    this.department_name    = data.department_name    ?? null;
    this.created_by_name    = data.created_by_name    ?? null;
    this.doctor_name        = data.doctor_name        ?? null;
    this.date_of_birth      = data.date_of_birth      ?? null;
    this.gender             = data.gender             ?? null;
    this.waiting_time       = data.waiting_time       ?? null;
  }

  static async create(visitData, userId) {
    return db.transaction(async (client) => {
      // Generate visit number using the shared utility (format: VIS-YYYY-XXXXX).
      // This correctly extracts only the trailing 5-digit sequence via `-(\\d+)$`
      // so the year is never included in the cast value and cannot snowball.
      const visitNumber = await generateVisitNumber(client, visitData.facility_id);

      const result = await client.query(`
        INSERT INTO visits (
          visit_number, patient_id, facility_id, department_id,
          visit_type, visit_date, check_in_time, referred_by,
          referring_facility, referring_reason, chief_complaint,
          presenting_complaint, history_of_presenting_illness,
          is_emergency, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        RETURNING *
      `, [
        visitNumber,
        visitData.patient_id,
        visitData.facility_id,
        visitData.department_id,
        visitData.visit_type,
        visitData.visit_date || new Date(),
        visitData.check_in_time || new Date(),
        visitData.referred_by,
        visitData.referring_facility,
        visitData.referring_reason,
        visitData.chief_complaint,
        visitData.presenting_complaint,
        visitData.history_of_presenting_illness,
        visitData.is_emergency || false,
        userId
      ]);

      // attempt to update patient's last visit date; if the column is missing or
      // the database user lacks ALTER permission we'll log a warning but continue
      try {
        await client.query(`
          UPDATE patients 
          SET last_visit_date = NOW()
          WHERE id = $1
        `, [visitData.patient_id]);
      } catch (err) {
        // 42703 = undefined_column, 42501 = insufficient_privilege
        if (err.code === '42703') {
          logger.warn('patients.last_visit_date column does not exist; please apply migration');
        } else if (err.code === '42501') {
          logger.warn('permission denied updating patients table; ensure last_visit_date column exists');
        } else {
          // rethrow other unexpected errors
          throw err;
        }
      }

      logger.audit('VISIT_CREATED', userId, 'visit', {
        visitId: result.rows[0].id,
        patientId: visitData.patient_id,
        visitNumber: result.rows[0].visit_number
      });

      return new Visit(result.rows[0]);
    });
  }

  static async findAll(facilityId, { date, search, limit = 30 } = {}) {
    const params = [];
    const conditions = [];

    if (facilityId) {
      params.push(facilityId);
      conditions.push(`v.facility_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`DATE(v.visit_date) = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(p.first_name || ' ' || p.last_name ILIKE $${idx} OR p.patient_number ILIKE $${idx})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit, 10) || 30);

    const result = await db.query(`
      SELECT
        v.id, v.visit_number, v.visit_date, v.visit_type,
        v.patient_id,
        v.chief_complaint, v.diagnosis, v.visit_status,
        v.check_in_time, v.check_out_time, v.is_emergency,
        p.first_name || ' ' || p.last_name AS patient_name,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        d.department_name,
        cr.first_name || ' ' || cr.last_name AS created_by_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN users cr ON v.created_by = cr.id
      ${whereClause}
      ORDER BY v.visit_date DESC, v.check_in_time DESC
      LIMIT $${params.length}
    `, params);

    return result.rows;
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        v.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'date_of_birth', p.date_of_birth,
          'gender', p.gender,
          'phone', p.phone_number
        ) as patient,
        json_build_object(
          'id', d.id,
          'name', d.department_name,
          'code', d.department_code
        ) as department,
        json_build_object(
          'id', f.id,
          'name', f.facility_name
        ) as facility,
        json_build_object(
          'id', triage_user.id,
          'name', triage_user.first_name || ' ' || triage_user.last_name
        ) as triage_by_user,
        json_build_object(
          'id', creator.id,
          'name', creator.first_name || ' ' || creator.last_name
        ) as created_by_user,
        (
          SELECT json_agg(
            json_build_object(
              'id', di.id,
              'code', di.diagnosis_code,
              'name', di.diagnosis_name,
              'type', di.diagnosis_type,
              'diagnosed_by', json_build_object(
                'id', u.id,
                'name', u.first_name || ' ' || u.last_name
              ),
              'diagnosed_date', di.diagnosed_date
            )
          )
          FROM diagnoses di
          LEFT JOIN users u ON di.diagnosed_by = u.id
          WHERE di.visit_id = v.id
        ) as diagnoses,
        (
          SELECT json_agg(
            json_build_object(
              'id', pr.id,
              'prescription_number', pr.prescription_number,
              'prescribed_by', json_build_object(
                'id', u.id,
                'name', u.first_name || ' ' || u.last_name
              ),
              'prescription_date', pr.prescription_date,
              'is_dispensed', pr.is_dispensed
            )
          )
          FROM prescriptions pr
          LEFT JOIN users u ON pr.prescribed_by = u.id
          WHERE pr.visit_id = v.id
        ) as prescriptions,
        (
          SELECT json_agg(
            json_build_object(
              'id', lo.id,
              'order_number', lo.order_number,
              'status', lo.status,
              'items', (
                SELECT json_agg(
                  json_build_object(
                    'id', loi.id,
                    'test_name', lt.test_name,
                    'result_value', loi.result_value,
                    'status', loi.status
                  )
                )
                FROM lab_order_items loi
                JOIN lab_tests lt ON loi.test_id = lt.id
                WHERE loi.lab_order_id = lo.id
              )
            )
          )
          FROM lab_orders lo
          WHERE lo.visit_id = v.id
        ) as lab_orders,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'recorded_at', pv.recorded_at,
              'height_cm', pv.height_cm,
              'weight_kg', pv.weight_kg,
              'bmi', pv.bmi,
              'temperature_celsius', pv.temperature_celsius,
              'systolic_bp', pv.systolic_bp,
              'diastolic_bp', pv.diastolic_bp,
              'heart_rate', pv.heart_rate,
              'respiratory_rate', pv.respiratory_rate,
              'oxygen_saturation', pv.oxygen_saturation,
              'pain_scale', pv.pain_scale,
              'blood_glucose', pv.blood_glucose,
              'notes', pv.notes
            )
            ORDER BY pv.recorded_at DESC
          )
          FROM patient_vitals pv
          WHERE pv.visit_id = v.id
        ) as vitals,
        (
          SELECT json_agg(
            json_build_object(
              'id', i.id,
              'invoice_number', i.invoice_number,
              'total_amount', i.total_amount,
              'payment_status', i.payment_status
            )
          )
          FROM invoices i
          WHERE i.visit_id = v.id
        ) as invoices
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN facilities f ON v.facility_id = f.id
      LEFT JOIN users triage_user ON v.triage_by = triage_user.id
      LEFT JOIN users creator ON v.created_by = creator.id
      WHERE v.id = $1
    `, [id]);

    return result.rows[0] ? new Visit(result.rows[0]) : null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(`
      SELECT 
        v.*,
        json_build_object(
          'id', d.id,
          'name', d.department_name
        ) as department
      FROM visits v
      JOIN departments d ON v.department_id = d.id
      WHERE v.patient_id = $1
      ORDER BY v.visit_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Visit(row));
  }

  static async getActiveVisits(facilityId = null) {
    // allow facilityId to be null (system user) – omit the filter in that case
    let query = `
      SELECT 
        v.id, v.visit_number, v.patient_id, v.visit_type, v.check_in_time,
        v.status, v.triage_priority,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        d.department_name,
        cr.first_name || ' ' || cr.last_name as created_by_name,
        EXTRACT(EPOCH FROM (NOW() - v.check_in_time))/60 as waiting_time
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN users cr ON v.created_by = cr.id
      WHERE v.visit_status IN ('Active', 'In Progress')
    `;
    const params = [];
    if (facilityId) {
      query += ` AND v.facility_id = $1`;
      params.push(facilityId);
    }
    query += `
      ORDER BY 
        CASE WHEN v.is_emergency THEN 0 ELSE 1 END,
        v.check_in_time
      LIMIT 100
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getTodayVisits(facilityId) {
    const result = await db.query(`
      SELECT 
        v.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.patient_number,
        d.department_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN departments d ON v.department_id = d.id
      WHERE v.facility_id = $1
        AND DATE(v.visit_date) = CURRENT_DATE
      ORDER BY v.check_in_time DESC
    `, [facilityId]);

    return result.rows.map(row => new Visit(row));
  }

  async update(data, userId) {
    const ALLOWED = [
      'visit_type', 'visit_date', 'visit_status', 'is_emergency',
      'department_id', 'chief_complaint', 'presenting_complaint',
      'history_of_presenting_illness', 'triage_notes', 'consultation_notes',
      'diagnosis', 'treatment_plan', 'discharge_notes',
      'referring_facility', 'referring_reason',
    ];

    const setClauses = [];
    const values = [];

    for (const field of ALLOWED) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) return this;

    values.push(userId);
    setClauses.push(`updated_by = $${values.length}`);
    setClauses.push('updated_at = NOW()');

    values.push(this.id);
    const result = await db.query(
      `UPDATE visits SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    Object.assign(this, result.rows[0]);
    return this;
  }

  async triage(triageData, userId) {
    const result = await db.query(`
      UPDATE visits 
      SET 
        triage_notes = $1,
        triage_by = $2,
        triage_time = NOW(),
        visit_status = 'In Progress',
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [triageData.notes, userId, this.id]);

    // Record vitals if provided
    if (triageData.vitals) {
      const h = triageData.vitals.height_cm ?? null;
      const w = triageData.vitals.weight_kg ?? null;
      const bmi = h && w && h > 0 ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : null;
      await db.query(`
        INSERT INTO patient_vitals (
          patient_id, visit_id, recorded_by, height_cm, weight_kg, bmi,
          temperature_celsius, systolic_bp, diastolic_bp, heart_rate,
          respiratory_rate, oxygen_saturation, pain_scale, blood_glucose, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        this.patient_id, this.id, userId,
        h,
        w,
        bmi,
        triageData.vitals.temperature_celsius ?? null,
        triageData.vitals.systolic_bp ?? null,
        triageData.vitals.diastolic_bp ?? null,
        triageData.vitals.heart_rate ?? null,
        triageData.vitals.respiratory_rate ?? null,
        triageData.vitals.oxygen_saturation ?? null,
        triageData.vitals.pain_scale ?? null,
        triageData.vitals.blood_glucose ?? null,
        triageData.vitals.notes ?? null
      ]);
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  async consult(consultationData, userId) {
    const result = await db.query(`
      UPDATE visits 
      SET 
        consultation_notes = $1,
        consultation_time = NOW(),
        updated_at = NOW(),
        updated_by = $2
      WHERE id = $3
      RETURNING *
    `, [consultationData.notes, userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async addDiagnosis(diagnosisData, userId) {
    const result = await db.query(`
      INSERT INTO diagnoses (
        visit_id, patient_id, diagnosis_code, diagnosis_name,
        diagnosis_type, diagnosis_description, diagnosed_by,
        is_confirmed, is_chronic, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      this.id,
      this.patient_id,
      diagnosisData.diagnosis_code,
      diagnosisData.diagnosis_name,
      diagnosisData.diagnosis_type,
      diagnosisData.diagnosis_description,
      userId,
      diagnosisData.is_confirmed || true,
      diagnosisData.is_chronic || false
    ]);

    return result.rows[0];
  }

  async discharge(dischargeData, userId) {
    const result = await db.query(`
      UPDATE visits 
      SET 
        visit_status = 'Discharged',
        discharge_notes = $1,
        discharge_date = NOW(),
        discharge_by = $2,
        check_out_time = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [dischargeData.notes, userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async transfer(newDepartmentId, reason, userId) {
    const result = await db.query(`
      UPDATE visits 
      SET 
        department_id = $1,
        transfer_reason = $2,
        transfer_date = NOW(),
        transferred_by = $3,
        visit_status = 'Transferred',
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [newDepartmentId, reason, userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async getTimeline() {
    const events = [];

    // Check-in event
    if (this.check_in_time) {
      events.push({
        time: this.check_in_time,
        event: 'Patient Checked In',
        type: 'check_in'
      });
    }

    // Triage event
    if (this.triage_time) {
      events.push({
        time: this.triage_time,
        event: 'Triage Completed',
        type: 'triage',
        notes: this.triage_notes
      });
    }

    // Consultation events from diagnoses
    const diagnoses = await db.query(`
      SELECT diagnosed_date as time, 'Diagnosis: ' || diagnosis_name as event, 'diagnosis' as type
      FROM diagnoses
      WHERE visit_id = $1
    `, [this.id]);
    events.push(...diagnoses.rows);

    // Lab orders
    const labs = await db.query(`
      SELECT order_date as time, 'Lab Order: ' || order_number as event, 'lab' as type
      FROM lab_orders
      WHERE visit_id = $1
    `, [this.id]);
    events.push(...labs.rows);

    // Prescriptions
    const prescriptions = await db.query(`
      SELECT prescription_date as time, 'Prescription Issued' as event, 'prescription' as type
      FROM prescriptions
      WHERE visit_id = $1
    `, [this.id]);
    events.push(...prescriptions.rows);

    // Discharge event
    if (this.discharge_date) {
      events.push({
        time: this.discharge_date,
        event: 'Patient Discharged',
        type: 'discharge'
      });
    }

    // Sort by time
    events.sort((a, b) => new Date(a.time) - new Date(b.time));

    return events;
  }

  async getVitals() {
    const result = await db.query(`
      SELECT *
      FROM patient_vitals
      WHERE visit_id = $1
      ORDER BY recorded_at DESC
    `, [this.id]);

    return result.rows;
  }

  async getProcedures() {
    const result = await db.query(`
      SELECT 
        pp.*,
        p.procedure_name,
        p.procedure_code,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as performed_by_user
      FROM patient_procedures pp
      JOIN procedures p ON pp.procedure_id = p.id
      LEFT JOIN users u ON pp.performed_by = u.id
      WHERE pp.visit_id = $1
      ORDER BY pp.procedure_date DESC
    `, [this.id]);

    return result.rows;
  }

  async getBills() {
    const result = await db.query(`
      SELECT *
      FROM invoices
      WHERE visit_id = $1
      ORDER BY invoice_date DESC
    `, [this.id]);

    return result.rows;
  }

  async getSummary() {
    return {
      visit_number: this.visit_number,
      visit_date: this.visit_date,
      visit_type: this.visit_type,
      duration: this.check_out_time ? 
        Math.round((new Date(this.check_out_time) - new Date(this.check_in_time)) / (1000 * 60)) : null,
      diagnosis: this.diagnosis,
      treatment_plan: this.treatment_plan,
      status: this.visit_status
    };
  }

  static async getDepartmentStats(departmentId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_visits,
        COUNT(CASE WHEN is_emergency THEN 1 END) as emergency_visits,
        AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time))/60) as avg_duration_minutes,
        COUNT(DISTINCT patient_id) as unique_patients,
        COUNT(CASE WHEN visit_status = 'Discharged' THEN 1 END) as discharged,
        COUNT(CASE WHEN visit_status = 'Active' THEN 1 END) as active
      FROM visits
      WHERE department_id = $1
        AND visit_date BETWEEN $2 AND $3
    `, [departmentId, startDate, endDate]);

    return result.rows[0];
  }

  static async getDoctorStats(doctorId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(DISTINCT v.id) as visits,
        COUNT(DISTINCT d.id) as diagnoses,
        COUNT(DISTINCT p.id) as prescriptions
      FROM visits v
      LEFT JOIN diagnoses d ON v.id = d.visit_id AND d.diagnosed_by = $1
      LEFT JOIN prescriptions p ON v.id = p.visit_id AND p.prescribed_by = $1
      WHERE v.created_by = $1
        AND v.visit_date BETWEEN $2 AND $3
    `, [doctorId, startDate, endDate]);

    return result.rows[0];
  }

  toJSON() {
    return {
      id: this.id,
      visit_number: this.visit_number,
      visit_date: this.visit_date,
      visit_type: this.visit_type,
      chief_complaint: this.chief_complaint,
      diagnosis: this.diagnosis,
      status: this.visit_status,
      check_in_time: this.check_in_time,
      check_out_time: this.check_out_time,
      is_emergency: this.is_emergency
    };
  }
}

module.exports = Visit;