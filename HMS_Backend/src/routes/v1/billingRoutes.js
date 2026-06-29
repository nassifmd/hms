const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const billingController = require("../../controllers/billingController");
const { authenticateToken, authorize } = require("../../middleware/auth");
const { validate } = require("../../middleware/validation");

// All billing routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/billing
 * @desc    Billing module root — list available endpoints
 * @access  Private
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      module: "Billing",
      description: "Invoices, payments, tariffs, NHIA claims",
      endpoints: [
        "/invoices",
        "/invoices/outstanding",
        "/invoices/:id",
        "/payments",
        "/payments/:id",
        "/payments/:id/receipt",
        "/services",
        "/service-prices",
        "/price-lists",
        "/dashboard",
        "/reports/daily-revenue",
        "/reports/revenue-by-period",
        "/reports/outstanding",
        "/reports/insurance",
        "/reports/payment-methods",
      ],
    },
  });
});

/**
 * @route   GET /api/v1/billing/invoices
 * @desc    List / search invoices
 * @access  Private (Accounts, Cashier)
 */
router.get(
  "/invoices",
  authorize("ACCOUNTS", "CASHIER", "SYS_ADMIN", "MED_SUPT"),
  billingController.getInvoices
);

/**
 * @route   GET /api/v1/billing/services
 * @desc    Get service catalog items for a given type (autocomplete for price entry)
 * @access  Private
 */
router.get(
  "/services",
  authorize("ACCOUNTS", "CASHIER", "SYS_ADMIN"),
  billingController.getServiceCatalog
);

/**
 * @route   GET /api/v1/billing/service-prices
 * @desc    List service prices
 * @access  Private
 */
router.get(
  "/service-prices",
  authorize("ACCOUNTS", "CASHIER", "SYS_ADMIN"),
  billingController.getServicePrices
);

/**
 * @route   POST /api/v1/billing/service-prices
 * @desc    Create a service price
 * @access  Private (Accounts, Admin)
 */
router.post(
  "/service-prices",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  [
    body("service_type").notEmpty().withMessage("Service type is required"),
    body("service_name").notEmpty().withMessage("Service name is required"),
    body("service_code").notEmpty().withMessage("Service code is required"),
    body("price").isNumeric({ min: 0 }).withMessage("Valid price is required"),
  ],
  validate,
  billingController.upsertServicePrice
);

/**
 * @route   PUT /api/v1/billing/service-prices/:id
 * @desc    Update a service price
 * @access  Private (Accounts, Admin)
 */
router.put(
  "/service-prices/:id",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  validate,
  billingController.upsertServicePrice
);

/**
 * @route   DELETE /api/v1/billing/service-prices/:id
 * @desc    Delete a service price
 * @access  Private (Accounts, Admin)
 */
router.delete(
  "/service-prices/:id",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  validate,
  billingController.deleteServicePrice
);

/**
 * @route   GET /api/v1/billing/price-lists
 * @desc    Get price lists
 * @access  Private
 */
router.get(
  "/price-lists",
  authorize("ACCOUNTS", "CASHIER", "SYS_ADMIN"),
  billingController.getPriceLists
);

/**
 * @route   POST /api/v1/billing/price-lists
 * @desc    Create a price list
 * @access  Private (Accounts, Admin)
 */
router.post(
  "/price-lists",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  [
    body("price_list_name")
      .notEmpty()
      .withMessage("Price list name is required"),
    body("price_list_code")
      .notEmpty()
      .withMessage("Price list code is required"),
  ],
  validate,
  billingController.createPriceList
);

/**
 * @route   GET /api/v1/billing/invoices/outstanding
 * @desc    Get outstanding invoices
 * @access  Private
 */
router.get(
  "/invoices/outstanding",
  authorize("ACCOUNTS", "CASHIER"),
  billingController.getOutstandingInvoices
);

/**
 * @route   GET /api/v1/billing/reports/daily-revenue
 * @desc    Get daily revenue
 * @access  Private
 */
router.get(
  "/reports/daily-revenue",
  authorize("ACCOUNTS", "MED_SUPT"),
  billingController.getDailyRevenue
);

/**
 * @route   GET /api/v1/billing/reports/revenue-by-period
 * @desc    Get revenue by period
 * @access  Private
 */
