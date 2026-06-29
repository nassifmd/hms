const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  audit: 5,
};

// Define colors for each level
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
  audit: "blue",
};

winston.addColors(colors);

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Custom format for files (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  }),

  // Error log file
  new DailyRotateFile({
    filename: path.join("logs", "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    level: "error",
    format: fileFormat,
    maxSize: "20m",
    maxFiles: "30d",
    auditFile: path.join("logs", "error-audit.json"),
  }),

  // Combined log file (all levels)
  new DailyRotateFile({
    filename: path.join("logs", "combined-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    format: fileFormat,
    maxSize: "50m",
    maxFiles: "14d",
    auditFile: path.join("logs", "combined-audit.json"),
  }),

  // HTTP access logs
  new DailyRotateFile({
    filename: path.join("logs", "http-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    level: "http",
    format: fileFormat,
    maxSize: "20m",
    maxFiles: "7d",
  }),

  // Audit logs (compliance)
  new DailyRotateFile({
    filename: path.join("logs", "audit-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    level: "audit",
    format: fileFormat,
    maxSize: "50m",
    maxFiles: "90d",
  }),
];

// Add exception handlers
const exceptionHandlers = [
  new winston.transports.File({
    filename: path.join("logs", "exceptions.log"),
    format: fileFormat,
  }),
];

// Add rejection handlers
const rejectionHandlers = [
  new winston.transports.File({
    filename: path.join("logs", "rejections.log"),
    format: fileFormat,
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  transports,
  exceptionHandlers,
  rejectionHandlers,
  exitOnError: false,
});

// Helper methods for structured logging
logger.logWithMetadata = (level, message, metadata = {}) => {
  logger.log(level, message, {
    ...metadata,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    service: "hospital-api",
    version: process.env.APP_VERSION || "1.0.0",
  });
};

// Audit logging for compliance
logger.audit = (action, userId, resource, details = {}) => {
  logger.log("audit", "Audit event", {
    action,
    userId,
    resource,
    ...details,
    auditId: require("crypto").randomBytes(16).toString("hex"),
  });
};

// Request logging middleware helper
logger.logRequest = (req, res, responseTime) => {
  logger.http("HTTP Request", {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    responseTime,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    userId: req.user?.userId,
  });
};

// Error logging with stack trace
logger.logError = (error, req = null) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    name: error.name,
  };

  if (req) {
    errorData.requestId = req.requestId;
    errorData.url = req.originalUrl;
    errorData.method = req.method;
    errorData.userId = req.user?.userId;
    errorData.body = req.body;
    errorData.params = req.params;
    errorData.query = req.query;
  }

  logger.error("Error occurred", errorData);
};

// Performance logging
logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.debug("Performance metric", {
    operation,
    duration,
    ...metadata,
    threshold: metadata.threshold || 1000,
    exceeded: duration > (metadata.threshold || 1000),
  });
};

// Database query logging
logger.logQuery = (query, duration, metadata = {}) => {
  if (duration > 1000) {
    logger.warn("Slow query", {
      query: query.substring(0, 200),
      duration,
      ...metadata,
    });
  } else if (process.env.NODE_ENV === "development") {
    logger.debug("Query executed", {
      query: query.substring(0, 100),
      duration,
      ...metadata,
    });
  }
};

// Create child logger with context
logger.child = (context) => {
  const childLogger = Object.create(logger);

  childLogger.log = (level, message, metadata = {}) => {
    logger.log(level, message, {
      ...context,
      ...metadata,
    });
  };

  return childLogger;
};

// Stream for morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

module.exports = logger;
