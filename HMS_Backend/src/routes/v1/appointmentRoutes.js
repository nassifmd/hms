const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const appointmentController = require('../../controllers/appointmentController');
const { authenticateToken, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');

// All appointment routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/appointments
 * @desc    Get all appointments with filters
 * @access  Private
 */
router.get('/',
  authorize('RECEPTION', 'DOCTOR', 'NURSE', 'RECORDS'),
  appointmentController.getAppointments
);

/**
 * @route   GET /api/v1/appointments/today
 * @desc    Get today's appointments
 * @access  Private
 */
router.get('/today',
  authorize('RECEPTION', 'DOCTOR', 'NURSE'),
  appointmentController.getTodayAppointments
);

/**
 * @route   GET /api/v1/appointments/available-slots
 * @desc    Get available appointment slots
 * @access  Private
 */
router.get('/available-slots',
  authorize('RECEPTION', 'DOCTOR'),
  [
    query('doctor_id').isUUID().withMessage('Valid doctor ID is required'),
    query('date').isDate().withMessage('Valid date is required')
  ],
  validate,
  appointmentController.getAvailableSlots
);

/**
 * @route   GET /api/v1/appointments/stats
 * @desc    Get appointment statistics
 * @access  Private
 */
router.get('/stats',
  authorize('MED_SUPT', 'RECEPTION'),
  appointmentController.getStats
);

/**
 * @route   GET /api/v1/appointments/doctor/:doctorId/schedule
 * @desc    Get doctor's schedule
 * @access  Private
 */
router.get('/doctor/:doctorId/schedule',
  authorize('RECEPTION', 'DOCTOR'),
  [
    param('doctorId').isUUID(),
    query('start_date').isDate().withMessage('Start date is required'),
    query('end_date').isDate().withMessage('End date is required')
  ],
  validate,
  appointmentController.getDoctorSchedule
);

/**
 * @route   GET /api/v1/appointments/patient/:patientId/upcoming
 * @desc    Get patient upcoming appointments
 * @access  Private
 */
router.get('/patient/:patientId/upcoming',
  authorize('RECEPTION', 'DOCTOR', 'NURSE'),
  param('patientId').isUUID(),
  validate,
  appointmentController.getPatientUpcoming
);

/**
 * @route   POST /api/v1/appointments
 * @desc    Create a new appointment
 * @access  Private (Reception, Doctors)
 */
router.post('/',
  authorize('RECEPTION', 'DOCTOR', 'RECORDS', 'NURSE', 'MED_OFFICER'),
  [
    body('patient_id').isUUID().withMessage('Valid patient ID is required'),
    body('doctor_id').isUUID().withMessage('Valid doctor ID is required'),
    body('department_id').isUUID().withMessage('Valid department ID is required'),
    body('appointment_date').isDate().withMessage('Valid appointment date is required'),
    body('start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required'),
    body('end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required'),
    body('appointment_type').notEmpty().withMessage('Appointment type is required')
  ],
  validate,
  appointmentController.createAppointment
);

/**
 * @route   POST /api/v1/appointments/bulk
 * @desc    Create bulk appointments
 * @access  Private (Admin only)
 */
router.post('/bulk',
  authorize('SYS_ADMIN', 'RECEPTION'),
  [
    body('appointments').isArray().withMessage('Appointments array is required')
  ],
  validate,
  appointmentController.createBulkAppointments
);

/**
 * @route   GET /api/v1/appointments/:id
 * @desc    Get single appointment by ID
 * @access  Private
 */
router.get('/:id',
  param('id').isUUID(),
  validate,
  appointmentController.getAppointment
);

/**
 * @route   PUT /api/v1/appointments/:id
 * @desc    Update appointment
 * @access  Private
 */
router.put('/:id',
  param('id').isUUID(),
  validate,
  appointmentController.updateAppointment
);

/**
 * @route   PUT /api/v1/appointments/:id/cancel
 * @desc    Cancel appointment
 * @access  Private
 */
router.put('/:id/cancel',
  param('id').isUUID(),
  [
    body('reason').notEmpty().withMessage('Cancellation reason is required')
  ],
  validate,
  appointmentController.cancelAppointment
);

/**
 * @route   PUT /api/v1/appointments/:id/reschedule
 * @desc    Reschedule appointment
 * @access  Private
 */
router.put('/:id/reschedule',
  param('id').isUUID(),
  [
    body('new_date').isDate().withMessage('Valid new date is required'),
    body('new_start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required'),
    body('new_end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required')
  ],
  validate,
  appointmentController.rescheduleAppointment
);

/**
 * @route   PUT /api/v1/appointments/:id/check-in
 * @desc    Check-in patient for appointment
 * @access  Private (Reception, Nurses)
 */
router.put('/:id/check-in',
  authorize('RECEPTION', 'NURSE'),
  param('id').isUUID(),
  validate,
  appointmentController.checkIn
);

/**
 * @route   PUT /api/v1/appointments/:id/check-out
 * @desc    Check-out patient from appointment
 * @access  Private (Reception, Nurses)
 */
router.put('/:id/check-out',
  authorize('RECEPTION', 'NURSE'),
  param('id').isUUID(),
  validate,
  appointmentController.checkOut
);

/**
 * @route   PUT /api/v1/appointments/:id/no-show
 * @desc    Mark appointment as no-show
 * @access  Private
 */
router.put('/:id/no-show',
  param('id').isUUID(),
  validate,
  appointmentController.noShow
);

module.exports = router;