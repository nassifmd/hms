const db = require("../config/database");
const User = require("../models/User");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const { verifyLicenseKey, VALID_MODULES } = require("../utils/license");

class AdminController {
  /**
   * @desc    Get system settings
   * @route   GET /api/v1/admin/settings
   * @access  Private (Admin only)
   */
  async getSettings(req, res, next) {
    try {
      // guard against missing table in lightweight deployments
      const {
        rows: [{ name: table }],
      } = await db.query(
        "SELECT to_regclass('public.system_settings') AS name"
      );

      if (!table) {
        // no settings table yet; return empty grouping so caller can continue
        return res.json({ success: true, data: {} });
      }

      const settings = await db.query(
        `
        SELECT DISTINCT ON (setting_key) *
        FROM system_settings
        WHERE facility_id = $1 OR facility_id IS NULL
        ORDER BY setting_key, facility_id NULLS LAST
      `,
        [req.user.facilityId]
      );

      // Group settings by category
      const grouped = settings.rows.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push({
          key: setting.setting_key,
          value: setting.setting_value,
          description: setting.description,
        });
        return acc;
      }, {});

      // Always override facility_name with the authoritative value from the facilities table
      const facilityRow = await db.query(
        "SELECT facility_name FROM facilities WHERE id = $1",
        [req.user.facilityId]
      );
      if (facilityRow.rows[0] && grouped["General"]) {
        const fnSetting = grouped["General"].find(
          (s) => s.key === "facility_name"
        );
        if (fnSetting) {
          fnSetting.value = facilityRow.rows[0].facility_name;
        }
      }

