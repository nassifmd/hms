const express = require("express");
const router = express.Router();
const { body, query } = require("express-validator");
const reportController = require("../../controllers/reportController");
const { authenticateToken, authorize } = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All report routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/reports
 * @desc    Reports module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Reports",
      description: "DHIMS-2, IDSR, financial, clinical, inventory reports",
      endpoints: [
        "/templates",
        "/patient-demographics",
        "/clinical-activity",
        "/financial",
        "/inventory",
        "/lab",
        "/appointments",
        "/mortality",
        "/custom",
        "/schedule",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/reports/templates
 * @desc    Get available report templates
 * @access  Private
 */
router.get(
  "/templates",
  authorize("MED_SUPT", "ACCOUNTS", "SYS_ADMIN"),
  reportController.getReportTemplates
);

/**
 * @route   GET /api/v1/reports/patient-demographics
 * @desc    Generate patient demographics report
 * @access  Private
 */
router.get(
  "/patient-demographics",
  authorize("MED_SUPT", "SYS_ADMIN"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getPatientDemographics
);

/**
 * @route   GET /api/v1/reports/clinical-activity
 * @desc    Generate clinical activity report
 * @access  Private
 */
router.get(
  "/clinical-activity",
  authorize("MED_SUPT", "DOCTOR"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getClinicalActivity
);

/**
 * @route   GET /api/v1/reports/financial
 * @desc    Generate financial report
 * @access  Private
 */
router.get(
  "/financial",
  authorize("ACCOUNTS", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getFinancialReport
);

/**
 * @route   GET /api/v1/reports/inventory
 * @desc    Generate inventory report
 * @access  Private
 */
router.get(
  "/inventory",
  authorize("PHARMACIST", "SYS_ADMIN"),
  reportController.getInventoryReport
);

/**
 * @route   GET /api/v1/reports/lab
 * @desc    Generate lab report
 * @access  Private
 */
router.get(
  "/lab",
  authorize("LAB_TECH", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getLabReport
);

/**
 * @route   GET /api/v1/reports/appointments
 * @desc    Generate appointment report
 * @access  Private
 */
router.get(
  "/appointments",
  authorize("RECEPTION", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getAppointmentReport
);

/**
 * @route   POST /api/v1/reports/custom
 * @desc    Generate custom report
 * @access  Private (Admin only)
 */
router.post(
  "/custom",
  authorize("SYS_ADMIN", "MED_SUPT"),
  [
    body("metrics").isArray().withMessage("Metrics array is required"),
    body("start_date").isDate().withMessage("Start date is required"),
    body("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getCustomReport
);

/**
 * @route   GET /api/v1/reports/mortality
 * @desc    Generate mortality report (deaths by cause, gender, age)
 * @access  Private
 */
router.get(
  "/mortality",
  authorize("MED_SUPT", "DOCTOR", "SYS_ADMIN"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  reportController.getMortalityReport
);

/**
 * @route   POST /api/v1/reports/schedule
 * @desc    Schedule automated report
 * @access  Private (Admin only)
 */
router.post(
  "/schedule",
  authorize("SYS_ADMIN"),
  [
    body("report_type").notEmpty().withMessage("Report type is required"),
    body("schedule")
      .notEmpty()
      .withMessage("Schedule configuration is required"),
    body("recipients").isArray().withMessage("Recipients array is required"),
  ],
  validate,
  reportController.scheduleReport
);

module.exports = router;
