const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const dentalController = require("../../controllers/dentalController");
const {
  authenticateToken,
  authorize,
  hasModuleAccess,
} = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");
const Pharmacy = require("../../models/Pharmacy");
const { FileUploadMiddleware } = require("../../middleware/fileUpload");
const path = require("path");

const dentalUpload = new FileUploadMiddleware({
  uploadDir: path.join(__dirname, "../../../uploads/dental"),
  maxSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
});

// All dental routes require authentication and dental module access
router.use(authenticateToken);
router.use(hasModuleAccess("DENTAL"));

/**
 * @route   GET /api/v1/dental
 * @desc    Dental module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Dental",
      description: "Dental charts, procedures, treatment plans",
      endpoints: [
        "/drugs/search",
        "/catalog",
        "/dashboard",
        "/stats",
        "/today-appointments",
        "/today-patients",
        "/charts",
        "/charts/:id",
        "/charts/:id/full",
        "/charts/:id/bpe",
        "/charts/:id/treatment-plan",
        "/procedures",
        "/procedures/:id",
        "/patients/:patientId/charts",
        "/patients/:patientId/procedures",
        "/patients/:patientId/treatment-plans",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/dental/drugs/search
 * @desc    Search medicines/drugs for prescriptions (dental access)
 * @access  Private
 */
router.get(
  "/drugs/search",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  [
    query("q")
      .isLength({ min: 2 })
      .withMessage("Search query must be at least 2 characters"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const drugs = await Pharmacy.searchDrugs(
        req.query.q,
        req.user.facilityId
      );
      res.json({ success: true, data: drugs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   GET /api/v1/dental/catalog
 * @desc    Get dental procedure catalog
 * @access  Private
 */
router.get(
  "/catalog",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  dentalController.getProcedureCatalog
);

/**
 * @route   POST /api/v1/dental/catalog
 * @desc    Create procedure catalog item
 * @access  Private (Admin only)
 */
router.post(
  "/catalog",
  authorize("SYS_ADMIN"),
  [
    body("procedure_code").notEmpty().withMessage("Procedure code is required"),
    body("procedure_name").notEmpty().withMessage("Procedure name is required"),
    body("procedure_category")
      .notEmpty()
      .withMessage("Procedure category is required"),
    body("price").isNumeric().withMessage("Valid price is required"),
  ],
  validate,
  dentalController.createProcedureCatalog
);

/**
 * @route   GET /api/v1/dental/stats
 * @desc    Get dental statistics
 * @access  Private
 */
router.get(
  "/stats",
  authorize("DENTIST", "DENTAL_SURGEON", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  dentalController.getStats
);

/**
 * @route   GET /api/v1/dental/dashboard
 * @desc    Get dental dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("DENTIST", "DENTAL_SURGEON"),
  dentalController.getDashboard
);

/**
 * @route   GET /api/v1/dental/today-appointments
 * @desc    Get today's dental appointments
 * @access  Private
 */
router.get(
  "/today-appointments",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  dentalController.getTodayAppointments
);

/**
 * @route   GET /api/v1/dental/today-patients
 * @desc    Get patients who had a dental procedure today
 * @access  Private
 */
router.get(
  "/today-patients",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  dentalController.getTodayPatients
);

/**
 * @route   GET /api/v1/dental/patients/:patientId/charts
 * @desc    Get patient dental charts
 * @access  Private
 */
router.get(
  "/patients/:patientId/charts",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("patientId").isUUID(),
  validate,
  dentalController.getPatientCharts
);

/**
 * @route   GET /api/v1/dental/patients/:patientId/procedures
 * @desc    Get patient dental procedures
 * @access  Private
 */
router.get(
  "/patients/:patientId/procedures",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("patientId").isUUID(),
  validate,
  dentalController.getPatientProcedures
);

/**
 * @route   GET /api/v1/dental/patients/:patientId/teeth/:toothNumber/history
 * @desc    Get tooth treatment history
 * @access  Private
 */
router.get(
  "/patients/:patientId/teeth/:toothNumber/history",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    param("patientId").isUUID(),
    param("toothNumber").isInt({ min: 11, max: 85 }),
  ],
  validate,
  dentalController.getToothHistory
);

/**
 * @route   POST /api/v1/dental/charts
 * @desc    Create a new dental chart
 * @access  Private (Dentists, Dental Surgeons)
 */
router.post(
  "/charts",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("visit_id").optional().isUUID(),
    body("chart_type")
      .isIn(["Adult", "Child"])
      .withMessage("Valid chart type is required"),
  ],
  validate,
  dentalController.createChart
);

/**
 * @route   GET /api/v1/dental/charts/:id
 * @desc    Get dental chart by ID
 * @access  Private
 */
router.get(
  "/charts/:id",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("id").isUUID(),
  validate,
  dentalController.getChart
);

/**
 * @route   PUT /api/v1/dental/charts/:chartId/teeth/:toothNumber
 * @desc    Update tooth status
 * @access  Private (Dentists)
 */
router.put(
  "/charts/:chartId/teeth/:toothNumber",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    param("chartId").isUUID(),
    param("toothNumber").isInt({ min: 11, max: 85 }),
    body("status").notEmpty().withMessage("Tooth status is required"),
  ],
  validate,
  dentalController.updateTooth
);

/**
 * @route   POST /api/v1/dental/charts/:chartId/treatment-plan
 * @desc    Create treatment plan
 * @access  Private (Dentists)
 */
router.post(
  "/charts/:chartId/treatment-plan",
  authorize("DENTIST", "DENTAL_SURGEON"),
  param("chartId").isUUID(),
  [
    body("diagnosis").notEmpty().withMessage("Diagnosis is required"),
    body("treatment_description")
      .notEmpty()
      .withMessage("Treatment description is required"),
    body("estimated_cost")
      .isNumeric()
      .withMessage("Valid estimated cost is required"),
  ],
  validate,
  dentalController.createTreatmentPlan
);

/**
 * @route   GET /api/v1/dental/patients/:patientId/treatment-plans
 * @desc    Get all treatment plans for a patient
 * @access  Private
 */
router.get(
  "/patients/:patientId/treatment-plans",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("patientId").isUUID(),
  validate,
  dentalController.getPatientTreatmentPlans
);

/**
 * @route   PATCH /api/v1/dental/treatment-plans/:planId
 * @desc    Update treatment plan status
 * @access  Private
 */
router.patch(
  "/treatment-plans/:planId",
  authorize("DENTIST", "DENTAL_SURGEON"),
  param("planId").isUUID(),
  validate,
  dentalController.updateTreatmentPlan
);

/**
 * @route   GET /api/v1/dental/charts/:id/full
 * @desc    Get chart with all teeth data
 * @access  Private
 */
router.get(
  "/charts/:id/full",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("id").isUUID(),
  validate,
  dentalController.getChartFull
);

/**
 * @route   POST /api/v1/dental/procedures
 * @desc    Create dental procedure
 * @access  Private (Dentists, Dental Surgeons)
 */
router.post(
  "/procedures",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("visit_id").optional().isUUID(),
    body("procedure_id").isUUID().withMessage("Valid procedure ID is required"),
    body("tooth_number").optional().isInt({ min: 11, max: 85 }),
    body("assisted_by")
      .optional()
      .isUUID()
      .withMessage("Assisting user must be a valid UUID"),
    body("anaesthetist_id")
      .optional()
      .isUUID()
      .withMessage("Anaesthetist must be a valid UUID"),
    body("findings").optional().isString(),
  ],
  validate,
  dentalController.createProcedure
);

/**
 * @route   GET /api/v1/dental/procedures/:id
 * @desc    Get dental procedure by ID
 * @access  Private
 */
router.get(
  "/procedures/:id",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("id").isUUID(),
  validate,
  dentalController.getProcedure
);

/**
 * @route   POST /api/v1/dental/procedures/:id/prescriptions
 * @desc    Create a prescription after a dental procedure
 * @access  Private (Dentists)
 */
router.post(
  "/procedures/:id/prescriptions",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    param("id").isUUID(),
    body("items")
      .isArray({ min: 1 })
      .withMessage("At least one medication item is required"),
    body("items.*.medication_name")
      .notEmpty()
      .withMessage("Medication name is required"),
    body("items.*.dosage").notEmpty().withMessage("Dosage is required"),
    body("items.*.frequency").notEmpty().withMessage("Frequency is required"),
  ],
  validate,
  dentalController.createPrescription
);

/**
 * @route   POST /api/v1/dental/procedures/:id/xray-request
 * @desc    Request dental X-ray imaging for a procedure
 * @access  Private (Dentists)
 */
router.post(
  "/procedures/:id/xray-request",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    param("id").isUUID(),
    body("imaging_type")
      .isIn(["Periapical", "Bitewing", "Panoramic", "CBCT", "Occlusal"])
      .withMessage("Valid imaging type required"),
  ],
  validate,
  dentalController.createXrayRequest
);

