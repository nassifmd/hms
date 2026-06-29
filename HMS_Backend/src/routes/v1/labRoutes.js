const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const labController = require("../../controllers/labController");
const {
  authenticateToken,
  authorize,
  hasModuleAccess,
} = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");
const { FileUploadMiddleware } = require("../../middleware/fileUpload");

const labResultUpload = new FileUploadMiddleware({
  uploadDir: require("path").join(__dirname, "../../../uploads"),
  maxSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf", ".doc", ".docx"],
});

// All lab routes require authentication and lab module access
router.use(authenticateToken);
router.use(hasModuleAccess("LAB"));

/**
 * @route   GET /api/v1/lab
 * @desc    Lab module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Laboratory",
      description: "Test catalog, request tracking, result entry",
      endpoints: [
        "/tests",
        "/tests/search",
        "/panels",
        "/orders",
        "/orders/pending",
        "/orders/:id",
        "/orders/:id/results",
        "/orders/:id/print",
        "/stats",
        "/dashboard",
        "/alerts/critical",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/lab/tests
 * @desc    Get lab tests catalog
 * @access  Private
 */
router.get(
  "/tests",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  labController.getTestCatalog
);

/**
 * @route   GET /api/v1/lab/tests/search
 * @desc    Search lab tests
 * @access  Private
 */
router.get(
  "/tests/search",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  [
    query("q")
      .isLength({ min: 2 })
      .withMessage("Search query must be at least 2 characters"),
  ],
  validate,
  labController.searchTests
);

/**
 * @route   POST /api/v1/lab/tests
 * @desc    Create lab test
 * @access  Private (Admin)
 */
router.post(
  "/tests",
  authorize("SYS_ADMIN"),
  [
    body("test_code").notEmpty().withMessage("Test code is required"),
    body("test_name").notEmpty().withMessage("Test name is required"),
    body("test_category").notEmpty().withMessage("Test category is required"),
  ],
  validate,
  labController.createTest
);

/**
 * @route   GET /api/v1/lab/panels
 * @desc    Get lab panels
 * @access  Private
 */
router.get("/panels", authorize("LAB_TECH", "DOCTOR"), labController.getPanels);

/**
 * @route   POST /api/v1/lab/panels
 * @desc    Create lab panel
 * @access  Private (Admin)
 */
router.post(
  "/panels",
  authorize("SYS_ADMIN"),
  [
    body("panel_code").notEmpty().withMessage("Panel code is required"),
    body("panel_name").notEmpty().withMessage("Panel name is required"),
    body("tests").isArray().withMessage("Tests array is required"),
  ],
  validate,
  labController.createPanel
);

/**
 * @route   GET /api/v1/lab/orders/pending
 * @desc    Get pending lab orders
 * @access  Private (Lab Technician)
 */
router.get(
  "/orders/pending",
  authorize("LAB_TECH"),
  labController.getPendingOrders
);

/**
 * @route   GET /api/v1/lab/patients/:patientId/orders
 * @desc    Get patient lab orders
 * @access  Private
 */
router.get(
  "/patients/:patientId/orders",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  param("patientId").isUUID(),
  validate,
  labController.getPatientOrders
);

/**
 * @route   GET /api/v1/lab/stats
 * @desc    Get lab statistics
 * @access  Private
 */
