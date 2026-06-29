require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const routes = require("./routes");
const { errorHandler } = require("./middleware/errorHandler");
const logger = require("./config/logger");
const db = require("./config/database");
const redis = require("./config/redis");

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", process.env.API_URL || "'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: { policy: "require-corp" },
  })
);

// Compression
app.use(compression());

// CORS
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : process.env.NODE_ENV === "production"
  ? [] // no external origins allowed unless explicitly configured
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Request ID
app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests, please try again later",
      },
    });
  },
});
app.use("/api", limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    logger.http({
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userId: req.user?.userId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  });

  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: db.pool ? "connected" : "disconnected",
    redis:
      redis.client && redis.client._inMemory
        ? "disabled"
        : redis.client && redis.client.status === "ready"
        ? "connected"
        : "disconnected",
    environment: process.env.NODE_ENV,
  });
});

// API Routes
app.use("/api/v1", routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Cannot ${req.method} ${req.url}`,
    },
    requestId: req.requestId,
  });
});

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

let shuttingDown = false;
async function gracefulShutdown() {
  if (shuttingDown) return; // already in progress
  shuttingDown = true;

  // signal database helper that we are shutting down
  db._shuttingDown = true;

  logger.info("Received shutdown signal, closing server...");

  // stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error("Error closing HTTP server", { error: err.message });
      process.exit(1);
    }

    logger.info("HTTP server closed, destroying remaining sockets");
    // forcefully destroy any lingering connections
    connections.forEach((socket) => socket.destroy());

    logger.info("HTTP server closed, closing other resources...");

    try {
      await db.close();
      await redis.client.quit();
      logger.info("Connections closed, exiting...");
      process.exit(0);
    } catch (closeErr) {
      logger.error("Error during shutdown", {
        error: closeErr.message,
        stack: closeErr.stack,
      });
      process.exit(1);
    }
  });

  // force exit if shutdown takes too long
  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
}

const PORT = process.env.PORT || 3000;

// keep reference so we can close it during shutdown
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// keep track of open sockets so we can destroy them on shutdown
const connections = new Set();
server.on("connection", (socket) => {
  connections.add(socket);
  socket.on("close", () => {
    connections.delete(socket);
  });
});

module.exports = app; // still export app for testing
