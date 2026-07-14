const jwt = require("jsonwebtoken");
const db = require("../config/database");
const redis = require("../config/redis");
const logger = require("../config/logger");
const auth = require("../config/auth");
const { hasModuleAccess } = require("./moduleAccess");

// Hoisted UUID regex — UUIDs are always lowercase hex, so no 'i' flag needed
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Authentication middleware to verify JWT token
 */
const authenticateToken = async (req, res, next) => {
  try {
    // if database is shutting down, reject immediately
    const db = require("../config/database");
    if (db._shuttingDown) {
      return res.status(503).json({
        success: false,
        error: {
          code: "SERVER_SHUTTING_DOWN",
          message: "The system is currently unavailable. Please try again in a few minutes.",
        },
      });
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Please log in to access this feature.",
        },
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Your session is no longer valid. Please log in again.",
        },
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "hospital-management-system",
      audience: "hospital-api",
    });

    // ---- Auth context caching ----
    // Check Redis cache before hitting the DB for roles/permissions.
    // The cache is invalidated whenever roles/permissions change.
    try {
      const cachedAuth = await redis.get(`user_auth:${decoded.userId}`);
      if (cachedAuth) {
        const parsed = typeof cachedAuth === "string" ? JSON.parse(cachedAuth) : cachedAuth;
        req.user = {
          userId: decoded.userId,
          employeeId: parsed.employeeId,
          name: parsed.name,
          email: parsed.email,
          facilityId: parsed.facilityId,
          branchId: parsed.branchId || null,
          departmentId: parsed.departmentId,
          roles: parsed.roles,
          permissions: parsed.permissions,
          isSuperUser:
            parsed.roles.includes("SUPER_ADMIN") ||
            parsed.roles.includes("SYS_ADMIN"),
        };
        return next();
      }
    } catch (_) {
      // Cache miss or error – fall through to DB query
    }

    // Get user from database with roles and permissions.
    // Uses a column-safe helper so the server stays functional on installations
    // that have not yet run the branch migration (branch_id column may be absent).
    let user;
    try {
      user = await db.query(
        `
        SELECT
          u.id, u.employee_id, u.first_name, u.last_name, u.email,
          u.facility_id, u.branch_id, u.department_id, u.user_status,
          COALESCE(
            array_agg(DISTINCT r.role_code) FILTER (WHERE r.role_code IS NOT NULL),
            ARRAY[]::text[]
          ) as roles,
          COALESCE(
            array_agg(DISTINCT p.permission_code) FILTER (WHERE p.permission_code IS NOT NULL),
            ARRAY[]::text[]
          ) as permissions
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
        LEFT JOIN roles r ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = $1 AND u.user_status = 'Active'
        GROUP BY u.id
      `,
        [decoded.userId]
      );
    } catch (colErr) {
      // Graceful fallback when branch_id column does not yet exist (migration pending).
      // Error code 42703 = undefined_column in PostgreSQL.
      if (colErr.code === "42703") {
        logger.warn(
          "branch_id column missing from users table – run migration 0007. Falling back to query without branch_id."
        );
        user = await db.query(
          `
          SELECT
            u.id, u.employee_id, u.first_name, u.last_name, u.email,
            u.facility_id, NULL::uuid AS branch_id, u.department_id, u.user_status,
            COALESCE(
              array_agg(DISTINCT r.role_code) FILTER (WHERE r.role_code IS NOT NULL),
              ARRAY[]::text[]
            ) as roles,
            COALESCE(
              array_agg(DISTINCT p.permission_code) FILTER (WHERE p.permission_code IS NOT NULL),
              ARRAY[]::text[]
            ) as permissions
          FROM users u
          LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
          LEFT JOIN roles r ON ur.role_id = r.id
          LEFT JOIN role_permissions rp ON r.id = rp.role_id
          LEFT JOIN permissions p ON rp.permission_id = p.id
          WHERE u.id = $1 AND u.user_status = 'Active'
          GROUP BY u.id
        `,
          [decoded.userId]
        );
      } else {
        throw colErr;
      }
    }

    if (user.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "This account does not exist or is not active. Please contact your administrator.",
        },
      });
    }

    // Check token version — if the user changed their password all older tokens
    // are invalidated. This limits the window of a stolen token after password reset.
    const tokenVersion = await redis.get(`token_version:${decoded.userId}`);
    if (tokenVersion && decoded.iat && decoded.iat < parseInt(tokenVersion)) {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_REVOKED",
          message: "Your session was revoked. Please log in again to continue.",
        },
      });
    }

    // Attach user to request object.
    // FACILITY_ID env var enables single-tenant mode: all requests are pinned to that facility.
    // The value MUST be a valid UUID; placeholders/empty strings fall back to the user's own facility_id.
    const envFacilityId = process.env.FACILITY_ID;
    const resolvedFacilityId =
      envFacilityId && UUID_REGEX.test(envFacilityId)
        ? envFacilityId
        : user.rows[0].facility_id;
    const isSuperUser =
      user.rows[0].roles.includes("SUPER_ADMIN") ||
      user.rows[0].roles.includes("SYS_ADMIN");
    req.user = {
      userId: user.rows[0].id,
      employeeId: user.rows[0].employee_id,
      name: `${user.rows[0].first_name} ${user.rows[0].last_name}`,
      email: user.rows[0].email,
      facilityId: resolvedFacilityId,
      // branchId is null for SUPER_ADMIN/SYS_ADMIN — they operate across all branches
      branchId: isSuperUser ? null : user.rows[0].branch_id,
      departmentId: user.rows[0].department_id,
      roles: user.rows[0].roles,
      permissions: user.rows[0].permissions,
      isSuperUser,
    };

    // Cache the auth context for subsequent requests (TTL: 5 minutes)
    try {
      await redis.set(
        `user_auth:${user.rows[0].id}`,
        JSON.stringify({
          employeeId: user.rows[0].employee_id,
          name: `${user.rows[0].first_name} ${user.rows[0].last_name}`,
          email: user.rows[0].email,
          facilityId: resolvedFacilityId,
          branchId: isSuperUser ? null : user.rows[0].branch_id,
          departmentId: user.rows[0].department_id,
          roles: user.rows[0].roles,
          permissions: user.rows[0].permissions,
        }),
        300
      );
    } catch (_) {
      // Non-critical cache failure — the DB query succeeded, so proceed
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please log in again.",
        },
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Your session could not be verified. Please log in again.",
        },
      });
    }

    logger.error("Authentication error:", error);
    next(error);
  }
};