router.get(
  "/stats",
  authorize("LAB_TECH", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  labController.getStats
);

/**
 * @route   GET /api/v1/lab/dashboard
 * @desc    Get lab dashboard
 * @access  Private
 */
router.get("/dashboard", authorize("LAB_TECH"), labController.getDashboard);

/**
 * @route   GET /api/v1/lab/alerts/critical
 * @desc    Get critical alerts
 * @access  Private
 */
router.get(
  "/alerts/critical",
  authorize("LAB_TECH", "DOCTOR"),
  labController.getCriticalAlerts
);

/**
 * @route   PUT /api/v1/lab/alerts/:id/acknowledge
 * @desc    Acknowledge critical alert
 * @access  Private
 */
router.put(
  "/alerts/:id/acknowledge",
  authorize("LAB_TECH", "DOCTOR"),
  param("id").isUUID(),
  validate,
  labController.acknowledgeAlert
);

/**
 * @route   POST /api/v1/lab/orders
 * @desc    Create lab order
 * @access  Private (Doctors)
 */
router.post(
  "/orders",
  authorize("DOCTOR"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("visit_id")
      .optional()
      .isUUID()
      .withMessage("Valid visit ID required when provided"),
    body("tests").isArray().withMessage("Tests array is required"),
  ],
  validate,
  labController.createOrder
);

/**
 * @route   GET /api/v1/lab/orders
 * @desc    Get lab orders with optional status/search filtering
 * @access  Private
 */
router.get(
  "/orders",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  [
    query("status")
      .optional()
      .isIn(["Pending", "Processing", "Completed", "Cancelled"])
      .withMessage("Invalid status"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage("Invalid limit"),
  ],
  validate,
  labController.getOrders
);

/**
 * @route   GET /api/v1/lab/orders/:id
 * @desc    Get lab order by ID
 * @access  Private
 */
router.get(
  "/orders/:id",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  param("id").isUUID(),
  validate,
  labController.getOrder
);

/**
 * @route   GET /api/v1/lab/orders/:id/results
 * @desc    Get test results
 * @access  Private
 */
router.get(
  "/orders/:id/results",
  authorize("LAB_TECH", "DOCTOR", "NURSE"),
  param("id").isUUID(),
  validate,
  labController.getResults
);

/**
 * @route   GET /api/v1/lab/orders/:id/print
 * @desc    Print lab report
 * @access  Private
 */
router.get(
  "/orders/:id/print",
  authorize("LAB_TECH", "DOCTOR"),
  param("id").isUUID(),
  validate,
  labController.printReport
);

/**
 * @route   POST /api/v1/lab/orders/:id/comments
 * @desc    Add comment to lab order
 * @access  Private
 */
router.post(
  "/orders/:id/comments",
  authorize("LAB_TECH", "DOCTOR"),
  param("id").isUUID(),
  [body("comment").notEmpty().withMessage("Comment is required")],
  validate,
  labController.addComment
);

/**
 * @route   GET /api/v1/lab/orders/:id/comments
 * @desc    Get lab order comments
 * @access  Private
 */
router.get(
  "/orders/:id/comments",
  authorize("LAB_TECH", "DOCTOR"),
  param("id").isUUID(),
  validate,
  labController.getComments
);

/**
 * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/collect
 * @desc    Collect specimen
 * @access  Private (Lab Technician)
 */
router.put(
  "/orders/:orderId/items/:itemId/collect",
  authorize("LAB_TECH"),
  [param("orderId").isUUID(), param("itemId").isUUID()],
  validate,
  labController.collectSpecimen
);

/**
 * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/result
 * @desc    Enter test result (supports multipart/form-data with up to 5 attachments)
 * @access  Private (Lab Technician)
 */
router.put(
  "/orders/:orderId/items/:itemId/result",
  authorize("LAB_TECH"),
  labResultUpload.array("attachments", 5, "lab-results"),
  [
    param("orderId").isUUID(),
    param("itemId").isUUID(),
    body("result_value").notEmpty().withMessage("Result value is required"),
  ],
  validate,
  labController.enterResult
);

/**
 * @route   PUT /api/v1/lab/orders/:orderId/items/:itemId/verify
 * @desc    Verify test result
 * @access  Private (Lab Technician Supervisor)
 */
router.put(
  "/orders/:orderId/items/:itemId/verify",
  authorize("LAB_TECH"),
  [param("orderId").isUUID(), param("itemId").isUUID()],
  validate,
  labController.verifyResult
);

module.exports = router;
