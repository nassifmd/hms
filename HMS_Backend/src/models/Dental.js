const db = require('../config/database');
const logger = require('../config/logger');

class Dental {
  constructor(data = {}) {
    this.id = data.id;
    this.patient_id = data.patient_id;
    this.visit_id = data.visit_id;
    this.chart_date = data.chart_date;
    this.chart_type = data.chart_type;
    this.created_by = data.created_by;
    this.notes = data.notes;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.teeth = data.teeth || [];
    // pg returns COUNT(*) as a string; coerce to integer
    this.procedure_count = data.procedure_count !== undefined ? parseInt(data.procedure_count, 10) : undefined;
  }

  // Dental Chart Management
  static async createChart(chartData, userId) {
    return db.transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO dental_charts (
          patient_id, visit_id, created_by, chart_date,
          chart_type, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `, [
        chartData.patient_id,
        chartData.visit_id,
        userId,
        chartData.chart_date || new Date(),
        chartData.chart_type || 'Adult',
        chartData.notes
      ]);

      const chart = result.rows[0];

      // Initialize teeth based on chart type
      const teeth = chart.chart_type === 'Adult' 
        ? this.getAdultTeeth() 
        : this.getChildTeeth();

      for (const tooth of teeth) {
        await client.query(`
          INSERT INTO dental_teeth (
            dental_chart_id, tooth_number, quadrant, tooth_type, status
          ) VALUES ($1, $2, $3, $4, $5)
        `, [chart.id, tooth.number, tooth.quadrant, tooth.type, 'Present']);
      }

      logger.audit('DENTAL_CHART_CREATED', userId, 'dental', {
        chartId: chart.id,
        patientId: chartData.patient_id
      });

      return new Dental(chart);
    });
  }

  static async findChartById(id) {
    const result = await db.query(`
      SELECT 
        dc.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as created_by_user,
        (
          SELECT json_agg(
            json_build_object(
              'id', dt.id,
              'tooth_number', dt.tooth_number,
              'quadrant', dt.quadrant,
              'tooth_type', dt.tooth_type,
              'status', dt.status,
              'condition_notes', dt.condition_notes
            ) ORDER BY dt.tooth_number
          )
          FROM dental_teeth dt
          WHERE dt.dental_chart_id = dc.id
        ) as teeth,
        (
          SELECT json_agg(
            json_build_object(
              'id', dp.id,
              'procedure_id', dp.procedure_id,
              'procedure_name', pr.procedure_name,
              'tooth_number', dp.tooth_number,
              'procedure_date', dp.procedure_date,
              'findings', dp.findings,
              'outcome', dp.outcome,
              'anaesthetist_id', dp.anaesthetist_id
            ) ORDER BY dp.procedure_date DESC
          )
          FROM patient_dental_procedures dp
          JOIN dental_procedures pr ON dp.procedure_id = pr.id
          WHERE dp.dental_chart_id = dc.id
        ) as procedures
      FROM dental_charts dc
      JOIN patients p ON dc.patient_id = p.id
      LEFT JOIN users u ON dc.created_by = u.id
      WHERE dc.id = $1
    `, [id]);

    if (result.rows[0]) {
      const chart = new Dental(result.rows[0]);
      chart.teeth = result.rows[0].teeth || [];
      return chart;
    }
    return null;
  }

  static async findChartsByPatient(patientId, limit = 5) {
    const result = await db.query(`
      SELECT 
        dc.*,
        (
          SELECT COUNT(*)
          FROM patient_dental_procedures
          WHERE dental_chart_id = dc.id
        ) as procedure_count
      FROM dental_charts dc
      WHERE dc.patient_id = $1
      ORDER BY dc.chart_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Dental(row));
  }

