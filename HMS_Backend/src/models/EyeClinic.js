const db = require('../config/database');
const logger = require('../config/logger');

class EyeClinic {
  constructor(data = {}) {
    this.id = data.id;
    this.visit_id = data.visit_id;
    this.patient_id = data.patient_id;
    this.examination_date = data.examination_date;
    this.examined_by = data.examined_by;
    
    // Visual Acuity (Distance)
    this.va_distance_right_uncorrected = data.va_distance_right_uncorrected;
    this.va_distance_right_corrected = data.va_distance_right_corrected;
    this.va_distance_left_uncorrected = data.va_distance_left_uncorrected;
    this.va_distance_left_corrected = data.va_distance_left_corrected;
    this.va_distance_binocular = data.va_distance_binocular;
    
    // Visual Acuity (Near)
    this.va_near_right_uncorrected = data.va_near_right_uncorrected;
    this.va_near_right_corrected = data.va_near_right_corrected;
    this.va_near_left_uncorrected = data.va_near_left_uncorrected;
    this.va_near_left_corrected = data.va_near_left_corrected;
    this.va_near_binocular = data.va_near_binocular;
    
    // Refraction
    this.refraction_method = data.refraction_method;
    this.sphere_right = data.sphere_right;
    this.sphere_left = data.sphere_left;
    this.cylinder_right = data.cylinder_right;
    this.cylinder_left = data.cylinder_left;
    this.axis_right = data.axis_right;
    this.axis_left = data.axis_left;
    this.addition_right = data.addition_right;
    this.addition_left = data.addition_left;
    
    // Intraocular Pressure
    this.iop_right = data.iop_right;
    this.iop_left = data.iop_left;
    this.iop_method = data.iop_method;
    this.iop_time = data.iop_time;
    
    // Clinical Findings
    this.anterior_segment_right = data.anterior_segment_right;
    this.anterior_segment_left = data.anterior_segment_left;
    this.posterior_segment_right = data.posterior_segment_right;
    this.posterior_segment_left = data.posterior_segment_left;
    
    // Diagnosis
    this.diagnosis_right = data.diagnosis_right;
    this.diagnosis_left = data.diagnosis_left;
    this.diagnosis_binocular = data.diagnosis_binocular;
    
    // Treatment
    this.treatment_plan = data.treatment_plan;
    this.glasses_prescribed = data.glasses_prescribed || false;
    this.medication_prescribed = data.medication_prescribed || false;
    this.surgery_recommended = data.surgery_recommended || false;
    this.follow_up_required = data.follow_up_required || false;
    this.follow_up_period = data.follow_up_period;
    
    this.notes = data.notes;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;

    // Joined fields from list queries
    this.examiner_name   = data.examiner_name   ?? null;
    this.patient_name    = data.patient_name    ?? null;
    this.patient_number  = data.patient_number  ?? null;
  }

  // Eye Examination
  static async createExamination(examData, userId) {
    const result = await db.query(`
      INSERT INTO eye_examinations (
        visit_id, patient_id, examined_by, examination_date,
        va_distance_right_uncorrected, va_distance_right_corrected,
        va_distance_left_uncorrected, va_distance_left_corrected,
        va_distance_binocular, va_near_right_uncorrected,
        va_near_right_corrected, va_near_left_uncorrected,
        va_near_left_corrected, va_near_binocular,
        refraction_method, sphere_right, sphere_left,
        cylinder_right, cylinder_left, axis_right, axis_left,
        addition_right, addition_left, iop_right, iop_left,
        iop_method, iop_time, anterior_segment_right,
        anterior_segment_left, posterior_segment_right,
        posterior_segment_left, diagnosis_right, diagnosis_left,
        diagnosis_binocular, treatment_plan, glasses_prescribed,
        medication_prescribed, surgery_recommended,
        follow_up_required, follow_up_period, notes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
        $38, $39, $40, $41, -- 41 placeholders match columns through notes
        NOW(), NOW())
      RETURNING *
    `, [
      examData.visit_id,
      examData.patient_id,
      userId,
      examData.examination_date || new Date(),
      examData.va_distance_right_uncorrected,
      examData.va_distance_right_corrected,
      examData.va_distance_left_uncorrected,
      examData.va_distance_left_corrected,
      examData.va_distance_binocular,
      examData.va_near_right_uncorrected,
      examData.va_near_right_corrected,
      examData.va_near_left_uncorrected,
      examData.va_near_left_corrected,
      examData.va_near_binocular,
      examData.refraction_method,
      examData.sphere_right,
      examData.sphere_left,
      examData.cylinder_right,
      examData.cylinder_left,
      examData.axis_right,
      examData.axis_left,
      examData.addition_right,
      examData.addition_left,
      examData.iop_right,
      examData.iop_left,
      examData.iop_method,
      examData.iop_time,
      examData.anterior_segment_right,
      examData.anterior_segment_left,
      examData.posterior_segment_right,
      examData.posterior_segment_left,
      examData.diagnosis_right,
      examData.diagnosis_left,
      examData.diagnosis_binocular,
      examData.treatment_plan,
      examData.glasses_prescribed || false,
      examData.medication_prescribed || false,
      examData.surgery_recommended || false,
      examData.follow_up_required || false,
      examData.follow_up_period,
      examData.notes
    ]);

    logger.audit('EYE_EXAMINATION_CREATED', userId, 'eye_clinic', {
      examId: result.rows[0].id,
      patientId: examData.patient_id
    });

    return new EyeClinic(result.rows[0]);
  }