/**
 * @route   POST /api/v1/dental/procedures/:id/attachments
 * @desc    Upload X-ray image or result file for a dental procedure
 * @access  Private (Dentists)
 */
router.post(
  "/procedures/:id/attachments",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("id").isUUID(),
  validate,
  dentalUpload.single("file", "dental"),
  dentalController.uploadAttachment
);

/**
 * @route   GET /api/v1/dental/procedures/:id/actions
 * @desc    Get post-procedure actions (prescriptions, X-ray requests, attachments)
 * @access  Private
 */
router.get(
  "/procedures/:id/actions",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("id").isUUID(),
  validate,
  dentalController.getProcedureActions
);

// ── BPE (Basic Periodontal Examination) ──

/**
 * @route   POST /api/v1/dental/charts/:chartId/bpe
 * @desc    Record a BPE examination for a dental chart
 * @access  Private (Dentists, Dental Surgeons)
 */
router.post(
  "/charts/:chartId/bpe",
  authorize("DENTIST", "DENTAL_SURGEON"),
  [
    param("chartId").isUUID(),
    body("sextant_1")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 1 must be 0–4, optionally with *"),
    body("sextant_2")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 2 must be 0–4, optionally with *"),
    body("sextant_3")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 3 must be 0–4, optionally with *"),
    body("sextant_4")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 4 must be 0–4, optionally with *"),
    body("sextant_5")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 5 must be 0–4, optionally with *"),
    body("sextant_6")
      .optional()
      .matches(/^[0-4]\*?$/)
      .withMessage("Sextant 6 must be 0–4, optionally with *"),
  ],
  validate,
  dentalController.createBPE
);

/**
 * @route   GET /api/v1/dental/charts/:chartId/bpe
 * @desc    Get BPE examinations for a dental chart
 * @access  Private
 */
router.get(
  "/charts/:chartId/bpe",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("chartId").isUUID(),
  validate,
  dentalController.getChartBPE
);

/**
 * @route   GET /api/v1/dental/patients/:patientId/bpe
 * @desc    Get BPE examination history for a patient
 * @access  Private
 */
router.get(
  "/patients/:patientId/bpe",
  authorize("DENTIST", "DENTAL_SURGEON", "DENTAL_TECH"),
  param("patientId").isUUID(),
  validate,
  dentalController.getPatientBPE
);

module.exports = router;
