const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const patientController = require('../../controllers/patientController');
const { authenticateToken, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');

// All patient routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/patients
 * @desc    Get all patients with pagination
 * @access  Private
 */
router.get('/',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION'),
  patientController.getPatients
);

/**
 * @route   GET /api/v1/patients/search
 * @desc    Search patients
 * @access  Private
 */
router.get('/search',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION', 'DENTIST', 'DENTAL_SURGEON', 'SYS_ADMIN'),
  query('q').isLength({ min: 3 }).withMessage('Search query must be at least 3 characters'),
  validate,
  patientController.searchPatients
);

/**
 * @route   GET /api/v1/patients/dashboard
 * @desc    Get patient dashboard
 * @access  Private
 */
router.get('/dashboard',
  authorize('MED_SUPT', 'DOCTOR'),
  patientController.getDashboard
);

/**
 * @route   GET /api/v1/patients/number/:patientNumber
 * @desc    Get patient by patient number
 * @access  Private
 */
router.get('/number/:patientNumber',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION'),
  param('patientNumber').notEmpty(),
  validate,
  patientController.getPatientByNumber
);

/**
 * @route   GET /api/v1/patients/phone/:phone
 * @desc    Get patient by phone number
 * @access  Private
 */
router.get('/phone/:phone',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION'),
  param('phone').isMobilePhone('any'),
  validate,
  patientController.getPatientByPhone
);

/**
 * @route   GET /api/v1/patients/nhis/:nhisNumber
 * @desc    Get patient by NHIS number
 * @access  Private
 */
router.get('/nhis/:nhisNumber',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION'),
  param('nhisNumber').notEmpty(),
  validate,
  patientController.getPatientByNHIS
);

/**
 * @route   GET /api/v1/patients/export
 * @desc    Export patients
 * @access  Private (Admin only)
 */
router.get('/export',
  authorize('SYS_ADMIN', 'RECORDS'),
  patientController.exportPatients
);

/**
 * @route   POST /api/v1/patients
 * @desc    Register a new patient
 * @access  Private (Records, Reception)
 */
router.post('/',
  authorize('RECORDS', 'RECEPTION'),
  [
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('date_of_birth').isISO8601().withMessage('Valid date of birth is required'),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Valid gender is required'),
    body('phone_number').optional({ nullable: true, checkFalsy: true }),
    body('email').optional().isEmail(),
    body('nhis_number').optional()
  ],
  validate,
  patientController.register
);

/**
 * @route   POST /api/v1/patients/merge
 * @desc    Merge duplicate patient records
 * @access  Private (Admin only)
 */
router.post('/merge',
  authorize('SYS_ADMIN', 'RECORDS'),
  [
    body('primaryId').isUUID().withMessage('Valid primary patient ID is required'),
    body('secondaryIds').isArray().withMessage('Secondary IDs array is required')
  ],
  validate,
  patientController.mergePatients
);

/**
 * @route   GET /api/v1/patients/:id
 * @desc    Get single patient by ID
 * @access  Private
 */
router.get('/:id',
  authorize('RECORDS', 'DOCTOR', 'NURSE', 'RECEPTION'),
  param('id').isUUID(),
  validate,
  patientController.getPatient
);

/**
 * @route   PUT /api/v1/patients/:id
 * @desc    Update patient
 * @access  Private (Records, Doctors)
 */
router.put('/:id',
  authorize('RECORDS', 'DOCTOR'),
  param('id').isUUID(),
  validate,
  patientController.updatePatient
);

/**
 * @route   GET /api/v1/patients/:id/vitals
 * @desc    Get patient vitals
 * @access  Private
 */
router.get('/:id/vitals',
  authorize('RECORDS', 'DOCTOR', 'NURSE'),
  param('id').isUUID(),
  validate,
  patientController.getVitals
);

/**
 * @route   POST /api/v1/patients/:id/vitals
 * @desc    Add patient vitals
 * @access  Private (Nurses)
 */
router.post('/:id/vitals',
  authorize('NURSE'),
  param('id').isUUID(),
  [
    body('height_cm').optional().isFloat({ min: 30, max: 300 }),
    body('weight_kg').optional().isFloat({ min: 1, max: 500 }),
    body('temperature_celsius').optional().isFloat({ min: 30, max: 45 }),
    body('systolic_bp').optional().isInt({ min: 50, max: 250 }),
    body('diastolic_bp').optional().isInt({ min: 30, max: 150 }),
    body('heart_rate').optional().isInt({ min: 30, max: 250 })
  ],
  validate,
  patientController.addVitals
);

/**
 * @route   GET /api/v1/patients/:id/visits
 * @desc    Get patient visits
 * @access  Private
 */
router.get('/:id/visits',
  param('id').isUUID(),
  validate,
  patientController.getVisits
);

/**
 * @route   GET /api/v1/patients/:id/appointments
 * @desc    Get patient appointments
 * @access  Private
 */
router.get('/:id/appointments',
  param('id').isUUID(),
  validate,
  patientController.getAppointments
);

/**
 * @route   GET /api/v1/patients/:id/prescriptions
 * @desc    Get patient prescriptions
 * @access  Private
 */
router.get('/:id/prescriptions',
  param('id').isUUID(),
  validate,
  patientController.getPrescriptions
);

/**
 * @route   GET /api/v1/patients/:id/lab-orders
 * @desc    Get patient lab orders
 * @access  Private
 */
router.get('/:id/lab-orders',
  param('id').isUUID(),
  validate,
  patientController.getLabOrders
);

/**
 * @route   GET /api/v1/patients/:id/bills
 * @desc    Get patient bills
 * @access  Private
 */
router.get('/:id/bills',
  param('id').isUUID(),
  validate,
  patientController.getBills
);

/**
 * @route   GET /api/v1/patients/:id/outstanding-balance
 * @desc    Get patient outstanding balance
 * @access  Private
 */
router.get('/:id/outstanding-balance',
  param('id').isUUID(),
  validate,
  patientController.getOutstandingBalance
);

/**
 * @route   GET /api/v1/patients/:id/nhis-status
 * @desc    Get patient NHIS status
 * @access  Private
 */
router.get('/:id/nhis-status',
  param('id').isUUID(),
  validate,
  patientController.getNHISStatus
);

/**
 * @route   POST /api/v1/patients/:id/next-of-kin
 * @desc    Add next of kin
 * @access  Private
 */
router.post('/:id/next-of-kin',
  param('id').isUUID(),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('relationship').notEmpty().withMessage('Relationship is required'),
    body('phone_number').isMobilePhone('any').withMessage('Valid phone number is required')
  ],
  validate,
  patientController.addNextOfKin
);

