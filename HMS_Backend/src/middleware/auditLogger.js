const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Audit logging middleware
 */
const auditLogger = (options = {}) => {
  const {
    table = null,
    action = null,
    includeBody = true,
    includeParams = true,
    includeQuery = true,
    sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'authorization']
  } = options;

  return async (req, res, next) => {
    // Store original end function
    const originalEnd = res.end;
    let responseBody = null;

    // Override end function to capture response
    res.end = function(chunk, encoding) {
      if (chunk) {
        try {
          responseBody = JSON.parse(chunk.toString());
        } catch (e) {
          responseBody = { raw: chunk.toString() };
        }
      }
      originalEnd.call(this, chunk, encoding);
    };

    // Wait for response to finish
    res.once('finish', async () => {
      try {
        // Skip logging for certain status codes
        if (res.statusCode >= 400 && res.statusCode < 500) {
          return;
        }

        // Prepare audit data
        const auditData = {
          user_id: req.user?.userId,
          facility_id: req.user?.facilityId,
          action: action || `${req.method} ${req.route?.path || req.path}`,
          table_name: table,
          record_id: req.params?.id,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          created_at: new Date()
        };

        // Add request details (with sensitive data redacted)
        if (includeBody && req.body) {
          const sanitizedBody = { ...req.body };
          sensitiveFields.forEach(field => {
            if (sanitizedBody[field]) {
              sanitizedBody[field] = '[REDACTED]';
            }
          });
          auditData.new_values = sanitizedBody;
        }

        if (includeParams && req.params) {
          auditData.record_id = auditData.record_id || req.params.id;
        }

        if (includeQuery && req.query) {
          auditData.query = req.query;
        }

        // Add response info for errors
        if (res.statusCode >= 500) {
          auditData.error = {
            status: res.statusCode,
            message: responseBody?.error?.message
          };
        }

        // Save audit log
        await db.query(`
          INSERT INTO audit_logs (
            user_id, facility_id, action, table_name,
            record_id, old_values, new_values, ip_address,
            user_agent, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          auditData.user_id,
          auditData.facility_id,
          auditData.action,
          auditData.table_name,
          auditData.record_id,
          auditData.old_values ? JSON.stringify(auditData.old_values) : null,
          auditData.new_values ? JSON.stringify(auditData.new_values) : null,
          auditData.ip_address,
          auditData.user_agent,
          auditData.created_at
        ]);

        logger.debug('Audit log created', { action: auditData.action });
      } catch (error) {
        logger.error('Failed to create audit log:', error);
      }
    });

    next();
  };
};

/**
 * Specific audit loggers for different operations
 */
const auditLoggers = {
  // Login attempts
  login: auditLogger({
    action: 'LOGIN',
    table: 'users',
    includeBody: false
  }),

  // Patient operations
  patient: auditLogger({
    table: 'patients',
    sensitiveFields: ['password', 'password_hash']
  }),

  // Clinical operations
  clinical: auditLogger({
    table: 'visits'
  }),

  // Financial operations
  financial: auditLogger({
    table: 'invoices',
    sensitiveFields: ['card_number', 'cvv', 'pin']
  }),

  // Admin operations
  admin: auditLogger({
    table: 'system_settings',
    includeBody: true
  }),

  // Generic logger
  generic: auditLogger()
};

module.exports = { auditLogger, auditLoggers };