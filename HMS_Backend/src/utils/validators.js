/**
 * Validation utility functions
 */

const validator = require('validator');
const { BLOOD_GROUP, GENDER, GHANA_REGIONS } = require('./constants');

/**
 * Validate email
 */
const isValidEmail = (email) => {
  return validator.isEmail(email);
};

/**
 * Validate phone number (Ghana format)
 */
const isValidPhoneNumber = (phone) => {
  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Ghana phone formats: 024XXXXXXX, 054XXXXXXX, 020XXXXXXX, etc.
  const patterns = [
    /^(0|233)?[2-5][0-9]{8}$/,  // Mobile numbers
    /^(0|233)?30[0-9]{7}$/,     // Landlines (Accra)
    /^(0|233)?31[0-9]{7}$/,     // Landlines (Kumasi)
    /^(0|233)?37[0-9]{7}$/,     // Landlines (Takoradi)
    /^(0|233)?39[0-9]{7}$/      // Landlines (Other regions)
  ];
  
  return patterns.some(pattern => pattern.test(cleaned));
};

/**
 * Validate Ghana Post GPS digital address
 */
const isValidDigitalAddress = (address) => {
  // Format: GA-123-4567 or AK-123-4567
  const pattern = /^[A-Z]{2}-\d{3}-\d{4}$/;
  return pattern.test(address);
};

/**
 * Validate Ghana Card number
 */
const isValidGhanaCard = (cardNumber) => {
  // Format: GHA-123456789-1
  const pattern = /^GHA-\d{9}-\d{1}$/;
  return pattern.test(cardNumber);
};

/**
 * Validate NHIS number
 */
const isValidNHISNumber = (nhisNumber) => {
  // Format: NHIS/12345678 or 12345678
  const pattern = /^(NHIS\/)?\d{6,10}$/i;
  return pattern.test(nhisNumber);
};

/**
 * Validate passport number
 */
const isValidPassportNumber = (passport) => {
  // Format: G1234567 (G followed by 7 digits)
  const pattern = /^[A-Z]\d{7}$/;
  return pattern.test(passport);
};

/**
 * Validate Voter's ID
 */
const isValidVotersID = (votersId) => {
  // Format: 1234567890 (10 digits)
  const pattern = /^\d{10}$/;
  return pattern.test(votersId);
};

/**
 * Validate date
 */
const isValidDate = (date) => {
  return validator.isDate(date);
};

/**
 * Validate future date
 */
const isFutureDate = (date) => {
  const inputDate = new Date(date);
  const now = new Date();
  return inputDate > now;
};

/**
 * Validate past date
 */
const isPastDate = (date) => {
  const inputDate = new Date(date);
  const now = new Date();
  return inputDate < now;
};

/**
 * Validate age (minimum age)
 */
const isValidAge = (dateOfBirth, minAge = 0, maxAge = 150) => {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    return age - 1 >= minAge && age - 1 <= maxAge;
  }
  
  return age >= minAge && age <= maxAge;
};

/**
 * Validate blood group
 */
const isValidBloodGroup = (bloodGroup) => {
  return Object.values(BLOOD_GROUP).includes(bloodGroup);
};

/**
 * Validate gender
 */
const isValidGender = (gender) => {
  return Object.values(GENDER).includes(gender);
};

/**
 * Validate Ghana region
 */
const isValidGhanaRegion = (region) => {
  return GHANA_REGIONS.includes(region);
};

/**
 * Validate UUID
 */
const isValidUUID = (uuid) => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return pattern.test(uuid);
};

/**
 * Validate URL
 */
const isValidURL = (url) => {
  return validator.isURL(url);
};

/**
 * Validate IP address
 */
const isValidIP = (ip) => {
  return validator.isIP(ip);
};

/**
 * Validate JSON string
 */
const isValidJSON = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate password strength
 */
const isStrongPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return pattern.test(password);
};

/**
 * Validate amount (positive number with up to 2 decimals)
 */
const isValidAmount = (amount) => {
  return /^\d+(\.\d{1,2})?$/.test(amount) && parseFloat(amount) >= 0;
};

/**
 * Validate quantity (positive integer)
 */
const isValidQuantity = (quantity) => {
  return Number.isInteger(quantity) && quantity >= 0;
};

/**
 * Validate percentage (0-100)
 */
const isValidPercentage = (percentage) => {
  return /^\d+(\.\d{1,2})?$/.test(percentage) && 
         parseFloat(percentage) >= 0 && 
         parseFloat(percentage) <= 100;
};

/**
 * Validate time (HH:MM format)
 */
const isValidTime = (time) => {
  const pattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return pattern.test(time);
};

/**
 * Validate time range (end time after start time)
 */
const isValidTimeRange = (startTime, endTime) => {
  if (!isValidTime(startTime) || !isValidTime(endTime)) return false;
  
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  
  return end > start;
};

/**
 * Validate date range (end date after or equal to start date)
 */
const isValidDateRange = (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return false;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return end >= start;
};

/**
 * Validate file type
 */
const isValidFileType = (filename, allowedTypes) => {
  const extension = filename.split('.').pop().toLowerCase();
  return allowedTypes.includes(extension);
};

/**
 * Validate file size
 */
const isValidFileSize = (size, maxSize) => {
  return size <= maxSize;
};

