const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const adminController = require("../../controllers/adminController");
const {
  authenticateToken,
  authorize,
  hasPermission,
} = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(authorize("SYS_ADMIN"));

/**
 * @route   GET /api/v1/admin
 * @desc    Admin module root — list available endpoints
 * @access  Private (SYS_ADMIN only)
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Admin",
      description:
        "System administration, user management, roles, permissions, settings",
      endpoints: [
        "/settings",
        "/roles",
        "/permissions",
        "/departments",
        "/users",
        "/users/:id",
        "/users/:id/roles",
        "/audit-logs",
        "/audit-logs/user-activity",
        "/audit-logs/table-activity",
        "/health",
        "/config",
        "/logs",
        "/backup",
        "/backups",
        "/restore",
        "/migrate",
        "/clear-cache",
        "/cleanup",
        "/test-email",
        "/test-sms",
        "/maintenance",
        "/modules/activate",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/admin/settings
 * @desc    Get system settings
 * @access  Private (Admin only)
 */
router.get("/settings", adminController.getSettings);

/**
 * @route   PUT /api/v1/admin/settings
 * @desc    Update system settings
 * @access  Private (Admin only)
 */
router.put(
  "/settings",
  [body("settings").isArray().withMessage("Settings array is required")],
  validate,
  adminController.updateSettings
);

/**
 * @route   GET /api/v1/admin/roles
 * @desc    Get all roles
 * @access  Private (Admin only)
 */
router.get("/roles", adminController.getRoles);

// department management
router.get(
  "/departments",
  hasPermission("MANAGE_DEPARTMENTS"),
  adminController.getDepartments
);
router.post(
  "/departments",
  hasPermission("MANAGE_DEPARTMENTS"),
  [
    body("department_code")
      .notEmpty()
      .withMessage("Department code is required"),
    body("department_name")
      .notEmpty()
      .withMessage("Department name is required"),
    body("department_type")
      .notEmpty()
      .withMessage("Department type is required"),
  ],
  validate,
  adminController.createDepartment
);

router.put(
  "/departments/:id",
  hasPermission("MANAGE_DEPARTMENTS"),
  [param("id").isUUID().withMessage("Valid department id is required")],
  validate,
  adminController.updateDepartment
);

router.delete(
  "/departments/:id",
  hasPermission("MANAGE_DEPARTMENTS"),
  [param("id").isUUID().withMessage("Valid department id is required")],
  validate,
  adminController.deleteDepartment
);

/**
 * @route   POST /api/v1/admin/roles
 * @desc    Create new role
 * @access  Private (Admin only)
 */
router.post(
  "/roles",
  hasPermission("MANAGE_ROLES"),
  [
    body("role_code").notEmpty().withMessage("Role code is required"),
    body("role_name").notEmpty().withMessage("Role name is required"),
  ],
  validate,
  adminController.createRole
);

/**
 * @route   PUT /api/v1/admin/roles/:id
 * @desc    Update role
 * @access  Private (Admin only)
 */
router.put(
  "/roles/:id",
  hasPermission("MANAGE_ROLES"),
  param("id").isUUID(),
  validate,
  adminController.updateRole
);

/**
 * @route   DELETE /api/v1/admin/roles/:id
 * @desc    Delete role
 * @access  Private (Admin only)
 */
router.delete(
  "/roles/:id",
  hasPermission("MANAGE_ROLES"),
  param("id").isUUID(),
  validate,
  adminController.deleteRole
);

/**
 * @route   GET /api/v1/admin/permissions
 * @desc    Get all permissions
 * @access  Private (Admin only)
 */
router.get("/permissions", adminController.getPermissions);

/**
 * @route   GET /api/v1/admin/audit-logs
 * @desc    Get audit logs
 * @access  Private (Admin only)
 */
router.get(
  "/audit-logs",
  hasPermission("VIEW_AUDIT_LOGS"),
  adminController.getAuditLogs
);

/**
 * @route   GET /api/v1/admin/audit-logs/user-activity
 * @desc    Get user activity summary
 * @access  Private (Admin only)
 */
router.get(
  "/audit-logs/user-activity",
  hasPermission("VIEW_AUDIT_LOGS"),
  adminController.getUserActivity
);

/**
 * @route   GET /api/v1/admin/audit-logs/table-activity
 * @desc    Get table activity summary
 * @access  Private (Admin only)
 */