/**
 * @route   PUT /api/v1/patients/:patientId/next-of-kin/:kinId
 * @desc    Update next of kin
 * @access  Private
 */
router.put('/:patientId/next-of-kin/:kinId',
  [
    param('patientId').isUUID(),
    param('kinId').isUUID()
  ],
  validate,
  patientController.updateNextOfKin
);

/**
 * @route   DELETE /api/v1/patients/:patientId/next-of-kin/:kinId
 * @desc    Delete next of kin
 * @access  Private
 */
router.delete('/:patientId/next-of-kin/:kinId',
  [
    param('patientId').isUUID(),
    param('kinId').isUUID()
  ],
  validate,
  patientController.deleteNextOfKin
);

/**
 * @route   POST /api/v1/patients/:id/insurance
 * @desc    Add patient insurance
 * @access  Private
 */
router.post('/:id/insurance',
  param('id').isUUID(),
  [
    body('provider').notEmpty().withMessage('Insurance provider is required'),
    body('policy_number').optional({ nullable: true, checkFalsy: true }),
    body('expiry_date').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Valid expiry date is required')
  ],
  validate,
  patientController.addInsurance
);

/**
 * @route   PUT /api/v1/patients/:patientId/insurance/:insuranceId
 * @desc    Update patient insurance
 * @access  Private
 */
/**
 * @route   DELETE /api/v1/patients/:id
 * @desc    Deactivate a patient (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authorize('SYS_ADMIN', 'SUPER_ADMIN'),
  param('id').isUUID(),
  validate,
  patientController.deactivatePatient
);

router.put('/:patientId/insurance/:insuranceId',
  [
    param('patientId').isUUID(),
    param('insuranceId').isUUID()
  ],
  validate,
  patientController.updateInsurance
);

module.exports = router;