  async updateTooth(toothNumber, updateData) {
    const result = await db.query(`
      UPDATE dental_teeth 
      SET 
        status = COALESCE($1, status),
        condition_notes = COALESCE($2, condition_notes),
        updated_at = NOW()
      WHERE dental_chart_id = $3 AND tooth_number = $4
      RETURNING *
    `, [
      updateData.status,
      updateData.condition_notes,
      this.id,
      toothNumber
    ]);

    // Update local cache
    const toothIndex = this.teeth.findIndex(t => t.tooth_number === toothNumber);
    if (toothIndex >= 0) {
      this.teeth[toothIndex] = { ...this.teeth[toothIndex], ...result.rows[0] };
    }

    return result.rows[0];
  }

  // Dental Procedures
  static async createProcedure(procedureData, userId) {
    try {
      // If no chart was specified, link to the patient's most recent chart.
      // If the patient has no chart at all, create a default Adult chart first.
      let chartId = procedureData.dental_chart_id || null;
      if (!chartId && procedureData.patient_id) {
        const chartLookup = await db.query(
          `SELECT id FROM dental_charts WHERE patient_id = $1 ORDER BY chart_date DESC LIMIT 1`,
          [procedureData.patient_id]
        );
        if (chartLookup.rows.length > 0) {
          chartId = chartLookup.rows[0].id;
        } else {
          // No chart exists yet — create a default Adult chart
          const newChart = await Dental.createChart({
            patient_id: procedureData.patient_id,
            visit_id: procedureData.visit_id || null,
            chart_type: 'Adult',
          }, userId);
          chartId = newChart.id;
        }
      }

      const result = await db.query(`
        INSERT INTO patient_dental_procedures (
          visit_id, patient_id, dental_chart_id, tooth_number,
          procedure_id, procedure_date, performed_by, assisted_by,
          anaesthetist_id, findings, outcome, complications,
          materials_used, follow_up_required, follow_up_date, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *
      `, [
        procedureData.visit_id,
        procedureData.patient_id,
        chartId,
        procedureData.tooth_number,
        procedureData.procedure_id,
        procedureData.procedure_date || new Date(),
        userId,
        procedureData.assisted_by,
        procedureData.anaesthetist_id,
        procedureData.findings,
        procedureData.outcome,
        procedureData.complications,
        procedureData.materials_used,
        procedureData.follow_up_required || false,
        procedureData.follow_up_date,
        procedureData.notes
      ]);

      logger.audit('DENTAL_PROCEDURE_CREATED', userId, 'dental', {
        procedureId: result.rows[0].id,
        patientId: procedureData.patient_id,
        toothNumber: procedureData.tooth_number
      });

      return result.rows[0];
    } catch (err) {
      // Provide clearer instruction if column is missing
      if (err.code === '42703' && err.message.includes('anaesthetist_id')) {
        err.message +=
          ' - please ensure the database schema has been updated (see migrations/0001_add_anaesthetist_to_patient_dental_procedures.sql)';
      }
      throw err;
    }
  }

  static async findProcedureById(id) {
    const result = await db.query(`
      SELECT 
        dp.*,
        p.procedure_name,
        p.procedure_code,
        p.procedure_category,
        json_build_object(
          'id', u1.id,
          'name', u1.first_name || ' ' || u1.last_name
        ) as performed_by_user,
        json_build_object(
          'id', u2.id,
          'name', u2.first_name || ' ' || u2.last_name
        ) as assisted_by_user,
        json_build_object(
          'id', u3.id,
          'name', u3.first_name || ' ' || u3.last_name
        ) as anaesthetist_user,
        json_build_object(
          'id', pt.id,
          'patient_number', pt.patient_number,
          'name', pt.first_name || ' ' || pt.last_name
        ) as patient
      FROM patient_dental_procedures dp
      JOIN dental_procedures p ON dp.procedure_id = p.id
      LEFT JOIN users u1 ON dp.performed_by = u1.id
      LEFT JOIN users u2 ON dp.assisted_by = u2.id
      LEFT JOIN users u3 ON dp.anaesthetist_id = u3.id
      JOIN patients pt ON dp.patient_id = pt.id
      WHERE dp.id = $1
    `, [id]);

    return result.rows[0];
  }