/**
 * Optional authentication - doesn't require token but attaches user if present
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "hospital-management-system",
      audience: "hospital-api",
      ignoreExpiration: false,
    });

    const user = await db.query(
      `
      SELECT u.id, u.facility_id, u.branch_id
      FROM users u
      WHERE u.id = $1 AND u.user_status = 'Active'
    `,
      [decoded.userId]
    );

    if (user.rows.length > 0) {
      req.user = {
        userId: user.rows[0].id,
        facilityId: user.rows[0].facility_id,
        branchId: user.rows[0].branch_id,
      };
    }

    next();
  } catch (error) {
    // Ignore token errors for optional auth
    next();
  }
};

/**
 * Role-based authorization middleware
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Please log in to access this feature.",
        },
      });
    }

    // SUPER_ADMIN and SYS_ADMIN are granted all role-based access
    if (
      req.user.roles.includes("SYS_ADMIN") ||
      req.user.roles.includes("SUPER_ADMIN")
    ) {
      return next();
    }

    // Allow access if user has any of the allowed roles
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    // Special case: allow all authenticated users if '*' is specified
    if (!hasRole && !allowedRoles.includes("*")) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action. Please contact your administrator if you need access.",
        },
      });
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * @param {string} requiredPermission - Permission required to access the route
 */
const hasPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Please log in to access this feature.",
        },
      });
    }

    // SUPER_ADMIN and SYS_ADMIN automatically have all permissions
    if (
      req.user.roles.includes("SYS_ADMIN") ||
      req.user.roles.includes("SUPER_ADMIN")
    ) {
      return next();
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Permission denied",
        },
      });
    }

    next();
  };
};

