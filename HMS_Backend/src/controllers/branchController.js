'use strict';

const db = require('../config/database');
const Audit = require('../models/Audit');
const logger = require('../config/logger');
const { validationResult } = require('express-validator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the facility ID that the calling user is authorised to manage.
 * SUPER_ADMIN and SYS_ADMIN may pass an explicit facility_id; everyone else
 * is locked to their own facility.
 */
const resolveFacilityId = (req) => {
  const isSuperUser =
    req.user.roles.includes('SUPER_ADMIN') ||
    req.user.roles.includes('SYS_ADMIN');
  return (isSuperUser && req.query.facility_id) || req.user.facilityId;
};

const BRANCH_SELECT = `
  fb.id,
  fb.facility_id,
  fb.parent_branch_id,
  fb.branch_code,
  fb.branch_name,
  fb.branch_type,
  fb.registration_number,
  fb.ghis_code,
  fb.nhis_accreditation_number,
  fb.address,
  fb.city,
  fb.region,
  fb.country,
  fb.postal_code,
  fb.phone_primary,
  fb.phone_secondary,
  fb.email,
  fb.branch_head_id,
  fb.operational_hours,
  fb.services_offered,
  fb.bed_capacity,
  fb.is_active,
  fb.status,
  fb.notes,
  fb.created_at,
  fb.updated_at,
  f.facility_name,
  f.facility_code,
  CONCAT(u.first_name, ' ', u.last_name) AS branch_head_name,
  pb.branch_name AS parent_branch_name,
  (SELECT COUNT(*) FROM users us WHERE us.branch_id = fb.id AND us.user_status = 'Active') AS staff_count,
  (SELECT COUNT(*) FROM departments d WHERE d.branch_id = fb.id AND d.is_active = true) AS department_count
`;

class BranchController {
  // -------------------------------------------------------------------------
  // GET /api/v1/branches
  // -------------------------------------------------------------------------
  /**
   * @desc    List all branches for the caller's facility
   * @route   GET /api/v1/branches
   * @access  Private – SUPER_ADMIN | SYS_ADMIN | MANAGE_BRANCHES | VIEW_ALL_BRANCHES
   */
  async getBranches(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { status, branch_type, search, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const conditions = ['fb.facility_id = $1'];
      const params = [facilityId];
      let idx = 2;

      if (status) {
        conditions.push(`fb.status = $${idx++}`);
        params.push(status);
      }
      if (branch_type) {
        conditions.push(`fb.branch_type = $${idx++}`);
        params.push(branch_type);
      }
      if (search) {
        conditions.push(`(fb.branch_name ILIKE $${idx} OR fb.branch_code ILIKE $${idx} OR fb.city ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const where = conditions.join(' AND ');

      const [dataResult, countResult] = await Promise.all([
        db.query(
          `SELECT ${BRANCH_SELECT}
           FROM facility_branches fb
           JOIN facilities f ON fb.facility_id = f.id
           LEFT JOIN users u ON fb.branch_head_id = u.id
           LEFT JOIN facility_branches pb ON fb.parent_branch_id = pb.id
           WHERE ${where}
           ORDER BY fb.branch_name ASC
           LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, parseInt(limit, 10), offset]
        ),
        db.query(
          `SELECT COUNT(*) FROM facility_branches fb WHERE ${where}`,
          params
        )
      ]);

      res.json({
        success: true,
        data: dataResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count, 10),
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(countResult.rows[0].count / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/branches/:id
  // -------------------------------------------------------------------------
  /**
   * @desc    Get a single branch by ID
   * @route   GET /api/v1/branches/:id
   * @access  Private – authenticated users of this facility
   */
  async getBranch(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;

      const result = await db.query(
        `SELECT ${BRANCH_SELECT}
         FROM facility_branches fb
         JOIN facilities f ON fb.facility_id = f.id
         LEFT JOIN users u ON fb.branch_head_id = u.id
         LEFT JOIN facility_branches pb ON fb.parent_branch_id = pb.id
         WHERE fb.id = $1 AND fb.facility_id = $2`,
        [id, facilityId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      // Fetch departments belonging to this branch
      const departments = await db.query(
        `SELECT id, department_code, department_name, department_type, is_active
         FROM departments
         WHERE branch_id = $1
         ORDER BY department_name`,
        [id]
      );

      res.json({
        success: true,
        data: { ...result.rows[0], departments: departments.rows }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/v1/branches
  // -------------------------------------------------------------------------
  /**
   * @desc    Create a new branch under the caller's facility
   * @route   POST /api/v1/branches
   * @access  Private – SUPER_ADMIN | SYS_ADMIN
   */
  async createBranch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() }
        });
      }

      const facilityId = resolveFacilityId(req);

      const {
        branch_code,
        branch_name,
        branch_type,
        parent_branch_id = null,
        registration_number = null,
        ghis_code = null,
        nhis_accreditation_number = null,
        address = null,
        city = null,
        region = null,
        country = 'Ghana',
        postal_code = null,
        phone_primary = null,
        phone_secondary = null,
        email = null,
        branch_head_id = null,
        operational_hours = null,
        services_offered = [],
        bed_capacity = 0,
        notes = null
      } = req.body;

      // Validate parent branch belongs to same facility
      if (parent_branch_id) {
        const parentCheck = await db.query(
          'SELECT id FROM facility_branches WHERE id = $1 AND facility_id = $2',
          [parent_branch_id, facilityId]
        );
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PARENT_BRANCH', message: 'Parent branch not found in this facility' }
          });
        }
      }

      // Validate branch head belongs to same facility (if provided)
      if (branch_head_id) {
        const headCheck = await db.query(
          `SELECT id FROM users WHERE id = $1 AND facility_id = $2 AND user_status = 'Active'`,
          [branch_head_id, facilityId]
        );
        if (headCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_BRANCH_HEAD', message: 'Branch head user not found in this facility' }
          });
        }
      }

      const result = await db.query(
        `INSERT INTO facility_branches (
          facility_id, parent_branch_id, branch_code, branch_name, branch_type,
          registration_number, ghis_code, nhis_accreditation_number,
          address, city, region, country, postal_code,
          phone_primary, phone_secondary, email,
          branch_head_id, operational_hours, services_offered, bed_capacity,
          notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22
        ) RETURNING id`,
        [
          facilityId, parent_branch_id, branch_code, branch_name, branch_type,
          registration_number, ghis_code, nhis_accreditation_number,
          address, city, region, country, postal_code,
          phone_primary, phone_secondary, email,
          branch_head_id,
          operational_hours ? JSON.stringify(operational_hours) : null,
          services_offered,
          bed_capacity, notes, req.user.userId
        ]
      );

      const newBranchId = result.rows[0].id;

      // Fetch the complete record to return
      const created = await db.query(
        `SELECT ${BRANCH_SELECT}
         FROM facility_branches fb
         JOIN facilities f ON fb.facility_id = f.id
         LEFT JOIN users u ON fb.branch_head_id = u.id
         LEFT JOIN facility_branches pb ON fb.parent_branch_id = pb.id
         WHERE fb.id = $1`,
        [newBranchId]
      );

      await Audit.logAction(req.user.userId, 'BRANCH_CREATED', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        new_values: { branch_id: newBranchId, branch_code, branch_name }
      });

      logger.info(`Branch created: ${branch_name} (${branch_code}) by user ${req.user.userId}`);

      res.status(201).json({
        success: true,
        data: created.rows[0],
        message: 'Branch created successfully'
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE_BRANCH_CODE', message: 'Branch code already exists in this facility' }
        });
      }
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // PUT /api/v1/branches/:id
  // -------------------------------------------------------------------------
  /**
   * @desc    Update an existing branch
   * @route   PUT /api/v1/branches/:id
   * @access  Private – SUPER_ADMIN | SYS_ADMIN
   */
  async updateBranch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() }
        });
      }

      const facilityId = resolveFacilityId(req);
      const { id } = req.params;

      // Confirm branch exists and belongs to this facility
      const existing = await db.query(
        'SELECT id FROM facility_branches WHERE id = $1 AND facility_id = $2',
        [id, facilityId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      const {
        branch_name,
        branch_type,
        parent_branch_id,
        registration_number,
        ghis_code,
        nhis_accreditation_number,
        address,
        city,
        region,
        country,
        postal_code,
        phone_primary,
        phone_secondary,
        email,
        branch_head_id,
        operational_hours,
        services_offered,
        bed_capacity,
        notes,
        status
      } = req.body;

      // Validate branch head if changing
      if (branch_head_id !== undefined && branch_head_id !== null) {
        const headCheck = await db.query(
          `SELECT id FROM users WHERE id = $1 AND facility_id = $2 AND user_status = 'Active'`,
          [branch_head_id, facilityId]
        );
        if (headCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_BRANCH_HEAD', message: 'Branch head user not found in this facility' }
          });
        }
      }

      await db.query(
        `UPDATE facility_branches SET
          branch_name             = COALESCE($1, branch_name),
          branch_type             = COALESCE($2, branch_type),
          parent_branch_id        = COALESCE($3, parent_branch_id),
          registration_number     = COALESCE($4, registration_number),
          ghis_code               = COALESCE($5, ghis_code),
          nhis_accreditation_number = COALESCE($6, nhis_accreditation_number),
          address                 = COALESCE($7, address),
          city                    = COALESCE($8, city),
          region                  = COALESCE($9, region),
          country                 = COALESCE($10, country),
          postal_code             = COALESCE($11, postal_code),
          phone_primary           = COALESCE($12, phone_primary),
          phone_secondary         = COALESCE($13, phone_secondary),
          email                   = COALESCE($14, email),
          branch_head_id          = COALESCE($15, branch_head_id),
          operational_hours       = COALESCE($16::jsonb, operational_hours),
          services_offered        = COALESCE($17, services_offered),
          bed_capacity            = COALESCE($18, bed_capacity),
          notes                   = COALESCE($19, notes),
          status                  = COALESCE($20::branch_status_type, status),
          is_active               = CASE WHEN $20 = 'Active' THEN true
                                         WHEN $20 IN ('Inactive', 'Suspended') THEN false
                                         ELSE is_active END,
          updated_at              = NOW()
        WHERE id = $21 AND facility_id = $22`,
        [
          branch_name, branch_type, parent_branch_id,
          registration_number, ghis_code, nhis_accreditation_number,
          address, city, region, country, postal_code,
          phone_primary, phone_secondary, email,
          branch_head_id,
          operational_hours ? JSON.stringify(operational_hours) : null,
          services_offered, bed_capacity, notes, status,
          id, facilityId
        ]
      );

      const updated = await db.query(
        `SELECT ${BRANCH_SELECT}
         FROM facility_branches fb
         JOIN facilities f ON fb.facility_id = f.id
         LEFT JOIN users u ON fb.branch_head_id = u.id
         LEFT JOIN facility_branches pb ON fb.parent_branch_id = pb.id
         WHERE fb.id = $1`,
        [id]
      );

      await Audit.logAction(req.user.userId, 'BRANCH_UPDATED', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        new_values: { branch_id: id, ...req.body }
      });

      res.json({
        success: true,
        data: updated.rows[0],
        message: 'Branch updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // PATCH /api/v1/branches/:id/status
  // -------------------------------------------------------------------------
  /**
   * @desc    Toggle / set branch status (Active | Inactive | Suspended)
   * @route   PATCH /api/v1/branches/:id/status
   * @access  Private – SUPER_ADMIN | SYS_ADMIN
   */
  async setBranchStatus(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['Active', 'Inactive', 'Suspended', 'Under Construction'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `Status must be one of: ${validStatuses.join(', ')}`
          }
        });
      }

      const result = await db.query(
        `UPDATE facility_branches
         SET status = $1::branch_status_type,
             is_active = $2,
             updated_at = NOW()
         WHERE id = $3 AND facility_id = $4
         RETURNING id, branch_name, status, is_active`,
        [status, status === 'Active', id, facilityId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      await Audit.logAction(req.user.userId, 'BRANCH_STATUS_CHANGED', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        new_values: { branch_id: id, status }
      });

      res.json({
        success: true,
        data: result.rows[0],
        message: `Branch status updated to ${status}`
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // DELETE /api/v1/branches/:id
  // -------------------------------------------------------------------------
  /**
   * @desc    Delete (soft-delete) a branch
   * @route   DELETE /api/v1/branches/:id
   * @access  Private – SUPER_ADMIN | SYS_ADMIN
   */
  async deleteBranch(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;

      // Safety check: prevent deletion if users are still assigned
      const usersInBranch = await db.query(
        `SELECT COUNT(*) FROM users WHERE branch_id = $1 AND user_status = 'Active'`,
        [id]
      );
      if (parseInt(usersInBranch.rows[0].count, 10) > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'BRANCH_HAS_ACTIVE_USERS',
            message: 'Cannot delete a branch that still has active staff. Reassign or deactivate them first.'
          }
        });
      }

      // Soft-delete: mark as Inactive
      const result = await db.query(
        `UPDATE facility_branches
         SET status = 'Inactive', is_active = false, updated_at = NOW()
         WHERE id = $1 AND facility_id = $2
         RETURNING id, branch_name`,
        [id, facilityId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      await Audit.logAction(req.user.userId, 'BRANCH_DELETED', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        old_values: { branch_id: id, branch_name: result.rows[0].branch_name }
      });

      res.json({
        success: true,
        message: 'Branch deactivated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/branches/:id/users
  // -------------------------------------------------------------------------
  /**
   * @desc    List staff assigned to a branch
   * @route   GET /api/v1/branches/:id/users
   * @access  Private – SUPER_ADMIN | SYS_ADMIN | VIEW_ALL_BRANCHES
   */
  async getBranchUsers(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;
      const { page = 1, limit = 50, search, user_status } = req.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      // Ensure branch belongs to this facility
      const branchCheck = await db.query(
        'SELECT id FROM facility_branches WHERE id = $1 AND facility_id = $2',
        [id, facilityId]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      const conditions = ['u.branch_id = $1'];
      const params = [id];
      let idx = 2;

      if (user_status) {
        conditions.push(`u.user_status = $${idx++}`);
        params.push(user_status);
      }
      if (search) {
        conditions.push(
          `(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.employee_id ILIKE $${idx} OR u.email ILIKE $${idx})`
        );
        params.push(`%${search}%`);
        idx++;
      }

      const where = conditions.join(' AND ');

      const [users, countResult] = await Promise.all([
        db.query(
          `SELECT
             u.id, u.employee_id,
             CONCAT(u.first_name, ' ', u.last_name) AS full_name,
             u.email, u.phone_number, u.user_status,
             u.specialization, u.joining_date,
             d.department_name,
             COALESCE(array_agg(DISTINCT r.role_name) FILTER (WHERE r.role_name IS NOT NULL), ARRAY[]::text[]) AS roles
           FROM users u
           LEFT JOIN departments d ON u.department_id = d.id
           LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
           LEFT JOIN roles r ON ur.role_id = r.id
           WHERE ${where}
           GROUP BY u.id, d.department_name
           ORDER BY u.first_name, u.last_name
           LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, parseInt(limit, 10), offset]
        ),
        db.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params)
      ]);

      res.json({
        success: true,
        data: users.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count, 10),
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(countResult.rows[0].count / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/v1/branches/:id/assign-user
  // -------------------------------------------------------------------------
  /**
   * @desc    Assign (or transfer) a user to a branch
   * @route   POST /api/v1/branches/:id/assign-user
   * @access  Private – SUPER_ADMIN | SYS_ADMIN | ASSIGN_BRANCH_USERS
   */
  async assignUserToBranch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() }
        });
      }

      const facilityId = resolveFacilityId(req);
      const { id } = req.params;
      const { user_id } = req.body;

      // Verify branch
      const branchCheck = await db.query(
        'SELECT id, branch_name FROM facility_branches WHERE id = $1 AND facility_id = $2 AND is_active = true',
        [id, facilityId]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Active branch not found' }
        });
      }

      // Verify user belongs to same facility
      const userCheck = await db.query(
        `SELECT id, first_name, last_name, branch_id FROM users WHERE id = $1 AND facility_id = $2 AND user_status = 'Active'`,
        [user_id, facilityId]
      );
      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'Active user not found in this facility' }
        });
      }

      const previousBranchId = userCheck.rows[0].branch_id;

      await db.query(
        `UPDATE users SET branch_id = $1, updated_at = NOW() WHERE id = $2`,
        [id, user_id]
      );

      await Audit.logAction(req.user.userId, 'USER_ASSIGNED_TO_BRANCH', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        old_values: { branch_id: previousBranchId },
        new_values: {
          user_id,
          branch_id: id,
          branch_name: branchCheck.rows[0].branch_name
        }
      });

      res.json({
        success: true,
        message: `User assigned to branch "${branchCheck.rows[0].branch_name}" successfully`,
        data: {
          user_id,
          branch_id: id,
          branch_name: branchCheck.rows[0].branch_name
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/v1/branches/:id/bulk-assign-users
  // -------------------------------------------------------------------------
  /**
   * @desc    Assign multiple users to a branch in one call
   * @route   POST /api/v1/branches/:id/bulk-assign-users
   * @access  Private – SUPER_ADMIN | SYS_ADMIN | ASSIGN_BRANCH_USERS
   */
  async bulkAssignUsersToBranch(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;
      const { user_ids } = req.body;

      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'user_ids array is required' }
        });
      }

      const branchCheck = await db.query(
        'SELECT id, branch_name FROM facility_branches WHERE id = $1 AND facility_id = $2 AND is_active = true',
        [id, facilityId]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Active branch not found' }
        });
      }

      const result = await db.query(
        `UPDATE users SET branch_id = $1, updated_at = NOW()
         WHERE id = ANY($2::uuid[]) AND facility_id = $3 AND user_status = 'Active'
         RETURNING id`,
        [id, user_ids, facilityId]
      );

      await Audit.logAction(req.user.userId, 'BULK_USERS_ASSIGNED_TO_BRANCH', {
        facility_id: facilityId,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        new_values: { branch_id: id, user_ids: result.rows.map(r => r.id) }
      });

      res.json({
        success: true,
        message: `${result.rows.length} user(s) assigned to branch "${branchCheck.rows[0].branch_name}"`,
        data: { assigned_count: result.rows.length, branch_id: id }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/branches/:id/stats
  // -------------------------------------------------------------------------
  /**
   * @desc    High-level statistics for a specific branch
   * @route   GET /api/v1/branches/:id/stats
   * @access  Private – SUPER_ADMIN | SYS_ADMIN | VIEW_ALL_BRANCHES
   */
  async getBranchStats(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);
      const { id } = req.params;
      const { period = '30' } = req.query; // days

      const branchCheck = await db.query(
        'SELECT id, branch_name FROM facility_branches WHERE id = $1 AND facility_id = $2',
        [id, facilityId]
      );
      if (branchCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' }
        });
      }

      const days = parseInt(period, 10);

      const [staffStats, appointmentStats, patientStats, departmentStats] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE user_status = 'Active') AS active_staff,
             COUNT(*) FILTER (WHERE user_status = 'Inactive') AS inactive_staff,
             COUNT(*) AS total_staff
           FROM users WHERE branch_id = $1`,
          [id]
        ),
        db.query(
          `SELECT
             COUNT(*) AS total_appointments,
             COUNT(*) FILTER (WHERE status = 'Completed') AS completed,
             COUNT(*) FILTER (WHERE status = 'Cancelled') AS cancelled,
             COUNT(*) FILTER (WHERE status = 'No Show') AS no_show
           FROM appointments
           WHERE branch_id = $1
             AND appointment_date >= CURRENT_DATE - INTERVAL '${days} days'`,
          [id]
        ),
        db.query(
          `SELECT COUNT(DISTINCT patient_id) AS unique_patients
           FROM visits
           WHERE branch_id = $1
             AND created_at >= NOW() - INTERVAL '${days} days'`,
          [id]
        ),
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE is_active = true) AS active_departments,
             COUNT(*) AS total_departments
           FROM departments WHERE branch_id = $1`,
          [id]
        )
      ]);

      res.json({
        success: true,
        data: {
          branch_id: id,
          branch_name: branchCheck.rows[0].branch_name,
          period_days: days,
          staff: staffStats.rows[0],
          appointments: appointmentStats.rows[0],
          patients: patientStats.rows[0],
          departments: departmentStats.rows[0]
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/branches/overview
  // -------------------------------------------------------------------------
  /**
   * @desc    Summary overview across all branches of the facility
   * @route   GET /api/v1/branches/overview
   * @access  Private – SUPER_ADMIN | SYS_ADMIN
   */
  async getFacilityBranchOverview(req, res, next) {
    try {
      const facilityId = resolveFacilityId(req);

      const overview = await db.query(
        `SELECT
           f.facility_name,
           f.facility_code,
           COUNT(DISTINCT fb.id)                                               AS total_branches,
           COUNT(DISTINCT fb.id) FILTER (WHERE fb.status = 'Active')          AS active_branches,
           COUNT(DISTINCT fb.id) FILTER (WHERE fb.status = 'Inactive')        AS inactive_branches,
           COUNT(DISTINCT fb.id) FILTER (WHERE fb.status = 'Suspended')       AS suspended_branches,
           (SELECT COUNT(*) FROM users u2 WHERE u2.facility_id = f.id AND u2.user_status = 'Active') AS total_active_staff,
           (SELECT COUNT(*) FROM users u3 WHERE u3.facility_id = f.id AND u3.branch_id IS NULL AND u3.user_status = 'Active') AS unassigned_staff,
           COALESCE(SUM(fb.bed_capacity), 0)                                   AS total_bed_capacity
         FROM facilities f
         LEFT JOIN facility_branches fb ON fb.facility_id = f.id
         WHERE f.id = $1
         GROUP BY f.id, f.facility_name, f.facility_code`,
        [facilityId]
      );

      const branchList = await db.query(
        `SELECT
           fb.id, fb.branch_code, fb.branch_name, fb.branch_type,
           fb.city, fb.status, fb.bed_capacity,
           (SELECT COUNT(*) FROM users u WHERE u.branch_id = fb.id AND u.user_status = 'Active') AS staff_count,
           (SELECT COUNT(*) FROM appointments a WHERE a.branch_id = fb.id AND a.appointment_date = CURRENT_DATE) AS appointments_today
         FROM facility_branches fb
         WHERE fb.facility_id = $1
         ORDER BY fb.branch_name`,
        [facilityId]
      );

      res.json({
        success: true,
        data: {
          summary: overview.rows[0] || {},
          branches: branchList.rows
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BranchController();
