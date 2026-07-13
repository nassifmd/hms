const User = require("../models/User");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");
const db = require("../config/database");
const { validationResult } = require("express-validator");

class UserController {
  /**
   * @desc    Create a new user
   * @route   POST /api/v1/users
   * @access  Private (Admin only)
   */
  async createUser(req, res, next) {
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

      const b = req.body;

      // SUPER_ADMIN can only create SYS_ADMIN users
      const isSuperAdmin = req.user.roles.includes("SUPER_ADMIN");
      if (isSuperAdmin) {
        const requestedRole =
          b.role_code || (b.roles && b.roles.length > 0 ? null : null);
        if (b.role_code && b.role_code !== "SYS_ADMIN") {
          return res.status(403).json({
            success: false,
            error: {
              code: "FORBIDDEN",
              message:
                "Super Administrator can only create System Administrator accounts",
            },
          });
        }
        // Force role to SYS_ADMIN
        b.role_code = "SYS_ADMIN";
      }

      // Resolve role UUID from role_code if provided
      let roleIds = b.roles || [];
      if (!roleIds.length && b.role_code) {
        const db = require("../config/database");
        const roleRow = await db.query(
          "SELECT id FROM roles WHERE role_code = $1 LIMIT 1",
          [b.role_code]
        );
        if (roleRow.rows.length > 0) {
          roleIds = [roleRow.rows[0].id];
        }
      }

      const userData = {
        first_name: b.first_name || b.firstName,
        last_name: b.last_name || b.lastName,
        middle_name: b.middle_name || b.middleName,
        email: b.email,
        password: b.password,
        phone_number: b.phone_number || b.phone,
        department_id: b.department_id,
        title: b.title,
        date_of_birth: b.date_of_birth || b.dateOfBirth,
        gender: b.gender,
        joining_date:
          b.joining_date ||
          b.joiningDate ||
          new Date().toISOString().slice(0, 10),
        employment_status:
          b.employment_status || b.employmentStatus || "Permanent",
        roles: roleIds,
        facility_id: req.user.facilityId,
        created_by: req.user.userId,
      };

      const user = await User.create(userData, req.user.userId);

      // Clear cache
      await redis.clearPattern("users:*");

      res.status(201).json({
        success: true,
        data: user.toJSON(),
        message: "User created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get all users with pagination
   * @route   GET /api/v1/users
   * @access  Private (Admin only)
   */
  async getUsers(req, res, next) {
    try {
      const { page, limit, search, facility_id, department_id, role, status } =
        req.query;

      // Build cache key
      const cacheKey = `users:${JSON.stringify(req.query)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }

      const result = await User.findAll(
        {
          search,
          facility_id: req.user.facilityId,
          department_id,
          role,
          status,
        },
        { page, limit }
      );

      // Cache for 5 minutes
      await redis.set(cacheKey, result, 300);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get single user by ID
   * @route   GET /api/v1/users/:id
   * @access  Private (Admin only)
   */
  async getUser(req, res, next) {
    try {
      const { id } = req.params;

      // Check cache
      const cacheKey = `user:${id}`;
      let user = await redis.get(cacheKey);

      if (!user) {
        user = await User.findById(id);

        if (!user) {
          return res.status(404).json({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "User not found",
            },
          });
        }

        // Cache for 1 hour
        await redis.set(cacheKey, user.toJSON(), 3600);
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update user
   * @route   PUT /api/v1/users/:id
   * @access  Private (Admin only)
   */
  async updateUser(req, res, next) {
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

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      const updatedUser = await user.update(req.body, req.user.userId);

      // Clear cache
      await redis.del(`user:${id}`);
      await redis.del(`user_auth:${id}`);
      await redis.clearPattern("users:*");

      res.json({
        success: true,
        data: updatedUser.toJSON(),
        message: "User updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Partially update user (e.g. toggle active status)
   * @route   PATCH /api/v1/users/:id
   * @access  Private (Admin only)
   */
  async patchUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "User not found" },
        });
      }

      const patch = {};
      if (req.body.isActive !== undefined) {
        patch.user_status = req.body.isActive ? "Active" : "Inactive";
      }

      const updatedUser = await user.update(patch, req.user.userId);
      await redis.del(`user:${id}`);
      await redis.del(`user_auth:${id}`);
      await redis.clearPattern("users:*");

      res.json({
        success: true,
        data: updatedUser.toJSON(),
        message: "User updated",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Delete user (soft delete)
   * @route   DELETE /api/v1/users/:id
   * @access  Private (Admin only)
   */
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      // Soft delete by deactivating
      await user.update({ user_status: "Inactive" }, req.user.userId);

      // Clear cache
      await redis.del(`user:${id}`);
      await redis.clearPattern("users:*");

      // Log deletion
      await Audit.logAction(req.user.userId, "USER_DEACTIVATED", {
        facility_id: req.user.facilityId,
        record_id: id,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        message: "User deactivated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user roles
   * @route   GET /api/v1/users/:id/roles
   * @access  Private (Admin only)
   */
  async getUserRoles(req, res, next) {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      const roles = await user.getRoles();

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Assign role to user
   * @route   POST /api/v1/users/:id/roles
   * @access  Private (Admin only)
   */
  async assignRole(req, res, next) {
    try {
      const { id } = req.params;
      const { roleId } = req.body;

      if (!roleId) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_ROLE",
            message: "Role ID is required",
          },
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      await user.assignRole(roleId, req.user.userId);

      // Clear cache
      await redis.del(`user:${id}`);
      await redis.del(`user_auth:${id}`);
      await redis.clearPattern("users:*");

      res.json({
        success: true,
        message: "Role assigned successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Remove role from user
   * @route   DELETE /api/v1/users/:id/roles/:roleId
   * @access  Private (Admin only)
   */
  async removeRole(req, res, next) {
    try {
      const { id, roleId } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      await user.removeRole(roleId);

      // Clear cache
      await redis.del(`user:${id}`);
      await redis.del(`user_auth:${id}`);
      await redis.clearPattern("users:*");

      res.json({
        success: true,
        message: "Role removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user permissions
   * @route   GET /api/v1/users/:id/permissions
   * @access  Private (Admin only)
   */
  async getUserPermissions(req, res, next) {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      const permissions = await user.getPermissions();

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get doctors by department
   * @route   GET /api/v1/users/doctors/department/:departmentId
   * @access  Private
   */
  async getDoctorsByDepartment(req, res, next) {
    try {
      const { departmentId } = req.params;

      const doctors = await User.getDoctorsByDepartment(departmentId);

      res.json({
        success: true,
        data: doctors.map((d) => d.toJSON()),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get available doctors for appointment
   * @route   GET /api/v1/users/doctors/available
   * @access  Private
   */
  async getAvailableDoctors(req, res, next) {
    try {
      const { date, startTime, endTime, departmentId } = req.query;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PARAMETERS",
            message: "Date, start time, and end time are required",
          },
        });
      }

      const doctors = await User.getAvailableDoctors(
        date,
        startTime,
        endTime,
        departmentId
      );

      res.json({
        success: true,
        data: doctors.map((d) => d.toJSON()),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user activity log
   * @route   GET /api/v1/users/:id/activity
   * @access  Private (Admin only)
   */
  async getUserActivity(req, res, next) {
    try {
      const { id } = req.params;
      const { days = 30, limit = 100 } = req.query;

      const logs = await Audit.find(
        {
          user_id: id,
          from_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
        { limit }
      );

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user statistics
   * @route   GET /api/v1/users/stats
   * @access  Private (Admin only)
   */
  async getUserStats(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const stats = await db.query(
        `
        SELECT
          COUNT(*) as total_users,
          COUNT(CASE WHEN u.user_status = 'Active' THEN 1 END) as active_users,
          COUNT(CASE WHEN u.user_status = 'Inactive' THEN 1 END) as inactive_users,
          COUNT(CASE WHEN u.account_locked THEN 1 END) as locked_users,
          (
            SELECT COALESCE(json_agg(json_build_object('role', role_name, 'count', cnt)), '[]'::json)
            FROM (
              SELECT r.role_name, COUNT(*) as cnt
              FROM user_roles ur
              JOIN roles r ON ur.role_id = r.id
              JOIN users u2 ON ur.user_id = u2.id
              WHERE u2.facility_id = $1
              GROUP BY r.role_name
            ) sub
          ) as role_breakdown
        FROM users u
        WHERE u.facility_id = $1
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: stats.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Bulk import users
   * @route   POST /api/v1/users/import
   * @access  Private (Admin only)
   */
  async bulkImport(req, res, next) {
    try {
      const { users } = req.body;

      if (!users || !Array.isArray(users)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATA",
            message: "Users array is required",
          },
        });
      }

      const results = {
        successful: [],
        failed: [],
      };

      for (const userData of users) {
        try {
          const user = await User.create(
            {
              ...userData,
              facility_id: req.user.facilityId,
            },
            req.user.userId
          );
          results.successful.push(user.toJSON());
        } catch (error) {
          results.failed.push({
            data: userData,
            error: error.message,
          });
        }
      }

      await Audit.logAction(req.user.userId, "BULK_USER_IMPORT", {
        facility_id: req.user.facilityId,
        newValues: {
          successful: results.successful.length,
          failed: results.failed.length,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        data: results,
        message: `Imported ${results.successful.length} users, ${results.failed.length} failed`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Export users
   * @route   GET /api/v1/users/export
   * @access  Private (Admin only)
   */
  async exportUsers(req, res, next) {
    try {
      const { format = "json" } = req.query;
      const facilityId = req.user.facilityId;

      const users = await User.findAll(
        { facility_id: facilityId },
        { limit: 10000 }
      );

      if (format === "csv") {
        // Convert to CSV
        const csv = this.convertToCSV(users.users);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=users.csv");
        return res.send(csv);
      }

      res.json({
        success: true,
        data: users.users,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Convert users to CSV
   * @access  Private
   */
  convertToCSV(users) {
    if (users.length === 0) return "";

    const headers = Object.keys(users[0]).filter(
      (key) =>
        !["password_hash", "refresh_token", "two_factor_secret"].includes(key)
    );

    const csvRows = [];
    csvRows.push(headers.join(","));

    for (const user of users) {
      const values = headers.map((header) => {
        const value = user[header];
        return value === null || value === undefined
          ? ""
          : `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(","));
    }

    return csvRows.join("\n");
  }
}

module.exports = new UserController();
