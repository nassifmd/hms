const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const dashboardController = require('../../controllers/dashboardController');
const { authenticateToken, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validation');

// All dashboard routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/dashboard/executive
 * @desc    Get executive dashboard data
 * @access  Private (Executives, Medical Superintendent)
 */
router.get('/executive',
  authorize('MED_SUPT', 'DISTRICT_HD', 'SYS_ADMIN'),
  dashboardController.getExecutiveDashboard.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/clinical
 * @desc    Get clinical dashboard data
 * @access  Private (Clinical staff)
 */
router.get('/clinical',
  authorize('DOCTOR', 'NURSE', 'MED_OFFICER'),
  dashboardController.getClinicalDashboard.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/financial
 * @desc    Get financial dashboard data
 * @access  Private (Accounts, Finance)
 */
router.get('/financial',
  authorize('ACCOUNTS', 'CASHIER', 'MED_SUPT'),
  dashboardController.getFinancialDashboard.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/operational
 * @desc    Get operational dashboard data
 * @access  Private (Operations Manager)
 */
router.get('/operational',
  authorize('SYS_ADMIN', 'RECEPTION'),
  dashboardController.getOperationalDashboard.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/kpis
 * @desc    Get KPI metrics
 * @access  Private
 */
router.get('/kpis',
  authorize('MED_SUPT', 'SYS_ADMIN'),
  dashboardController.getKPIs.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/realtime
 * @desc    Get real-time updates
 * @access  Private
 */
router.get('/realtime',
  authorize('RECEPTION', 'NURSE', 'DOCTOR'),
  dashboardController.getRealTimeUpdates.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/my
 * @desc    Get user-specific dashboard
 * @access  Private
 */
router.get('/my',
  dashboardController.getMyDashboard.bind(dashboardController)
);

/**
 * @route   GET /api/v1/dashboard/department/:departmentId
 * @desc    Get departmental dashboard
 * @access  Private (Department staff)
 */
router.get('/department/:departmentId',
  param('departmentId').isUUID(),
  validate,
  dashboardController.getDepartmentDashboard.bind(dashboardController)
);

module.exports = router;