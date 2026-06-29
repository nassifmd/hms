const db = require('../config/database');
const { generateAppointmentNumber } = require('../utils/generators');
const logger = require('../config/logger');

class Appointment {
  constructor(data = {}) {
    this.id = data.id;
    this.appointment_number = data.appointment_number;
    this.patient_id = data.patient_id;
    this.facility_id = data.facility_id;
    this.department_id = data.department_id;
    this.doctor_id = data.doctor_id;
    this.appointment_date = data.appointment_date;
    this.start_time = data.start_time;
    this.end_time = data.end_time;
    this.duration_minutes = data.duration_minutes;
    this.appointment_type = data.appointment_type;
    this.reason = data.reason;
    this.notes = data.notes;
    this.is_emergency = data.is_emergency || false;
    this.is_referral = data.is_referral || false;
    this.referring_doctor_id = data.referring_doctor_id;
    this.status = data.status || 'Scheduled';
    this.cancellation_reason = data.cancellation_reason;
    this.rescheduled_from = data.rescheduled_from;
    this.checked_in_time = data.checked_in_time;
    this.checked_in_by = data.checked_in_by;
    this.checked_out_time = data.checked_out_time;
    this.checked_out_by = data.checked_out_by;
    this.visit_id = data.visit_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
    // joined fields
    this.patient_name = data.patient_name;
    this.patient_number = data.patient_number;
    this.doctor_name = data.doctor_name;
  }

  static async create(appointmentData, userId) {
    return db.transaction(async (client) => {
      // Check doctor availability
      const conflicting = await client.query(`
        SELECT id FROM appointments
        WHERE doctor_id = $1
          AND appointment_date = $2
          AND status NOT IN ('Cancelled', 'Completed')
          AND (
            (start_time <= $3 AND end_time > $3) OR
            (start_time < $4 AND end_time >= $4) OR
            (start_time >= $3 AND end_time <= $4)
          )
      `, [
        appointmentData.doctor_id,
        appointmentData.appointment_date,
        appointmentData.start_time,
        appointmentData.end_time
      ]);

      if (conflicting.rows.length > 0) {
        throw new Error('Doctor is not available at this time');
      }

      // Check if patient has appointment at same time
      const patientConflicting = await client.query(`
        SELECT id FROM appointments
        WHERE patient_id = $1
          AND appointment_date = $2
          AND status NOT IN ('Cancelled', 'Completed')
          AND (
            (start_time <= $3 AND end_time > $3) OR
            (start_time < $4 AND end_time >= $4) OR
            (start_time >= $3 AND end_time <= $4)
          )
      `, [
        appointmentData.patient_id,
        appointmentData.appointment_date,
        appointmentData.start_time,
        appointmentData.end_time
      ]);

      if (patientConflicting.rows.length > 0) {
        throw new Error('Patient already has an appointment at this time');
      }

      // Calculate duration
      const start = new Date(`1970-01-01T${appointmentData.start_time}`);
      const end = new Date(`1970-01-01T${appointmentData.end_time}`);
      const durationMinutes = (end - start) / (1000 * 60);

      // Generate appointment number
      const appointmentNumber = await generateAppointmentNumber(client, appointmentData.facility_id);

      const result = await client.query(`
        INSERT INTO appointments (
          appointment_number, patient_id, facility_id, department_id,
          doctor_id, appointment_date, start_time, end_time, duration_minutes,
          appointment_type, reason, notes, is_emergency, is_referral,
          referring_doctor_id, status, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING *
      `, [
        appointmentNumber,
        appointmentData.patient_id,
        appointmentData.facility_id,
        appointmentData.department_id,
        appointmentData.doctor_id,
        appointmentData.appointment_date,
        appointmentData.start_time,
        appointmentData.end_time,
        durationMinutes,
        appointmentData.appointment_type,
        appointmentData.reason,
        appointmentData.notes,
        appointmentData.is_emergency || false,
        appointmentData.is_referral || false,
        appointmentData.referring_doctor_id,
        appointmentData.status || 'Scheduled',
        userId
      ]);

      // Create reminder if requested
      if (appointmentData.send_reminder) {
        const reminderTime = new Date(appointmentData.appointment_date);
        const [hours, minutes] = appointmentData.start_time.split(':');
        reminderTime.setHours(parseInt(hours), parseInt(minutes) - 120, 0); // 2 hours before

        await client.query(`
          INSERT INTO appointment_reminders (
            appointment_id, reminder_type, scheduled_time, status
          ) VALUES ($1, $2, $3, 'Pending')
        `, [result.rows[0].id, appointmentData.reminder_type || 'SMS', reminderTime]);
      }

      logger.audit('APPOINTMENT_CREATED', userId, 'appointment', {
        appointmentId: result.rows[0].id,
        patientId: appointmentData.patient_id,
        doctorId: appointmentData.doctor_id
      });

      return new Appointment(result.rows[0]);
    });
  }

