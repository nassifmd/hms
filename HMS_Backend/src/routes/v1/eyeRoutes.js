const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const eyeController = require("../../controllers/eyeController");
const {
  authenticateToken,
  authorize,
  hasModuleAccess,
} = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All eye clinic routes require authentication and eye module access
router.use(authenticateToken);
router.use(hasModuleAccess("EYE"));

/**
 * @route   GET /api/v1/eye
 * @desc    Eye clinic module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Eye Clinic",
      description:
        "Visual acuity, IOP, slit-lamp findings, refraction, spectacle prescriptions",
      endpoints: [
        "/dashboard",
        "/stats",
        "/inventory",
        "/examinations",
        "/examinations/:id",
        "/prescriptions",
        "/prescriptions/:id",
        "/prescriptions/:id/dispense",
        "/visual-field-tests",
        "/patients/:patientId/examinations",
        "/patients/:patientId/prescriptions",
        "/calculate/spherical-equivalent",
        "/convert/visual-acuity",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/eye/stats
 * @desc    Get eye examination statistics
 * @access  Private
 */
router.get(
  "/stats",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  eyeController.getStats
);

/**
 * @route   GET /api/v1/eye/dashboard
 * @desc    Get eye clinic dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST"),
  eyeController.getDashboard
);

/**
 * @route   GET /api/v1/eye/inventory
 * @desc    Get optical inventory
 * @access  Private
 */
router.get(
  "/inventory",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  eyeController.getOpticalInventory
);

/**
 * @route   POST /api/v1/eye/inventory
 * @desc    Add optical inventory item
 * @access  Private (Technician, Admin)
 */
router.post(
  "/inventory",
  authorize("TECHNICIAN", "SYS_ADMIN"),
  [
    body("item_type")
      .optional()
      .isIn(["Frame", "Lens", "Contact Lens", "Solution"])
      .withMessage("Valid item type is required"),
    body("item_code")
      .optional()
      .notEmpty()
      .withMessage("Item code is required"),
    body("item_name")
      .optional()
      .notEmpty()
      .withMessage("Item name is required"),
    body("brand").optional().isString(),
    body("model").optional().isString(),
    body("color").optional().isString(),
    body("size").optional().isString(),
    body("material").optional().isString(),
    body("quantity_on_hand")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Valid quantity is required"),
    body("unit_cost").optional().isNumeric(),
    body("selling_price")
      .optional()
      .isNumeric()
      .withMessage("Valid selling price is required"),
    body("supplier_id").optional().isUUID(),
    body("reorder_level").optional().isInt(),
    body("location").optional().isString(),
    body("is_active").optional().isBoolean(),
  ],
  validate,
  eyeController.addOpticalItem
);

/**
 * @route   PUT /api/v1/eye/inventory/:id
 * @desc    Update optical inventory item
 * @access  Private (Technician)
 */
router.put(
  "/inventory/:id",
  authorize("TECHNICIAN"),
  param("id").isUUID(),
  validate,
  eyeController.updateOpticalItem
);

/**
 * @route   GET /api/v1/eye/patients/:patientId/examinations
 * @desc    Get patient eye examinations
 * @access  Private
 */
router.get(
  "/patients/:patientId/examinations",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  param("patientId").isUUID(),
  validate,
  eyeController.getPatientExaminations
);

/**
 * @route   GET /api/v1/eye/patients/:patientId/prescriptions
 * @desc    Get patient glasses prescriptions
 * @access  Private
 */
router.get(
  "/patients/:patientId/prescriptions",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  param("patientId").isUUID(),
  validate,
  eyeController.getPatientPrescriptions
);

/**
 * @route   POST /api/v1/eye/examinations
 * @desc    Create eye examination
 * @access  Private (Optometrists, Ophthalmologists)
 */
