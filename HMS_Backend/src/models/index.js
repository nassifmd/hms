const fs = require("fs");
const path = require("path");
const db = require("../config/database");

// Import all models
const User = require("./User");
const Patient = require("./Patient");
const Appointment = require("./Appointment");
const Visit = require("./Visit");
const Diagnosis = require("./Diagnosis");
const Prescription = require("./Prescription");
const LabOrder = require("./LabOrder");
const Pharmacy = require("./Pharmacy");
const Dental = require("./Dental");
const EyeClinic = require("./EyeClinic");
const Billing = require("./Billing");
const Insurance = require("./Insurance");
const Inventory = require("./Inventory");
const Audit = require("./Audit");

// Model registry
const models = {
  User,
  Patient,
  Appointment,
  Visit,
  Diagnosis,
  Prescription,
  LabOrder,
  Pharmacy,
  Dental,
  EyeClinic,
  Billing,
  Insurance,
  Inventory,
  Audit,
};

// Initialize all models
Object.values(models).forEach((model) => {
  if (typeof model.init === "function") {
    model.init();
  }
});

// Set up associations
const setupAssociations = () => {
  // User associations
  User.hasMany(Appointment, {
    foreignKey: "doctor_id",
    as: "doctorAppointments",
  });
  User.hasMany(Appointment, {
    foreignKey: "created_by",
    as: "createdAppointments",
  });
  User.hasMany(Visit, { foreignKey: "created_by", as: "createdVisits" });
  User.hasMany(Patient, {
    foreignKey: "registered_by",
    as: "registeredPatients",
  });
  User.belongsToMany(User, {
    through: "user_roles",
    foreignKey: "user_id",
    as: "roles",
  });

  // Patient associations
  Patient.hasMany(Appointment, {
    foreignKey: "patient_id",
    as: "appointments",
  });
  Patient.hasMany(Visit, { foreignKey: "patient_id", as: "visits" });
  Patient.hasMany(Diagnosis, { foreignKey: "patient_id", as: "diagnoses" });
  Patient.hasMany(Prescription, {
    foreignKey: "patient_id",
    as: "prescriptions",
  });
  Patient.hasMany(LabOrder, { foreignKey: "patient_id", as: "labOrders" });
  Patient.hasMany(Insurance, { foreignKey: "patient_id", as: "insurance" });
  Patient.hasMany(Billing, { foreignKey: "patient_id", as: "bills" });
  Patient.belongsTo(User, { foreignKey: "registered_by", as: "registrar" });

  // Appointment associations
  Appointment.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Appointment.belongsTo(User, { foreignKey: "doctor_id", as: "doctor" });
  Appointment.belongsTo(User, { foreignKey: "created_by", as: "creator" });
  Appointment.belongsTo(Visit, { foreignKey: "visit_id", as: "visit" });

  // Visit associations
  Visit.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Visit.belongsTo(User, { foreignKey: "created_by", as: "creator" });
  Visit.hasMany(Diagnosis, { foreignKey: "visit_id", as: "diagnoses" });
  Visit.hasMany(Prescription, { foreignKey: "visit_id", as: "prescriptions" });
  Visit.hasMany(LabOrder, { foreignKey: "visit_id", as: "labOrders" });
  Visit.hasOne(Billing, { foreignKey: "visit_id", as: "bill" });

  // Diagnosis associations
  Diagnosis.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Diagnosis.belongsTo(Visit, { foreignKey: "visit_id", as: "visit" });
  Diagnosis.belongsTo(User, { foreignKey: "diagnosed_by", as: "doctor" });

  // Prescription associations
  Prescription.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Prescription.belongsTo(Visit, { foreignKey: "visit_id", as: "visit" });
  Prescription.belongsTo(User, { foreignKey: "prescribed_by", as: "doctor" });
  Prescription.hasMany(Pharmacy.Dispensing, {
    foreignKey: "prescription_id",
    as: "dispensings",
  });

  // LabOrder associations
  LabOrder.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  LabOrder.belongsTo(Visit, { foreignKey: "visit_id", as: "visit" });
  LabOrder.belongsTo(User, { foreignKey: "ordered_by", as: "requester" });
  LabOrder.hasMany(LabOrder.Result, { foreignKey: "order_id", as: "results" });

  // Billing associations
  Billing.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Billing.belongsTo(Visit, { foreignKey: "visit_id", as: "visit" });
  Billing.belongsTo(User, { foreignKey: "created_by", as: "creator" });
  Billing.hasMany(Billing.Item, { foreignKey: "bill_id", as: "items" });
  Billing.hasMany(Billing.Payment, { foreignKey: "bill_id", as: "payments" });
  Billing.hasOne(Insurance.Claim, { foreignKey: "bill_id", as: "claim" });

  // Insurance associations
  Insurance.belongsTo(Patient, { foreignKey: "patient_id", as: "patient" });
  Insurance.hasMany(Insurance.Claim, {
    foreignKey: "insurance_id",
    as: "claims",
  });

  // Inventory associations
  Inventory.hasMany(Inventory.StockMovement, {
    foreignKey: "item_id",
    as: "movements",
  });
  Inventory.hasMany(Inventory.ReorderAlert, {
    foreignKey: "item_id",
    as: "alerts",
  });
};

setupAssociations();

// Helper function to get model by name
models.getModel = (name) => {
  return models[name] || null;
};

// Database synchronization helper
models.sync = async (options = {}) => {
  const { force = false, alter = false } = options;

  for (const [name, model] of Object.entries(models)) {
    if (typeof model.sync === "function") {
      await model.sync({ force, alter });
    }
  }
};

// Transaction helper
models.transaction = async (callback) => {
  return db.transaction(callback);
};

module.exports = models;
