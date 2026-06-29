/**
 * Formatting utility functions
 */

const moment = require('moment');

/**
 * Format currency (GHS)
 */
const formatCurrency = (amount, options = {}) => {
  const {
    currency = 'GHS',
    locale = 'en-GH',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);
};

/**
 * Format number with thousand separators
 */
const formatNumber = (number, options = {}) => {
  const {
    locale = 'en-GH',
    minimumFractionDigits = 0,
    maximumFractionDigits = 2
  } = options;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(number);
};

/**
 * Format percentage
 */
const formatPercentage = (value, options = {}) => {
  const {
    locale = 'en-GH',
    minimumFractionDigits = 1,
    maximumFractionDigits = 1,
    includeSymbol = true
  } = options;

  const formatted = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value / 100);

  return includeSymbol ? formatted : formatted.replace('%', '').trim();
};

/**
 * Format phone number (Ghana format)
 */
const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 9 && ['2', '5'].includes(cleaned[0])) {
    return `0${cleaned}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('233')) {
    return `0${cleaned.substring(3)}`;
  } else if (cleaned.length === 13 && cleaned.startsWith('233')) {
    return `0${cleaned.substring(4)}`;
  }
  
  return phone;
};

/**
 * Format Ghana Card number
 */
const formatGhanaCard = (cardNumber) => {
  const cleaned = cardNumber.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `GHA-${cleaned.substring(0, 9)}-${cleaned.substring(9)}`;
  }
  return cardNumber;
};

/**
 * Format NHIS number
 */
const formatNHISNumber = (nhisNumber) => {
  const cleaned = nhisNumber.replace(/\D/g, '');
  if (cleaned.length === 8) {
    return `NHIS/${cleaned}`;
  }
  return nhisNumber;
};

/**
 * Format digital address (Ghana Post GPS)
 */
const formatDigitalAddress = (address) => {
  const cleaned = address.replace(/\s/g, '').toUpperCase();
  if (cleaned.length === 10 && /^[A-Z]{2}\d{3}\d{4}$/.test(cleaned)) {
    return `${cleaned.substring(0, 2)}-${cleaned.substring(2, 5)}-${cleaned.substring(5)}`;
  }
  return address;
};

/**
 * Format file size
 */
const formatFileSize = (bytes, options = {}) => {
  const {
    decimalPlaces = 2,
    binary = false
  } = options;

  if (bytes === 0) return '0 Bytes';

  const k = binary ? 1024 : 1000;
  const sizes = binary 
    ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB']
    : ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(decimalPlaces)} ${sizes[i]}`;
};

/**
 * Format duration in minutes to human readable
 */
const formatDuration = (minutes, options = {}) => {
  const {
    format = 'long', // 'short' or 'long'
    includeSeconds = false
  } = options;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const secs = includeSeconds ? Math.floor((minutes * 60) % 60) : 0;

  const parts = [];

  if (hours > 0) {
    parts.push(format === 'long' ? `${hours} hour${hours > 1 ? 's' : ''}` : `${hours}h`);
  }
  
  if (mins > 0) {
    parts.push(format === 'long' ? `${mins} minute${mins > 1 ? 's' : ''}` : `${mins}m`);
  }
  
  if (secs > 0 && includeSeconds) {
    parts.push(format === 'long' ? `${secs} second${secs > 1 ? 's' : ''}` : `${secs}s`);
  }

  return parts.join(' ') || '0 minutes';
};

/**
 * Format blood pressure reading
 */
const formatBloodPressure = (systolic, diastolic) => {
  return `${systolic}/${diastolic} mmHg`;
};

/**
 * Format temperature
 */
const formatTemperature = (temperature, unit = 'celsius') => {
  const value = temperature.toFixed(1);
  return unit === 'celsius' ? `${value}°C` : `${value}°F`;
};

/**
 * Format weight
 */
const formatWeight = (weight, unit = 'kg') => {
  return `${weight.toFixed(1)} ${unit}`;
};

/**
 * Format height
 */
const formatHeight = (height, unit = 'cm') => {
  if (unit === 'cm') {
    return `${height.toFixed(0)} cm`;
  } else if (unit === 'm') {
    return `${(height / 100).toFixed(2)} m`;
  } else {
    const feet = Math.floor(height / 30.48);
    const inches = Math.round((height % 30.48) / 2.54);
    return `${feet}'${inches}"`;
  }
};

/**
 * Format BMI
 */
const formatBMI = (bmi) => {
  const value = bmi.toFixed(1);
  let category;

  if (bmi < 18.5) category = 'Underweight';
  else if (bmi < 25) category = 'Normal';
  else if (bmi < 30) category = 'Overweight';
  else category = 'Obese';

  return `${value} (${category})`;
};

/**
 * Format visual acuity
 */
const formatVisualAcuity = (value, format = 'snellen') => {
  if (!value) return 'N/A';
  
  if (format === 'decimal') {
    const decimal = parseFloat(value);
    return decimal.toFixed(2);
  }
  
  return value;
};

/**
 * Format refraction value
 */
const formatRefraction = (sphere, cylinder, axis) => {
  if (!sphere && !cylinder) return 'Plano';
  
  const parts = [];
  if (sphere) parts.push(`${sphere > 0 ? '+' : ''}${sphere.toFixed(2)}`);
  if (cylinder) parts.push(`${cylinder > 0 ? '+' : ''}${cylinder.toFixed(2)}`);
  if (axis) parts.push(`x${axis}`);
  
  return parts.join(' ');
};

/**
 * Format drug strength
 */
