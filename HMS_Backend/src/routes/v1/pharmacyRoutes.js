const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const pharmacyController = require("../../controllers/pharmacyController");
const {
  authenticateToken,
  authorize,
  hasModuleAccess,
} = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All pharmacy routes require authentication and pharmacy module access
router.use(authenticateToken);
router.use(hasModuleAccess("PHARMACY"));

/**
 * @route   GET /api/v1/pharmacy
 * @desc    Pharmacy module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Pharmacy",
      description: "Formulary, dispensing, inventory, stock management",
      endpoints: [
        "/drugs",
        "/drugs/search",
        "/drugs/:id",
        "/inventory",
        "/dispense",
        "/dashboard",
        "/alerts/low-stock",
        "/alerts/expiry",
        "/movements",
        "/stock-take",
        "/purchase-orders",
        "/reports/inventory-value",
        "/reports/consumption",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/pharmacy/drugs/search
 * @desc    Search drugs
 * @access  Private
 */
router.get(
  "/drugs/search",
  authorize("PHARMACIST", "DOCTOR", "NURSE"),
  [
    query("q")
      .isLength({ min: 2 })
      .withMessage("Search query must be at least 2 characters"),
  ],
  validate,
  pharmacyController.searchDrugs
);

/**
 * @route   GET /api/v1/pharmacy/inventory
 * @desc    Get inventory
 * @access  Private
 */
router.get(
  "/inventory",
  authorize("PHARMACIST", "TECHNICIAN"),
  pharmacyController.getInventory
);

/**
 * @route   GET /api/v1/pharmacy/alerts/low-stock
 * @desc    Get low stock alerts
 * @access  Private
 */
router.get(
  "/alerts/low-stock",
  authorize("PHARMACIST"),
  pharmacyController.getLowStockAlerts
);

/**
 * @route   GET /api/v1/pharmacy/alerts/expiry
 * @desc    Get expiry alerts
 * @access  Private
 */
router.get(
  "/alerts/expiry",
  authorize("PHARMACIST"),
  pharmacyController.getExpiryAlerts
);

/**
 * @route   GET /api/v1/pharmacy/movements
 * @desc    Get stock movements
 * @access  Private
 */
router.get(
  "/movements",
  authorize("PHARMACIST"),
  pharmacyController.getStockMovements
);

/**
 * @route   GET /api/v1/pharmacy/reports/inventory-value
 * @desc    Get inventory value report
 * @access  Private
 */
router.get(
  "/reports/inventory-value",
  authorize("PHARMACIST", "ACCOUNTS"),
  pharmacyController.getInventoryValue
);

/**
 * @route   GET /api/v1/pharmacy/reports/consumption
 * @desc    Get consumption report
 * @access  Private
 */
router.get(
  "/reports/consumption",
  authorize("PHARMACIST"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  pharmacyController.getConsumptionReport
);

/**
 * @route   GET /api/v1/pharmacy/reports/expiry
 * @desc    Get expiry report
 * @access  Private
 */
router.get(
  "/reports/expiry",
  authorize("PHARMACIST"),
  pharmacyController.getExpiryReport
);

/**
 * @route   GET /api/v1/pharmacy/dashboard
 * @desc    Get pharmacy dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("PHARMACIST"),
  pharmacyController.getDashboard
);

/**
 * @route   GET /api/v1/pharmacy/dispensing/patient/:patientId
 * @desc    Get dispensing history
 * @access  Private
 */
router.get(
  "/dispensing/patient/:patientId",
  authorize("PHARMACIST", "DOCTOR"),
  param("patientId").isUUID(),
  validate,
  pharmacyController.getDispensingHistory
);

/**
 * @route   POST /api/v1/pharmacy/drugs
 * @desc    Create new drug
 * @access  Private (Pharmacist, Admin)
 */
router.post(
  "/drugs",
  authorize("PHARMACIST", "SYS_ADMIN"),
  [
    body("drug_code").notEmpty().withMessage("Drug code is required"),
    body("drug_name").notEmpty().withMessage("Drug name is required"),
    body("dosage_form").notEmpty().withMessage("Dosage form is required"),
    body("strength").notEmpty().withMessage("Strength is required"),
  ],
  validate,
  pharmacyController.createDrug
);

/**
 * @route   GET /api/v1/pharmacy/drugs/:id
 * @desc    Get drug by ID
 * @access  Private
 */
router.get(
  "/drugs/:id",
  authorize("PHARMACIST", "DOCTOR", "NURSE"),
  param("id").isUUID(),
  validate,
  pharmacyController.getDrug
);

/**
 * @route   POST /api/v1/pharmacy/inventory
 * @desc    Add inventory batch
 * @access  Private (Pharmacist)
 */
router.post(
  "/inventory",
  authorize("PHARMACIST"),
  [
    body("drug_id").isUUID().withMessage("Valid drug ID is required"),
    body("batch_number").notEmpty().withMessage("Batch number is required"),
    body("expiry_date")
      .isISO8601()
      .withMessage("Valid expiry date is required"),
    body("quantity_on_hand")
      .isInt({ min: 0 })
      .withMessage("Valid quantity is required"),
    body("unit_cost").isNumeric().withMessage("Valid unit cost is required"),
    body("selling_price")
      .isNumeric()
      .withMessage("Valid selling price is required"),
  ],
  validate,
  pharmacyController.addInventory
);

/**
 * @route   PUT /api/v1/pharmacy/inventory/:id
 * @desc    Update inventory
 * @access  Private (Pharmacist)
 */
router.put(
  "/inventory/:id",
  authorize("PHARMACIST"),
  param("id").isUUID(),
  validate,
  pharmacyController.updateInventory
);

/**
 * @route   POST /api/v1/pharmacy/dispense
 * @desc    Dispense medication
 * @access  Private (Pharmacist)
 */
router.post(
  "/dispense",
  authorize("PHARMACIST"),
  [
    body("prescription_id")
      .isUUID()
      .withMessage("Valid prescription ID is required"),
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
  ],
  validate,
  pharmacyController.dispenseMedication
);

/**
 * @route   POST /api/v1/pharmacy/stock-take
 * @desc    Perform stock take
 * @access  Private (Pharmacist)
 */
router.post(
  "/stock-take",
  authorize("PHARMACIST"),
  [body("items").isArray().withMessage("Stock take items are required")],
  validate,
  pharmacyController.performStockTake
);

/**
 * @route   POST /api/v1/pharmacy/purchase-orders
 * @desc    Create purchase order
 * @access  Private (Pharmacist)
 */
router.post(
  "/purchase-orders",
  authorize("PHARMACIST"),
  [
    body("supplier_id").isUUID().withMessage("Valid supplier ID is required"),
    body("items").isArray().withMessage("Purchase order items are required"),
  ],
  validate,
  pharmacyController.createPurchaseOrder
);

/**
 * @route   PUT /api/v1/pharmacy/purchase-orders/:id/receive
 * @desc    Receive purchase order
 * @access  Private (Pharmacist)
 */
router.put(
  "/purchase-orders/:id/receive",
  authorize("PHARMACIST"),
  param("id").isUUID(),
  [body("items").isArray().withMessage("Received items are required")],
  validate,
  pharmacyController.receivePurchaseOrder
);

module.exports = router;
