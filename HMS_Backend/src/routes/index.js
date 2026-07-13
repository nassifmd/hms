const express = require("express");
const router = express.Router();

const authRoutes = require("./v1/authRoutes");
const userRoutes = require("./v1/userRoutes");
const patientRoutes = require("./v1/patientRoutes");
const appointmentRoutes = require("./v1/appointmentRoutes");
const clinicalRoutes = require("./v1/clinicalRoutes");
const dentalRoutes = require("./v1/dentalRoutes");
const eyeRoutes = require("./v1/eyeRoutes");
const pharmacyRoutes = require("./v1/pharmacyRoutes");
const labRoutes = require("./v1/labRoutes");
const billingRoutes = require("./v1/billingRoutes");
const insuranceRoutes = require("./v1/insuranceRoutes");
const reportRoutes = require("./v1/reportRoutes");
const inventoryRoutes = require("./v1/inventoryRoutes");
const dashboardRoutes = require("./v1/dashboardRoutes");
const adminRoutes = require("./v1/adminRoutes");
const moduleRoutes = require("./v1/moduleRoutes");
const branchRoutes = require("./v1/branchRoutes");

// API documentation route (simplified)
router.get("/docs", (req, res) => {
  res.json({
    success: true,
    data: {
      title: "Hospital Management System API v1",
      description: "RESTful API for Hospital Management System",
      base_url: "/api/v1",
      endpoints: {
        auth: "/auth",
        users: "/users",
        patients: "/patients",
        appointments: "/appointments",
        clinical: "/clinical",
        dental: "/dental",
        eye: "/eye",
        pharmacy: "/pharmacy",
        lab: "/lab",
        billing: "/billing",
        insurance: "/insurance",
        reports: "/reports",
        inventory: "/inventory",
        dashboard: "/dashboard",
        admin: "/admin",
        branches: "/branches",
      },
      documentation_url: "https://documenter.getpostman.com/view/...",
      support_email: "api-support@hospital.gov.gh",
    },
  });
});

// Mount all routes
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/patients", patientRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/clinical", clinicalRoutes);
router.use("/dental", dentalRoutes);
router.use("/eye", eyeRoutes);
router.use("/pharmacy", pharmacyRoutes);
router.use("/lab", labRoutes);
router.use("/billing", billingRoutes);
router.use("/insurance", insuranceRoutes);
router.use("/reports", reportRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/admin", adminRoutes);
router.use("/modules", moduleRoutes);
router.use("/branches", branchRoutes);

// Stub notifications endpoint — some browser extensions poll this and log 404 noise
router.all("/notifications*", (req, res) => {
  res.json({ success: true, data: { unread_count: 0, notifications: [] } });
});

// 404 handler for undefined routes
router.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
});

module.exports = router;
