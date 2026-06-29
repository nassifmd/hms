'use strict';

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const branchController = require('../../controllers/branchController');
const { authenticateToken, authorize, hasPermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');

// All branch routes require a valid JWT
router.use(authenticateToken);

// ─── Reusable validators ──────────────────────────────────────────────────────

const branchIdParam = param('id')
  .isUUID()
  .withMessage('Branch ID must be a valid UUID');

const createBranchValidators = [
  body('branch_code')
    .trim()
    .notEmpty().withMessage('Branch code is required')
    .isLength({ max: 50 }).withMessage('Branch code must not exceed 50 characters')
    .matches(/^[A-Za-z0-9_-]+$/).withMessage('Branch code may only contain letters, digits, hyphens and underscores'),
  body('branch_name')
    .trim()
    .notEmpty().withMessage('Branch name is required')
    .isLength({ max: 255 }).withMessage('Branch name must not exceed 255 characters'),
  body('branch_type')
    .notEmpty().withMessage('Branch type is required')
    .isIn(['Main', 'Annex', 'Outreach', 'Satellite', 'Specialist', 'Other'])
    .withMessage('Branch type must be one of: Main, Annex, Outreach, Satellite, Specialist, Other'),
  body('parent_branch_id')
    .optional({ nullable: true })
    .isUUID().withMessage('Parent branch ID must be a valid UUID'),
  body('branch_head_id')
    .optional({ nullable: true })
    .isUUID().withMessage('Branch head ID must be a valid UUID'),
  body('email')
    .optional({ nullable: true })
    .isEmail().withMessage('Invalid email address'),
  body('phone_primary')
    .optional({ nullable: true })
    .matches(/^[+\d\s()-]{7,20}$/).withMessage('Invalid primary phone number'),
  body('bed_capacity')
    .optional()
    .isInt({ min: 0 }).withMessage('Bed capacity must be a non-negative integer'),
  body('operational_hours')
    .optional({ nullable: true })
    .isObject().withMessage('Operational hours must be a JSON object'),
  body('services_offered')
    .optional()
    .isArray().withMessage('Services offered must be an array')
];

const updateBranchValidators = [
  branchIdParam,
  ...createBranchValidators.map(v => v.optional ? v : v.optional())
];

const assignUserValidators = [
  branchIdParam,
  body('user_id')
    .isUUID().withMessage('user_id must be a valid UUID')
];

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/branches/overview
 * @desc    Facility-wide branch summary (counts, staff totals)
 * @access  SUPER_ADMIN | SYS_ADMIN
 */
router.get(
  '/overview',
  authorize('SUPER_ADMIN', 'SYS_ADMIN'),
  branchController.getFacilityBranchOverview
);

/**
 * @route   GET /api/v1/branches
 * @desc    List all branches for the caller's facility
 * @access  SUPER_ADMIN | SYS_ADMIN | MANAGE_BRANCHES | VIEW_ALL_BRANCHES
 */
router.get(
  '/',
  authorize('SUPER_ADMIN', 'SYS_ADMIN', '*'),
  hasPermission('VIEW_ALL_BRANCHES'),
  [
    query('status').optional().isIn(['Active', 'Inactive', 'Suspended', 'Under Construction']),
    query('branch_type').optional().trim(),
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 })
  ],
  validate,
  branchController.getBranches
);

/**
 * @route   POST /api/v1/branches
 * @desc    Create a new branch
 * @access  SUPER_ADMIN | SYS_ADMIN
 */
router.post(
  '/',
  authorize('SUPER_ADMIN', 'SYS_ADMIN'),
  hasPermission('MANAGE_BRANCHES'),
  createBranchValidators,
  validate,
  branchController.createBranch
);

/**
 * @route   GET /api/v1/branches/:id
 * @desc    Get a single branch with its departments
 * @access  Any authenticated user of the facility
 */
router.get(
  '/:id',
  [branchIdParam],
  validate,
  branchController.getBranch
);

/**
 * @route   PUT /api/v1/branches/:id
 * @desc    Update branch details
 * @access  SUPER_ADMIN | SYS_ADMIN
 */
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'SYS_ADMIN'),
  hasPermission('MANAGE_BRANCHES'),
  updateBranchValidators,
  validate,
  branchController.updateBranch
);

/**
 * @route   PATCH /api/v1/branches/:id/status
 * @desc    Set branch operational status
 * @access  SUPER_ADMIN | SYS_ADMIN
 */
router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN', 'SYS_ADMIN'),
  hasPermission('MANAGE_BRANCHES'),
  [
    branchIdParam,
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(['Active', 'Inactive', 'Suspended', 'Under Construction'])
      .withMessage('Status must be one of: Active, Inactive, Suspended, Under Construction')
  ],
  validate,
  branchController.setBranchStatus
);

/**
 * @route   DELETE /api/v1/branches/:id
 * @desc    Soft-delete (deactivate) a branch
 * @access  SUPER_ADMIN | SYS_ADMIN
 */
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'SYS_ADMIN'),
  hasPermission('MANAGE_BRANCHES'),
  [branchIdParam],
  validate,
  branchController.deleteBranch
);

/**
 * @route   GET /api/v1/branches/:id/users
 * @desc    List staff assigned to a branch
 * @access  SUPER_ADMIN | SYS_ADMIN | VIEW_ALL_BRANCHES
 */
router.get(
  '/:id/users',
  authorize('SUPER_ADMIN', 'SYS_ADMIN', '*'),
  hasPermission('VIEW_ALL_BRANCHES'),
  [
    branchIdParam,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('search').optional().trim(),
    query('user_status').optional().isIn(['Active', 'Inactive', 'Suspended', 'Locked'])
  ],
  validate,
  branchController.getBranchUsers
);

/**
 * @route   POST /api/v1/branches/:id/assign-user
 * @desc    Assign a single user to this branch
 * @access  SUPER_ADMIN | SYS_ADMIN | ASSIGN_BRANCH_USERS
 */
router.post(
  '/:id/assign-user',
  authorize('SUPER_ADMIN', 'SYS_ADMIN', '*'),
  hasPermission('ASSIGN_BRANCH_USERS'),
  assignUserValidators,
  validate,
  branchController.assignUserToBranch
);

/**
 * @route   POST /api/v1/branches/:id/bulk-assign-users
 * @desc    Assign multiple users to this branch
 * @access  SUPER_ADMIN | SYS_ADMIN | ASSIGN_BRANCH_USERS
 */
router.post(
  '/:id/bulk-assign-users',
  authorize('SUPER_ADMIN', 'SYS_ADMIN', '*'),
  hasPermission('ASSIGN_BRANCH_USERS'),
  [
    branchIdParam,
    body('user_ids')
      .isArray({ min: 1 }).withMessage('user_ids must be a non-empty array')
      .custom(ids => ids.every(id => /^[0-9a-f-]{36}$/i.test(id)))
      .withMessage('All user_ids must be valid UUIDs')
  ],
  validate,
  branchController.bulkAssignUsersToBranch
);

/**
 * @route   GET /api/v1/branches/:id/stats
 * @desc    Activity statistics for a branch
 * @access  SUPER_ADMIN | SYS_ADMIN | VIEW_ALL_BRANCHES
 */
router.get(
  '/:id/stats',
  authorize('SUPER_ADMIN', 'SYS_ADMIN', '*'),
  hasPermission('VIEW_ALL_BRANCHES'),
  [
    branchIdParam,
    query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be between 1 and 365 days')
  ],
  validate,
  branchController.getBranchStats
);

module.exports = router;