/**
 * Validate color hex code
 */
const isValidHexColor = (color) => {
  const pattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return pattern.test(color);
};

/**
 * Validate base64 string
 */
const isBase64 = (str) => {
  const pattern = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,([a-zA-Z0-9+/=]+)$/;
  return pattern.test(str);
};

/**
 * Validate array
 */
const isArray = (value) => {
  return Array.isArray(value);
};

/**
 * Validate object
 */
const isObject = (value) => {
  return value && typeof value === 'object' && !Array.isArray(value);
};

/**
 * Validate function
 */
const isFunction = (value) => {
  return typeof value === 'function';
};

/**
 * Validate string
 */
const isString = (value) => {
  return typeof value === 'string';
};

/**
 * Validate number
 */
const isNumber = (value) => {
  return typeof value === 'number' && !isNaN(value);
};

/**
 * Validate boolean
 */
const isBoolean = (value) => {
  return typeof value === 'boolean';
};

/**
 * Validate null or undefined
 */
const isNil = (value) => {
  return value === null || value === undefined;
};

/**
 * Validate empty string
 */
const isEmptyString = (value) => {
  return isString(value) && value.trim().length === 0;
};

/**
 * Validate credit card number
 */
const isValidCreditCard = (cardNumber) => {
  return validator.isCreditCard(cardNumber);
};

/**
 * Validate CVV
 */
const isValidCVV = (cvv) => {
  return /^\d{3,4}$/.test(cvv);
};

/**
 * Validate expiry date (MM/YY format)
 */
const isValidExpiryDate = (expiry) => {
  const pattern = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
  if (!pattern.test(expiry)) return false;
  
  const [month, year] = expiry.split('/');
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  
  const expiryYear = parseInt(year);
  const expiryMonth = parseInt(month);
  
  if (expiryYear < currentYear) return false;
  if (expiryYear === currentYear && expiryMonth < currentMonth) return false;
  
  return true;
};

/**
 * Validate sort order
 */
const isValidSortOrder = (order) => {
  return ['asc', 'desc', 'ASC', 'DESC'].includes(order);
};

/**
 * Validate pagination parameters
 */
const isValidPagination = (page, limit) => {
  return (
    (!page || (isNumber(page) && page > 0)) &&
    (!limit || (isNumber(limit) && limit > 0 && limit <= 100))
  );
};

/**
 * Validate search query
 */
const isValidSearchQuery = (query) => {
  return isString(query) && query.length >= 2;
};

/**
 * Validate drug strength format
 */
const isValidDrugStrength = (strength) => {
  // Examples: 500mg, 10mg/ml, 250mg/5ml
  const pattern = /^[\d.]+(mg|g|mcg|iu|ml)(\/[\d.]+(mg|g|mcg|iu|ml))?$/i;
  return pattern.test(strength);
};

/**
 * Validate dosage format
 */
const isValidDosage = (dosage) => {
  // Examples: 1 tablet, 2 capsules, 5ml, 10mg
  const pattern = /^[\d.]+(\s+)?(tablet|capsule|ml|mg|g|mcg|iu|drop|puff|application)?$/i;
  return pattern.test(dosage);
};

/**
 * Validate frequency format
 */
const isValidFrequency = (frequency) => {
  const validFrequencies = [
    'once daily', 'twice daily', 'three times daily', 'four times daily',
    'every 4 hours', 'every 6 hours', 'every 8 hours', 'every 12 hours',
    'as needed', 'immediately', 'at bedtime', 'before meals', 'after meals'
  ];
  return validFrequencies.includes(frequency.toLowerCase());
};

/**
 * Validate diagnosis code (ICD-11 format)
 */
const isValidDiagnosisCode = (code) => {
  // ICD-11 format: 1A00.Z or 1A00
  const pattern = /^[A-Z0-9]+(\.[A-Z0-9]+)?$/;
  return pattern.test(code);
};

/**
 * Validate procedure code (CPT format)
 */
const isValidProcedureCode = (code) => {
  // CPT format: 5 digits
  const pattern = /^\d{5}$/;
  return pattern.test(code);
};

module.exports = {
  isValidEmail,
  isValidPhoneNumber,
  isValidDigitalAddress,
  isValidGhanaCard,
  isValidNHISNumber,
  isValidPassportNumber,
  isValidVotersID,
  isValidDate,
  isFutureDate,
  isPastDate,
  isValidAge,
  isValidBloodGroup,
  isValidGender,
  isValidGhanaRegion,
  isValidUUID,
  isValidURL,
  isValidIP,
  isValidJSON,
  isStrongPassword,
  isValidAmount,
  isValidQuantity,
  isValidPercentage,
  isValidTime,
  isValidTimeRange,
  isValidDateRange,
  isValidFileType,
  isValidFileSize,
  isValidHexColor,
  isBase64,
  isArray,
  isObject,
  isFunction,
  isString,
  isNumber,
  isBoolean,
  isNil,
  isEmptyString,
  isValidCreditCard,
  isValidCVV,
  isValidExpiryDate,
  isValidSortOrder,
  isValidPagination,
  isValidSearchQuery,
  isValidDrugStrength,
  isValidDosage,
  isValidFrequency,
  isValidDiagnosisCode,
  isValidProcedureCode
};