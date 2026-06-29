const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const userController = require('../../controllers/userController');
const adminController = require('../../controllers/adminController');
const { authenticateToken, authorize, hasPermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');

// All user routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/users
 * @desc    Get all users with pagination
 * @access  Private (Admin only)
 */
router.get('/',
  authorize('SYS_ADMIN', 'DISTRICT_HD'),
  userController.getUsers
);

/**
 * @route   GET /api/v1/users/stats
 * @desc    Get user statistics
 * @access  Private (Admin only)
 */
router.get('/stats',
  authorize('SYS_ADMIN'),
  userController.getUserStats
);

/**
 * @route   GET /api/v1/users/departments
 * @desc    Get all departments (reference data used by appointment forms)
 * @access  Private (any authenticated user)
 */
router.get('/departments', adminController.getDepartments);

/**
 * @route   GET /api/v1/users/doctors/department/:departmentId
 * @desc    Get doctors by department
 * @access  Private
 */
router.get('/doctors/department/:departmentId',
  param('departmentId').isUUID(),
  validate,
  userController.getDoctorsByDepartment
);

/**
 * @route   GET /api/v1/users/doctors/available
 * @desc    Get available doctors for appointment
 * @access  Private
 */
router.get('/doctors/available',
  [
    query('date').isDate().withMessage('Valid date is required'),
    query('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time is required'),
    query('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid end time is required')
  ],
  validate,
  userController.getAvailableDoctors
);

/**
 * @route   POST /api/v1/users
 * @desc    Create a new user
 * @access  Private (Admin only)
 */
router.post('/',
  authorize('SYS_ADMIN'),
  hasPermission('CREATE_USER'),
  [
    body('first_name').if(body('firstName').not().exists()).notEmpty().withMessage('First name is required'),
    body('firstName').if(body('first_name').not().exists()).notEmpty().withMessage('First name is required'),
    body('last_name').if(body('lastName').not().exists()).notEmpty().withMessage('Last name is required'),
    body('lastName').if(body('first_name').not().exists()).notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('facility_id').optional().isUUID(),
    body('department_id').optional().isUUID(),
    body('role_id').optional().isUUID(),
    body('role_code').optional().isString()
  ],
  validate,
  userController.createUser
);

/**
 * @route   POST /api/v1/users/import
 * @desc    Bulk import users
 * @access  Private (Admin only)
 */
router.post('/import',
  authorize('SYS_ADMIN'),
  hasPermission('BULK_IMPORT'),
  userController.bulkImport
);

/**
 * @route   GET /api/v1/users/export
 * @desc    Export users
 * @access  Private (Admin only)
 */
router.get('/export',
  authorize('SYS_ADMIN'),
  userController.exportUsers
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get single user by ID
 * @access  Private (Admin only)
 */
router.get('/:id',
  authorize('SYS_ADMIN', 'DISTRICT_HD'),
  param('id').isUUID(),
  validate,
  userController.getUser
);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user
 * @access  Private (Admin only)
 */
router.put('/:id',
  authorize('SYS_ADMIN'),
  hasPermission('UPDATE_USER'),
  param('id').isUUID(),
  [
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('gender').optional().isIn(['Male','Female','Other']).withMessage('Gender must be Male, Female or Other'),
    body('facility_id').optional().isUUID().withMessage('Facility ID must be a UUID'),
    body('department_id').optional().isUUID().withMessage('Department ID must be a UUID'),
    body('employee_id').optional().notEmpty().withMessage('Employee ID cannot be empty'),
    body('two_factor_enabled').optional().isBoolean().withMessage('Two factor flag must be boolean')
  ],
  validate,
  userController.updateUser
);

/**
 * @route   PATCH /api/v1/users/:id
 * @desc    Partially update user (e.g. toggle isActive)
 * @access  Private (Admin only)
 */
router.patch('/:id',
  authorize('SYS_ADMIN'),
  param('id').isUUID(),
  body('isActive').optional().isBoolean(),
  validate,
  userController.patchUser
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authorize('SYS_ADMIN'),
  hasPermission('DELETE_USER'),
  param('id').isUUID(),
  validate,
  userController.deleteUser
);

/**
 * @route   GET /api/v1/users/:id/roles
 * @desc    Get user roles
 * @access  Private (Admin only)
 */
router.get('/:id/roles',
  authorize('SYS_ADMIN'),
  param('id').isUUID(),
  validate,
  userController.getUserRoles
);

/**
 * @route   POST /api/v1/users/:id/roles
 * @desc    Assign role to user
 * @access  Private (Admin only)
 *
 * Granting and revoking roles is considered part of the "manage
 * roles" capability.  Using the MANAGE_ROLES permission keeps the
 * access control consistent with the admin/roles endpoints and
 * prevents additional permission seeds from being required.
 */
router.post('/:id/roles',
  authorize('SYS_ADMIN'),
  hasPermission('MANAGE_ROLES'),
  [
    param('id').isUUID(),
    body('roleId').isUUID().withMessage('Valid role ID is required')
  ],
  validate,
  userController.assignRole
);

/**
 * @route   DELETE /api/v1/users/:id/roles/:roleId
 * @desc    Remove role from user
 * @access  Private (Admin only)
 *
 * Same permission as assignment; the ability to modify a role set
 * implies the ability to take it away.
 */
router.delete('/:id/roles/:roleId',
  authorize('SYS_ADMIN'),
  hasPermission('MANAGE_ROLES'),
  [
    param('id').isUUID(),
    param('roleId').isUUID()
  ],
  validate,
  userController.removeRole
);

/**
 * @route   GET /api/v1/users/:id/permissions
 * @desc    Get user permissions
 * @access  Private (Admin only)
 */
router.get('/:id/permissions',
  authorize('SYS_ADMIN'),
  param('id').isUUID(),
  validate,
  userController.getUserPermissions
);

/**
 * @route   GET /api/v1/users/:id/activity
 * @desc    Get user activity log
 * @access  Private (Admin only)
 */
router.get('/:id/activity',
  authorize('SYS_ADMIN'),
  param('id').isUUID(),
  validate,
  userController.getUserActivity
);

module.exports = router;