  static async findExaminationById(id) {
    const result = await db.query(`
      SELECT 
        e.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'date_of_birth', p.date_of_birth
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name,
          'specialization', u.specialization
        ) as examined_by_user,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit
      FROM eye_examinations e
      JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u ON e.examined_by = u.id
      LEFT JOIN visits v ON e.visit_id = v.id
      WHERE e.id = $1
    `, [id]);

    return result.rows[0] ? new EyeClinic(result.rows[0]) : null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(`
      SELECT 
        e.*,
        u.first_name || ' ' || u.last_name as examiner_name,
        EXTRACT(YEAR FROM AGE(e.examination_date, p.date_of_birth)) as patient_age_at_exam
      FROM eye_examinations e
      JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users u ON e.examined_by = u.id
      WHERE e.patient_id = $1
      ORDER BY e.examination_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new EyeClinic(row));
  }

  // Glasses Prescription
  static async createGlassesPrescription(prescriptionData, userId) {
    return db.transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO glasses_prescriptions (
          eye_examination_id, patient_id, prescription_date,
          prescribed_by, distance_sphere_right, distance_sphere_left,
          distance_cylinder_right, distance_cylinder_left,
          distance_axis_right, distance_axis_left,
          distance_prism_right, distance_prism_left,
          near_sphere_right, near_sphere_left,
          near_cylinder_right, near_cylinder_left,
          near_axis_right, near_axis_left,
          near_prism_right, near_prism_left,
          intermediate_sphere_right, intermediate_sphere_left,
          intermediate_cylinder_right, intermediate_cylinder_left,
          intermediate_axis_right, intermediate_axis_left,
          pupil_distance, glasses_type, lens_type, coating, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())
        RETURNING *
      `, [
        prescriptionData.eye_examination_id,
        prescriptionData.patient_id,
        prescriptionData.prescription_date || new Date(),
        userId,
        prescriptionData.distance_sphere_right,
        prescriptionData.distance_sphere_left,
        prescriptionData.distance_cylinder_right,
        prescriptionData.distance_cylinder_left,
        prescriptionData.distance_axis_right,
        prescriptionData.distance_axis_left,
        prescriptionData.distance_prism_right,
        prescriptionData.distance_prism_left,
        prescriptionData.near_sphere_right,
        prescriptionData.near_sphere_left,
        prescriptionData.near_cylinder_right,
        prescriptionData.near_cylinder_left,
        prescriptionData.near_axis_right,
        prescriptionData.near_axis_left,
        prescriptionData.near_prism_right,
        prescriptionData.near_prism_left,
        prescriptionData.intermediate_sphere_right,
        prescriptionData.intermediate_sphere_left,
        prescriptionData.intermediate_cylinder_right,
        prescriptionData.intermediate_cylinder_left,
        prescriptionData.intermediate_axis_right,
        prescriptionData.intermediate_axis_left,
        prescriptionData.pupil_distance,
        prescriptionData.glasses_type,
        prescriptionData.lens_type,
        prescriptionData.coating,
        prescriptionData.notes
      ]);

      // Update examination to mark glasses as prescribed
      if (prescriptionData.eye_examination_id) {
        await client.query(`
          UPDATE eye_examinations 
          SET glasses_prescribed = true
          WHERE id = $1
        `, [prescriptionData.eye_examination_id]);
      }

      logger.audit('GLASSES_PRESCRIPTION_CREATED', userId, 'eye_clinic', {
        prescriptionId: result.rows[0].id,
        patientId: prescriptionData.patient_id
      });

      return result.rows[0];
    });
  }

  static async findGlassesPrescriptionById(id) {
    const result = await db.query(`
      SELECT 
        gp.*,
        json_build_object(
          'id', p.id,
          'name', p.first_name || ' ' || p.last_name,
          'patient_number', p.patient_number
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as prescribed_by_user,
        json_build_object(
          'id', e.id,
          'examination_date', e.examination_date
        ) as examination
      FROM glasses_prescriptions gp
      JOIN patients p ON gp.patient_id = p.id
      LEFT JOIN users u ON gp.prescribed_by = u.id
      LEFT JOIN eye_examinations e ON gp.eye_examination_id = e.id
      WHERE gp.id = $1
    `, [id]);

    return result.rows[0];
  }

  static async getPatientPrescriptions(patientId, limit = 10) {
    const result = await db.query(`
      SELECT *
      FROM glasses_prescriptions
      WHERE patient_id = $1
      ORDER BY prescription_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows;
  }

  async markAsDispensed(userId) {
    const result = await db.query(`
      UPDATE glasses_prescriptions 
      SET 
        is_dispensed = true,
        dispensed_by = $1,
        dispensed_date = NOW(),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Optical Inventory
  static async addOpticalItem(itemData) {
    try {
      const result = await db.query(`
        INSERT INTO optical_inventory (
          facility_id, item_type, item_code, item_name,
          brand, model, color, size, material,
          quantity_on_hand, unit_cost, selling_price,
          supplier_id, reorder_level, location, is_active,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *
      `, [
        itemData.facility_id,
        itemData.item_type,
        itemData.item_code,
        itemData.item_name,
        itemData.brand,
        itemData.model,
        itemData.color,
        itemData.size,
        itemData.material,
        itemData.quantity_on_hand || 0,
        itemData.unit_cost,
        itemData.selling_price,
        itemData.supplier_id,
        itemData.reorder_level,
        itemData.location,
        itemData.is_active !== false
      ]);

      return result.rows[0];
    } catch (err) {
      if (err.code === '23502' && err.message.includes('item_code')) {
        err.message += ' - item_code is required in the request body';
      }
      throw err;
    }
  }

  static async getOpticalInventory(facilityId, filters = {}) {
    const {
      item_type,
      low_stock_only,
      search
    } = filters;

    let conditions = ['facility_id = $1'];
    let params = [facilityId];
    let paramIndex = 2;

    if (item_type) {
      conditions.push(`item_type = $${paramIndex}`);
      params.push(item_type);
      paramIndex++;
    }

    if (low_stock_only) {
      conditions.push(`quantity_on_hand <= reorder_level`);
    }

    if (search) {
      conditions.push(`(
        item_name ILIKE $${paramIndex} OR
        item_code ILIKE $${paramIndex} OR
        brand ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(`
      SELECT *
      FROM optical_inventory
      WHERE ${whereClause}
      ORDER BY item_type, item_name
    `, params);

    return result.rows;
  }

  // Clinical Calculations
  calculateSphericalEquivalent() {
    return {
      right: this.sphere_right + (this.cylinder_right / 2),
      left: this.sphere_left + (this.cylinder_left / 2)
    };
  }

  calculateVisualAcuityScore() {
    const convertToDecimal = (va) => {
      if (!va) return null;
      // Convert various formats to decimal
      if (va.includes('/')) {
        const [num, denom] = va.split('/').map(Number);
        return num / denom;
      }
      return parseFloat(va);
    };

    return {
      right_uncorrected: convertToDecimal(this.va_distance_right_uncorrected),
      right_corrected: convertToDecimal(this.va_distance_right_corrected),
      left_uncorrected: convertToDecimal(this.va_distance_left_uncorrected),
      left_corrected: convertToDecimal(this.va_distance_left_corrected)
    };
  }

  // Reports
  static async getExaminationStats(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_exams,
        COUNT(CASE WHEN glasses_prescribed THEN 1 END) as glasses_prescribed,
        COUNT(CASE WHEN surgery_recommended THEN 1 END) as surgery_recommended,
        AVG(iop_right) as avg_iop_right,
        AVG(iop_left) as avg_iop_left,
        COUNT(DISTINCT v.patient_id) as unique_patients
      FROM eye_examinations e
      JOIN visits v ON e.visit_id = v.id
      WHERE v.facility_id = $1
        AND e.examination_date BETWEEN $2 AND $3
    `, [facilityId, startDate, endDate]);

    return result.rows[0];
  }

  static async getCommonDiagnoses(facilityId, limit = 10) {
    // PostgreSQL can complain about ambiguous references when using UNNEST on
    // table columns inside an ARRAY, so rewrite using UNION ALL which is more
    // robust and matches how similar reports are generated elsewhere.
    const result = await db.query(`
      SELECT diagnosis, COUNT(*) as count
      FROM (
        SELECT e.diagnosis_right as diagnosis, v.facility_id
        FROM eye_examinations e
        JOIN visits v ON e.visit_id = v.id
        WHERE e.diagnosis_right IS NOT NULL
        UNION ALL
        SELECT e.diagnosis_left as diagnosis, v.facility_id
        FROM eye_examinations e
        JOIN visits v ON e.visit_id = v.id
        WHERE e.diagnosis_left IS NOT NULL
        UNION ALL
        SELECT e.diagnosis_binocular as diagnosis, v.facility_id
        FROM eye_examinations e
        JOIN visits v ON e.visit_id = v.id
        WHERE e.diagnosis_binocular IS NOT NULL
      ) d
      WHERE d.facility_id = $1
      GROUP BY diagnosis
      ORDER BY count DESC
      LIMIT $2
    `, [facilityId, limit]);

    return result.rows;
  }

  // Visual Field Tests (if needed)
  static async createVisualFieldTest(testData, userId) {
    try {
      const result = await db.query(`
        INSERT INTO visual_field_tests (
          patient_id, eye_examination_id, test_date, eye,
          mean_deviation, pattern_standard_deviation,
          visual_field_index, test_duration, reliability,
          defects, notes, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `, [
        testData.patient_id,
        testData.eye_examination_id,
        testData.test_date || new Date(),
        testData.eye,
        testData.mean_deviation,
        testData.pattern_standard_deviation,
        testData.visual_field_index,
        testData.test_duration,
        testData.reliability,
        testData.defects,
        testData.notes,
        userId
      ]);

      return result.rows[0];
    } catch (err) {
      if (err.code === '42P01' && err.message.includes('visual_field_tests')) {
        err.message +=
          ' - please ensure the table exists (see migrations/0004_create_visual_field_tests_table.sql)';
      }
      throw err;
    }
  }

  toJSON() {
    return {
      id: this.id,
      examination_date: this.examination_date,
      visual_acuity: {
        distance: {
          right_uncorrected: this.va_distance_right_uncorrected,
          right_corrected: this.va_distance_right_corrected,
          left_uncorrected: this.va_distance_left_uncorrected,
          left_corrected: this.va_distance_left_corrected,
          binocular: this.va_distance_binocular
        },
        near: {
          right_uncorrected: this.va_near_right_uncorrected,
          right_corrected: this.va_near_right_corrected,
          left_uncorrected: this.va_near_left_uncorrected,
          left_corrected: this.va_near_left_corrected,
          binocular: this.va_near_binocular
        }
      },
      refraction: {
        sphere: { right: this.sphere_right, left: this.sphere_left },
        cylinder: { right: this.cylinder_right, left: this.cylinder_left },
        axis: { right: this.axis_right, left: this.axis_left },
        addition: { right: this.addition_right, left: this.addition_left }
      },
      iop: {
        right: this.iop_right,
        left: this.iop_left,
        method: this.iop_method
      },
      diagnosis: {
        right: this.diagnosis_right,
        left: this.diagnosis_left,
        binocular: this.diagnosis_binocular
      },
      treatment_plan: this.treatment_plan,
      glasses_prescribed: this.glasses_prescribed,
      follow_up_required: this.follow_up_required,
      notes: this.notes
    };
  }
}

module.exports = EyeClinic;