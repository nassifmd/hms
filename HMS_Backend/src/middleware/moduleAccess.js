const db = require('../config/database');
const logger = require('../config/logger');
const redis = require('../config/redis');

/**
 * Check if facility has access to a specific module
 */
const checkModuleAccess = async (facilityId, moduleCode) => {
  try {
    // Check cache first
    const cacheKey = `module:access:${facilityId}:${moduleCode}`;
    const cached = await redis.get(cacheKey);
    
    if (cached !== null) {
      return cached === 'true';
    }

    // Query database
    const result = await db.query(`
      SELECT EXISTS(
        SELECT 1 FROM module_subscriptions
        WHERE facility_id = $1
          AND module_code = $2
          AND is_active = true
          AND start_date <= CURRENT_DATE
          AND end_date >= CURRENT_DATE
      ) as has_access
    `, [facilityId, moduleCode]);

    const hasAccess = result.rows[0].has_access;

    // Cache for 1 hour
    await redis.set(cacheKey, hasAccess ? 'true' : 'false', 3600);

    return hasAccess;
  } catch (error) {
    logger.error('Module access check error:', error);
    return false;
  }
};

/**
 * Middleware to check module access
 * @param {string} moduleCode - Module code to check access for
 */
const hasModuleAccess = (moduleCode) => {
  return async (req, res, next) => {
    try {
      // Skip for super admin
      if (req.user?.roles.includes('SYS_ADMIN')) {
        return next();
      }

      const facilityId = req.user?.facilityId || req.body.facility_id;

      if (!facilityId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FACILITY',
            message: 'Facility ID is required to check module access'
          }
        });
      }

      const hasAccess = await checkModuleAccess(facilityId, moduleCode);

      if (!hasAccess) {
        logger.warn('Module access denied', {
          userId: req.user?.userId,
          facilityId,
          moduleCode
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'MODULE_ACCESS_DENIED',
            message: `Access to ${moduleCode} module is not available for your facility`
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Module access middleware error:', error);
      next(error);
    }
  };
};

/**
 * Middleware to check multiple module access (OR condition)
 */
const hasAnyModuleAccess = (moduleCodes) => {
  return async (req, res, next) => {
    try {
      // Skip for super admin
      if (req.user?.roles.includes('SYS_ADMIN')) {
        return next();
      }

      const facilityId = req.user?.facilityId || req.body.facility_id;

      if (!facilityId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FACILITY',
            message: 'Facility ID is required to check module access'
          }
        });
      }

      for (const moduleCode of moduleCodes) {
        const hasAccess = await checkModuleAccess(facilityId, moduleCode);
        if (hasAccess) {
          return next();
        }
      }

      logger.warn('Module access denied', {
        userId: req.user?.userId,
        facilityId,
        requiredModules: moduleCodes
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'MODULE_ACCESS_DENIED',
          message: `Access to at least one of ${moduleCodes.join(', ')} modules is required`
        }
      });
    } catch (error) {
      logger.error('Module access middleware error:', error);
      next(error);
    }
  };
};

/**
 * Middleware to check if module is enabled in system
 */
const isModuleEnabled = (moduleCode) => {
  return (req, res, next) => {
    const envVar = `${moduleCode.toUpperCase()}_MODULE_ENABLED`;
    const isEnabled = process.env[envVar] === 'true';

    if (!isEnabled) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MODULE_NOT_FOUND',
          message: `${moduleCode} module is not available in this system`
        }
      });
    }

    next();
  };
};

/**
 * Get facility's active modules
 */
const getFacilityModules = async (facilityId) => {
  try {
    const cacheKey = `facility:modules:${facilityId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await db.query(`
      SELECT 
        module_code,
        module_name,
        subscription_type,
        start_date,
        end_date,
        max_users
      FROM module_subscriptions
      WHERE facility_id = $1
        AND is_active = true
        AND start_date <= CURRENT_DATE
        AND end_date >= CURRENT_DATE
      ORDER BY module_name
    `, [facilityId]);

    await redis.set(cacheKey, result.rows, 3600);

    return result.rows;
  } catch (error) {
    logger.error('Get facility modules error:', error);
    return [];
  }
};

/**
 * Check if user count is within module limits
 */
const checkUserLimit = (moduleCode) => {
  return async (req, res, next) => {
    try {
      const facilityId = req.user?.facilityId;

      if (!facilityId) {
        return next();
      }

      // Get module subscription
      const result = await db.query(`
        SELECT max_users
        FROM module_subscriptions
        WHERE facility_id = $1
          AND module_code = $2
          AND is_active = true
      `, [facilityId, moduleCode]);

      if (result.rows.length === 0 || !result.rows[0].max_users) {
        return next();
      }

      const maxUsers = result.rows[0].max_users;

      // Count current users with access to this module
      const userCount = await db.query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE u.facility_id = $1
          AND u.user_status = 'Active'
          AND r.role_code IN (
            SELECT unnest(module_roles) 
            FROM module_config 
            WHERE module_code = $2
          )
      `, [facilityId, moduleCode]);

      if (userCount.rows[0].count >= maxUsers) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'USER_LIMIT_EXCEEDED',
            message: `User limit (${maxUsers}) for ${moduleCode} module has been reached`
          }
        });
      }

      next();
    } catch (error) {
      logger.error('User limit check error:', error);
      next(error);
    }
  };
};

module.exports = {
  hasModuleAccess,
  hasAnyModuleAccess,
  isModuleEnabled,
  getFacilityModules,
  checkUserLimit,
  checkModuleAccess
};