const logger = require("../config/logger");
const { AppError } = require("../utils/errors");

/**
 * Fields that must never appear in logs because they contain secrets.
 */
const SENSITIVE_FIELDS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "password_confirmation",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "apiSecret",
  "x-api-key",
  "x-api-secret",
  "authorization",
  "secret",
  "otp",
  "resetToken",
  "password_reset_token",
  "two_factor_secret",
  "encryption_key",
  "private_key",
]);

/**
 * Recursively redact sensitive fields from an object so they never
 * appear in log output.
 */
function redactSensitive(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      redacted[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Central error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Set default values
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.code = err.code || "INTERNAL_SERVER_ERROR";

  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId,
    requestId: req.requestId,
    body: redactSensitive(req.body),
    params: redactSensitive(req.params),
    query: redactSensitive(req.query),
  });

  // map shutdown-related errors to service unavailable
  if (err.message && err.message.toLowerCase().includes("shutting down")) {
    error = new AppError(
      "Server is shutting down",
      503,
      "SERVER_SHUTTING_DOWN"
    );
  }

  // PostgreSQL unique violation error
  if (err.code === "23505") {
    const field = err.detail?.match(/Key \((.*?)\)=/)?.[1] || "field";
    error = new AppError(
      `A record with that ${field} already exists. Please use a different value.`,
      409,
      "DUPLICATE_ENTRY"
    );
  }

  // PostgreSQL foreign key violation
  if (err.code === "23503") {
    error = new AppError(
      "The related record this action depends on could not be found. Please ensure the linked item exists and try again.",
      404,
      "REFERENCE_NOT_FOUND"
    );
  }

  // PostgreSQL not null violation
  if (err.code === "23502") {
    const field = err.column || "field";
    error = new AppError(
      "A required value is missing. Please complete all required fields and try again.",
      400,
      "REQUIRED_FIELD"
    );
  }

  // PostgreSQL invalid input syntax
  if (err.code === "22P02") {
    error = new AppError(
      "The information you entered is not in the correct format. Please check your input and try again.",
      400,
      "INVALID_INPUT"
    );
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error = new AppError(
      "Your session could not be verified. Please log in again to continue.",
      401,
      "INVALID_TOKEN"
    );
  }

  if (err.name === "TokenExpiredError") {
    error = new AppError(
      "Your session has expired. Please log in again to continue.",
      401,
      "TOKEN_EXPIRED"
    );
  }

  // Multer errors (file upload)
  if (err.code === "LIMIT_FILE_SIZE") {
    error = new AppError(
      "The file you uploaded is too large. Please choose a smaller file and try again.",
      400,
      "FILE_TOO_LARGE"
    );
  }

  if (err.code === "LIMIT_FILE_COUNT") {
    error = new AppError(
      "You uploaded too many files. Please upload fewer files at once and try again.",
      400,
      "TOO_MANY_FILES"
    );
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    error = new AppError(
      "The file you uploaded does not match the expected type. Please check the file and try again.",
      400,
      "UNEXPECTED_FILE"
    );
  }

  // Validation errors
  if (err.name === "ValidationError") {
    error = new AppError(err.message, 400, "VALIDATION_ERROR");
  }

  // Send response
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const error = new AppError(
    "The page or resource you requested was not found. Please check the address and try again.",
    404,
    "NOT_FOUND"
  );
  next(error);
};

/**
 * Async handler wrapper to catch errors
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtExceptions = () => {
  process.on("uncaughtException", (err) => {
    logger.error("UNCAUGHT EXCEPTION! 💥", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejections = () => {
  process.on("unhandledRejection", (err) => {
    logger.error("UNHANDLED REJECTION! 💥", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
};

module.exports = {
  errorHandler,
  notFound,
  catchAsync,
  handleUncaughtExceptions,
  handleUnhandledRejections,
  AppError,
};