  static async getPatientProcedures(patientId, limit = 20) {
    const result = await db.query(`
      SELECT 
        dp.*,
        p.procedure_name,
        p.procedure_code,
        dc.chart_date,
        pt.first_name || ' ' || pt.last_name AS patient_name,
        pt.patient_number,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as performed_by_user,
        json_build_object(
          'id', u3.id,
          'name', u3.first_name || ' ' || u3.last_name
        ) as anaesthetist_user
      FROM patient_dental_procedures dp
      JOIN dental_procedures p ON dp.procedure_id = p.id
      JOIN patients pt ON dp.patient_id = pt.id
      LEFT JOIN users u ON dp.performed_by = u.id
      LEFT JOIN users u3 ON dp.anaesthetist_id = u3.id
      LEFT JOIN dental_charts dc ON dp.dental_chart_id = dc.id
      WHERE dp.patient_id = $1
      ORDER BY dp.procedure_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows;
  }

  // Procedure Catalog
  static async getProcedureCatalog(active = true) {
    const result = await db.query(`
      SELECT * FROM dental_procedures
      WHERE is_active = $1 OR $1 IS NULL
      ORDER BY procedure_category, procedure_name
    `, [active]);

    return result.rows;
  }

  static async createProcedureCatalog(procedureData) {
    try {
      const result = await db.query(`
        INSERT INTO dental_procedures (
          procedure_code, procedure_name, procedure_category,
          tooth_specific, description, standard_duration,
          price, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `, [
        procedureData.procedure_code,
        procedureData.procedure_name,
        procedureData.procedure_category,
        procedureData.tooth_specific !== false,
        procedureData.description,
        procedureData.standard_duration,
        procedureData.price,
        procedureData.is_active !== false
      ]);

      return result.rows[0];
    } catch (err) {
      if (err.code === '42703' && err.message.includes('updated_at')) {
        err.message +=
          ' - please update your database schema (see migrations/0002_add_updated_at_to_dental_procedures.sql)';
      }
      throw err;
    }
  }

  // Treatment Planning
  async createTreatmentPlan(planData, userId) {
    try {
      const result = await db.query(`
        INSERT INTO dental_treatment_plans (
          patient_id, dental_chart_id, created_by, plan_date,
          diagnosis, treatment_description, estimated_cost,
          estimated_duration, priority, status, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *
      `, [
        this.patient_id,
        this.id,
        userId,
        planData.plan_date || new Date(),
        planData.diagnosis,
        planData.treatment_description,
        planData.estimated_cost,
        planData.estimated_duration,
        planData.priority || 'Normal',
        'Active',
        planData.notes
      ]);

      return result.rows[0];
    } catch (err) {
      if (err.code === '42P01' && err.message.includes('dental_treatment_plans')) {
        err.message +=
          ' - the dental_treatment_plans table is missing; run the migration in migrations/0003_create_dental_treatment_plans_table.sql';
      }
      throw err;
    }
  }

  // Odontogram/Charting
  getToothStatus(toothNumber) {
    const tooth = this.teeth.find(t => t.tooth_number === toothNumber);
    return tooth ? tooth.status : 'Unknown';
  }

  getQuadrantTeeth(quadrant) {
    return this.teeth.filter(t => t.quadrant === quadrant);
  }

  getTreatmentHistory(toothNumber) {
    return db.query(`
      SELECT 
        dp.*,
        p.procedure_name,
        u.first_name || ' ' || u.last_name as dentist_name
      FROM patient_dental_procedures dp
      JOIN dental_procedures p ON dp.procedure_id = p.id
      LEFT JOIN users u ON dp.performed_by = u.id
      WHERE dp.patient_id = $1 AND dp.tooth_number = $2
      ORDER BY dp.procedure_date DESC
    `, [this.patient_id, toothNumber]);
  }

  // Static helper methods for tooth numbering
  static getAdultTeeth() {
    const teeth = [];
    // Quadrant 1: Upper Right (18-11)
    for (let i = 18; i >= 11; i--) {
      teeth.push({
        number: i,
        quadrant: 1,
        type: this.getToothType(i)
      });
    }
    // Quadrant 2: Upper Left (21-28)
    for (let i = 21; i <= 28; i++) {
      teeth.push({
        number: i,
        quadrant: 2,
        type: this.getToothType(i)
      });
    }
    // Quadrant 3: Lower Left (31-38)
    for (let i = 31; i <= 38; i++) {
      teeth.push({
        number: i,
        quadrant: 3,
        type: this.getToothType(i)
      });
    }
    // Quadrant 4: Lower Right (48-41)
    for (let i = 48; i >= 41; i--) {
      teeth.push({
        number: i,
        quadrant: 4,
        type: this.getToothType(i)
      });
    }
    return teeth;
  }

  static getChildTeeth() {
    const teeth = [];
    // Quadrant 5: Upper Right (55-51)
    for (let i = 55; i >= 51; i--) {
      teeth.push({
        number: i,
        quadrant: 5,
        type: 'Deciduous'
      });
    }
    // Quadrant 6: Upper Left (61-65)
    for (let i = 61; i <= 65; i++) {
      teeth.push({
        number: i,
        quadrant: 6,
        type: 'Deciduous'
      });
    }
    // Quadrant 7: Lower Left (71-75)
    for (let i = 71; i <= 75; i++) {
      teeth.push({
        number: i,
        quadrant: 7,
        type: 'Deciduous'
      });
    }
    // Quadrant 8: Lower Right (85-81)
    for (let i = 85; i >= 81; i--) {
      teeth.push({
        number: i,
        quadrant: 8,
        type: 'Deciduous'
      });
    }
    return teeth;
  }

  static getToothType(toothNumber) {
    const lastDigit = toothNumber % 10;
    if (lastDigit === 1 || lastDigit === 2) return 'Incisor';
    if (lastDigit === 3) return 'Canine';
    if (lastDigit === 4 || lastDigit === 5) return 'Premolar';
    if (lastDigit >= 6 && lastDigit <= 8) return 'Molar';
    return 'Unknown';
  }

  // Reports
  static async getProcedureStats(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        p.procedure_category,
        p.procedure_name,
        COUNT(*) as procedure_count,
        COUNT(DISTINCT dp.patient_id) as unique_patients,
        SUM(p.price) as total_revenue,
        AVG(p.price) as avg_price
      FROM patient_dental_procedures dp
      JOIN dental_procedures p ON dp.procedure_id = p.id
      JOIN visits v ON dp.visit_id = v.id
      WHERE v.facility_id = $1
        AND dp.procedure_date BETWEEN $2 AND $3
      GROUP BY p.procedure_category, p.procedure_name
      ORDER BY procedure_count DESC
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }

  static async getToothStatistics(facilityId) {
    const result = await db.query(`
      SELECT 
        dt.tooth_number,
        dt.quadrant,
        dt.status,
        COUNT(*) as tooth_count
      FROM dental_teeth dt
      JOIN dental_charts dc ON dt.dental_chart_id = dc.id
      JOIN patients p ON dc.patient_id = p.id
      WHERE p.facility_id = $1
      GROUP BY dt.tooth_number, dt.quadrant, dt.status
      ORDER BY dt.quadrant, dt.tooth_number
    `, [facilityId]);

    return result.rows;
  }

  // Get treatment plans for a patient (across all charts)
  static async getPatientTreatmentPlans(patientId) {
    const result = await db.query(`
      SELECT 
        dtp.*,
        u.first_name || ' ' || u.last_name AS created_by_name,
        dc.chart_date
      FROM dental_treatment_plans dtp
      LEFT JOIN users u ON dtp.created_by = u.id
      LEFT JOIN dental_charts dc ON dtp.dental_chart_id = dc.id
      WHERE dtp.patient_id = $1
      ORDER BY dtp.plan_date DESC
    `, [patientId]);
    return result.rows;
  }

  // Update tooth status on a chart
  static async updateToothByChart(chartId, toothNumber, updateData) {
    const result = await db.query(`
      UPDATE dental_teeth
      SET status = COALESCE($1, status),
          condition_notes = COALESCE($2, condition_notes),
          updated_at = NOW()
      WHERE dental_chart_id = $3 AND tooth_number = $4
      RETURNING *
    `, [updateData.status, updateData.condition_notes, chartId, toothNumber]);
    return result.rows[0];
  }

  // Update overall treatment plan status
  static async updateTreatmentPlan(planId, updateData) {
    const result = await db.query(`
      UPDATE dental_treatment_plans
      SET status = COALESCE($1, status),
          notes = COALESCE($2, notes),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [updateData.status, updateData.notes, planId]);
    return result.rows[0];
  }

  // ── BPE (Basic Periodontal Examination) ──

  static deriveTreatmentNeed(overallScore) {
    const s = String(overallScore).replace('*', '');
    const num = parseInt(s, 10);
    if (isNaN(num)) return 'Re-examine';
    if (num === 0) return 'No treatment needed';
    if (num === 1) return 'Oral hygiene instruction (OHI)';
    if (num === 2) return 'OHI + scale and polish';
    if (num === 3) return 'OHI + root surface debridement';
    if (num >= 4) return 'Refer to specialist / detailed periodontal assessment';
    return 'Re-examine';
  }

  static async createBPE(data, userId) {
    const scores = [data.sextant_1, data.sextant_2, data.sextant_3, data.sextant_4, data.sextant_5, data.sextant_6];
    const numericScores = scores.map(s => s ? parseInt(String(s).replace('*', ''), 10) : -1).filter(n => !isNaN(n) && n >= 0);
    const maxScore = numericScores.length > 0 ? Math.max(...numericScores) : null;
    const hasStar = scores.some(s => s && String(s).includes('*'));
    const overall = maxScore !== null ? (hasStar ? `${maxScore}*` : String(maxScore)) : null;
    const treatmentNeed = overall !== null ? this.deriveTreatmentNeed(overall) : null;

    const result = await db.query(`
      INSERT INTO dental_bpe_examinations (
        dental_chart_id, patient_id, examination_date,
        sextant_1, sextant_2, sextant_3,
        sextant_4, sextant_5, sextant_6,
        overall_score, clinical_notes, treatment_need, examined_by,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW(), NOW())
      RETURNING *
    `, [
      data.dental_chart_id,
      data.patient_id,
      data.examination_date || new Date(),
      data.sextant_1 || null,
      data.sextant_2 || null,
      data.sextant_3 || null,
      data.sextant_4 || null,
      data.sextant_5 || null,
      data.sextant_6 || null,
      overall,
      data.clinical_notes || null,
      treatmentNeed,
      userId,
    ]);

    logger.audit('DENTAL_BPE_CREATED', userId, 'dental', {
      bpeId: result.rows[0].id,
      chartId: data.dental_chart_id,
      patientId: data.patient_id,
      overallScore: overall,
    });

    return result.rows[0];
  }

  static async getBPEByChart(chartId) {
    const result = await db.query(`
      SELECT
        bpe.*,
        u.first_name || ' ' || u.last_name AS examined_by_name
      FROM dental_bpe_examinations bpe
      LEFT JOIN users u ON bpe.examined_by = u.id
      WHERE bpe.dental_chart_id = $1
      ORDER BY bpe.examination_date DESC
    `, [chartId]);
    return result.rows;
  }

  static async getBPEByPatient(patientId) {
    const result = await db.query(`
      SELECT
        bpe.*,
        u.first_name || ' ' || u.last_name AS examined_by_name,
        dc.chart_type, dc.chart_date
      FROM dental_bpe_examinations bpe
      LEFT JOIN users u ON bpe.examined_by = u.id
      LEFT JOIN dental_charts dc ON bpe.dental_chart_id = dc.id
      WHERE bpe.patient_id = $1
      ORDER BY bpe.examination_date DESC
    `, [patientId]);
    return result.rows;
  }
}

module.exports = Dental;