      res.json({
        success: true,
        data: grouped,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update system settings
   * @route   PUT /api/v1/admin/settings
   * @access  Private (Admin only)
   */
  async updateSettings(req, res, next) {
    try {
      const { settings } = req.body;

      if (!settings || !Array.isArray(settings)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATA",
            message: "Please provide a valid list of settings to update.",
          },
        });
      }

      // ensure table exists before attempting writes
      const {
        rows: [{ name: table }],
      } = await db.query(
        "SELECT to_regclass('public.system_settings') AS name"
      );

      if (!table) {
        // Fail gracefully: nothing to update if schema missing
        return res.status(500).json({
          success: false,
          error: {
            code: "MISSING_TABLE",
            message: "The system settings could not be saved. Please contact your administrator.",
          },
        });
      }

      for (const setting of settings) {
        await db.query(
          `
          INSERT INTO system_settings (setting_key, setting_value, category, description, facility_id, updated_by, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (setting_key, facility_id)
          DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `,
          [
            setting.key,
            setting.value,
            setting.category,
            setting.description,
            req.user.facilityId,
            req.user.userId,
          ]
        );
      }

      // Keep facilities table in sync when facility_name is updated
      const facilityNameSetting = settings.find(
        (s) => s.key === "facility_name"
      );
      if (facilityNameSetting) {
        await db.query(
          "UPDATE facilities SET facility_name = $1 WHERE id = $2",
          [facilityNameSetting.value, req.user.facilityId]
        );
      }

      // Clear cache
      await redis.del("system:settings");

      // Invalidate notification service channel cache when notification settings change
      const hasNotificationChange = settings.some(
        (s) => s.key === "email_notifications" || s.key === "sms_notifications"
      );
      if (hasNotificationChange) {
        try {
          const notificationService = require("../services/notificationService");
          notificationService._systemChannelCache = null;
          notificationService._systemChannelCacheAt = 0;
        } catch (_) {
          /* service may not be loaded */
        }
      }

      await Audit.logAction(req.user.userId, "SETTINGS_UPDATED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        message: "Settings updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all roles
   * @route   GET /api/v1/admin/roles
   * @access  Private (Admin only)
   */
  async getRoles(req, res, next) {
    try {
      const roles = await db.query(`
        SELECT
          r.*,
          (
            SELECT json_agg(
              json_build_object(
                'id', p.id,
                'code', p.permission_code,
                'name', p.permission_name,
                'module', p.module
              )
            )
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role_id = r.id
          ) as permissions,
          COUNT(u.id) as user_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        LEFT JOIN users u ON ur.user_id = u.id
        GROUP BY r.id
        ORDER BY r.role_name
      `);

      res.json({
        success: true,
        data: roles.rows,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Create new role
   * @route   POST /api/v1/admin/roles
   * @access  Private (Admin only)
   */
  async createRole(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const { role_code, role_name, description, permissions } = req.body;

      const result = await db.transaction(async (client) => {
        // Create role
        const role = await client.query(
          `
          INSERT INTO roles (role_code, role_name, description, created_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING *
        `,
          [role_code, role_name, description]
        );

        // Assign permissions
        if (permissions && permissions.length > 0) {
          for (const permissionId of permissions) {
            await client.query(
              `
              INSERT INTO role_permissions (role_id, permission_id)
              VALUES ($1, $2)
            `,
              [role.rows[0].id, permissionId]
            );
          }
        }

        return role.rows[0];
      });

      await Audit.logAction(req.user.userId, "ROLE_CREATED", {
        facility_id: req.user.facilityId,
        record_id: result.id,
        new_values: { role_code, role_name },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "Role created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update role
   * @route   PUT /api/v1/admin/roles/:id
   * @access  Private (Admin only)
   */
  async updateRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role_name, description, permissions } = req.body;

      const result = await db.transaction(async (client) => {
        // Update role
        const role = await client.query(
          `
          UPDATE roles
          SET
            role_name = COALESCE($1, role_name),
            description = COALESCE($2, description),
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `,
          [role_name, description, id]
        );

        if (permissions) {
          // Remove old permissions
          await client.query(
            `
            DELETE FROM role_permissions WHERE role_id = $1
          `,
            [id]
          );

          // Add new permissions
          for (const permissionId of permissions) {
            await client.query(
              `
              INSERT INTO role_permissions (role_id, permission_id)
              VALUES ($1, $2)
            `,
              [id, permissionId]
            );
          }
        }

        return role.rows[0];
      });

      // Clear user caches
      await redis.clearPattern("user:*");
      await redis.clearPattern("user_auth:*");

      await Audit.logAction(req.user.userId, "ROLE_UPDATED", {
        facility_id: req.user.facilityId,
        record_id: id,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        data: result,
        message: "Role updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Delete role
   * @route   DELETE /api/v1/admin/roles/:id
   * @access  Private (Admin only)
   */
  async deleteRole(req, res, next) {
    try {
      const { id } = req.params;

      // Check if role is in use
      const usage = await db.query(
        `
        SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1
      `,
        [id]
      );

      if (usage.rows[0].count > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: "ROLE_IN_USE",
            message: "Cannot delete role that is assigned to users",
          },
        });
      }

      await db.query("DELETE FROM roles WHERE id = $1", [id]);

      // Invalidate auth cache since roles changed
      await redis.clearPattern("user_auth:*");

      await Audit.logAction(req.user.userId, "ROLE_DELETED", {
        facility_id: req.user.facilityId,
        record_id: id,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // ----------------- department management -----------------

  async getDepartments(req, res, next) {
    try {
      const { facility_id } = req.query;
      let query = `
        SELECT
          id, facility_id AS "facilityId", branch_id AS "branchId",
          department_code AS "departmentCode", department_name AS "departmentName",
          department_type AS "departmentType", floor_location AS "floorLocation",
          extension_number AS "extensionNumber", is_active AS "isActive",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM departments
      `;
      const params = [];
      if (facility_id) {
        params.push(facility_id);
        query += " WHERE facility_id = $1";
      }
      query += " ORDER BY department_type, department_name";
      const result = await db.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      next(error);
    }
  }

  async createDepartment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const {
        facility_id,
        department_code,
        department_name,
        department_type,
        parent_department_id,
        head_of_department,
        floor_location,
        extension_number,
      } = req.body;

      const result = await db.query(
        `INSERT INTO departments
           (facility_id, department_code, department_name, department_type, parent_department_id, head_of_department, floor_location, extension_number, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         RETURNING *`,
        [
          req.user.facilityId,
          department_code,
          department_name,
          department_type,
          parent_department_id,
          head_of_department,
          floor_location,
          extension_number,
        ]
      );

      await Audit.logAction(req.user.userId, "DEPARTMENT_CREATED", {
        facility_id: req.user.facilityId,
        record_id: result.rows[0].id,
        new_values: result.rows[0],
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: "Department created",
      });
    } catch (error) {
      next(error);
    }
  }

  async updateDepartment(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const { id } = req.params;
      const fields = [
        "facility_id",
        "department_code",
        "department_name",
        "department_type",
        "parent_department_id",
        "head_of_department",
        "floor_location",
        "extension_number",
        "is_active",
      ];
      const updates = [];
      const values = [];
      let idx = 1;
      fields.forEach((f) => {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx}`);
          values.push(req.body[f]);
          idx++;
        }
      });
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: "NO_UPDATES", message: "No valid fields to update" },
        });
      }
      values.push(id);
      const query = `UPDATE departments SET ${updates.join(
        ", "
      )}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
      const result = await db.query(query, values);

      await Audit.logAction(req.user.userId, "DEPARTMENT_UPDATED", {
        facility_id: req.user.facilityId,
        record_id: id,
        new_values: result.rows[0],
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        data: result.rows[0],
        message: "Department updated",
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteDepartment(req, res, next) {
    try {
      const { id } = req.params;
      await db.query(
        `UPDATE departments SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await Audit.logAction(req.user.userId, "DEPARTMENT_DELETED", {
        facility_id: req.user.facilityId,
        record_id: id,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.json({ success: true, message: "Department deactivated" });
    } catch (error) {
      next(error);
    }
  }

  // Fixed: removed duplicate and malformed getPermissions method
  /**
   * @desc    Get all permissions
   * @route   GET /api/v1/admin/permissions
   * @access  Private (Admin only)
   */
  async getPermissions(req, res, next) {
    try {
      const permissions = await db.query(`
        SELECT * FROM permissions
        ORDER BY module, permission_name
      `);

      // Group by module
      const grouped = permissions.rows.reduce((acc, perm) => {
        if (!acc[perm.module]) {
          acc[perm.module] = [];
        }
        acc[perm.module].push(perm);
        return acc;
      }, {});

      res.json({
        success: true,
        data: grouped,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get audit logs
   * @route   GET /api/v1/admin/audit-logs
   * @access  Private (Admin only)
   */
  async getAuditLogs(req, res, next) {
    try {
      const {
        user_id,
        action,
        table_name,
        from_date,
        to_date,
        page = 1,
        limit = 50,
      } = req.query;

      const logs = await Audit.find(
        {
          user_id,
          // SYS_ADMIN / SUPER_ADMIN see all logs; other roles are scoped to their facility.
          // Also skip the filter when logs pre-date facility assignment (facility_id IS NULL).
          facility_id: req.user.isSuperUser ? undefined : req.user.facilityId,
          action,
          table_name,
          from_date,
          to_date,
        },
        { page, limit }
      );

      res.json({
        success: true,
        ...logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get system health status
   * @route   GET /api/v1/admin/health
   * @access  Private (Admin only)
   */
  async getSystemHealth(req, res, next) {
    try {
      // Database health
      const dbHealth = await db.query("SELECT 1 as health_check");

      // Active connections
      const connections = await db.query(`
        SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
      `);

      // Redis health (isolated so a redis failure doesn't crash the whole endpoint)
      let redisStatus = "unhealthy";
      let redisCachedKeys = 0;
      try {
        const pong = await redis.client.ping();
        redisStatus = pong === "PONG" ? "healthy" : "unhealthy";
        // Count cached keys in the in-memory store
        redisCachedKeys = (redis.store?.size ?? 0) + (redis.hashes?.size ?? 0);
      } catch (_) {
        redisStatus = "unhealthy";
      }

      // Storage health
      const storage = require("../config/storage");
      const storageUsage = await storage.getStorageUsage();

      const mem = process.memoryUsage();

      const health = {
        database: {
          status: dbHealth.rows[0] ? "healthy" : "unhealthy",
          connections: parseInt(connections.rows[0].count, 10),
        },
        redis: {
          status: redisStatus,
          cached_keys: redisCachedKeys,
          mode: redis.client?._inMemory ? "in-memory" : "redis",
        },
        storage: storageUsage,
        uptime: process.uptime(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
        },
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get system backup
   * @route   POST /api/v1/admin/backup
   * @access  Private (Admin only)
   */
  async createBackup(req, res, next) {
    try {
      const backup = require("../services/backupService");
      const result = await backup.createBackup();

      await Audit.logAction(req.user.userId, "BACKUP_CREATED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        data: result,
        message: "Backup created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Restore from backup
   * @route   POST /api/v1/admin/restore
   * @access  Private (Admin only)
   */
  async restoreBackup(req, res, next) {
    try {
      const { backup_file } = req.body;

      if (!backup_file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_FILE",
            message: "Backup file name is required",
          },
        });
      }

      const backup = require("../services/backupService");
      await backup.restoreBackup(backup_file);

      await Audit.logAction(req.user.userId, "BACKUP_RESTORED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: { backup_file },
      });

      res.json({
        success: true,
        message: "Backup restored successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get list of backups
   * @route   GET /api/v1/admin/backups
   * @access  Private (Admin only)
   */
  async getBackups(req, res, next) {
    try {
      const backup = require("../services/backupService");
      const backups = await backup.listBackups();

      res.json({
        success: true,
        data: backups,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Run database migrations
   * @route   POST /api/v1/admin/migrate
   * @access  Private (Admin only)
   */
  async runMigrations(req, res, next) {
    try {
      const { migration_file } = req.body;

      // This would run database migrations
      // In production, this should be handled by migration scripts

      await Audit.logAction(req.user.userId, "MIGRATION_RUN", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: { migration_file },
      });

      res.json({
        success: true,
        message: "Migrations completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Clear system cache
   * @route   POST /api/v1/admin/clear-cache
   * @access  Private (Admin only)
   */
  async clearCache(req, res, next) {
    try {
      const { pattern = "*" } = req.body;

      await redis.clearPattern(pattern);

      await Audit.logAction(req.user.userId, "CACHE_CLEARED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: { pattern },
      });

      res.json({
        success: true,
        message: "Cache cleared successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get system configuration
   * @route   GET /api/v1/admin/config
   * @access  Private (Admin only)
   */
  async getConfig(req, res, next) {
    try {
      // Return non-sensitive configuration
      const config = {
        environment: process.env.NODE_ENV,
        api_version: "v1",
        features: {
          dental_module: process.env.DENTAL_MODULE_ENABLED === "true",
          eye_module: process.env.EYE_MODULE_ENABLED === "true",
          lab_module: process.env.LAB_MODULE_ENABLED === "true",
          pharmacy_module: process.env.PHARMACY_MODULE_ENABLED === "true",
          claims_it: process.env.CLAIMS_IT_ENABLED === "true",
          two_factor: process.env.ENABLE_2FA === "true",
          email_notifications:
            process.env.ENABLE_EMAIL_NOTIFICATIONS === "true",
          sms_notifications: process.env.ENABLE_SMS_NOTIFICATIONS === "true",
        },
        limits: {
          max_file_size: process.env.MAX_FILE_SIZE,
          rate_limit: process.env.RATE_LIMIT_MAX_REQUESTS,
          pagination_limit: 100,
        },
        support: {
          email: process.env.SUPPORT_EMAIL,
          phone: process.env.SUPPORT_PHONE,
        },
      };

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get system logs
   * @route   GET /api/v1/admin/logs
   * @access  Private (Admin only)
   */
  async getLogs(req, res, next) {
    try {
      const { level, from_date, to_date, limit = 100 } = req.query;

      // This would read from log files
      // For now, return sample data
      const logs = {
        system: [],
        audit: [],
        errors: [],
      };

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user activity summary
   * @route   GET /api/v1/admin/user-activity
   * @access  Private (Admin only)
   */
  async getUserActivity(req, res, next) {
    try {
      const { days = 30 } = req.query;

      const activity = await Audit.getUserActivitySummary(
        req.user.facilityId,
        days
      );

      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get table activity summary
   * @route   GET /api/v1/admin/table-activity
   * @access  Private (Admin only)
   */
  async getTableActivity(req, res, next) {
    try {
      const { days = 30 } = req.query;

      const activity = await Audit.getTableActivitySummary(
        req.user.facilityId,
        days
      );

      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Clean up old data
   * @route   POST /api/v1/admin/cleanup
   * @access  Private (Admin only)
   */
  async cleanupData(req, res, next) {
    try {
      const { type, older_than_days } = req.body;

      let deletedCount = 0;

      if (type === "audit_logs") {
        deletedCount = await Audit.cleanup(older_than_days || 365);
      } else if (type === "temp_files") {
        const storage = require("../config/storage");
        await storage.cleanupTempFiles();
      }

      await Audit.logAction(req.user.userId, "DATA_CLEANUP", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: { type, older_than_days, deletedCount },
      });

      res.json({
        success: true,
        data: { deleted: deletedCount },
        message: "Cleanup completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Test email configuration
   * @route   POST /api/v1/admin/test-email
   * @access  Private (Admin only)
   */
  async testEmail(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_EMAIL",
            message: "Please enter an email address to send the test to.",
          },
        });
      }

      const emailService = require("../config/email");

      await emailService.sendEmail({
        to: email,
        subject: "Test Email from Hospital Management System",
        html: "<h1>Test Email</h1><p>This is a test email to verify your email configuration.</p>",
      });

      res.json({
        success: true,
        message: "Test email sent successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Test SMS configuration
   * @route   POST /api/v1/admin/test-sms
   * @access  Private (Admin only)
   */
  async testSMS(req, res, next) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PHONE",
            message: "Please enter a phone number to send the test message to.",
          },
        });
      }

      const smsService = require("../config/sms");

      await smsService.sendSMS(
        phone,
        "This is a test SMS from your Hospital Management System."
      );

      res.json({
        success: true,
        message: "Test SMS sent successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Toggle maintenance mode
   * @route   POST /api/v1/admin/maintenance
   * @access  Private (Admin only)
   */
  async toggleMaintenance(req, res, next) {
    try {
      const { enabled, message } = req.body;

      // Store maintenance mode in Redis
      await redis.set("system:maintenance", {
        enabled: enabled || false,
        message:
          message || "System is under maintenance. Please try again later.",
        updated_by: req.user.userId,
        updated_at: new Date().toISOString(),
      });

      await Audit.logAction(req.user.userId, "MAINTENANCE_TOGGLED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: { enabled, message },
      });

      res.json({
        success: true,
        message: `Maintenance mode ${
          enabled ? "enabled" : "disabled"
        } successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get active module licenses for the current facility
   * @route   GET /api/v1/modules/status
   * @access  Private (any authenticated user)
   */
  async getModuleStatus(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      let rows = [];
      try {
        const { rows: dbRows } = await db.query(
          `SELECT module_code, expires_at, license_id, activated_at
             FROM module_licenses
            WHERE facility_id = $1
              AND is_active = true
              AND expires_at > NOW()`,
          [facilityId]
        );
        rows = dbRows;
      } catch {
        // table may not exist yet in this deployment — return all inactive
      }

      const now = new Date();
      const activeMap = {};
      for (const row of rows) {
        const secsLeft = Math.ceil((new Date(row.expires_at) - now) / 1000);
        activeMap[row.module_code] = {
          active: true,
          days_remaining: Math.ceil(secsLeft / 86400),
          expires_at: row.expires_at,
          license_id: row.license_id,
          activated_at: row.activated_at,
        };
      }

      const modules = {};
      for (const code of VALID_MODULES) {
        modules[code] = activeMap[code] || {
          active: false,
          days_remaining: 0,
          expires_at: null,
        };
      }

      res.json({ success: true, data: { modules } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Activate a paid module with a license key
   * @route   POST /api/v1/admin/modules/activate
   * @access  Private (SYS_ADMIN)
   */
  /**
   * @desc    Unlock a locked user account (reset account_locked and login_attempts)
   * @route   POST /api/v1/admin/users/:id/unlock
   * @access  Private (SYS_ADMIN)
   */
  async unlockUser(req, res, next) {
    try {
      const { id } = req.params;

      const result = await db.query(
        `UPDATE users SET account_locked = false, login_attempts = 0 WHERE id = $1 RETURNING id, email, account_locked, login_attempts`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: "USER_NOT_FOUND", message: "No user found with that ID. Please check and try again." },
        });
      }

      await Audit.logAction(req.user.userId, "USER_UNLOCKED", {
        target_user_id: id,
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      // Clear user cache
      await redis.del(`user:${id}`);
      await redis.del(`user_auth:${id}`);
      await redis.clearPattern(`users:*`);

      res.json({
        success: true,
        data: result.rows[0],
        message: "User account unlocked successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async activateModule(req, res, next) {
    try {
      const { module_code, license_key } = req.body;
      const facilityId = req.user.facilityId;
      const userId = req.user.id;

      if (!module_code || !VALID_MODULES.includes(module_code.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_MODULE",
            message: `module_code must be one of: ${VALID_MODULES.join(", ")}`,
          },
        });
      }

      const mod = module_code.toUpperCase();

      let payload;
      try {
        payload = verifyLicenseKey(license_key);
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_LICENSE_KEY", message: err.message },
        });
      }

      if (payload.mod !== mod) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MODULE_MISMATCH",
            message: `This key is for the ${payload.mod} module, not ${mod}`,
          },
        });
      }

      if (payload.fid !== "*" && payload.fid !== facilityId) {
        return res.status(400).json({
          success: false,
          error: {
            code: "FACILITY_MISMATCH",
            message: "This license key is not valid for your facility",
          },
        });
      }

      const issuedAt = new Date(payload.iss * 1000);
      const expiresAt = new Date(payload.exp * 1000);

      await db.query(
        `INSERT INTO module_licenses
           (facility_id, module_code, license_key, license_id, issued_at, expires_at, activated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (facility_id, module_code)
         DO UPDATE SET
           license_key   = EXCLUDED.license_key,
           license_id    = EXCLUDED.license_id,
           issued_at     = EXCLUDED.issued_at,
           expires_at    = EXCLUDED.expires_at,
           activated_at  = CURRENT_TIMESTAMP,
           activated_by  = EXCLUDED.activated_by,
           is_active     = true`,
        [facilityId, mod, license_key, payload.lid, issuedAt, expiresAt, userId]
      );

      await Audit.log({
        action: "MODULE_ACTIVATED",
        entity_type: "module_licenses",
        entity_id: null,
        user_id: userId,
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        new_values: {
          module_code: mod,
          license_id: payload.lid,
          expires_at: expiresAt,
        },
      });

      res.json({
        success: true,
        message: `${mod} module activated successfully`,
        data: {
          module_code: mod,
          license_id: payload.lid,
          expires_at: expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