const formatDrugStrength = (strength, unit) => {
  return `${strength}${unit}`;
};

/**
 * Format dosage instructions
 */
const formatDosageInstructions = (dosage, frequency, duration) => {
  const parts = [];
  
  if (dosage) parts.push(`Take ${dosage}`);
  if (frequency) parts.push(frequency);
  if (duration) parts.push(`for ${duration}`);
  
  return parts.join(' ');
};

/**
 * Format address
 */
const formatAddress = (address) => {
  const parts = [];
  
  if (address.line1) parts.push(address.line1);
  if (address.line2) parts.push(address.line2);
  if (address.city) parts.push(address.city);
  if (address.district) parts.push(address.district);
  if (address.region) parts.push(address.region);
  if (address.digital) parts.push(address.digital);
  
  return parts.join(', ');
};

/**
 * Format patient name
 */
const formatPatientName = (patient, options = {}) => {
  const {
    includeTitle = true,
    includeMiddle = true,
    surnameFirst = false
  } = options;

  const parts = [];
  
  if (includeTitle && patient.title) parts.push(patient.title);
  
  if (surnameFirst) {
    parts.push(patient.last_name);
    parts.push(patient.first_name);
    if (includeMiddle && patient.middle_name) parts.push(patient.middle_name);
  } else {
    parts.push(patient.first_name);
    if (includeMiddle && patient.middle_name) parts.push(patient.middle_name);
    parts.push(patient.last_name);
  }
  
  return parts.join(' ').trim();
};

/**
 * Format doctor name
 */
const formatDoctorName = (doctor, options = {}) => {
  const {
    includeTitle = true,
    includeSpecialization = false
  } = options;

  const parts = [];
  
  if (includeTitle && doctor.title) parts.push(doctor.title);
  parts.push(doctor.first_name);
  parts.push(doctor.last_name);
  
  if (includeSpecialization && doctor.specialization) {
    parts.push(`(${doctor.specialization})`);
  }
  
  return parts.join(' ');
};

/**
 * Format appointment time
 */
const formatAppointmentTime = (date, startTime, endTime) => {
  const formattedDate = moment(date).format('DD MMM YYYY');
  return `${formattedDate} at ${startTime} - ${endTime}`;
};

/**
 * Format invoice number
 */
const formatInvoiceNumber = (number) => {
  // Format: INV-2024-00001
  const parts = number.match(/(INV)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format claim number
 */
const formatClaimNumber = (number) => {
  // Format: CLM-2024-00001
  const parts = number.match(/(CLM)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format lab order number
 */
const formatLabOrderNumber = (number) => {
  // Format: LAB-2024-00001
  const parts = number.match(/(LAB)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format prescription number
 */
const formatPrescriptionNumber = (number) => {
  // Format: PRESC-2024-00001
  const parts = number.match(/(PRESC)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format patient number
 */
const formatPatientNumber = (number) => {
  // Format: PAT-2024-00001
  const parts = number.match(/(PAT)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format visit number
 */
const formatVisitNumber = (number) => {
  // Format: VIS-2024-00001
  const parts = number.match(/(VIS)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format payment number
 */
const formatPaymentNumber = (number) => {
  // Format: PAY-2024-00001
  const parts = number.match(/(PAY)(\d{4})(\d+)/);
  if (parts) {
    return `${parts[1]}-${parts[2]}-${parts[3].padStart(5, '0')}`;
  }
  return number;
};

/**
 * Format mobile money number for display
 */
const formatMobileMoneyNumber = (number) => {
  const cleaned = number.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  return number;
};

/**
 * Format card number (masked)
 */
const formatMaskedCardNumber = (cardNumber) => {
  const cleaned = cardNumber.replace(/\D/g, '');
  if (cleaned.length >= 4) {
    const last4 = cleaned.slice(-4);
    return `**** **** **** ${last4}`;
  }
  return cardNumber;
};

/**
 * Format account number (masked)
 */
const formatMaskedAccountNumber = (accountNumber) => {
  const cleaned = accountNumber.replace(/\D/g, '');
  if (cleaned.length >= 4) {
    const last4 = cleaned.slice(-4);
    const masked = '*'.repeat(cleaned.length - 4);
    return `${masked}${last4}`;
  }
  return accountNumber;
};

/**
 * Format enumeration value to readable string
 */
const formatEnum = (value) => {
  if (!value) return '';
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Format list as comma-separated with 'and'
 */
const formatList = (items, options = {}) => {
  const {
    conjunction = 'and',
    oxfordComma = true
  } = options;

  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;

  const firstPart = items.slice(0, -1).join(', ');
  const lastItem = items[items.length - 1];
  const comma = oxfordComma ? ',' : '';

  return `${firstPart}${comma} ${conjunction} ${lastItem}`;
};

module.exports = {
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatPhoneNumber,
  formatGhanaCard,
  formatNHISNumber,
  formatDigitalAddress,
  formatFileSize,
  formatDuration,
  formatBloodPressure,
  formatTemperature,
  formatWeight,
  formatHeight,
  formatBMI,
  formatVisualAcuity,
  formatRefraction,
  formatDrugStrength,
  formatDosageInstructions,
  formatAddress,
  formatPatientName,
  formatDoctorName,
  formatAppointmentTime,
  formatInvoiceNumber,
  formatClaimNumber,
  formatLabOrderNumber,
  formatPrescriptionNumber,
  formatPatientNumber,
  formatVisitNumber,
  formatPaymentNumber,
  formatMobileMoneyNumber,
  formatMaskedCardNumber,
  formatMaskedAccountNumber,
  formatEnum,
  formatList
};