router.get(
  "/reports/revenue-by-period",
  authorize("ACCOUNTS", "MED_SUPT"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  billingController.getRevenueByPeriod
);

/**
 * @route   GET /api/v1/billing/reports/outstanding
 * @desc    Get outstanding report
 * @access  Private
 */
router.get(
  "/reports/outstanding",
  authorize("ACCOUNTS", "MED_SUPT"),
  billingController.getOutstandingReport
);

/**
 * @route   GET /api/v1/billing/reports/insurance
 * @desc    Get insurance billing report
 * @access  Private
 */
router.get(
  "/reports/insurance",
  authorize("ACCOUNTS"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  billingController.getInsuranceBillingReport
);

/**
 * @route   GET /api/v1/billing/reports/payment-methods
 * @desc    Get payment methods breakdown
 * @access  Private
 */
router.get(
  "/reports/payment-methods",
  authorize("ACCOUNTS"),
  [
    query("start_date").isDate().withMessage("Start date is required"),
    query("end_date").isDate().withMessage("End date is required"),
  ],
  validate,
  billingController.getPaymentMethodsBreakdown
);

/**
 * @route   GET /api/v1/billing/dashboard
 * @desc    Get billing dashboard
 * @access  Private
 */
router.get(
  "/dashboard",
  authorize("ACCOUNTS", "CASHIER"),
  billingController.getDashboard
);

/**
 * @route   GET /api/v1/billing/patients/:patientId/invoices
 * @desc    Get patient invoices
 * @access  Private
 */
router.get(
  "/patients/:patientId/invoices",
  authorize("ACCOUNTS", "CASHIER", "DOCTOR"),
  param("patientId").isUUID(),
  validate,
  billingController.getPatientInvoices
);

/**
 * @route   GET /api/v1/billing/patients/:patientId/visit-services
 * @desc    Services received by a patient on a given date (for cashier)
 * @access  Private
 */
router.get(
  "/patients/:patientId/visit-services",
  authorize("ACCOUNTS", "CASHIER", "SYS_ADMIN"),
  param("patientId").isUUID(),
  validate,
  billingController.getPatientVisitServices
);

/**
 * @route   POST /api/v1/billing/invoices
 * @desc    Create new invoice
 * @access  Private (Accounts, Cashier)
 */
router.post(
  "/invoices",
  authorize("ACCOUNTS", "CASHIER"),
  [
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("items").isArray().withMessage("Invoice items are required"),
  ],
  validate,
  billingController.createInvoice
);

/**
 * @route   GET /api/v1/billing/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private
 */
router.get(
  "/invoices/:id",
  authorize("ACCOUNTS", "CASHIER", "DOCTOR"),
  param("id").isUUID(),
  validate,
  billingController.getInvoice
);

/**
 * @route   DELETE /api/v1/billing/invoices/:id
 * @desc    Void an invoice
 * @access  Private (Accounts, SYS_ADMIN)
 */
router.delete(
  "/invoices/:id",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  body("reason").notEmpty().withMessage("Void reason is required"),
  validate,
  billingController.voidInvoice
);

/**
 * @route   POST /api/v1/billing/invoices/:id/items
 * @desc    Add item to invoice
 * @access  Private (Accounts)
 */
router.post(
  "/invoices/:id/items",
  authorize("ACCOUNTS"),
  param("id").isUUID(),
  [
    body("item_type").notEmpty().withMessage("Item type is required"),
    body("item_name").notEmpty().withMessage("Item name is required"),
    body("quantity")
      .isInt({ min: 1 })
      .withMessage("Valid quantity is required"),
    body("unit_price").isNumeric().withMessage("Valid unit price is required"),
  ],
  validate,
  billingController.addInvoiceItem
);

/**
 * @route   DELETE /api/v1/billing/invoices/:invoiceId/items/:itemId
 * @desc    Remove item from invoice
 * @access  Private (Accounts)
 */
router.delete(
  "/invoices/:invoiceId/items/:itemId",
  authorize("ACCOUNTS"),
  [param("invoiceId").isUUID(), param("itemId").isUUID()],
  validate,
  billingController.removeInvoiceItem
);

/**
 * @route   PUT /api/v1/billing/invoices/:id/discount
 * @desc    Apply discount to invoice
 * @access  Private (Accounts, Admin)
 */
router.put(
  "/invoices/:id/discount",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  [
    body("percentage")
      .isFloat({ min: 0, max: 100 })
      .withMessage("Valid discount percentage is required"),
    body("reason").notEmpty().withMessage("Discount reason is required"),
  ],
  validate,
  billingController.applyDiscount
);

/**
 * @route   PUT /api/v1/billing/invoices/:id/void
 * @desc    Void invoice
 * @access  Private (Accounts, Admin)
 */
router.put(
  "/invoices/:id/void",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  [body("reason").notEmpty().withMessage("Void reason is required")],
  validate,
  billingController.voidInvoice
);

/**
 * @route   POST /api/v1/billing/payments
 * @desc    Add payment to invoice
 * @access  Private (Cashier)
 */
router.post(
  "/payments",
  authorize("CASHIER", "ACCOUNTS"),
  [
    body("invoice_id").isUUID().withMessage("Valid invoice ID is required"),
    body("patient_id").isUUID().withMessage("Valid patient ID is required"),
    body("payment_method")
      .isIn(["Cash", "Mobile Money", "Card", "Bank Transfer", "Cheque"])
      .withMessage("Valid payment method is required"),
    body("amount").isNumeric().withMessage("Valid amount is required"),
  ],
  validate,
  billingController.addPayment
);

/**
 * @route   GET /api/v1/billing/payments/:id
 * @desc    Get payment by ID
 * @access  Private
 */
router.get(
  "/payments/:id",
  authorize("ACCOUNTS", "CASHIER"),
  param("id").isUUID(),
  validate,
  billingController.getPayment
);

/**
 * @route   GET /api/v1/billing/payments/:id/receipt
 * @desc    Generate receipt
 * @access  Private
 */
router.get(
  "/payments/:id/receipt",
  authorize("ACCOUNTS", "CASHIER", "DOCTOR"),
  param("id").isUUID(),
  validate,
  billingController.generateReceipt
);

/**
 * @route   PUT /api/v1/billing/payments/:id/void
 * @desc    Void payment
 * @access  Private (Accounts, Admin)
 */
router.put(
  "/payments/:id/void",
  authorize("ACCOUNTS", "SYS_ADMIN"),
  param("id").isUUID(),
  [body("reason").notEmpty().withMessage("Void reason is required")],
  validate,
  billingController.voidPayment
);

module.exports = router;
