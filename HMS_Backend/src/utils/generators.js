/**
 * Generator utility functions
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

/**
 * Generate UUID
 */
const generateUUID = () => {
  return uuidv4();
};

/**
 * Generate random string
 */
const generateRandomString = (length = 10, options = {}) => {
  const {
    numbers = true,
    lowercase = true,
    uppercase = true,
    special = false,
  } = options;

  let chars = "";
  if (numbers) chars += "0123456789";
  if (lowercase) chars += "abcdefghijklmnopqrstuvwxyz";
  if (uppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (special) chars += "!@#$%^&*()_-+=<>?";

  if (!chars) chars = "abcdefghijklmnopqrstuvwxyz";

  let result = "";
  const bytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
};

/**
 * Generate random number
 */
const generateRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generate OTP (One Time Password)
 */
const generateOTP = (length = 6) => {
  return generateRandomString(length, {
    numbers: true,
    lowercase: false,
    uppercase: false,
    special: false,
  });
};

/**
 * Generate patient number
 * Format: PAT-YYYY-XXXXX (where X is sequential number)
 */
const generatePatientNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(patient_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM patients
    WHERE patient_number LIKE $1
  `,
    [`PAT-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `PAT-${year}-${sequence}`;
};

/**
 * Generate visit number
 * Format: VIS-YYYY-XXXXX
 */
const generateVisitNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");
  let sequence;
  try {
    // Use a dedicated sequence for fast, non-blocking ID generation.
    // This requires the sequence to exist and be synced to the current max.
    const result = await client.query(
      `SELECT nextval('visit_number_seq') as seq`
    );
    sequence = result.rows[0].seq.toString().padStart(5, "0");
  } catch {
    // Fallback: sequence doesn't exist — use MAX(SUBSTRING...)
    const result = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(visit_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
       FROM visits
       WHERE visit_number LIKE $1`,
      [`VIS-${year}-%`]
    );
    sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  }
  return `VIS-${year}-${sequence}`;
};

/**
 * Generate appointment number
 * Format: APT-YYYY-XXXXX
 */
const generateAppointmentNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(appointment_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM appointments
    WHERE appointment_number LIKE $1
  `,
    [`APT-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `APT-${year}-${sequence}`;
};

/**
 * Generate invoice number
 * Format: INV-YYYY-XXXXX
 */
const generateInvoiceNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM invoices
    WHERE invoice_number LIKE $1
  `,
    [`INV-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `INV-${year}-${sequence}`;
};

/**
 * Generate payment number
 * Format: PAY-YYYY-XXXXX
 */
const generatePaymentNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM payments
    WHERE payment_number LIKE $1
  `,
    [`PAY-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `PAY-${year}-${sequence}`;
};

/**
 * Generate claim number
 * Format: CLM-YYYY-XXXXX
 */
const generateClaimNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(claim_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM insurance_claims
    WHERE claim_number LIKE $1
  `,
    [`CLM-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `CLM-${year}-${sequence}`;
};

/**
 * Generate prescription number
 * Format: PRESC-YYYY-XXXXX
 */
const generatePrescriptionNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(prescription_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM prescriptions
    WHERE prescription_number LIKE $1
  `,
    [`PRESC-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `PRESC-${year}-${sequence}`;
};

/**
 * Generate lab order number
 * Format: LAB-YYYY-XXXXX
 */
const generateLabOrderNumber = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM lab_orders
    WHERE order_number LIKE $1
  `,
    [`LAB-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `LAB-${year}-${sequence}`;
};

/**
 * Generate employee ID
 * Format: EMP-YYYY-XXXXX
 */
const generateEmployeeId = async (client, facilityId) => {
  const year = moment().format("YYYY");

  const result = await client.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING(employee_id FROM '-(\\d+)$') AS INTEGER)), 0) + 1 as next_seq
    FROM users
    WHERE employee_id LIKE $1
  `,
    [`EMP-${year}-%`]
  );

  const sequence = result.rows[0].next_seq.toString().padStart(5, "0");
  return `EMP-${year}-${sequence}`;
};

/**
 * Generate batch number
 * Format: BATCH-YYYYMMDD-XXXXX
 */
const generateBatchNumber = () => {
  const date = moment().format("YYYYMMDD");
  const random = generateRandomNumber(10000, 99999);
  return `BATCH-${date}-${random}`;
};

/**
 * Generate transaction reference
 * Format: TXN-YYYYMMDD-XXXXX
 */
const generateTransactionReference = () => {
  const date = moment().format("YYYYMMDD");
  const random = generateRandomString(8, {
    numbers: true,
    lowercase: false,
    uppercase: true,
    special: false,
  });
  return `TXN-${date}-${random}`;
};

/**
 * Generate receipt number
 * Format: RCPT-YYYYMMDD-XXXXX
 */
const generateReceiptNumber = () => {
  const date = moment().format("YYYYMMDD");
  const random = generateRandomNumber(10000, 99999);
  return `RCPT-${date}-${random}`;
};

/**
 * Generate API key
 */
const generateApiKey = () => {
  const prefix = "HMS";
  const random = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Generate API secret
 */
const generateApiSecret = () => {
  return crypto.randomBytes(48).toString("hex");
};

/**
 * Generate password reset token
 */
const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Generate email verification token
 */
const generateEmailVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Generate session ID
 */
const generateSessionId = () => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Generate tracking number
 * Format: TRK-YYYYMMDD-XXXXX
 */
const generateTrackingNumber = () => {
  const date = moment().format("YYYYMMDD");
  const random = generateRandomString(8, {
    numbers: true,
    lowercase: false,
    uppercase: true,
    special: false,
  });
  return `TRK-${date}-${random}`;
};

/**
 * Generate drug code
 * Format: DRG-XXX-XXX
 */
const generateDrugCode = (name) => {
  const prefix = "DRG";
  const namePart = name
    .split(" ")
    .map((word) => word.substring(0, 3).toUpperCase())
    .join("");
  const random = generateRandomString(3, {
    numbers: true,
    lowercase: false,
    uppercase: true,
    special: false,
  });
  return `${prefix}-${namePart}-${random}`;
};

/**
 * Generate test code
 * Format: TEST-XXX-XXX
 */
const generateTestCode = (name) => {
  const prefix = "TEST";
  const namePart = name
    .split(" ")
    .map((word) => word.substring(0, 3).toUpperCase())
    .join("");
  const random = generateRandomString(3, {
    numbers: true,
    lowercase: false,
    uppercase: true,
    special: false,
  });
  return `${prefix}-${namePart}-${random}`;
};

/**
 * Generate procedure code
 * Format: PROC-XXX-XXX
 */
const generateProcedureCode = (name) => {
  const prefix = "PROC";
  const namePart = name
    .split(" ")
    .map((word) => word.substring(0, 3).toUpperCase())
    .join("");
  const random = generateRandomString(3, {
    numbers: true,
    lowercase: false,
    uppercase: true,
    special: false,
  });
  return `${prefix}-${namePart}-${random}`;
};

/**
 * Generate supplier code
 * Format: SUP-XXX-XXX
 */
const generateSupplierCode = (name) => {
  const prefix = "SUP";
  const namePart = name
    .split(" ")
    .map((word) => word.substring(0, 3).toUpperCase())
    .join("");
  const random = generateRandomNumber(1000, 9999);
  return `${prefix}-${namePart}-${random}`;
};

/**
 * Generate department code
 * Format: DEPT-XXX
 */
const generateDepartmentCode = (name) => {
  const prefix = "DEPT";
  const namePart = name
    .split(" ")
    .map((word) => word.substring(0, 2).toUpperCase())
    .join("");
  return `${prefix}-${namePart}`;
};

/**
 * Generate room number
 * Format: FLR-X-XXX
 */
const generateRoomNumber = (floor, department) => {
  const floorNum = floor.toString().padStart(2, "0");
  const deptCode = department.substring(0, 3).toUpperCase();
  const roomNum = generateRandomNumber(1, 50).toString().padStart(3, "0");
  return `${floorNum}-${deptCode}-${roomNum}`;
};

/**
 * Generate bed number
 * Format: BED-XXX-XXX
 */
const generateBedNumber = (roomNumber, index) => {
  const roomPart = roomNumber.split("-").pop();
  return `BED-${roomPart}-${index.toString().padStart(2, "0")}`;
};

/**
 * Generate username from name
 */
const generateUsername = (firstName, lastName) => {
  const base = `${firstName.charAt(0)}${lastName}`.toLowerCase();
  const random = generateRandomNumber(100, 999);
  return `${base}${random}`;
};

/**
 * Generate temporary password
 */
const generateTemporaryPassword = () => {
  return generateRandomString(12, {
    numbers: true,
    lowercase: true,
    uppercase: true,
    special: true,
  });
};

/**
 * Generate barcode
 */
const generateBarcode = (prefix = "HMS") => {
  const timestamp = Date.now().toString();
  const random = generateRandomNumber(10000, 99999);
  const checkDigit = generateRandomNumber(0, 9);
  return `${prefix}${timestamp}${random}${checkDigit}`;
};

/**
 * Generate QR code data
 */
const generateQRData = (type, id, data = {}) => {
  const qrData = {
    type,
    id,
    timestamp: new Date().toISOString(),
    ...data,
  };
  return Buffer.from(JSON.stringify(qrData)).toString("base64");
};

module.exports = {
  generateUUID,
  generateRandomString,
  generateRandomNumber,
  generateOTP,
  generatePatientNumber,
  generateVisitNumber,
  generateAppointmentNumber,
  generateInvoiceNumber,
  generatePaymentNumber,
  generateClaimNumber,
  generatePrescriptionNumber,
  generateLabOrderNumber,
  generateEmployeeId,
  generateBatchNumber,
  generateTransactionReference,
  generateReceiptNumber,
  generateApiKey,
  generateApiSecret,
  generatePasswordResetToken,
  generateEmailVerificationToken,
  generateSessionId,
  generateTrackingNumber,
  generateDrugCode,
  generateTestCode,
  generateProcedureCode,
  generateSupplierCode,
  generateDepartmentCode,
  generateRoomNumber,
  generateBedNumber,
  generateUsername,
  generateTemporaryPassword,
  generateBarcode,
  generateQRData,
};
