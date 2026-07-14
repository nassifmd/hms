const db = require('../config/database');
const { generatePatientNumber } = require('../utils/generators');
const logger = require('../config/logger');

class Patient {
  constructor(data = {}) {
    this.id = data.id;
    this.patient_number = data.patient_number;
    this.ghs_unique_identifier = data.ghs_unique_identifier;
    this.nhis_number = data.nhis_number;
    this.nhis_expiry_date = data.nhis_expiry_date;
    this.title = data.title;
    this.first_name = data.first_name;
    this.middle_name = data.middle_name;
    this.last_name = data.last_name;
    this.date_of_birth = data.date_of_birth;
    this.gender = data.gender;
    this.blood_group = data.blood_group;
    this.genotype = data.genotype;
    this.marital_status = data.marital_status;
    this.occupation = data.occupation;
    this.employer_name = data.employer_name;
    this.employer_address = data.employer_address;
    this.nationality = data.nationality || 'Ghanaian';
    this.region_of_origin = data.region_of_origin;
    this.district_of_origin = data.district_of_origin;
    this.hometown = data.hometown;
    this.tribe = data.tribe;
    this.religion = data.religion;
    this.email = data.email;
    this.phone_number = data.phone_number;
    this.alternate_phone = data.alternate_phone;
    this.address_line1 = data.address_line1;
    this.address_line2 = data.address_line2;
    this.city = data.city;
    this.district = data.district;
    this.region = data.region;
    this.postal_code = data.postal_code;
    this.digital_address = data.digital_address;
    this.emergency_contact_name = data.emergency_contact_name;
    this.emergency_contact_phone = data.emergency_contact_phone;
    this.emergency_contact_relationship = data.emergency_contact_relationship;
    this.emergency_contact_address = data.emergency_contact_address;
    this.registration_date = data.registration_date;
    this.registered_by = data.registered_by;
    this.patient_photo_url = data.patient_photo_url;
    this.id_type = data.id_type;
    this.id_number = data.id_number;
    this.id_issue_date = data.id_issue_date;
    this.id_expiry_date = data.id_expiry_date;
    this.id_document_url = data.id_document_url;
    this.allergies = data.allergies;
    this.chronic_conditions = data.chronic_conditions;
    this.current_medications = data.current_medications;
    this.surgical_history = data.surgical_history;
    this.family_history = data.family_history;
    this.social_history = data.social_history;
    this.registration_fee_paid = data.registration_fee_paid || false;
    this.is_active = data.is_active !== false;
    this.patient_status = data.patient_status || 'Active';
    this.deceased_date = data.deceased_date;
    this.cause_of_death = data.cause_of_death;
    this.last_visit_date = data.last_visit_date; // may be undefined if column not present in older DBs
    this.facility_id = data.facility_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  static async create(patientData, userId, facilityId) {
    return db.transaction(async (client) => {
      // Generate patient number
      const patientNumber = await generatePatientNumber(client, facilityId);

      const result = await client.query(`
        INSERT INTO patients (
          patient_number, facility_id, title, first_name, middle_name,
          last_name, date_of_birth, gender, blood_group, genotype,
          marital_status, occupation, employer_name, employer_address,
          nationality, region_of_origin, district_of_origin, hometown,
          tribe, religion, email, phone_number, alternate_phone,
          address_line1, address_line2, city, district, region,
          postal_code, digital_address, emergency_contact_name,
          emergency_contact_phone, emergency_contact_relationship,
          emergency_contact_address, nhis_number, nhis_expiry_date,
          allergies, chronic_conditions, current_medications,
          surgical_history, family_history, social_history,
          registered_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
          $37, $38, $39, $40, $41, $42, $43, NOW(), NOW()
        ) RETURNING *
      `, [
        patientNumber, facilityId, patientData.title,
        patientData.first_name, patientData.middle_name,
        patientData.last_name, patientData.date_of_birth,
        patientData.gender, patientData.blood_group, patientData.genotype,
        patientData.marital_status, patientData.occupation,
        patientData.employer_name, patientData.employer_address,
        patientData.nationality, patientData.region_of_origin,
        patientData.district_of_origin, patientData.hometown,
        patientData.tribe, patientData.religion, patientData.email,
        patientData.phone_number, patientData.alternate_phone,
        patientData.address_line1, patientData.address_line2,
        patientData.city, patientData.district, patientData.region,
        patientData.postal_code, patientData.digital_address,
        patientData.emergency_contact_name,
        patientData.emergency_contact_phone,
        patientData.emergency_contact_relationship,
        patientData.emergency_contact_address,
        patientData.nhis_number, patientData.nhis_expiry_date,
        patientData.allergies, patientData.chronic_conditions,
        patientData.current_medications, patientData.surgical_history,
        patientData.family_history, patientData.social_history,
        userId
      ]);

      // Insert next of kin if provided
      if (patientData.next_of_kin && patientData.next_of_kin.length > 0) {
        for (const kin of patientData.next_of_kin) {
          await client.query(`
            INSERT INTO patient_next_of_kin (
              patient_id, name, relationship, phone_number,
              email, address, is_primary
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            result.rows[0].id, kin.name, kin.relationship,
            kin.phone_number, kin.email, kin.address,
            kin.is_primary || false
          ]);
        }
      }

      logger.audit('PATIENT_CREATED', userId, 'patient', {
        patientId: result.rows[0].id,
        patientNumber: result.rows[0].patient_number
      });

      return new Patient(result.rows[0]);
    });
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        p.*,
        json_build_object(
          'id', f.id,
          'name', f.facility_name,
          'code', f.facility_code
        ) as facility,
        (
          SELECT json_agg(
            json_build_object(
              'id', nok.id,
              'name', nok.name,
              'relationship', nok.relationship,
              'phone', nok.phone_number,
              'email', nok.email,
              'address', nok.address,
              'is_primary', nok.is_primary
            )
          )
          FROM patient_next_of_kin nok
          WHERE nok.patient_id = p.id
        ) as next_of_kin,
        (
          SELECT json_agg(
            json_build_object(
              'id', pi.id,
              'provider', pi.insurance_provider,
              'policy_number', pi.policy_number,
              'type', pi.insurance_type,
              'plan', pi.plan_name,
              'start_date', pi.start_date,
              'expiry_date', pi.expiry_date,
              'is_active', pi.is_active,
              'is_verified', pi.is_verified
            )
          )
          FROM patient_insurance pi
          WHERE pi.patient_id = p.id
        ) as insurance,
        (
          SELECT json_build_object(
            'id', u.id,
            'name', u.first_name || ' ' || u.last_name,
            'employee_id', u.employee_id
          )
          FROM users u
          WHERE u.id = p.registered_by
        ) as registered_by_user
      FROM patients p
      LEFT JOIN facilities f ON p.facility_id = f.id
      WHERE p.id = $1
    `, [id]);

    return result.rows[0] ? new Patient(result.rows[0]) : null;
  }

  static async findByPatientNumber(patientNumber) {
    const result = await db.query(
      `SELECT id, patient_number, ghs_unique_identifier, nhis_number, nhis_expiry_date,
        title, first_name, middle_name, last_name, date_of_birth, gender,
        blood_group, genotype, marital_status, occupation, employer_name,
        employer_address, nationality, region_of_origin, district_of_origin,
        hometown, tribe, religion, email, phone_number, alternate_phone,
        address_line1, address_line2, city, district, region, postal_code,
        digital_address, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship, emergency_contact_address,
        registration_date, registered_by, patient_photo_url, id_type, id_number,
        id_issue_date, id_expiry_date, id_document_url, allergies,
        chronic_conditions, current_medications, surgical_history, family_history,
        social_history, registration_fee_paid, is_active, patient_status,
        deceased_date, cause_of_death, last_visit_date, facility_id,
        created_at, updated_at, created_by, updated_by
      FROM patients WHERE patient_number = $1`,
      [patientNumber]
    );
    return result.rows[0] ? new Patient(result.rows[0]) : null;
  }

  static async findByPhone(phone) {
    const result = await db.query(
      'SELECT * FROM patients WHERE phone_number = $1 OR alternate_phone = $1',
      [phone]
    );
    return result.rows[0] ? new Patient(result.rows[0]) : null;
  }

  static async findByNHIS(nhisNumber) {
    const result = await db.query(
      'SELECT * FROM patients WHERE nhis_number = $1',
      [nhisNumber]
    );
    return result.rows[0] ? new Patient(result.rows[0]) : null;
  }

  static async findAll(filters = {}, pagination = {}) {
    const {
      search,
      gender,
      blood_group,
      status,
      facility_id,
      from_date,
      to_date,
      age_min,
      age_max
    } = filters;

    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        p.first_name ILIKE $${paramIndex} OR 
        p.last_name ILIKE $${paramIndex} OR 
        p.patient_number ILIKE $${paramIndex} OR
        p.phone_number ILIKE $${paramIndex} OR
        p.nhis_number ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (gender) {
      conditions.push(`p.gender = $${paramIndex}`);
      params.push(gender);
      paramIndex++;
    }

    if (blood_group) {
      conditions.push(`p.blood_group = $${paramIndex}`);
      params.push(blood_group);
      paramIndex++;
    }

    if (status) {
      conditions.push(`p.patient_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (facility_id) {
      conditions.push(`p.facility_id = $${paramIndex}`);
      params.push(facility_id);
      paramIndex++;
    }

    if (from_date) {
      conditions.push(`p.created_at >= $${paramIndex}`);
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      conditions.push(`p.created_at <= $${paramIndex}`);
      params.push(to_date);
      paramIndex++;
    }

    if (age_min || age_max) {
      const ageCondition = [];
      if (age_min) {
        ageCondition.push(`EXTRACT(YEAR FROM AGE(p.date_of_birth)) >= $${paramIndex}`);
        params.push(age_min);
        paramIndex++;
      }
      if (age_max) {
        ageCondition.push(`EXTRACT(YEAR FROM AGE(p.date_of_birth)) <= $${paramIndex}`);
        params.push(age_max);
        paramIndex++;
      }
      conditions.push(`(${ageCondition.join(' AND ')})`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM patients p
      WHERE ${whereClause}
    `, params);

    const result = await db.query(`
      SELECT 
        p.id, p.patient_number, p.ghs_unique_identifier, p.nhis_number,
        p.nhis_expiry_date, p.title, p.first_name, p.middle_name, p.last_name,
        p.date_of_birth, p.gender, p.blood_group, p.genotype, p.marital_status,
        p.occupation, p.employer_name, p.employer_address, p.nationality,
        p.region_of_origin, p.district_of_origin, p.hometown, p.tribe, p.religion,
        p.email, p.phone_number, p.alternate_phone, p.address_line1, p.address_line2,
        p.city, p.district, p.region, p.postal_code, p.digital_address,
        p.emergency_contact_name, p.emergency_contact_phone,
        p.emergency_contact_relationship, p.emergency_contact_address,
        p.registration_date, p.registered_by, p.patient_photo_url, p.id_type,
        p.id_number, p.id_issue_date, p.id_expiry_date, p.id_document_url,
        p.allergies, p.chronic_conditions, p.current_medications,
        p.surgical_history, p.family_history, p.social_history,
        p.registration_fee_paid, p.is_active, p.patient_status,
        p.deceased_date, p.cause_of_death, p.last_visit_date, p.facility_id,
        p.created_at, p.updated_at, p.created_by, p.updated_by,
        json_build_object(
          'id', f.id,
          'name', f.facility_name
        ) as facility,
        (
          SELECT json_agg(
            json_build_object(
              'name', nok.name,
              'relationship', nok.relationship,
              'phone', nok.phone_number,
              'is_primary', nok.is_primary
            )
          )
          FROM patient_next_of_kin nok
          WHERE nok.patient_id = p.id AND nok.is_primary = true
          LIMIT 1
        ) as primary_contact
      FROM patients p
      LEFT JOIN facilities f ON p.facility_id = f.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      patients: result.rows.map(row => new Patient(row)),
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countResult.rows[0].total / limit)
    };
  }

  static async search(query, facilityId = null) {
    let sql = `
      SELECT 
        id, patient_number, first_name, last_name, date_of_birth,
        gender, phone_number, nhis_number
      FROM patients
      WHERE 
        patient_number ILIKE $1 OR
        first_name ILIKE $1 OR
        last_name ILIKE $1 OR
        phone_number ILIKE $1 OR
        nhis_number ILIKE $1
    `;
    
    const params = [`%${query}%`];
    
    if (facilityId) {
      sql += ` AND facility_id = $2`;
      params.push(facilityId);
    }
    
    sql += ` LIMIT 20`;

    const result = await db.query(sql, params);
    return result.rows.map(row => new Patient(row));
  }

  async update(updateData, userId) {
    const result = await db.query(`
      UPDATE patients 
      SET 
        title = COALESCE($1, title),
        first_name = COALESCE($2, first_name),
        middle_name = COALESCE($3, middle_name),
        last_name = COALESCE($4, last_name),
        date_of_birth = COALESCE($5, date_of_birth),
        gender = COALESCE($6, gender),
        blood_group = COALESCE($7, blood_group),
        genotype = COALESCE($8, genotype),
        marital_status = COALESCE($9, marital_status),
        occupation = COALESCE($10, occupation),
        employer_name = COALESCE($11, employer_name),
        employer_address = COALESCE($12, employer_address),
        email = COALESCE($13, email),
        phone_number = COALESCE($14, phone_number),
        alternate_phone = COALESCE($15, alternate_phone),
        address_line1 = COALESCE($16, address_line1),
        address_line2 = COALESCE($17, address_line2),
        city = COALESCE($18, city),
        district = COALESCE($19, district),
        region = COALESCE($20, region),
        postal_code = COALESCE($21, postal_code),
        digital_address = COALESCE($22, digital_address),
        nhis_number = COALESCE($23, nhis_number),
        nhis_expiry_date = COALESCE($24, nhis_expiry_date),
        emergency_contact_name = COALESCE($25, emergency_contact_name),
        emergency_contact_phone = COALESCE($26, emergency_contact_phone),
        emergency_contact_relationship = COALESCE($27, emergency_contact_relationship),
        allergies = COALESCE($28, allergies),
        chronic_conditions = COALESCE($29, chronic_conditions),
        current_medications = COALESCE($30, current_medications),
        surgical_history = COALESCE($31, surgical_history),
        family_history = COALESCE($32, family_history),
        social_history = COALESCE($33, social_history),
        patient_status = COALESCE($34, patient_status),
        patient_photo_url = COALESCE($35, patient_photo_url),
        updated_at = NOW(),
        updated_by = $36
      WHERE id = $37
      RETURNING *
    `, [
      updateData.title, updateData.first_name, updateData.middle_name,
      updateData.last_name, updateData.date_of_birth, updateData.gender,
      updateData.blood_group, updateData.genotype, updateData.marital_status,
      updateData.occupation, updateData.employer_name, updateData.employer_address,
      updateData.email, updateData.phone_number, updateData.alternate_phone,
      updateData.address_line1, updateData.address_line2, updateData.city,
      updateData.district, updateData.region, updateData.postal_code,
      updateData.digital_address, updateData.nhis_number,
      updateData.nhis_expiry_date, updateData.emergency_contact_name,
      updateData.emergency_contact_phone, updateData.emergency_contact_relationship,
      updateData.allergies, updateData.chronic_conditions,
      updateData.current_medications, updateData.surgical_history,
      updateData.family_history, updateData.social_history,
      updateData.patient_status, updateData.patient_photo_url,
      userId, this.id
    ]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async addNextOfKin(kinData) {
    const result = await db.query(`
      INSERT INTO patient_next_of_kin (
        patient_id, name, relationship, phone_number,
        email, address, is_primary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      this.id, kinData.name, kinData.relationship,
      kinData.phone_number, kinData.email, kinData.address,
      kinData.is_primary || false
    ]);

    return result.rows[0];
  }

  async updateNextOfKin(kinId, kinData) {
    const result = await db.query(`
      UPDATE patient_next_of_kin 
      SET 
        name = COALESCE($1, name),
        relationship = COALESCE($2, relationship),
        phone_number = COALESCE($3, phone_number),
        email = COALESCE($4, email),
        address = COALESCE($5, address),
        is_primary = COALESCE($6, is_primary)
      WHERE id = $7 AND patient_id = $8
      RETURNING *
    `, [
      kinData.name, kinData.relationship, kinData.phone_number,
      kinData.email, kinData.address, kinData.is_primary,
      kinId, this.id
    ]);

    return result.rows[0];
  }

  async deleteNextOfKin(kinId) {
    await db.query(`
      DELETE FROM patient_next_of_kin
      WHERE id = $1 AND patient_id = $2
    `, [kinId, this.id]);
  }

  async addInsurance(insuranceData) {
    const result = await db.query(`
      INSERT INTO patient_insurance (
        patient_id, insurance_provider, policy_number,
        insurance_type, plan_name, start_date, expiry_date,
        is_active, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      this.id, insuranceData.provider, insuranceData.policy_number,
      insuranceData.type, insuranceData.plan_name,
      insuranceData.start_date, insuranceData.expiry_date,
      insuranceData.is_active !== false,
      insuranceData.is_verified || false
    ]);

    return result.rows[0];
  }

  async updateInsurance(insuranceId, insuranceData) {
    const result = await db.query(`
      UPDATE patient_insurance 
      SET 
        insurance_provider = COALESCE($1, insurance_provider),
        policy_number = COALESCE($2, policy_number),
        insurance_type = COALESCE($3, insurance_type),
        plan_name = COALESCE($4, plan_name),
        start_date = COALESCE($5, start_date),
        expiry_date = COALESCE($6, expiry_date),
        is_active = COALESCE($7, is_active),
        is_verified = COALESCE($8, is_verified)
      WHERE id = $9 AND patient_id = $10
      RETURNING *
    `, [
      insuranceData.provider, insuranceData.policy_number,
      insuranceData.type, insuranceData.plan_name,
      insuranceData.start_date, insuranceData.expiry_date,
      insuranceData.is_active, insuranceData.is_verified,
      insuranceId, this.id
    ]);

    return result.rows[0];
  }

  async addVital(vitalData, userId) {
    // Calculate BMI if not provided
    let bmi = vitalData.bmi;
    if (!bmi && vitalData.height_cm && vitalData.weight_kg) {
      bmi = vitalData.weight_kg / Math.pow(vitalData.height_cm / 100, 2);
      bmi = Math.round(bmi * 100) / 100;
    }

    const result = await db.query(`
      INSERT INTO patient_vitals (
        patient_id, visit_id, recorded_by, height_cm, weight_kg,
        bmi, temperature_celsius, systolic_bp, diastolic_bp,
        heart_rate, respiratory_rate, oxygen_saturation,
        blood_glucose, pain_scale, notes, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING *
    `, [
      this.id, vitalData.visit_id, userId, vitalData.height_cm,
      vitalData.weight_kg, bmi, vitalData.temperature_celsius,
      vitalData.systolic_bp, vitalData.diastolic_bp, vitalData.heart_rate,
      vitalData.respiratory_rate, vitalData.oxygen_saturation,
      vitalData.blood_glucose, vitalData.pain_scale, vitalData.notes
    ]);

    return result.rows[0];
  }

  async getVitals(limit = 20) {
    const result = await db.query(`
      SELECT 
        pv.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as recorded_by_user,
        CASE 
          WHEN pv.visit_id IS NOT NULL THEN (
            SELECT json_build_object(
              'id', v.id,
              'visit_number', v.visit_number,
              'visit_date', v.visit_date
            )
            FROM visits v
            WHERE v.id = pv.visit_id
          )
          ELSE NULL
        END as visit
      FROM patient_vitals pv
      LEFT JOIN users u ON pv.recorded_by = u.id
      WHERE pv.patient_id = $1
      ORDER BY pv.recorded_at DESC
      LIMIT $2
    `, [this.id, limit]);

    return result.rows;
  }

  async getVisits(limit = 10) {
    const result = await db.query(`
      SELECT 
        v.*,
        json_build_object(
          'id', d.id,
          'name', d.department_name,
          'code', d.department_code
        ) as department,
        (
          SELECT json_agg(
            json_build_object(
              'id', di.id,
              'code', di.diagnosis_code,
              'name', di.diagnosis_name,
              'type', di.diagnosis_type
            )
          )
          FROM diagnoses di
          WHERE di.visit_id = v.id
        ) as diagnoses,
        (
          SELECT json_agg(
            json_build_object(
              'id', pr.id,
              'prescription_number', pr.prescription_number
            )
          )
          FROM prescriptions pr
          WHERE pr.visit_id = v.id
        ) as prescriptions
      FROM visits v
      LEFT JOIN departments d ON v.department_id = d.id
      WHERE v.patient_id = $1
      ORDER BY v.visit_date DESC
      LIMIT $2
    `, [this.id, limit]);

    return result.rows;
  }

  async getAppointments(limit = 10, includePast = true) {
    const query = `
      SELECT 
        a.*,
        json_build_object(
          'id', d.id,
          'name', d.department_name
        ) as department,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name,
          'specialization', u.specialization
        ) as doctor
      FROM appointments a
      JOIN departments d ON a.department_id = d.id
      JOIN users u ON a.doctor_id = u.id
      WHERE a.patient_id = $1
      ${includePast ? '' : "AND a.appointment_date >= CURRENT_DATE"}
      ORDER BY a.appointment_date DESC, a.start_time DESC
      LIMIT $2
    `;

    const result = await db.query(query, [this.id, limit]);
    return result.rows;
  }

  async getPrescriptions(limit = 10) {
    const result = await db.query(`
      SELECT 
        p.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as prescribed_by_user,
        (
          SELECT json_agg(
            json_build_object(
              'id', pi.id,
              'medication_name', pi.medication_name,
              'dosage', pi.dosage,
              'frequency', pi.frequency,
              'quantity', pi.quantity
            )
          )
          FROM prescription_items pi
          WHERE pi.prescription_id = p.id
        ) as items
      FROM prescriptions p
      LEFT JOIN users u ON p.prescribed_by = u.id
      WHERE p.patient_id = $1
      ORDER BY p.prescription_date DESC
      LIMIT $2
    `, [this.id, limit]);

    return result.rows;
  }

  async getLabOrders(limit = 10) {
    const result = await db.query(`
      SELECT 
        lo.*,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as ordered_by_user,
        (
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
        ) as items
      FROM lab_orders lo
      LEFT JOIN users u ON lo.ordered_by = u.id
      WHERE lo.patient_id = $1
      ORDER BY lo.order_date DESC
      LIMIT $2
    `, [this.id, limit]);

    return result.rows;
  }

  async getBills(limit = 10) {
    const result = await db.query(`
      SELECT *
      FROM invoices
      WHERE patient_id = $1
      ORDER BY invoice_date DESC
      LIMIT $2
    `, [this.id, limit]);

    return result.rows;
  }

  async getOutstandingBalance() {
    const result = await db.query(`
      SELECT COALESCE(SUM(balance_due), 0) as outstanding
      FROM invoices
      WHERE patient_id = $1
        AND balance_due > 0
        AND voided = false
    `, [this.id]);

    return parseFloat(result.rows[0].outstanding);
  }

  async getNHISStatus() {
    if (!this.nhis_number) {
      return { active: false, reason: 'No NHIS number' };
    }

    const now = new Date();
    const expiry = new Date(this.nhis_expiry_date);

    return {
      active: expiry > now,
      nhis_number: this.nhis_number,
      expiry_date: this.nhis_expiry_date,
      days_until_expiry: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
    };
  }

  async getDemographics() {
    return {
      age: this.date_of_birth ? 
        Math.floor((new Date() - new Date(this.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : null,
      gender: this.gender,
      region: this.region,
      district: this.district,
      marital_status: this.marital_status,
      occupation: this.occupation
    };
  }

  toJSON() {
    return {
      id: this.id,
      patient_number: this.patient_number,
      ghs_unique_identifier: this.ghs_unique_identifier,
      nhis_number: this.nhis_number,
      nhis_expiry_date: this.nhis_expiry_date,
      title: this.title,
      first_name: this.first_name,
      middle_name: this.middle_name,
      last_name: this.last_name,
      full_name: `${this.title || ''} ${this.first_name} ${this.last_name}`.trim(),
      date_of_birth: this.date_of_birth,
      gender: this.gender,
      blood_group: this.blood_group,
      genotype: this.genotype,
      marital_status: this.marital_status,
      occupation: this.occupation,
      employer_name: this.employer_name,
      nationality: this.nationality,
      region_of_origin: this.region_of_origin,
      district_of_origin: this.district_of_origin,
      hometown: this.hometown,
      tribe: this.tribe,
      religion: this.religion,
      age: this.date_of_birth ? 
        Math.floor((new Date() - new Date(this.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : null,
      phone_number: this.phone_number,
      alternate_phone: this.alternate_phone,
      email: this.email,
      id_type: this.id_type,
      id_number: this.id_number,
      allergies: this.allergies,
      chronic_conditions: this.chronic_conditions,
      current_medications: this.current_medications,
      surgical_history: this.surgical_history,
      family_history: this.family_history,
      social_history: this.social_history,
      address: {
        line1: this.address_line1,
        line2: this.address_line2,
        city: this.city,
        district: this.district,
        region: this.region,
        digital: this.digital_address
      },
      address_line1: this.address_line1,
      address_line2: this.address_line2,
      city: this.city,
      district: this.district,
      region: this.region,
      postal_code: this.postal_code,
      digital_address: this.digital_address,
      emergency_contact_name: this.emergency_contact_name,
      emergency_contact_phone: this.emergency_contact_phone,
      emergency_contact_relationship: this.emergency_contact_relationship,
      emergency_contact_address: this.emergency_contact_address,
      emergency_contact: {
        name: this.emergency_contact_name,
        phone: this.emergency_contact_phone,
        relationship: this.emergency_contact_relationship
      },
      facility_id: this.facility_id,
      patient_status: this.patient_status,
      status: this.patient_status,
      is_active: this.is_active,
      registration_date: this.registration_date,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  // ── Admin: Soft-delete (deactivate) a patient ──
  static async deactivate(id, userId) {
    const result = await db.query(
      `UPDATE patients SET patient_status = 'Inactive', updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING id`,
      [userId, id]
    );
    return result.rows[0] || null;
  }

  // Static dashboard methods
  static async getDashboardStats(facilityId) {
    const result = await db.query(`
      WITH stats AS (
        SELECT 
          COUNT(*) as total_patients,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_patients_30d,
          COUNT(CASE WHEN gender = 'Male' THEN 1 END) as male_count,
          COUNT(CASE WHEN gender = 'Female' THEN 1 END) as female_count,
          COUNT(CASE WHEN nhis_number IS NOT NULL AND nhis_number <> '' THEN 1 END) as nhis_count,
          AVG(EXTRACT(YEAR FROM AGE(date_of_birth))) as avg_age
        FROM patients
        WHERE facility_id = $1 AND is_active = true
      ),
      age_groups AS (
        SELECT 
          CASE 
            WHEN AGE(date_of_birth) < INTERVAL '18 years' THEN '0-17'
            WHEN AGE(date_of_birth) < INTERVAL '35 years' THEN '18-34'
            WHEN AGE(date_of_birth) < INTERVAL '50 years' THEN '35-49'
            WHEN AGE(date_of_birth) < INTERVAL '65 years' THEN '50-64'
            ELSE '65+'
          END as age_group,
          COUNT(*) as count
        FROM patients
        WHERE facility_id = $1 AND is_active = true
        GROUP BY age_group
      ),
      blood_groups AS (
        SELECT 
          blood_group,
          COUNT(*) as count
        FROM patients
        WHERE facility_id = $1 AND is_active = true AND blood_group IS NOT NULL
        GROUP BY blood_group
      )
      SELECT 
        (SELECT row_to_json(stats) FROM stats) as stats,
        (SELECT json_agg(age_groups) FROM age_groups) as age_distribution,
        (SELECT json_agg(blood_groups) FROM blood_groups) as blood_group_distribution
    `, [facilityId]);

    return result.rows[0];
  }
}

module.exports = Patient;