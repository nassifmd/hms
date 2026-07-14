const { validationResult } = require("express-validator");
const logger = require("../config/logger");

/**
 * Validate request using express-validator results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.debug("Validation failed:", {
      path: req.path,
      errors: errorMessages,
    });

    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Some of the information you entered is incorrect or missing. Please review the highlighted fields and try again.",
        details: errorMessages,
      },
    });
  }

  next();
};

/**
 * Validate UUID parameter
 */
const validateUUID = (req, res, next) => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Check all UUID parameters
  for (const [key, value] of Object.entries(req.params)) {
    if (
      key.toLowerCase().includes("id") ||
      key.toLowerCase().includes("uuid")
    ) {
      if (value && !uuidPattern.test(value)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_UUID",
            message: "The ID you provided is not valid. Please check that you've selected a valid record and try again.",
          },
        });
      }
    }
  }

  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page, limit, offset } = req.query;

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PAGE",
          message: "Page number must be 1 or higher.",
        },
      });
    }
    req.query.page = pageNum;
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_LIMIT",
          message: "Limit must be between 1 and 100",
        },
      });
    }
    req.query.limit = limitNum;
  }

  if (offset !== undefined) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_OFFSET",
          message: "The starting position must be 0 or higher.",
        },
      });
    }
    req.query.offset = offsetNum;
  }

  next();
};

/**
 * Validate date range parameters
 */
const validateDateRange = (req, res, next) => {
  const { start_date, end_date, from_date, to_date } = req.query;

  const validateDate = (date, name) => {
    if (date && isNaN(Date.parse(date))) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_DATE",
          message: "The date you entered is not in a valid format. Please use a valid date.",
        },
      });
    }
  };

  validateDate(start_date, "start_date");
  validateDate(end_date, "end_date");
  validateDate(from_date, "from_date");
  validateDate(to_date, "to_date");

  // Check date range logic
  if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_RANGE",
        message: "The start date must be earlier than the end date.",
      },
    });
  }

  if (from_date && to_date && new Date(from_date) > new Date(to_date)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_RANGE",
        message: "The from date must be earlier than the to date.",
      },
    });
  }

  next();
};

/**
 * Validate required fields
 */
const validateRequired = (fields) => {
  return (req, res, next) => {
    const missing = [];

    for (const field of fields) {
      const value = field.includes(".")
        ? field.split(".").reduce((obj, key) => obj?.[key], req.body)
        : req.body[field];

      if (value === undefined || value === null || value === "") {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "Please complete all required fields before continuing.",
          details: missing,
        },
      });
    }

    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (Ghana format)
 */
const validatePhoneNumber = (phone) => {
  // Ghana phone numbers: 024XXXXXXX, 054XXXXXXX, etc.
  const phoneRegex = /^(0|233)?[2-5][0-9]{8}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ""));
};

/**
 * Validate NHIS number format
 */
const validateNHISNumber = (nhis) => {
  // NHIS number format: NHIS/123456/24 or 123456789
  const nhisRegex = /^(NHIS\/)?[0-9]{6,9}(\/[0-9]{2})?$/i;
  return nhisRegex.test(nhis);
};

/**
 * Validate blood group
 */
const validateBloodGroup = (bloodGroup) => {
  const validGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  return validGroups.includes(bloodGroup);
};

/**
 * Validate gender
 */
const validateGender = (gender) => {
  const validGenders = ["Male", "Female", "Other"];
  return validGenders.includes(gender);
};

/**
 * Encode HTML special characters to entity references to prevent XSS.
 * Unlike tag-stripping, this approach preserves the original data while
 * ensuring it cannot be interpreted as HTML markup.
 */
function encodeHtmlEntities(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Recursively sanitize all string values in an object to prevent XSS.
 * Applies HTML entity encoding so the data is safe for rendering.
 */
function deepSanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (typeof item === "string") {
        obj[index] = encodeHtmlEntities(item);
      } else if (typeof item === "object") {
        deepSanitize(item);
      }
    });
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === "string") {
          obj[key] = encodeHtmlEntities(obj[key]).trim();
        } else if (typeof obj[key] === "object") {
          deepSanitize(obj[key]);
        }
      }
    }
  }
}

/**
 * Sanitize input to prevent XSS using HTML entity encoding.
 * Also sanitizes req.params which was previously missed.
 */
const sanitizeInput = (req, res, next) => {
  deepSanitize(req.body);
  deepSanitize(req.query);
  deepSanitize(req.params);
  next();
};

/**
 * Validate content type
 */
const validateContentType = (req, res, next) => {
  const contentType = req.headers["content-type"];

  if (req.method === "POST" || req.method === "PUT") {
    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        success: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "The request format is not supported. Please ensure you're using a compatible client.",
        },
      });
    }
  }

  next();
};

module.exports = {
  validate,
  validateUUID,
  validatePagination,
  validateDateRange,
  validateRequired,
  validateEmail,
  validatePhoneNumber,
  validateNHISNumber,
  validateBloodGroup,
  validateGender,
  sanitizeInput,
  validateContentType,
};