  static async findById(id) {
    const result = await db.query(`
      SELECT 
        a.*,
        json_build_object(
          'id', p.id,
          'patient_number', p.patient_number,
          'name', p.first_name || ' ' || p.last_name,
          'phone', p.phone_number,
          'date_of_birth', p.date_of_birth,
          'gender', p.gender
        ) as patient,
        json_build_object(
          'id', u.id,
          'name', u.first_name || ' ' || u.last_name,
          'title', u.title,
          'employee_id', u.employee_id,
          'specialization', u.specialization
        ) as doctor,
        json_build_object(
          'id', d.id,
          'name', d.department_name,
          'code', d.department_code,
          'floor', d.floor_location
        ) as department,
        json_build_object(
          'id', f.id,
          'name', f.facility_name,
          'code', f.facility_code
        ) as facility
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u ON a.doctor_id = u.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN facilities f ON a.facility_id = f.id
      WHERE a.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row.patient) {
      logger.warn(`Appointment ${id} retrieved but linked patient record missing`);
    }
    if (!row.doctor) {
      logger.warn(`Appointment ${id} retrieved but linked doctor record missing`);
    }
    if (!row.department) {
      logger.warn(`Appointment ${id} retrieved but linked department record missing`);
    }
    if (!row.facility) {
      logger.warn(`Appointment ${id} retrieved but linked facility record missing`);
    }

    return new Appointment(row);
  }

  static async findByDate(date, facilityId, departmentId = null) {
    let query = `
      SELECT 
        a.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number as patient_phone,
        u.first_name || ' ' || u.last_name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.doctor_id = u.id
      WHERE a.appointment_date = $1 AND a.facility_id = $2
    `;
    
    const params = [date, facilityId];
    
    if (departmentId) {
      query += ` AND a.department_id = $3`;
      params.push(departmentId);
    }
    
    query += ` ORDER BY a.start_time`;

    const result = await db.query(query, params);
    return result.rows.map(row => new Appointment(row));
  }

  static async getTodayAppointments(facilityId) {
    const result = await db.query(`
      SELECT 
        a.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number,
        u.first_name || ' ' || u.last_name as doctor_name,
        d.department_name,
        CASE 
          WHEN a.checked_in_time IS NOT NULL THEN 'Checked In'
          ELSE a.status::text
        END as current_status,
        EXTRACT(EPOCH FROM (NOW() - a.checked_in_time))/60 as minutes_waiting
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.doctor_id = u.id
      JOIN departments d ON a.department_id = d.id
      WHERE a.appointment_date = CURRENT_DATE
        AND a.facility_id = $1
      ORDER BY a.start_time
    `, [facilityId]);

    return result.rows.map(row => new Appointment(row));
  }

  static async getUpcomingAppointments(patientId, limit = 10) {
    const result = await db.query(`
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
        AND a.appointment_date >= CURRENT_DATE
        AND a.status NOT IN ('Cancelled', 'Completed')
      ORDER BY a.appointment_date, a.start_time
      LIMIT $2
    `, [patientId, limit]);

    return result.rows.map(row => new Appointment(row));
  }

  static async getDoctorSchedule(doctorId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        a.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number as patient_phone
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.doctor_id = $1
        AND a.appointment_date BETWEEN $2 AND $3
        AND a.status NOT IN ('Cancelled')
      ORDER BY a.appointment_date, a.start_time
    `, [doctorId, startDate, endDate]);

    return result.rows.map(row => new Appointment(row));
  }

  static async getAvailableSlots(doctorId, date, departmentId = null) {
    // Get doctor's working hours (this would come from a schedule table)
    // For now, assume 9 AM to 5 PM, 30-minute slots
    const workingHours = {
      start: '09:00',
      end: '17:00',
      slotDuration: 30
    };

    // Get booked appointments
    const booked = await db.query(`
      SELECT start_time, end_time
      FROM appointments
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND status NOT IN ('Cancelled', 'Completed')
    `, [doctorId, date]);

    const bookedSlots = booked.rows.map(b => ({
      start: b.start_time,
      end: b.end_time
    }));

    // Generate available slots
    const slots = [];
    const start = new Date(`1970-01-01T${workingHours.start}`);
    const end = new Date(`1970-01-01T${workingHours.end}`);
    
    for (let time = start; time < end; time.setMinutes(time.getMinutes() + workingHours.slotDuration)) {
      const slotStart = time.toTimeString().slice(0, 5);
      const slotEnd = new Date(time.getTime() + workingHours.slotDuration * 60000)
        .toTimeString().slice(0, 5);

      // Check if slot is available
      const isBooked = bookedSlots.some(booked => 
        (slotStart >= booked.start && slotStart < booked.end) ||
        (slotEnd > booked.start && slotEnd <= booked.end) ||
        (slotStart <= booked.start && slotEnd >= booked.end)
      );

      if (!isBooked) {
        slots.push({
          start: slotStart,
          end: slotEnd,
          available: true
        });
      }
    }

    return slots;
  }