/**
 * Facility-based access control - ensures user can only access their facility's data
 */
const belongsToFacility = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Please log in to access this feature.",
      },
    });
  }

  const resourceFacilityId =
    req.body.facility_id || req.params.facility_id || req.query.facility_id;

  // Skip check if no facility specified (will be set by controller)
  if (!resourceFacilityId) {
    return next();
  }

  if (resourceFacilityId !== req.user.facilityId && !req.user.isSuperUser) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "You can only access data for your own facility. Please contact your administrator if you need broader access.",
      },
    });
  }

  next();
};

/**
 * Department-based access control
 */
const belongsToDepartment = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Please log in to access this feature.",
      },
    });
  }

  const resourceDepartmentId =
    req.body.department_id || req.params.department_id;

  if (!resourceDepartmentId) {
    return next();
  }

  if (
    resourceDepartmentId !== req.user.departmentId &&
    !req.user.roles.includes("SYS_ADMIN")
  ) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "You can only access data for your own department. Please contact your administrator if you need broader access.",
      },
    });
  }

  next();
};

/**
 * Check if user is the resource owner (e.g., accessing their own data)
 */
const isResourceOwner = (resourceUserIdField = "user_id") => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Please log in to access this feature.",
        },
      });
    }

    const resourceUserId =
      req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (
      resourceUserId &&
      resourceUserId !== req.user.userId &&
      !req.user.roles.includes("SYS_ADMIN")
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to access this record.",
          },
        });
      }

      next();
  };
};

/**
 * Generate rate limiter middleware with custom options
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = "You've made too many attempts. Please wait a moment and try again.",
    keyGenerator = (req) => req.user?.userId || req.ip,
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [k, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter((t) => t > windowStart);
      if (validTimestamps.length === 0) {
        requests.delete(k);
      } else {
        requests.set(k, validTimestamps);
      }
    }

    // Get user's request timestamps
    const userRequests = requests.get(key) || [];

    // Check if over limit
    if (userRequests.length >= max) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
        },
      });
    }

    // Add current request
    userRequests.push(now);
    requests.set(key, userRequests);

    next();
  };
};

/**
 * Generate API key for service-to-service authentication
 */
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const apiSecret = req.headers["x-api-secret"];

  if (!apiKey || !apiSecret) {
    return res.status(401).json({
      success: false,
      error: {
        code: "MISSING_API_CREDENTIALS",
        message: "API key and secret required",
      },
    });
  }

  try {
    // Validate API key from database
    const result = await db.query(
      `
      SELECT * FROM api_keys
      WHERE api_key = $1 AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_API_KEY",
          message: "The API key provided is not valid. Please check your credentials and try again.",
        },
      });
    }

    const apiKeyData = result.rows[0];

    // Verify secret using HMAC-SHA256 with timing-safe comparison
    // Supports both newly-hashed secrets and legacy plaintext for migration
    const storedSecret = apiKeyData.api_secret;
    const isHexHash = /^[0-9a-f]{64}$/i.test(storedSecret);
    let isValid = false;

    if (isHexHash) {
      // New path: stored value is an HMAC-SHA256 hash
      isValid = auth.verifyApiKey(apiKey, apiSecret, storedSecret);
    } else {
      // Legacy path: stored value is plaintext — warn and migrate
      logger.warn(
        "API key secret stored in plaintext — migrate to hashed secrets via auth.generateApiKey()"
      );
      isValid = apiSecret === storedSecret;
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_API_SECRET",
          message: "The API secret provided is not valid. Please check your credentials and try again.",
        },
      });
    }

    // Attach API key info to request
    req.apiKey = {
      id: apiKeyData.id,
      name: apiKeyData.name,
      facilityId: apiKeyData.facility_id,
      permissions: apiKeyData.permissions,
    };

    next();
  } catch (error) {
    logger.error("API key validation error:", error);
    next(error);
  }
};

module.exports = {
  authenticateToken,
  optionalAuthenticate,
  authorize,
  hasPermission,
  hasModuleAccess,
  belongsToFacility,
  belongsToDepartment,
  isResourceOwner,
  rateLimiter,
  validateApiKey,
};
