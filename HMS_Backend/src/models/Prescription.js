const db = require('../config/database');
const logger = require('../config/logger');

class Prescription {
  constructor(data = {}) {
    this.id = data.id;
    this.prescription_number = data.prescription_number;
    this.visit_id = data.visit_id;
    this.patient_id = data.patient_id;
    this.prescribed_by = data.prescribed_by;
    this.prescription_date = data.prescription_date;
    this.diagnosis_id = data.diagnosis_id;
    this.notes = data.notes;
    this.is_dispensed = data.is_dispensed || false;
    this.status = data.is_dispensed ? 'Dispensed' : 'Pending';
    this.dispensed_by = data.dispensed_by;
    this.dispensed_date = data.dispensed_date;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.items = data.items || [];
    // Joined fields from queries
    this.patient_name = data.patient_name || null;
    this.patient_number = data.patient_number || null;
    this.doctor_name = data.doctor_name || null;
    // Source: 'Dental' for prescriptions written from the dental module
    this.source = data.source || 'Clinical';
  }

  static async create(prescriptionData, userId) {
    return db.transaction(async (client) => {
      // Acquire advisory lock to serialize prescription number generation and prevent
      // duplicate key errors under concurrent requests (race condition with MAX()+1)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('prescription_number_seq'))`);

      // Generate prescription number
      const year = new Date().getFullYear();
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(prescription_number FROM '(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
        FROM prescriptions
        WHERE prescription_number LIKE $1
      `, [`PRESC${year}%`]);
      
      const prescriptionNumber = `PRESC${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Create prescription
      const result = await client.query(`
        INSERT INTO prescriptions (
          prescription_number, visit_id, patient_id, prescribed_by,
          diagnosis_id, notes, prescription_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `, [
        prescriptionNumber,
        prescriptionData.visit_id,
        prescriptionData.patient_id,
        userId,
        prescriptionData.diagnosis_id,
        prescriptionData.notes
      ]);

      const prescription = result.rows[0];

      // Add prescription items
      if (prescriptionData.items && prescriptionData.items.length > 0) {
        for (const item of prescriptionData.items) {
          await client.query(`
            INSERT INTO prescription_items (
              prescription_id, medication_name, dosage, frequency,
              duration, route, quantity, refills, instructions,
              is_compound, compound_instructions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            prescription.id,
            item.medication_name,
            item.dosage,
            item.frequency,
            item.duration,
            item.route,
            item.quantity,
            item.refills || 0,
            item.instructions,
            item.is_compound || false,
            item.compound_instructions
          ]);
        }
      }

      logger.audit('PRESCRIPTION_CREATED', userId, 'prescription', {
        prescriptionId: prescription.id,
        patientId: prescriptionData.patient_id,
        prescriptionNumber: prescription.prescription_number
      });

      return new Prescription(prescription);
    });
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        p.*,
        json_build_object(
          'id', v.id,
          'visit_number', v.visit_number,
          'visit_date', v.visit_date
        ) as visit,
        json_build_object(
          'id', pt.id,
          'patient_number', pt.patient_number,
          'name', pt.first_name || ' ' || pt.last_name
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name
        ) as prescribed_by_user,
        json_build_object(
          'id', d.id,
          'diagnosis_code', d.diagnosis_code,
          'diagnosis_name', d.diagnosis_name
        ) as diagnosis,
        (
          SELECT json_agg(
            json_build_object(
              'id', pi.id,
              'medication_name', pi.medication_name,
              'dosage', pi.dosage,
              'frequency', pi.frequency,
              'duration', pi.duration,
              'route', pi.route,
              'quantity', pi.quantity,
              'refills', pi.refills,
              'instructions', pi.instructions,
              'is_compound', pi.is_compound,
              'compound_instructions', pi.compound_instructions
            )
          )
          FROM prescription_items pi
          WHERE pi.prescription_id = p.id
        ) as items
      FROM prescriptions p
      JOIN visits v ON p.visit_id = v.id
      JOIN patients pt ON p.patient_id = pt.id
      LEFT JOIN users u ON p.prescribed_by = u.id
      LEFT JOIN diagnoses d ON p.diagnosis_id = d.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows[0]) {
      const prescription = new Prescription(result.rows[0]);
      prescription.items = result.rows[0].items || [];
      return prescription;
    }
    return null;
  }

  static async findByPatient(patientId, limit = 10) {
    const result = await db.query(`
      SELECT 
        p.*,
        v.visit_date,
        u.first_name || ' ' || u.last_name as doctor_name,
        (
          SELECT json_agg(
            json_build_object(
              'medication_name', pi.medication_name,
              'dosage', pi.dosage,
              'quantity', pi.quantity
            )
          )
          FROM prescription_items pi
          WHERE pi.prescription_id = p.id
        ) as items
      FROM prescriptions p
      JOIN visits v ON p.visit_id = v.id
      JOIN users u ON p.prescribed_by = u.id
      WHERE p.patient_id = $1
      ORDER BY p.prescription_date DESC
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Prescription(row));
  }

  static async getPendingDispensing(facilityId, { status, search, limit = 50 } = {}) {
    // Build filter conditions
    const params = [facilityId];
    const conditions = ['COALESCE(v.facility_id, pt.facility_id) = $1'];

    // status filter: 'Pending' → not dispensed, 'Dispensed' → dispensed, omit → all
    if (status === 'Pending') {
      conditions.push('p.is_dispensed = false');
    } else if (status === 'Dispensed') {
      conditions.push('p.is_dispensed = true');
    }

    // text search against patient name, patient number or prescription number
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(
        pt.first_name || ' ' || pt.last_name ILIKE $${idx}
        OR pt.patient_number ILIKE $${idx}
        OR p.prescription_number ILIKE $${idx}
      )`);
    }

    params.push(limit);
    const limitIdx = params.length;

    const result = await db.query(`
      SELECT 
        p.*,
        pt.first_name || ' ' || pt.last_name as patient_name,
        pt.patient_number,
        u.first_name || ' ' || u.last_name as doctor_name,
        CASE WHEN p.notes LIKE '[dental:%' THEN 'Dental' ELSE 'Clinical' END as source,
        (
          SELECT json_agg(
            json_build_object(
              'id', pi.id,
              'medication_name', pi.medication_name,
              'dosage', pi.dosage,
              'frequency', pi.frequency,
              'duration', pi.duration,
              'route', pi.route,
              'quantity', pi.quantity,
              'refills', pi.refills,
              'instructions', pi.instructions
            )
          )
          FROM prescription_items pi
          WHERE pi.prescription_id = p.id
        ) as items
      FROM prescriptions p
      JOIN patients pt ON p.patient_id = pt.id
      JOIN users u ON p.prescribed_by = u.id
      LEFT JOIN visits v ON p.visit_id = v.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.prescription_date DESC
      LIMIT $${limitIdx}
    `, params);

    return result.rows.map(row => new Prescription(row));
  }

  async dispense(dispensingData, userId) {
    return db.transaction(async (client) => {
      // Check if already dispensed
      if (this.is_dispensed) {
        throw new Error('Prescription already dispensed');
      }

      // Generate dispensing number
      const year = new Date().getFullYear();
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(dispensing_number FROM '(\d+)$') AS INTEGER)), 0) + 1 as next_seq
        FROM drug_dispensing
        WHERE dispensing_number LIKE $1
      `, [`DISP${year}%`]);
      
      const dispensingNumber = `DISP${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Create dispensing record
      await client.query(`
        INSERT INTO drug_dispensing (
          dispensing_number, prescription_id, patient_id,
          dispensed_by, notes, dispensed_date
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        dispensingNumber,
        this.id,
        this.patient_id,
        userId,
        dispensingData.notes
      ]);

      // Update prescription status
      await client.query(`
        UPDATE prescriptions 
        SET 
          is_dispensed = true,
          dispensed_by = $1,
          dispensed_date = NOW(),
          updated_at = NOW()
        WHERE id = $2
      `, [userId, this.id]);

      // Update inventory for each item
      if (dispensingData.items) {
        for (const item of dispensingData.items) {
          await client.query(`
            INSERT INTO dispensing_items (
              dispensing_id, drug_inventory_id, quantity_dispensed
            ) VALUES (
              (SELECT id FROM drug_dispensing WHERE dispensing_number = $1),
              $2, $3
            )
          `, [dispensingNumber, item.inventory_id, item.quantity]);
        }
      }

      this.is_dispensed = true;
      this.dispensed_by = userId;
      this.dispensed_date = new Date();

      logger.audit('PRESCRIPTION_DISPENSED', userId, 'prescription', {
        prescriptionId: this.id,
        dispensingNumber
      });

      return this;
    });
  }

  async addItem(itemData) {
    const result = await db.query(`
      INSERT INTO prescription_items (
        prescription_id, medication_name, dosage, frequency,
        duration, route, quantity, refills, instructions,
        is_compound, compound_instructions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      this.id,
      itemData.medication_name,
      itemData.dosage,
      itemData.frequency,
      itemData.duration,
      itemData.route,
      itemData.quantity,
      itemData.refills || 0,
      itemData.instructions,
      itemData.is_compound || false,
      itemData.compound_instructions
    ]);

    this.items.push(result.rows[0]);
    return result.rows[0];
  }

  async updateItem(itemId, itemData) {
    const result = await db.query(`
      UPDATE prescription_items 
      SET 
        medication_name = COALESCE($1, medication_name),
        dosage = COALESCE($2, dosage),
        frequency = COALESCE($3, frequency),
        duration = COALESCE($4, duration),
        route = COALESCE($5, route),
        quantity = COALESCE($6, quantity),
        refills = COALESCE($7, refills),
        instructions = COALESCE($8, instructions),
        is_compound = COALESCE($9, is_compound),
        compound_instructions = COALESCE($10, compound_instructions)
      WHERE id = $11 AND prescription_id = $12
      RETURNING *
    `, [
      itemData.medication_name,
      itemData.dosage,
      itemData.frequency,
      itemData.duration,
      itemData.route,
      itemData.quantity,
      itemData.refills,
      itemData.instructions,
      itemData.is_compound,
      itemData.compound_instructions,
      itemId,
      this.id
    ]);

    return result.rows[0];
  }

  async removeItem(itemId) {
    await db.query(`
      DELETE FROM prescription_items
      WHERE id = $1 AND prescription_id = $2
    `, [itemId, this.id]);

    this.items = this.items.filter(item => item.id !== itemId);
  }

  async getDispensingHistory() {
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
      WHERE dd.prescription_id = $1
      ORDER BY dd.dispensed_date DESC
    `, [this.id]);

    return result.rows;
  }

  static async getPrescriptionStats(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_prescriptions,
        COUNT(CASE WHEN is_dispensed THEN 1 END) as dispensed,
        COUNT(CASE WHEN NOT is_dispensed THEN 1 END) as pending,
        AVG(EXTRACT(EPOCH FROM (dispensed_date - prescription_date))/3600) as avg_dispense_hours
      FROM prescriptions p
      JOIN visits v ON p.visit_id = v.id
      WHERE v.facility_id = $1
        AND p.prescription_date BETWEEN $2 AND $3
    `, [facilityId, startDate, endDate]);

    return result.rows[0];
  }

  toJSON() {
    return {
      id: this.id,
      prescriptionNumber: this.prescription_number,
      patientId: this.patient_id,
      patientName: this.patient_name,
      patientNumber: this.patient_number,
      doctorId: this.prescribed_by,
      doctorName: this.doctor_name,
      visitId: this.visit_id,
      status: this.is_dispensed ? 'Dispensed' : 'Pending',
      notes: this.notes,
      createdAt: this.prescription_date || this.created_at,
      dispensedDate: this.dispensed_date,
      medications: (this.items || []).map(item => ({
        id: item.id,
        medicationId: item.id,
        medicationName: item.medication_name,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        dispensedQuantity: item.dispensed_quantity || undefined,
      })),
    };
  }
}

module.exports = Prescription;