  async checkIn(userId) {
    const result = await db.query(`
      UPDATE appointments 
      SET 
        status = 'In Progress',
        checked_in_time = NOW(),
        checked_in_by = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async checkOut(userId) {
    const result = await db.query(`
      UPDATE appointments 
      SET 
        status = 'Completed',
        checked_out_time = NOW(),
        checked_out_by = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async cancel(reason, userId) {
    const result = await db.query(`
      UPDATE appointments 
      SET 
        status = 'Cancelled',
        cancellation_reason = $1,
        updated_at = NOW(),
        updated_by = $2
      WHERE id = $3
      RETURNING *
    `, [reason, userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async reschedule(newDate, newStartTime, newEndTime, userId) {
    // Check availability
    const conflicting = await db.query(`
      SELECT id FROM appointments
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND status NOT IN ('Cancelled', 'Completed')
        AND id != $3
        AND (
          (start_time <= $4 AND end_time > $4) OR
          (start_time < $5 AND end_time >= $5) OR
          (start_time >= $4 AND end_time <= $5)
        )
    `, [this.doctor_id, newDate, this.id, newStartTime, newEndTime]);

    if (conflicting.rows.length > 0) {
      throw new Error('Doctor is not available at the new time');
    }

    const result = await db.query(`
      UPDATE appointments 
      SET 
        appointment_date = $1,
        start_time = $2,
        end_time = $3,
        status = 'Rescheduled',
        rescheduled_from = $4,
        updated_at = NOW(),
        updated_by = $5
      WHERE id = $6
      RETURNING *
    `, [newDate, newStartTime, newEndTime, this.id, userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async noShow(userId) {
    const result = await db.query(`
      UPDATE appointments 
      SET 
        status = 'No Show',
        updated_at = NOW(),
        updated_by = $1
      WHERE id = $2
      RETURNING *
    `, [userId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  async linkToVisit(visitId) {
    const result = await db.query(`
      UPDATE appointments 
      SET 
        visit_id = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [visitId, this.id]);

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Reminder methods
  static async getPendingReminders() {
    const result = await db.query(`
      SELECT 
        r.*,
        a.appointment_number,
        a.appointment_date,
        a.start_time,
        a.patient_id,
        a.doctor_id,
        p.first_name || ' ' || p.last_name as patient_name,
        p.phone_number as patient_phone,
        p.email as patient_email,
        u.first_name || ' ' || u.last_name as doctor_name
      FROM appointment_reminders r
      JOIN appointments a ON r.appointment_id = a.id
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.doctor_id = u.id
      WHERE r.scheduled_time <= NOW() + INTERVAL '5 minutes'
        AND r.scheduled_time > NOW() - INTERVAL '1 minute'
        AND r.status = 'Pending'
    `);

    return result.rows;
  }

  async createReminder(reminderType, scheduledTime) {
    const result = await db.query(`
      INSERT INTO appointment_reminders (
        appointment_id, reminder_type, scheduled_time, status
      ) VALUES ($1, $2, $3, 'Pending')
      RETURNING *
    `, [this.id, reminderType, scheduledTime]);

    return result.rows[0];
  }

  static async markReminderSent(reminderId) {
    await db.query(`
      UPDATE appointment_reminders 
      SET status = 'Sent', sent_time = NOW()
      WHERE id = $1
    `, [reminderId]);
  }

  // Statistics methods
  static async getDailyStats(facilityId, date) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Scheduled' THEN 1 END) as scheduled,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status = 'No Show' THEN 1 END) as no_show,
        COUNT(CASE WHEN checked_in_time IS NOT NULL THEN 1 END) as checked_in,
        AVG(CASE 
          WHEN checked_in_time IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (checked_in_time - (appointment_date::timestamp + start_time::time)))/60
          ELSE NULL 
        END) as avg_checkin_delay
      FROM appointments
      WHERE facility_id = $1 AND appointment_date = $2
    `, [facilityId, date]);

    return result.rows[0];
  }

  static async getWeeklyStats(facilityId, startDate) {
    const result = await db.query(`
      SELECT 
        DATE_TRUNC('day', appointment_date) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
      FROM appointments
      WHERE facility_id = $1
        AND appointment_date >= $2
        AND appointment_date < $2 + INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', appointment_date)
      ORDER BY date
    `, [facilityId, startDate]);

    return result.rows;
  }

  toJSON() {
    return {
      id: this.id,
      appointment_number: this.appointment_number,
      patient_id: this.patient_id,
      patient_name: this.patient_name,
      patient_number: this.patient_number,
      doctor_id: this.doctor_id,
      doctor_name: this.doctor_name,
      department_id: this.department_id,
      appointment_date: this.appointment_date,
      start_time: this.start_time,
      end_time: this.end_time,
      appointment_type: this.appointment_type,
      reason: this.reason,
      status: this.status,
      is_emergency: this.is_emergency,
      checked_in_time: this.checked_in_time,
      checked_out_time: this.checked_out_time
    };
  }
}

module.exports = Appointment;