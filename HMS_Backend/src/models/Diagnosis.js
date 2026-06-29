const db = require('../config/database');
const logger = require('../config/logger');

class Diagnosis {
  constructor(data = {}) {
    this.id = data.id;
    this.visit_id = data.visit_id;
    this.patient_id = data.patient_id;
    this.diagnosis_code = data.diagnosis_code;
    this.diagnosis_name = data.diagnosis_name;
    this.diagnosis_type = data.diagnosis_type;
    this.diagnosis_description = data.diagnosis_description;
    this.diagnosed_by = data.diagnosed_by;
    this.diagnosed_date = data.diagnosed_date;
    this.is_confirmed = data.is_confirmed || false;
    this.is_chronic = data.is_chronic || false;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async create(diagnosisData, userId) {
    const result = await db.query(`
      INSERT INTO diagnoses (
        visit_id, patient_id, diagnosis_code, diagnosis_name,
        diagnosis_type, diagnosis_description, diagnosed_by,
        is_confirmed, is_chronic, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      diagnosisData.visit_id,
      diagnosisData.patient_id,
      diagnosisData.diagnosis_code,
      diagnosisData.diagnosis_name,
      diagnosisData.diagnosis_type,
      diagnosisData.diagnosis_description,
      userId,
      diagnosisData.is_confirmed || false,
      diagnosisData.is_chronic || false
    ]);

    logger.audit('DIAGNOSIS_CREATED', userId, 'diagnosis', {
      diagnosisId: result.rows[0].id,
      patientId: diagnosisData.patient_id,
      diagnosisCode: diagnosisData.diagnosis_code
    });

    return new Diagnosis(result.rows[0]);
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        d.*,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as diagnosed_by_user
      FROM diagnoses d
      JOIN visits v ON d.visit_id = v.id
      JOIN patients p ON d.patient_id = p.id
      LEFT JOIN users u ON d.diagnosed_by = u.id
      WHERE d.id = $1
    `, [id]);

    return result.rows[0] ? new Diagnosis(result.rows[0]) : null;
  }

  static async findByPatient(patientId, limit = 20) {
    const result = await db.query(`
      SELECT 
        d.*,
        v.visit_date,
        v.visit_number,
        u.first_name || ' ' || u.last_name as doctor_name
      FROM diagnoses d
      JOIN visits v ON d.visit_id = v.id
      LEFT JOIN users u ON d.diagnosed_by = u.id
      WHERE d.patient_id = $1
      ORDER BY d.diagnosed_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Diagnosis(row));
  }

  static async findByVisit(visitId) {
    const result = await db.query(`
      SELECT 
        d.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as diagnosed_by_user
      FROM diagnoses d
      LEFT JOIN users u ON d.diagnosed_by = u.id
      WHERE d.visit_id = $1
      ORDER BY d.diagnosed_date
    `, [visitId]);

    return result.rows.map(row => new Diagnosis(row));
  }

  static async getCommonDiagnoses(facilityId, limit = 10, days = 90) {
    const result = await db.query(`
      SELECT 
        d.diagnosis_code,
        d.diagnosis_name,
        COUNT(*) as count,
        COUNT(DISTINCT d.patient_id) as unique_patients
      FROM diagnoses d
      JOIN visits v ON d.visit_id = v.id
      WHERE v.facility_id = $1
        AND d.created_at >= NOW() - $2::interval
      GROUP BY d.diagnosis_code, d.diagnosis_name
      ORDER BY count DESC
      LIMIT $3
    `, [facilityId, `${days} days`, limit]);

    return result.rows;
  }

  static async getDiagnosisTrends(facilityId, diagnosisCode, months = 12) {
    const result = await db.query(`
      SELECT 
        DATE_TRUNC('month', d.created_at) as month,
        COUNT(*) as count
      FROM diagnoses d
      JOIN visits v ON d.visit_id = v.id
      WHERE v.facility_id = $1
        AND d.diagnosis_code = $2
        AND d.created_at >= NOW() - $3::interval
      GROUP BY DATE_TRUNC('month', d.created_at)
      ORDER BY month
    `, [facilityId, diagnosisCode, `${months} months`]);

    return result.rows;
  }

  async update(updateData, userId) {
    const result = await db.query(`
      UPDATE diagnoses 
      SET 
        diagnosis_code = COALESCE($1, diagnosis_code),
        diagnosis_name = COALESCE($2, diagnosis_name),
        diagnosis_type = COALESCE($3, diagnosis_type),
        diagnosis_description = COALESCE($4, diagnosis_description),
        is_confirmed = COALESCE($5, is_confirmed),
        is_chronic = COALESCE($6, is_chronic),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      updateData.diagnosis_code,
      updateData.diagnosis_name,
      updateData.diagnosis_type,
      updateData.diagnosis_description,
      updateData.is_confirmed,
      updateData.is_chronic,
      this.id
    ]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async confirm(userId) {
    const result = await db.query(`
      UPDATE diagnoses 
      SET 
        is_confirmed = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  static async search(query, facilityId = null) {
    const likeParam  = `%${query}%`;
    const startParam = `${query}%`;

    // 1. Primary: GHS-approved ICD-10 catalogue ─────────────────────────────
    const catResult = await db.query(`
      SELECT
        id::text,
        diagnosis_code,
        diagnosis_name,
        NULL::text AS diagnosis_type
      FROM diagnosis_catalogue
      WHERE is_active = true
        AND (diagnosis_code ILIKE $1 OR diagnosis_name ILIKE $2)
      ORDER BY
        CASE WHEN diagnosis_code ILIKE $3 THEN 0 ELSE 1 END,
        diagnosis_name
      LIMIT 20
    `, [startParam, likeParam, startParam]);

    // 2. Secondary: recent facility diagnoses not already in catalogue ───────
    let facilityRows = [];
    if (facilityId) {
      const usedCodes = catResult.rows
        .map(r => r.diagnosis_code)
        .filter(Boolean);

      const excludeClause = usedCodes.length > 0
        ? `AND (d.diagnosis_code IS NULL OR d.diagnosis_code NOT ILIKE ALL($3::text[]))`
        : '';
      const facilityParams = usedCodes.length > 0
        ? [likeParam, facilityId, usedCodes]
        : [likeParam, facilityId];

      const facResult = await db.query(`
        SELECT DISTINCT ON (d.diagnosis_code, d.diagnosis_name)
          d.id::text,
          d.diagnosis_code,
          d.diagnosis_name,
          d.diagnosis_type
        FROM diagnoses d
        JOIN visits v ON d.visit_id = v.id
        WHERE (d.diagnosis_name ILIKE $1 OR d.diagnosis_code ILIKE $1)
          AND v.facility_id = $2
          ${excludeClause}
        ORDER BY d.diagnosis_code, d.diagnosis_name, d.diagnosed_date DESC
        LIMIT 5
      `, facilityParams);
      facilityRows = facResult.rows;
    }

    // Merge and cap at 25 results ────────────────────────────────────────────
    return [...catResult.rows, ...facilityRows].slice(0, 25);
  }

  toJSON() {
    return {
      id: this.id,
      diagnosis_code: this.diagnosis_code,
      diagnosis_name: this.diagnosis_name,
      diagnosis_type: this.diagnosis_type,
      diagnosis_description: this.diagnosis_description,
      diagnosed_date: this.diagnosed_date,
      is_confirmed: this.is_confirmed,
      is_chronic: this.is_chronic
    };
  }
}

module.exports = Diagnosis;