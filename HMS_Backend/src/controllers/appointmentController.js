const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");
const db = require("../config/database");
const emailService = require("../config/email");
const smsService = require("../config/sms");
const { validationResult } = require("express-validator");

class AppointmentController {
  /**
   * @desc    Create a new appointment
   * @route   POST /api/v1/appointments
   * @access  Private (Reception, Doctors)
   */
  async createAppointment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const appointmentData = {
        ...req.body,
        facility_id: req.user.facilityId,
        created_by: req.user.userId,
      };

      const appointment = await Appointment.create(
        appointmentData,
        req.user.userId
      );

      // Send confirmation notifications
      if (appointmentData.send_reminder) {
        try {
          const patient = await Patient.findById(appointment.patient_id);
          const doctor = await User.findById(appointment.doctor_id);

          // Send SMS if phone number exists
          if (patient.phone_number) {
            await smsService.sendAppointmentReminder(patient, {
              ...appointment,
              doctor_name: `${doctor.first_name} ${doctor.last_name}`,
            });
          }

          // Send email if email exists
          if (patient.email) {
            await emailService.sendAppointmentReminder({
              ...appointment,
              patient_name: `${patient.first_name} ${patient.last_name}`,
              patient_email: patient.email,
              doctor_name: `${doctor.first_name} ${doctor.last_name}`,
              department_name: appointmentData.department_name,
              facility_name: req.user.facilityName,
            });
          }
        } catch (notificationError) {
          logger.error(
            "Failed to send appointment notifications:",
            notificationError
          );
        }
      }

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.status(201).json({
        success: true,
        data: appointment,
        message: "Appointment created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all appointments with filters
   * @route   GET /api/v1/appointments
   * @access  Private
   */
  async getAppointments(req, res, next) {
    try {
      const {
        date,
        start_date,
        end_date,
        department_id,
        doctor_id,
        patient_id,
        status,
        page = 1,
        limit = 50,
      } = req.query;

      let appointments;
      let total;

      if (date) {
        appointments = await Appointment.findByDate(
          date,
          req.user.facilityId,
          department_id
        );
        total = appointments.length;
      } else {
        // Build query
        let query = `
          SELECT COUNT(*) OVER() as total, a.*,
            p.first_name || ' ' || p.last_name AS patient_name,
            p.patient_number,
            u.first_name || ' ' || u.last_name AS doctor_name
          FROM appointments a
          JOIN patients p ON a.patient_id = p.id
          LEFT JOIN users u ON a.doctor_id = u.id
          WHERE a.facility_id = $1
        `;
        const params = [req.user.facilityId];
        let paramIndex = 2;

        if (start_date && end_date) {
          query += ` AND a.appointment_date BETWEEN $${paramIndex} AND $${
            paramIndex + 1
          }`;
          params.push(start_date, end_date);
          paramIndex += 2;
        }

        if (department_id) {
          query += ` AND a.department_id = $${paramIndex}`;
          params.push(department_id);
          paramIndex++;
        }

        if (doctor_id) {
          query += ` AND a.doctor_id = $${paramIndex}`;
          params.push(doctor_id);
          paramIndex++;
        }

        if (patient_id) {
          query += ` AND a.patient_id = $${paramIndex}`;
          params.push(patient_id);
          paramIndex++;
        }

        if (status) {
          query += ` AND a.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }

        query += ` ORDER BY a.appointment_date, a.start_time LIMIT $${paramIndex} OFFSET $${
          paramIndex + 1
        }`;
        params.push(limit, (page - 1) * limit);

        const result = await db.query(query, params);
        appointments = result.rows;
        total = result.rows.length > 0 ? parseInt(result.rows[0].total) : 0;
      }

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get single appointment by ID
   * @route   GET /api/v1/appointments/:id
   * @access  Private
   */
  async getAppointment(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update appointment
   * @route   PUT /api/v1/appointments/:id
   * @access  Private
   */
  async updateAppointment(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      // Update appointment
      const updated = await db.query(
        `
        UPDATE appointments
        SET
          appointment_type = COALESCE($1, appointment_type),
          reason = COALESCE($2, reason),
          notes = COALESCE($3, notes),
          updated_at = NOW(),
          updated_by = $4
        WHERE id = $5
        RETURNING *
      `,
        [
          req.body.appointment_type,
          req.body.reason,
          req.body.notes,
          req.user.userId,
          id,
        ]
      );

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        data: updated.rows[0],
        message: "Appointment updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Cancel appointment
   * @route   PUT /api/v1/appointments/:id/cancel
   * @access  Private
   */
  async cancelAppointment(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_REASON",
            message: "Cancellation reason is required",
          },
        });
      }

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      await appointment.cancel(reason, req.user.userId);

      // Send cancellation notification
      try {
        const patient = await Patient.findById(appointment.patient_id);
        if (patient.phone_number) {
          await smsService.sendSMS(
            patient.phone_number,
            `Your appointment for ${appointment.appointment_date} at ${appointment.start_time} has been cancelled. Reason: ${reason}`
          );
        }
      } catch (notifyError) {
        logger.error("Failed to send cancellation notification:", notifyError);
      }

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        message: "Appointment cancelled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Reschedule appointment
   * @route   PUT /api/v1/appointments/:id/reschedule
   * @access  Private
   */
  async rescheduleAppointment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const { id } = req.params;
      const { new_date, new_start_time, new_end_time } = req.body;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      await appointment.reschedule(
        new_date,
        new_start_time,
        new_end_time,
        req.user.userId
      );

      // Send reschedule notification
      try {
        const patient = await Patient.findById(appointment.patient_id);
        if (patient.phone_number) {
          await smsService.sendSMS(
            patient.phone_number,
            `Your appointment has been rescheduled to ${new_date} at ${new_start_time}`
          );
        }
      } catch (notifyError) {
        logger.error("Failed to send reschedule notification:", notifyError);
      }

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        message: "Appointment rescheduled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Check-in patient for appointment
   * @route   PUT /api/v1/appointments/:id/check-in
   * @access  Private (Reception, Nurses)
   */
  async checkIn(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      await appointment.checkIn(req.user.userId);

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        message: "Patient checked in successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Check-out patient from appointment
   * @route   PUT /api/v1/appointments/:id/check-out
   * @access  Private (Reception, Nurses)
   */
  async checkOut(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      await appointment.checkOut(req.user.userId);

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        message: "Patient checked out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Mark appointment as no-show
   * @route   PUT /api/v1/appointments/:id/no-show
   * @access  Private
   */
  async noShow(req, res, next) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Appointment not found",
          },
        });
      }

      // Verify facility access
      if (appointment.facility_id !== req.user.facilityId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this appointment",
          },
        });
      }

      await appointment.noShow(req.user.userId);

      // Clear cache
      await redis.clearPattern("appointments:*");

      res.json({
        success: true,
        message: "Appointment marked as no-show",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get today's appointments
   * @route   GET /api/v1/appointments/today
   * @access  Private
   */
  async getTodayAppointments(req, res, next) {
    try {
      const appointments = await Appointment.getTodayAppointments(
        req.user.facilityId
      );

      res.json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get doctor's schedule
   * @route   GET /api/v1/appointments/doctor/:doctorId/schedule
   * @access  Private
   */
  async getDoctorSchedule(req, res, next) {
    try {
      const { doctorId } = req.params;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_DATES",
            message: "Start date and end date are required",
          },
        });
      }

      const schedule = await Appointment.getDoctorSchedule(
        doctorId,
        start_date,
        end_date
      );

      res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get available appointment slots
   * @route   GET /api/v1/appointments/available-slots
   * @access  Private
   */
  async getAvailableSlots(req, res, next) {
    try {
      const { doctor_id, date, department_id } = req.query;

      if (!doctor_id || !date) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PARAMETERS",
            message: "Doctor ID and date are required",
          },
        });
      }

      const slots = await Appointment.getAvailableSlots(
        doctor_id,
        date,
        department_id
      );

      res.json({
        success: true,
        data: slots,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get patient upcoming appointments
   * @route   GET /api/v1/appointments/patient/:patientId/upcoming
   * @access  Private
   */
  async getPatientUpcoming(req, res, next) {
    try {
      const { patientId } = req.params;
      const { limit = 10 } = req.query;

      const appointments = await Appointment.getUpcomingAppointments(
        patientId,
        limit
      );

      res.json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get appointment statistics
   * @route   GET /api/v1/appointments/stats
   * @access  Private
   */
  async getStats(req, res, next) {
    try {
      const { date, start_date, end_date } = req.query;

      let stats;
      if (date) {
        stats = await Appointment.getDailyStats(req.user.facilityId, date);
      } else if (start_date && end_date) {
        stats = await Appointment.getWeeklyStats(
          req.user.facilityId,
          start_date
        );
      } else {
        // Default to today
        stats = await Appointment.getDailyStats(
          req.user.facilityId,
          new Date().toISOString().split("T")[0]
        );
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create bulk appointments
   * @route   POST /api/v1/appointments/bulk
   * @access  Private (Admin only)
   */
  async createBulkAppointments(req, res, next) {
    try {
      const { appointments } = req.body;

      if (!appointments || !Array.isArray(appointments)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATA",
            message: "Appointments array is required",
          },
        });
      }

      const results = {
        successful: [],
        failed: [],
      };

      for (const aptData of appointments) {
        try {
          const appointment = await Appointment.create(
            {
              ...aptData,
              facility_id: req.user.facilityId,
            },
            req.user.userId
          );
          results.successful.push(appointment);
        } catch (error) {
          results.failed.push({
            data: aptData,
            error: error.message,
          });
        }
      }

      await redis.clearPattern("appointments:*");

      res.status(201).json({
        success: true,
        data: results,
        message: `Created ${results.successful.length} appointments, ${results.failed.length} failed`,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AppointmentController();
