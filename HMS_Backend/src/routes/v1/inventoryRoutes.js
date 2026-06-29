const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const inventoryController = require("../../controllers/inventoryController");
const { authenticateToken, authorize } = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All inventory routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/inventory
 * @desc    Inventory module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Inventory",
      description: "Item catalogue, stock levels, purchase orders, suppliers",
      endpoints: [
        "/catalog",
        "/items",
        "/items/search",
        "/items/:id",
        "/items/:id/history",
        "/items/:id/adjustment",
        "/items/:id/dispose-expired",
        "/batches",
        "/batches/:id",
        "/batches/:id/adjust",
        "/movements",
        "/suppliers",
        "/dashboard",
        "/purchase-orders",
        "/stock-take",
        "/transfer",
        "/reports/value",
        "/reports/by-category",
        "/reports/expiry",
        "/reports/movements",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/inventory/catalog
 * @desc    Fetch item names from the relevant catalog table for a given category
 * @access  Private
 */
router.get(
  "/catalog",
  authorize(
    "INVENTORY",
    "PHARMACIST",
    "SYS_ADMIN",
    "DOCTOR",
    "NURSE",
    "ACCOUNTS",
    "CASHIER"
  ),
  inventoryController.getCatalog
);

/**
 * @route   GET /api/v1/inventory/items
 * @desc    List inventory items
 * @access  Private
 */
router.get(
  "/items",
  authorize("INVENTORY", "PHARMACIST", "SYS_ADMIN", "DOCTOR", "NURSE"),
  inventoryController.getItems
);

/**
 * @route   GET /api/v1/inventory/items/search
 * @desc    Search inventory items
 * @access  Private
 */
router.get(
  "/items/search",
  authorize("INVENTORY", "PHARMACIST"),
  [
    query("q")
      .isLength({ min: 2 })
      .withMessage("Search query must be at least 2 characters"),
  ],
  validate,
  inventoryController.searchItems
);

/**
 * @route   GET /api/v1/inventory/batches
 * @desc    Get inventory batches
 * @access  Private
 */
router.get(
  "/batches",
  authorize("INVENTORY", "PHARMACIST"),
  inventoryController.getBatches
);

/**
 * @route   GET /api/v1/inventory/movements
 * @desc    Get stock movements
 * @access  Private
 */
router.get(
  "/movements",
  authorize("INVENTORY", "PHARMACIST"),
  inventoryController.getMovements
);

/**
 * @route   GET /api/v1/inventory/suppliers
 * @desc    Get suppliers
 * @access  Private
 */
router.get(
  "/suppliers",
  authorize("INVENTORY", "PHARMACIST"),
  inventoryController.getSuppliers
);

/**
 * @route   GET /api/v1/inventory/reports/value
 * @desc    Get inventory value report
 * @access  Private
 */
router.get(
  "/reports/value",
  authorize("INVENTORY", "ACCOUNTS"),
  inventoryController.getInventoryValue
);

/**
 * @route   GET /api/v1/inventory/reports/by-category
 * @desc    Get inventory by category
 * @access  Private
 */
router.get(
  "/reports/by-category",
  authorize("INVENTORY"),
  inventoryController.getInventoryByCategory
);

/**
 * @route   GET /api/v1/inventory/reports/expiry
 * @desc    Get expiry report
 * @access  Private
 */
router.get(
  "/reports/expiry",
  authorize("INVENTORY", "PHARMACIST"),
  inventoryController.getExpiryReport
);

/**
 * @route   GET /api/v1/inventory/reports/movements
 * @desc    Get movement summary
 * @access  Private
 */
router.get(
  "/reports/movements",
  authorize("INVENTORY"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  inventoryController.getMovementSummary
);

/**
 * @route   GET /api/v1/inventory/dashboard
 * @desc    Get inventory dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("INVENTORY", "PHARMACIST"),
  inventoryController.getDashboard
);

/**
 * @route   POST /api/v1/inventory/transfer
 * @desc    Transfer stock from Store to Pharmacy
 * @access  Private (Inventory Manager, Pharmacist)
 */
router.post(
  "/transfer",
  authorize("INVENTORY", "PHARMACIST", "SYS_ADMIN"),
  [
    body("item_id").isUUID().withMessage("Valid item ID is required"),
    body("quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be at least 1"),
  ],
  validate,
  inventoryController.transferToPharmacy
);

/**
 * @route   POST /api/v1/inventory/items
 * @desc    Create new inventory item
 * @access  Private (Admin, Inventory Manager)
 */
router.post(
  "/items",
  authorize("SYS_ADMIN", "INVENTORY"),
  [
    body("item_code").notEmpty().withMessage("Item code is required"),
    body("item_name").notEmpty().withMessage("Item name is required"),
    body("item_type").notEmpty().withMessage("Item type is required"),
    body("unit_of_measure")
      .notEmpty()
      .withMessage("Unit of measure is required"),
  ],
  validate,
  inventoryController.createItem
);

/**
 * @route   GET /api/v1/inventory/items/:id
 * @desc    Get inventory item by ID
 * @access  Private
 */
router.get(
  "/items/:id",
  authorize("INVENTORY", "PHARMACIST"),
  param("id").isUUID(),
  validate,
  inventoryController.getItem
);

/**
 * @route   GET /api/v1/inventory/items/:id/history
 * @desc    Get item edit history and stock movements
 * @access  Private
 */
router.get(
  "/items/:id/history",
  authorize("INVENTORY", "PHARMACIST", "SYS_ADMIN"),
  param("id").isUUID(),
  validate,
  inventoryController.getItemHistory
);

/**
 * @route   PUT /api/v1/inventory/items/:id
 * @desc    Update inventory item
 * @access  Private (Inventory Manager)
 */
router.put(
  "/items/:id",
  authorize("INVENTORY"),
  param("id").isUUID(),
  validate,
  inventoryController.updateItem
);

/**
 * @route   POST /api/v1/inventory/batches
 * @desc    Add inventory batch
 * @access  Private (Inventory Manager)
 */
router.post(
  "/batches",
  authorize("INVENTORY", "PHARMACIST", "SYS_ADMIN"),
  [
    body("item_id").isUUID().withMessage("Valid item ID is required"),
    body("batch_number").notEmpty().withMessage("Batch number is required"),
    body("quantity_on_hand")
      .isInt({ min: 0 })
      .withMessage("Valid quantity is required"),
    body("unit_cost").isNumeric().withMessage("Valid unit cost is required"),
  ],
  validate,
  inventoryController.addBatch
);

/**
 * @route   PATCH /api/v1/inventory/batches/:id/adjust
 * @desc    Correct batch stock quantity (manual stock adjustment)
 * @access  Private (Inventory Manager, Admin)
 */
router.patch(
  "/batches/:id/adjust",
  authorize("INVENTORY", "SYS_ADMIN"),
  param("id").isUUID(),
  body("new_quantity")
    .isInt({ min: 0 })
    .withMessage("New quantity must be a non-negative whole number"),
  body("reason").notEmpty().withMessage("Reason for adjustment is required"),
  validate,
  inventoryController.adjustBatch
);

/**
 * @route   PUT /api/v1/inventory/batches/:id
 * @desc    Update batch
 * @access  Private (Inventory Manager)
 */
router.put(
  "/batches/:id",
  authorize("INVENTORY"),
  param("id").isUUID(),
  validate,
  inventoryController.updateBatch
);

/**
 * @route   POST /api/v1/inventory/items/:id/adjustment
 * @desc    Stock adjustment — add or remove units with reason (FEFO for removals)
 * @access  Private (Inventory Manager, Admin)
 */
router.post(
  "/items/:id/adjustment",
  authorize("INVENTORY", "SYS_ADMIN"),
  param("id").isUUID(),
  body("direction")
    .isIn(["add", "remove"])
    .withMessage("Direction must be add or remove"),
  body("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("reason").notEmpty().withMessage("Reason is required"),
  validate,
  inventoryController.stockAdjustment
);

/**
 * @route   POST /api/v1/inventory/items/:id/dispose-expired
 * @desc    Dispose all expired batches for an item
 * @access  Private (Inventory Manager, Admin)
 */
router.post(
  "/items/:id/dispose-expired",
  authorize("INVENTORY", "SYS_ADMIN"),
  param("id").isUUID(),
  validate,
  inventoryController.disposeExpiredBatches
);

/**
 * @route   DELETE /api/v1/inventory/batches/:id
 * @desc    Delete batch (soft delete)
 * @access  Private (Admin only)
 */
router.delete(
  "/batches/:id",
  authorize("SYS_ADMIN"),
  param("id").isUUID(),
  validate,
  inventoryController.deleteBatch
);

/**
 * @route   POST /api/v1/inventory/movements
 * @desc    Record stock movement
 * @access  Private (Inventory Manager)
 */
router.post(
  "/movements",
  authorize("INVENTORY"),
  [
    body("item_id").isUUID().withMessage("Valid item ID is required"),
    body("batch_id").isUUID().withMessage("Valid batch ID is required"),
    body("movement_type")
      .isIn(["Receipt", "Issue", "Transfer", "Adjustment", "Return"])
      .withMessage("Valid movement type is required"),
    body("quantity")
      .isInt({ min: 1 })
      .withMessage("Valid quantity is required"),
  ],
  validate,
  inventoryController.recordMovement
);

/**
 * @route   POST /api/v1/inventory/stock-take
 * @desc    Perform stock take
 * @access  Private (Inventory Manager)
 */
router.post(
  "/stock-take",
  authorize("INVENTORY"),
  [body("items").isArray().withMessage("Stock take items are required")],
  validate,
  inventoryController.performStockTake
);

/**
 * @route   POST /api/v1/inventory/suppliers
 * @desc    Add supplier
 * @access  Private (Admin, Inventory Manager)
 */
router.post(
  "/suppliers",
  authorize("SYS_ADMIN", "INVENTORY"),
  [
    body("supplier_code").notEmpty().withMessage("Supplier code is required"),
    body("supplier_name").notEmpty().withMessage("Supplier name is required"),
    body("phone_number")
      .isMobilePhone("any")
      .withMessage("Valid phone number is required"),
  ],
  validate,
  inventoryController.addSupplier
);

/**
 * @route   POST /api/v1/inventory/purchase-orders
 * @desc    Create purchase order
 * @access  Private (Inventory Manager)
 */
router.post(
  "/purchase-orders",
  authorize("INVENTORY"),
  [
    body("supplier_id").isUUID().withMessage("Valid supplier ID is required"),
    body("items").isArray().withMessage("Purchase order items are required"),
  ],
  validate,
  inventoryController.createPurchaseOrder
);

/**
 * @route   PUT /api/v1/inventory/purchase-orders/:id/receive
 * @desc    Receive purchase order
 * @access  Private (Inventory Manager)
 */
router.put(
  "/purchase-orders/:id/receive",
  authorize("INVENTORY"),
  param("id").isUUID(),
  [body("items").isArray().withMessage("Received items are required")],
  validate,
  inventoryController.receivePurchaseOrder
);

module.exports = router;