router.get(
  "/audit-logs/table-activity",
  hasPermission("VIEW_AUDIT_LOGS"),
  adminController.getTableActivity
);

/**
 * @route   POST /api/v1/admin/users/:id/unlock
 * @desc    Unlock a locked user account
 * @access  Private (SYS_ADMIN only)
 */
router.post(
  "/users/:id/unlock",
  hasPermission("UPDATE_USER"),
  param("id").isUUID(),
  validate,
  adminController.unlockUser
);

/**
 * @route   GET /api/v1/admin/health
 * @desc    Get system health status
 * @access  Private (Admin only)
 */
router.get("/health", adminController.getSystemHealth);

/**
 * @route   GET /api/v1/admin/config
 * @desc    Get system configuration
 * @access  Private (Admin only)
 */
router.get("/config", adminController.getConfig);

/**
 * @route   GET /api/v1/admin/logs
 * @desc    Get system logs
 * @access  Private (Admin only)
 */
router.get("/logs", hasPermission("VIEW_SYSTEM_LOGS"), adminController.getLogs);

/**
 * @route   POST /api/v1/admin/backup
 * @desc    Create system backup
 * @access  Private (Admin only)
 */
router.post(
  "/backup",
  hasPermission("MANAGE_BACKUPS"),
  adminController.createBackup
);

/**
 * @route   GET /api/v1/admin/backups
 * @desc    Get list of backups
 * @access  Private (Admin only)
 */
router.get(
  "/backups",
  hasPermission("VIEW_BACKUPS"),
  adminController.getBackups
);

/**
 * @route   POST /api/v1/admin/restore
 * @desc    Restore from backup
 * @access  Private (Admin only)
 */
router.post(
  "/restore",
  hasPermission("MANAGE_BACKUPS"),
  [body("backup_file").notEmpty().withMessage("Backup file name is required")],
  validate,
  adminController.restoreBackup
);

/**
 * @route   POST /api/v1/admin/migrate
 * @desc    Run database migrations
 * @access  Private (Admin only)
 */
router.post(
  "/migrate",
  hasPermission("MANAGE_SYSTEM"),
  adminController.runMigrations
);

/**
 * @route   POST /api/v1/admin/clear-cache
 * @desc    Clear system cache
 * @access  Private (Admin only)
 */
router.post(
  "/clear-cache",
  hasPermission("MANAGE_SYSTEM"),
  adminController.clearCache
);

/**
 * @route   POST /api/v1/admin/cleanup
 * @desc    Clean up old data
 * @access  Private (Admin only)
 */
router.post(
  "/cleanup",
  hasPermission("MANAGE_SYSTEM"),
  [
    body("type")
      .isIn(["audit_logs", "temp_files"])
      .withMessage("Valid cleanup type is required"),
  ],
  validate,
  adminController.cleanupData
);

/**
 * @route   POST /api/v1/admin/test-email
 * @desc    Test email configuration
 * @access  Private (Admin only)
 */
router.post(
  "/test-email",
  hasPermission("MANAGE_SYSTEM"),
  [body("email").isEmail().withMessage("Valid email is required")],
  validate,
  adminController.testEmail
);

/**
 * @route   POST /api/v1/admin/test-sms
 * @desc    Test SMS configuration
 * @access  Private (Admin only)
 */
router.post(
  "/test-sms",
  hasPermission("MANAGE_SYSTEM"),
  [
    body("phone")
      .isMobilePhone("any")
      .withMessage("Valid phone number is required"),
  ],
  validate,
  adminController.testSMS
);

/**
 * @route   POST /api/v1/admin/maintenance
 * @desc    Toggle maintenance mode
 * @access  Private (Admin only)
 */
router.post(
  "/maintenance",
  hasPermission("MANAGE_SYSTEM"),
  [body("enabled").isBoolean().withMessage("Enabled flag is required")],
  validate,
  adminController.toggleMaintenance
);

/**
 * @route   POST /api/v1/admin/modules/activate
 * @desc    Activate a paid module with a license key
 * @access  Private (SYS_ADMIN)
 */
router.post(
  "/modules/activate",
  [
    body("module_code")
      .isIn(["CLINICAL", "DENTAL", "EYE", "LAB", "INSURANCE"])
      .withMessage(
        "module_code must be one of: CLINICAL, DENTAL, EYE, LAB, INSURANCE"
      ),
    body("license_key").notEmpty().withMessage("license_key is required"),
  ],
  validate,
  adminController.activateModule
);

module.exports = router;
