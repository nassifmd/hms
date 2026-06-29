const db = require('../config/database');
const logger = require('../config/logger');

class Audit {
  constructor(data = {}) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.facility_id = data.facility_id;
    this.action = data.action;
    this.table_name = data.table_name;
    this.record_id = data.record_id;
    this.old_values = data.old_values;
    this.new_values = data.new_values;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.created_at = data.created_at;
  }

  // Log an audit entry
  static async log(auditData) {
    try {
      const result = await db.query(`
        INSERT INTO audit_logs (
          user_id, facility_id, action, table_name,
          record_id, old_values, new_values, ip_address,
          user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [
        auditData.user_id,
        auditData.facility_id,
        auditData.action,
        auditData.table_name,
        auditData.record_id,
        auditData.old_values ? JSON.stringify(auditData.old_values) : null,
        auditData.new_values ? JSON.stringify(auditData.new_values) : null,
        auditData.ip_address,
        auditData.user_agent
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to write audit log:', error);
      // Don't throw - audit logging should not break the main operation
      return null;
    }
  }

  // Log a user action
  static async logAction(userId, action, details = {}) {
    return this.log({
      user_id: userId,
      facility_id: details.facility_id,
      action,
      table_name: details.table_name,
      record_id: details.record_id,
      old_values: details.old_values,
      new_values: details.new_values,
      ip_address: details.ip_address,
      user_agent: details.user_agent
    });
  }

  // Log a data change
  static async logChange(userId, tableName, recordId, oldValues, newValues, req = null) {
    return this.log({
      user_id: userId,
      facility_id: req?.user?.facility_id,
      action: 'UPDATE',
      table_name: tableName,
      record_id: recordId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });
  }

  // Log a create operation
  static async logCreate(userId, tableName, recordId, newValues, req = null) {
    return this.log({
      user_id: userId,
      facility_id: req?.user?.facility_id,
      action: 'CREATE',
      table_name: tableName,
      record_id: recordId,
      new_values: newValues,
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });
  }

  // Log a delete operation
  static async logDelete(userId, tableName, recordId, oldValues, req = null) {
    return this.log({
      user_id: userId,
      facility_id: req?.user?.facility_id,
      action: 'DELETE',
      table_name: tableName,
      record_id: recordId,
      old_values: oldValues,
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });
  }

  // Log a login attempt
  static async logLogin(userId, success, req = null, failureReason = null) {
    return this.log({
      user_id: userId,
      facility_id: req?.user?.facility_id,
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      table_name: 'users',
      record_id: userId,
      new_values: { success, failureReason },
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });
  }

  // Log a logout
  static async logLogout(userId, req = null) {
    return this.log({
      user_id: userId,
      facility_id: req?.user?.facility_id,
      action: 'LOGOUT',
      table_name: 'users',
      record_id: userId,
      ip_address: req?.ip,
      user_agent: req?.get('user-agent')
    });
  }

  // Query audit logs
  static async find(filters = {}, pagination = {}) {
    const {
      user_id,
      facility_id,
      action,
      table_name,
      record_id,
      from_date,
      to_date,
      search
    } = filters;

    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    // helper to prefix with audit_logs alias
    const col = (c) => `a.${c}`;

    if (user_id) {
      conditions.push(`${col('user_id')} = $${paramIndex}`);
      params.push(user_id);
      paramIndex++;
    }

    if (facility_id) {
      conditions.push(`(${col('facility_id')} = $${paramIndex} OR ${col('facility_id')} IS NULL)`);
      params.push(facility_id);
      paramIndex++;
    }

    if (action) {
      conditions.push(`${col('action')} = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (table_name) {
      conditions.push(`${col('table_name')} = $${paramIndex}`);
      params.push(table_name);
      paramIndex++;
    }

    if (record_id) {
      conditions.push(`${col('record_id')} = $${paramIndex}`);
      params.push(record_id);
      paramIndex++;
    }

    if (from_date) {
      conditions.push(`${col('created_at')} >= $${paramIndex}`);
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      conditions.push(`${col('created_at')} <= $${paramIndex}`);
      params.push(to_date);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        new_values::text ILIKE $${paramIndex} OR
        old_values::text ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM audit_logs a
      WHERE ${whereClause}
    `, params);

    const result = await db.query(`
      SELECT 
        a.*,
        u.first_name || ' ' || u.last_name as user_name,
        u.employee_id,
        f.facility_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN facilities f ON a.facility_id = f.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countResult.rows[0].total / limit)
    };
  }

  // Get audit summary by action type
  static async getActionSummary(facilityId, days = 30) {
    const result = await db.query(`
      SELECT 
        action,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence
      FROM audit_logs
      WHERE facility_id = $1
        AND created_at >= NOW() - $2::interval
      GROUP BY action
      ORDER BY count DESC
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  // Get user activity summary
  static async getUserActivitySummary(facilityId, days = 30) {
    const result = await db.query(`
      SELECT 
        u.id,
        u.first_name || ' ' || u.last_name as user_name,
        u.employee_id,
        COUNT(a.id) as action_count,
        COUNT(DISTINCT DATE(a.created_at)) as active_days,
        MIN(a.created_at) as first_action,
        MAX(a.created_at) as last_action,
        json_agg(DISTINCT a.action) as actions_performed
      FROM audit_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.facility_id = $1
        AND a.created_at >= NOW() - $2::interval
      GROUP BY u.id, u.first_name, u.last_name, u.employee_id
      ORDER BY action_count DESC
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  // Get table modification summary
  static async getTableActivitySummary(facilityId, days = 30) {
    const result = await db.query(`
      SELECT 
        table_name,
        COUNT(*) as total_changes,
        COUNT(CASE WHEN action = 'CREATE' THEN 1 END) as creates,
        COUNT(CASE WHEN action = 'UPDATE' THEN 1 END) as updates,
        COUNT(CASE WHEN action = 'DELETE' THEN 1 END) as deletes,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_logs
      WHERE facility_id = $1
        AND created_at >= NOW() - $2::interval
      GROUP BY table_name
      ORDER BY total_changes DESC
    `, [facilityId, `${days} days`]);

    return result.rows;
  }

  // Clean up old audit logs
  static async cleanup(daysToKeep = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db.query(`
      DELETE FROM audit_logs
      WHERE created_at < $1
      RETURNING COUNT(*) as deleted_count
    `, [cutoffDate]);

    logger.info('Cleaned up old audit logs', {
      deletedCount: result.rows[0].deleted_count,
      olderThan: cutoffDate
    });

    return result.rows[0].deleted_count;
  }

  // Export audit logs for compliance
  static async exportForCompliance(facilityId, startDate, endDate, format = 'json') {
    const result = await db.query(`
      SELECT 
        a.created_at,
        u.first_name || ' ' || u.last_name as user_name,
        u.employee_id,
        a.action,
        a.table_name,
        a.record_id,
        a.old_values,
        a.new_values,
        a.ip_address,
        a.user_agent
      FROM audit_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.facility_id = $1
        AND a.created_at BETWEEN $2 AND $3
      ORDER BY a.created_at
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }

  // Get statistics for compliance dashboard
  static async getComplianceStats(facilityId, year) {
    const result = await db.query(`
      WITH monthly_stats AS (
        SELECT 
          EXTRACT(MONTH FROM created_at) as month,
          COUNT(*) as total_logs,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(CASE WHEN action LIKE '%DELETE%' THEN 1 END) as delete_operations,
          COUNT(CASE WHEN table_name IN ('patients', 'visits', 'diagnoses') THEN 1 END) as clinical_data_changes
        FROM audit_logs
        WHERE facility_id = $1
          AND EXTRACT(YEAR FROM created_at) = $2
        GROUP BY EXTRACT(MONTH FROM created_at)
      )
      SELECT 
        json_agg(monthly_stats ORDER BY month) as monthly_data,
        SUM(total_logs) as yearly_total,
        AVG(active_users) as avg_monthly_active_users,
        SUM(delete_operations) as yearly_deletes,
        SUM(clinical_data_changes) as yearly_clinical_changes
      FROM monthly_stats
    `, [facilityId, year]);

    return result.rows[0];
  }

  // Helper to format audit data for display
  formatForDisplay() {
    return {
      id: this.id,
      timestamp: this.created_at,
      user: this.user_name,
      action: this.action,
      table: this.table_name,
      record: this.record_id,
      changes: {
        old: this.old_values,
        new: this.new_values
      },
      source: {
        ip: this.ip_address,
        userAgent: this.user_agent
      }
    };
  }

  // Check if an action is suspicious (for security monitoring)
  static async detectSuspiciousActivity(userId, timeframe = 3600000) { // 1 hour default
    const oneHourAgo = new Date(Date.now() - timeframe);

    const result = await db.query(`
      WITH user_activity AS (
        SELECT 
          COUNT(*) as action_count,
          COUNT(DISTINCT action) as unique_actions,
          COUNT(DISTINCT table_name) as unique_tables,
          COUNT(CASE WHEN action = 'DELETE' THEN 1 END) as delete_count,
          COUNT(CASE WHEN action = 'LOGIN_FAILED' THEN 1 END) as failed_logins
        FROM audit_logs
        WHERE user_id = $1
          AND created_at >= $2
      )
      SELECT 
        *,
        CASE 
          WHEN action_count > 100 THEN 'HIGH_VOLUME'
          WHEN delete_count > 20 THEN 'HIGH_DELETES'
          WHEN failed_logins > 5 THEN 'BRUTE_FORCE_ATTEMPT'
          ELSE 'NORMAL'
        END as alert_level
      FROM user_activity
    `, [userId, oneHourAgo]);

    return result.rows[0];
  }
}

module.exports = Audit;