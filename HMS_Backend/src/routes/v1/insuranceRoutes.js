const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const insuranceController = require("../../controllers/insuranceController");
const { authenticateToken, authorize } = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All insurance routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/insurance
 * @desc    Insurance module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Insurance",
      description: "NHIS & private insurer management, claims submission",
      endpoints: [
        "/claims/pending",
        "/claims/:id",
        "/claims/:id/validate",
        "/claims/:id/submit",
        "/claims/:id/approve",
        "/claims/:id/reject",
        "/claims/:id/paid",
        "/patient-insurance",
        "/verify-nhis",
        "/stats",
        "/dashboard",
        "/sync",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/insurance/claims/pending
 * @desc    Get pending claims
 * @access  Private
 */
router.get(
  "/claims/pending",
  authorize("ACCOUNTS", "INSURANCE", "SYS_ADMIN"),
  insuranceController.getPendingClaims
);

/**
 * @route   GET /api/v1/insurance/patients/:patientId/active
 * @desc    Get patient active insurance
 * @access  Private
 */
router.get(
  "/patients/:patientId/active",
  authorize("RECORDS", "ACCOUNTS", "DOCTOR", "SYS_ADMIN"),
  param("patientId").isUUID(),
  validate,
  insuranceController.getPatientActiveInsurance
);

/**
 * @route   GET /api/v1/insurance/patients/:patientId/claims
 * @desc    Get patient claims
 * @access  Private
 */
router.get(
  "/patients/:patientId/claims",
  authorize("ACCOUNTS", "INSURANCE"),
  param("patientId").isUUID(),
  validate,
  insuranceController.getPatientClaims
);

/**
 * @route   GET /api/v1/insurance/patients/:patientId/eligibility
 * @desc    Check patient eligibility
 * @access  Private
 */
router.get(
  "/patients/:patientId/eligibility",
  authorize("ACCOUNTS", "RECORDS"),
  param("patientId").isUUID(),
  validate,
  insuranceController.checkEligibility
);

/**
 * @route   GET /api/v1/insurance/patients/:patientId/nhis-history
 * @desc    Get NHIS verification history
 * @access  Private
 */
router.get(
  "/patients/:patientId/nhis-history",
  authorize("ACCOUNTS", "RECORDS"),
  param("patientId").isUUID(),
  validate,
  insuranceController.getNHISVerificationHistory
);

/**
 * @route   GET /api/v1/insurance/stats
 * @desc    Get claim statistics
 * @access  Private
 */
router.get(
  "/stats",
  authorize("ACCOUNTS", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  insuranceController.getClaimStats
);

/**
 * @route   GET /api/v1/insurance/dashboard
 * @desc    Get insurance dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("ACCOUNTS", "INSURANCE"),
  insuranceController.getDashboard
);

/**
 * @route   GET /api/v1/insurance/tariff/:serviceCode
 * @desc    Get tariff rates
 * @access  Private
 */
router.get(
  "/tariff/:serviceCode",
  authorize("ACCOUNTS", "DOCTOR"),
  param("serviceCode").notEmpty(),
  validate,
  insuranceController.getTariff
);

/**
 * @route   POST /api/v1/insurance/patient-insurance
 * @desc    Add patient insurance
 * @access  Private (Records, Insurance Officer)
 */
router.post(
  "/patient-insurance",
  authorize("RECORDS", "INSURANCE"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("insurance_provider")
      .notEmpty()
      .withMessage("Insurance provider is required"),
    body("policy_number").notEmpty().withMessage("Policy number is required"),
    body("expiry_date")
      .isISO8601()
      .withMessage("Valid expiry date is required"),
  ],
  validate,
  insuranceController.addPatientInsurance
);

/**
 * @route   POST /api/v1/insurance/claims
 * @desc    Create new insurance claim
 * @access  Private (Accounts, Insurance Officer)
 */
router.post(
  "/claims",
  authorize("ACCOUNTS", "INSURANCE"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("invoice_id")
      .optional()
      .isUUID()
      .withMessage("Valid invoice ID is required"),
    body("patient_insurance_id")
      .isUUID()
      .withMessage("Valid patient insurance ID is required"),
    body("total_amount")
      .optional()
      .isFloat({ gt: 0 })
      .withMessage("Total amount must be positive"),
  ],
  validate,
  insuranceController.createClaim
);

/**
 * @route   GET /api/v1/insurance/claims/:id
 * @desc    Get claim by ID
 * @access  Private
 */
router.get(
  "/claims/:id",
  authorize("ACCOUNTS", "INSURANCE"),
  param("id").isUUID(),
  validate,
  insuranceController.getClaim
);

/**
 * @route   GET /api/v1/insurance/claims/:id/history
 * @desc    Get claim status history
 * @access  Private
 */
router.get(
  "/claims/:id/history",
  authorize("ACCOUNTS", "INSURANCE"),
  param("id").isUUID(),
  validate,
  insuranceController.getClaimHistory
);

/**
 * @route   POST /api/v1/insurance/claims/:id/validate
 * @desc    Validate claim with ClaimsIT
 * @access  Private (Insurance Officer)
 */
router.post(
  "/claims/:id/validate",
  authorize("INSURANCE"),
  param("id").isUUID(),
  validate,
  insuranceController.validateClaim
);

/**
 * @route   POST /api/v1/insurance/claims/:id/submit
 * @desc    Submit claim to ClaimsIT
 * @access  Private (Insurance Officer)
 */
router.post(
  "/claims/:id/submit",
  authorize("INSURANCE"),
  param("id").isUUID(),
  validate,
  insuranceController.submitClaim
);

/**
 * @route   PUT /api/v1/insurance/claims/:id/approve
 * @desc    Approve claim
 * @access  Private (Insurance Officer, Admin)
 */
router.put(
  "/claims/:id/approve",
  authorize("INSURANCE", "SYS_ADMIN"),
  param("id").isUUID(),
  [
    body("approved_amount")
      .isNumeric()
      .withMessage("Approved amount is required"),
  ],
  validate,
  insuranceController.approveClaim
);

/**
 * @route   PUT /api/v1/insurance/claims/:id/reject
 * @desc    Reject claim
 * @access  Private (Insurance Officer, Admin)
 */
router.put(
  "/claims/:id/reject",
  authorize("INSURANCE", "SYS_ADMIN"),
  param("id").isUUID(),
  [body("reason").notEmpty().withMessage("Rejection reason is required")],
  validate,
  insuranceController.rejectClaim
);

/**
 * @route   PUT /api/v1/insurance/claims/:id/paid
 * @desc    Mark claim as paid
 * @access  Private (Accounts)
 */
router.put(
  "/claims/:id/paid",
  authorize("ACCOUNTS"),
  param("id").isUUID(),
  [body("paid_amount").isNumeric().withMessage("Paid amount is required")],
  validate,
  insuranceController.markAsPaid
);

/**
 * @route   PUT /api/v1/insurance/claims/:claimId/items/:itemId
 * @desc    Update claim item
 * @access  Private (Insurance Officer)
 */
router.put(
  "/claims/:claimId/items/:itemId",
  authorize("INSURANCE"),
  [param("claimId").isUUID(), param("itemId").isUUID()],
  validate,
  insuranceController.updateClaimItem
);

/**
 * @route   POST /api/v1/insurance/verify-nhis
 * @desc    Verify NHIS number
 * @access  Private
 */
router.post(
  "/verify-nhis",
  authorize("RECORDS", "ACCOUNTS"),
  [
    body("nhis_number").notEmpty().withMessage("NHIS number is required"),
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
  ],
  validate,
  insuranceController.verifyNHIS
);

/**
 * @route   POST /api/v1/insurance/sync
 * @desc    Sync claim status with ClaimsIT
 * @access  Private (Insurance Officer)
 */
router.post(
  "/sync",
  authorize("INSURANCE"),
  [body("claim_id").isUUID().withMessage("Valid claim ID is required")],
  validate,
  insuranceController.syncClaimStatus
);

module.exports = router;