router.post(
  "/examinations",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("visit_id").optional().isUUID(),
    body("va_distance_right_uncorrected").optional(),
    body("va_distance_left_uncorrected").optional(),
    body("sphere_right").optional().isFloat(),
    body("sphere_left").optional().isFloat(),
    body("cylinder_right").optional().isFloat(),
    body("cylinder_left").optional().isFloat(),
    body("axis_right").optional().isInt({ min: 0, max: 180 }),
    body("axis_left").optional().isInt({ min: 0, max: 180 }),
    body("diagnosis_right").optional().isString(),
    body("diagnosis_left").optional().isString(),
  ],
  validate,
  eyeController.createExamination
);

/**
 * @route   GET /api/v1/eye/examinations/:id
 * @desc    Get eye examination by ID
 * @access  Private
 */
router.get(
  "/examinations/:id",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  param("id").isUUID(),
  validate,
  eyeController.getExamination
);

/**
 * @route   POST /api/v1/eye/prescriptions
 * @desc    Create glasses prescription
 * @access  Private (Optometrists, Ophthalmologists)
 */
router.post(
  "/prescriptions",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("eye_examination_id").optional().isUUID(),
    body("distance_sphere_right").optional().isFloat(),
    body("distance_sphere_left").optional().isFloat(),
    body("distance_cylinder_right").optional().isFloat(),
    body("distance_cylinder_left").optional().isFloat(),
    body("distance_axis_right").optional().isInt({ min: 0, max: 180 }),
    body("distance_axis_left").optional().isInt({ min: 0, max: 180 }),
    body("glasses_type")
      .optional()
      .isIn(["Single Vision", "Bifocal", "Progressive"]),
  ],
  validate,
  eyeController.createGlassesPrescription
);

/**
 * @route   GET /api/v1/eye/prescriptions/:id
 * @desc    Get glasses prescription by ID
 * @access  Private
 */
router.get(
  "/prescriptions/:id",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  param("id").isUUID(),
  validate,
  eyeController.getGlassesPrescription
);

/**
 * @route   PUT /api/v1/eye/prescriptions/:id/dispense
 * @desc    Mark glasses as dispensed
 * @access  Private (Technician)
 */
router.put(
  "/prescriptions/:id/dispense",
  authorize("TECHNICIAN"),
  param("id").isUUID(),
  validate,
  eyeController.dispenseGlasses
);

/**
 * @route   POST /api/v1/eye/visual-field-tests
 * @desc    Create visual field test
 * @access  Private (Optometrists, Ophthalmologists)
 */
router.post(
  "/visual-field-tests",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("eye")
      .isIn(["Right", "Left", "Both"])
      .withMessage("Valid eye is required"),
    body("mean_deviation").optional().isFloat(),
    body("pattern_standard_deviation").optional().isFloat(),
  ],
  validate,
  eyeController.createVisualFieldTest
);

/**
 * @route   POST /api/v1/eye/calculate/spherical-equivalent
 * @desc    Calculate spherical equivalent
 * @access  Private
 */
router.post(
  "/calculate/spherical-equivalent",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST"),
  [
    body("sphere_right").optional().isFloat(),
    body("cylinder_right").optional().isFloat(),
    body("sphere_left").optional().isFloat(),
    body("cylinder_left").optional().isFloat(),
  ],
  validate,
  eyeController.calculateSphericalEquivalent
);

/**
 * @route   POST /api/v1/eye/convert/visual-acuity
 * @desc    Convert visual acuity
 * @access  Private
 */
router.post(
  "/convert/visual-acuity",
  authorize("OPTOMETRIST", "OPHTHALMOLOGIST", "TECHNICIAN"),
  [
    body("value").notEmpty().withMessage("Visual acuity value is required"),
    body("from_format")
      .isIn(["snellen", "decimal"])
      .withMessage("Valid from format is required"),
    body("to_format")
      .isIn(["snellen", "decimal"])
      .withMessage("Valid to format is required"),
  ],
  validate,
  eyeController.convertVisualAcuity
);

module.exports = router;
