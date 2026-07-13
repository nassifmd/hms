const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const clinicalController = require("../../controllers/clinicalController");
const { authenticateToken, authorize } = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All clinical routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/clinical
 * @desc    Clinical module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Clinical",
      description:
        "OPD visits, triage, consultations, diagnoses, prescriptions",
      endpoints: [
        "/visits",
        "/visits/active",
        "/visits/:id",
        "/visits/:id/triage",
        "/visits/:id/diagnoses",
        "/visits/:id/discharge",
        "/visits/:id/transfer",
        "/visits/:id/timeline",
        "/diagnoses/search",
        "/diagnoses/:id",
        "/prescriptions",
        "/prescriptions/:id",
        "/prescriptions/pending",
        "/analytics/common-diagnoses",
        "/export",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/clinical/visits
 * @desc    Get visits list (filterable by date and search)
 * @access  Private
 */
router.get("/visits", clinicalController.getVisits);

/**
 * @route   GET /api/v1/clinical/visits/active
 * @desc    Get active visits
 * @access  Private
 */
router.get(
  "/visits/active",
  authorize("DOCTOR", "NURSE", "RECEPTION"),
  clinicalController.getActiveVisits
);

/**
 * @route   GET /api/v1/clinical/analytics/common-diagnoses
 * @desc    Get common diagnoses
 * @access  Private
 */
router.get(
  "/analytics/common-diagnoses",
  authorize("DOCTOR", "MED_SUPT"),
  clinicalController.getCommonDiagnoses
);

/**
 * @route   GET /api/v1/clinical/analytics/diagnosis-trends
 * @desc    Get diagnosis trends
 * @access  Private
 */
router.get(
  "/analytics/diagnosis-trends",
  authorize("DOCTOR", "MED_SUPT"),
  [
    query("diagnosis_code")
      .notEmpty()
      .withMessage("Diagnosis code is required"),
  ],
  validate,
  clinicalController.getDiagnosisTrends
);

/**
 * @route   GET /api/v1/clinical/analytics/prescription-stats
 * @desc    Get prescription statistics
 * @access  Private
 */
router.get(
  "/analytics/prescription-stats",
  authorize("DOCTOR", "MED_SUPT", "PHARMACIST"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  clinicalController.getPrescriptionStats
);

/**
 * @route   GET /api/v1/clinical/analytics/department-stats
 * @desc    Get department visit statistics
 * @access  Private
 */
router.get(
  "/analytics/department-stats",
  authorize("MED_SUPT"),
  [
    query("department_id")
      .isUUID()
      .withMessage("Valid department ID is required"),
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  clinicalController.getDepartmentStats
);

/**
 * @route   GET /api/v1/clinical/diagnoses/search
 * @desc    Search diagnoses
 * @access  Private
 */
router.get(
  "/diagnoses/search",
  authorize("DOCTOR", "NURSE"),
  [
    query("q")
      .isLength({ min: 2 })
      .withMessage("Search query must be at least 2 characters"),
  ],
  validate,
  clinicalController.searchDiagnoses
);

/**
 * @route   GET /api/v1/clinical/prescriptions/pending
 * @desc    Get pending prescriptions
 * @access  Private (Pharmacy)
 */
router.get(
  "/prescriptions/pending",
  authorize("PHARMACIST"),
  clinicalController.getPendingPrescriptions
);

/**
 * @route   GET /api/v1/clinical/patients/:patientId/visits
 * @desc    Get patient visits
 * @access  Private
 */
router.get(
  "/patients/:patientId/visits",
  param("patientId").isUUID(),
  validate,
  clinicalController.getPatientVisits
);

/**
 * @route   GET /api/v1/clinical/patients/:patientId/diagnoses
 * @desc    Get patient diagnoses
 * @access  Private
 */
router.get(
  "/patients/:patientId/diagnoses",
  param("patientId").isUUID(),
  validate,
  clinicalController.getPatientDiagnoses
);

/**
 * @route   GET /api/v1/clinical/patients/:patientId/prescriptions
 * @desc    Get patient prescriptions
 * @access  Private
 */
router.get(
  "/patients/:patientId/prescriptions",
  param("patientId").isUUID(),
  validate,
  clinicalController.getPatientPrescriptions
);

/**
 * @route   POST /api/v1/clinical/visits
 * @desc    Create a new visit
 * @access  Private (Reception, Nurses, Doctors)
 */
router.post(
  "/visits",
  authorize("RECEPTION", "NURSE", "DOCTOR"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("department_id")
      .optional({ values: "falsy" })
      .isUUID()
      .withMessage("Valid department ID is required"),
    body("visit_type")
      .isIn(["Outpatient", "Inpatient", "Emergency", "Review"])
      .withMessage("Valid visit type is required"),
  ],
  validate,
  clinicalController.createVisit
);

/**
 * @route   GET /api/v1/clinical/visits/:id
 * @desc    Get visit by ID
 * @access  Private
 */
router.get(
  "/visits/:id",
  param("id").isUUID(),
  validate,
  clinicalController.getVisit
);

/**
 * @route   PUT /api/v1/clinical/visits/:id
 * @desc    Update visit
 * @access  Private (Doctors, Nurses)
 */
router.put(
  "/visits/:id",
  authorize("DOCTOR", "NURSE"),
  param("id").isUUID(),
  validate,
  clinicalController.updateVisit
);

/**
 * @route   PUT /api/v1/clinical/visits/:id/triage
 * @desc    Triage patient
 * @access  Private (Nurses)
 */
router.put(
  "/visits/:id/triage",
  authorize("NURSE"),
  param("id").isUUID(),
  [body("notes").optional().isString(), body("vitals").optional().isObject()],
  validate,
  clinicalController.triageVisit
);

/**
 * @route   POST /api/v1/clinical/visits/:id/diagnoses
 * @desc    Add diagnosis to visit
 * @access  Private (Doctors)
 */
router.post(
  "/visits/:id/diagnoses",
  authorize("DOCTOR"),
  param("id").isUUID(),
  [
    body("diagnosis_code").notEmpty().withMessage("Diagnosis code is required"),
    body("diagnosis_name").notEmpty().withMessage("Diagnosis name is required"),
    body("diagnosis_type")
      .isIn(["Primary", "Secondary", "Differential"])
      .withMessage("Valid diagnosis type is required"),
  ],
  validate,
  clinicalController.addDiagnosis
);

/**
 * @route   GET /api/v1/clinical/visits/:id/diagnoses
 * @desc    Get diagnoses for visit
 * @access  Private
 */
router.get(
  "/visits/:id/diagnoses",
  param("id").isUUID(),
  validate,
  clinicalController.getDiagnoses
);

/**
 * @route   PUT /api/v1/clinical/visits/:id/discharge
 * @desc    Discharge patient
 * @access  Private (Doctors)
 */
router.put(
  "/visits/:id/discharge",
  authorize("DOCTOR"),
  param("id").isUUID(),
  [
    body("discharge_notes")
      .notEmpty()
      .withMessage("Discharge notes are required"),
  ],
  validate,
  clinicalController.dischargePatient
);

/**
 * @route   PUT /api/v1/clinical/visits/:id/transfer
 * @desc    Transfer patient
 * @access  Private (Doctors)
 */
router.put(
  "/visits/:id/transfer",
  authorize("DOCTOR"),
  param("id").isUUID(),
  [
    body("department_id")
      .isUUID()
      .withMessage("Valid department ID is required"),
    body("reason").notEmpty().withMessage("Transfer reason is required"),
  ],
  validate,
  clinicalController.transferPatient
);

/**
 * @route   GET /api/v1/clinical/visits/:id/timeline
 * @desc    Get visit timeline
 * @access  Private
 */
router.get(
  "/visits/:id/timeline",
  param("id").isUUID(),
  validate,
  clinicalController.getVisitTimeline
);

/**
 * @route   GET /api/v1/clinical/diagnoses/:id
 * @desc    Get diagnosis by ID
 * @access  Private
 */
router.get(
  "/diagnoses/:id",
  param("id").isUUID(),
  validate,
  clinicalController.getDiagnosis
);

/**
 * @route   PUT /api/v1/clinical/diagnoses/:id
 * @desc    Update diagnosis
 * @access  Private (Doctors)
 */
router.put(
  "/diagnoses/:id",
  authorize("DOCTOR"),
  param("id").isUUID(),
  validate,
  clinicalController.updateDiagnosis
);

/**
 * @route   PUT /api/v1/clinical/diagnoses/:id/confirm
 * @desc    Confirm diagnosis
 * @access  Private (Doctors)
 */
router.put(
  "/diagnoses/:id/confirm",
  authorize("DOCTOR"),
  param("id").isUUID(),
  validate,
  clinicalController.confirmDiagnosis
);

/**
 * @route   POST /api/v1/clinical/prescriptions
 * @desc    Create prescription
 * @access  Private (Doctors)
 */
router.post(
  "/prescriptions",
  authorize("DOCTOR"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("visit_id").isUUID().withMessage("Valid visit ID is required"),
    body("items").isArray().withMessage("Prescription items are required"),
  ],
  validate,
  clinicalController.createPrescription
);

/**
 * @route   GET /api/v1/clinical/prescriptions/:id
 * @desc    Get prescription by ID
 * @access  Private
 */
router.get(
  "/prescriptions/:id",
  param("id").isUUID(),
  validate,
  clinicalController.getPrescription
);

/**
 * @route   PUT /api/v1/clinical/prescriptions/:id
 * @desc    Update prescription
 * @access  Private (Doctors)
 */
router.put(
  "/prescriptions/:id",
  authorize("DOCTOR"),
  param("id").isUUID(),
  validate,
  clinicalController.updatePrescription
);

/**
 * @route   POST /api/v1/clinical/prescriptions/:id/items
 * @desc    Add item to prescription
 * @access  Private (Doctors)
 */
router.post(
  "/prescriptions/:id/items",
  authorize("DOCTOR"),
  param("id").isUUID(),
  [
    body("medication_name")
      .notEmpty()
      .withMessage("Medication name is required"),
    body("dosage").notEmpty().withMessage("Dosage is required"),
    body("frequency").notEmpty().withMessage("Frequency is required"),
  ],
  validate,
  clinicalController.addPrescriptionItem
);

/**
 * @route   PUT /api/v1/clinical/prescriptions/:prescriptionId/items/:itemId
 * @desc    Update prescription item
 * @access  Private (Doctors)
 */
router.put(
  "/prescriptions/:prescriptionId/items/:itemId",
  authorize("DOCTOR"),
  [param("prescriptionId").isUUID(), param("itemId").isUUID()],
  validate,
  clinicalController.updatePrescriptionItem
);

/**
 * @route   DELETE /api/v1/clinical/prescriptions/:prescriptionId/items/:itemId
 * @desc    Remove prescription item
 * @access  Private (Doctors)
 */
router.delete(
  "/prescriptions/:prescriptionId/items/:itemId",
  authorize("DOCTOR"),
  [param("prescriptionId").isUUID(), param("itemId").isUUID()],
  validate,
  clinicalController.removePrescriptionItem
);

/**
 * @route   GET /api/v1/clinical/export
 * @desc    Export clinical data
 * @access  Private (Admin only)
 */
router.get(
  "/export",
  authorize("SYS_ADMIN", "MED_SUPT"),
  [
    query("patient_id").optional().isUUID(),
    query("from_date").optional().isDate(),
    query("to_date").optional().isDate(),
  ],
  validate,
  clinicalController.exportClinicalData
);

module.exports = router;
