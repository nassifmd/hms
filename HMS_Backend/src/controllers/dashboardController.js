const db = require("../config/database");
const Audit = require("../models/Audit");
const logger = require("../config/logger");
const redis = require("../config/redis");

class DashboardController {
  constructor() {
    // bind all instance methods so they retain `this` when passed to Express
    Object.getOwnPropertyNames(DashboardController.prototype)
      .filter((fn) => fn !== "constructor" && typeof this[fn] === "function")
      .forEach((fn) => {
        this[fn] = this[fn].bind(this);
      });
  }

  /**
   * @desc    Get executive dashboard data
   * @route   GET /api/v1/dashboard/executive
   * @access  Private (Executives, Medical Superintendent)
   */
  async getExecutiveDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      // Check cache
      const cacheKey = `dashboard:executive:${facilityId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          data: cached,
          fromCache: true,
        });
      }

      const dashboard = await db.query(
        `
        WITH patient_stats AS (
          SELECT
            COUNT(*) as total_patients,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_patients_30d,
            COUNT(CASE WHEN gender = 'Male' THEN 1 END) as male_count,
            COUNT(CASE WHEN gender = 'Female' THEN 1 END) as female_count
          FROM patients
          WHERE facility_id = $1
        ),
        visit_stats AS (
          SELECT
            COUNT(*) as total_visits,
            COUNT(CASE WHEN visit_date = CURRENT_DATE THEN 1 END) as today_visits,
            COUNT(CASE WHEN is_emergency THEN 1 END) as emergency_visits,
            AVG(CASE WHEN check_in_time IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(check_out_time, updated_at) - check_in_time))/60 END) as avg_visit_duration
          FROM visits
          WHERE facility_id = $1
            AND visit_date >= NOW() - INTERVAL '30 days'
        ),
        revenue_stats AS (
          SELECT
            COALESCE(SUM(p.amount), 0) as revenue_30d,
            COALESCE(SUM(CASE WHEN DATE(p.payment_date) = CURRENT_DATE THEN p.amount END), 0) as revenue_today,
            COALESCE(SUM(i.balance_due), 0) as outstanding_revenue
          FROM payments p
          RIGHT JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND (p.payment_date >= NOW() - INTERVAL '30 days' OR p.payment_date IS NULL)
            AND p.voided = false
            AND i.voided = false
        ),
        appointment_stats AS (
          SELECT
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN appointment_date = CURRENT_DATE THEN 1 END) as today_appointments,
            COUNT(CASE WHEN status = 'Scheduled' AND appointment_date = CURRENT_DATE THEN 1 END) as pending_today
          FROM appointments
          WHERE facility_id = $1
            AND appointment_date >= CURRENT_DATE
        ),
        department_performance AS (
          SELECT
            d.department_name,
            COUNT(v.id) as visits_30d,
            AVG(EXTRACT(EPOCH FROM (v.check_out_time - v.check_in_time))/60) as avg_wait_time
          FROM departments d
          LEFT JOIN visits v ON d.id = v.department_id
            AND v.visit_date >= NOW() - INTERVAL '30 days'
          WHERE d.facility_id = $1
          GROUP BY d.id, d.department_name
          ORDER BY visits_30d DESC
          LIMIT 5
        ),
        daily_trend AS (
          SELECT
            DATE(visit_date) as date,
            COUNT(*) as visits
          FROM visits
          WHERE facility_id = $1
            AND visit_date >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(visit_date)
          ORDER BY date
        )
        SELECT
          (SELECT row_to_json(patient_stats) FROM patient_stats) as patients,
          (SELECT row_to_json(visit_stats) FROM visit_stats) as visits,
          (SELECT row_to_json(revenue_stats) FROM revenue_stats) as revenue,
          (SELECT row_to_json(appointment_stats) FROM appointment_stats) as appointments,
          (SELECT json_agg(department_performance) FROM department_performance) as top_departments,
          (SELECT json_agg(daily_trend) FROM daily_trend) as daily_trend
      `,
        [facilityId]
      );

      const data = dashboard.rows[0];

      // Cache for 5 minutes
      await redis.set(cacheKey, data, 300);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get clinical dashboard data
   * @route   GET /api/v1/dashboard/clinical
   * @access  Private (Clinical staff)
   */
  async getClinicalDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const dashboard = await db.query(
        `
        WITH active_patients AS (
          SELECT COUNT(*) as count
          FROM visits
          WHERE facility_id = $1
            AND visit_status = 'Active'
        ),
        triage_queue AS (
          SELECT
            v.id,
            v.patient_id,
            p.first_name || ' ' || p.last_name as patient_name,
            v.check_in_time,
            EXTRACT(EPOCH FROM (NOW() - v.check_in_time))/60 as waiting_minutes,
            CASE
              WHEN v.is_emergency THEN 'Emergency'
              ELSE 'Routine'
            END as priority
          FROM visits v
          JOIN patients p ON v.patient_id = p.id
          WHERE v.facility_id = $1
            AND v.visit_status = 'Active'
            AND v.triage_time IS NULL
          ORDER BY
            v.is_emergency DESC,
            v.check_in_time
          LIMIT 10
        ),
        today_diagnoses AS (
          SELECT
            d.diagnosis_name,
            COUNT(*) as count
          FROM diagnoses d
          JOIN visits v ON d.visit_id = v.id
          WHERE v.facility_id = $1
            AND DATE(d.diagnosed_date) = CURRENT_DATE
          GROUP BY d.diagnosis_name
          ORDER BY count DESC
          LIMIT 5
        ),
        pending_lab AS (
          SELECT COUNT(*) as count
          FROM lab_orders
          WHERE facility_id = $1
            AND status IN ('Pending', 'In Progress')
        ),
        pending_pharmacy AS (
          SELECT COUNT(*) as count
          FROM prescriptions p
          JOIN visits v ON p.visit_id = v.id
          WHERE v.facility_id = $1
            AND p.is_dispensed = false
        ),
        doctor_load AS (
          SELECT
            u.first_name || ' ' || u.last_name as doctor_name,
            COUNT(v.id) as active_patients
          FROM users u
          LEFT JOIN visits v ON u.id = v.created_by
            AND v.visit_status = 'Active'
          WHERE u.facility_id = $1
            AND u.user_status = 'Active'
            AND EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON ur.role_id = r.id
              WHERE ur.user_id = u.id
                AND r.role_code IN ('DOCTOR', 'MED_OFFICER')
            )
          GROUP BY u.id, u.first_name, u.last_name
          ORDER BY active_patients DESC
        )
        SELECT
          (SELECT count FROM active_patients) as active_patients,
          (SELECT json_agg(triage_queue) FROM triage_queue) as triage_queue,
          (SELECT json_agg(today_diagnoses) FROM today_diagnoses) as top_diagnoses,
          (SELECT count FROM pending_lab) as pending_lab_orders,
          (SELECT count FROM pending_pharmacy) as pending_prescriptions,
          (SELECT json_agg(doctor_load) FROM doctor_load) as doctor_workload
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: dashboard.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get financial dashboard data
   * @route   GET /api/v1/dashboard/financial
   * @access  Private (Accounts, Finance)
   */
  async getFinancialDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      const dashboard = await db.query(
        `
        WITH revenue_summary AS (
          SELECT
            COALESCE(SUM(p.amount), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN DATE(p.payment_date) = CURRENT_DATE THEN p.amount END), 0) as today_revenue,
            COALESCE(SUM(CASE WHEN p.payment_date >= DATE_TRUNC('month', CURRENT_DATE) THEN p.amount END), 0) as month_revenue
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.voided = false
        ),
        outstanding_summary AS (
          SELECT
            COALESCE(SUM(balance_due), 0) as total_outstanding,
            COUNT(*) as outstanding_invoices,
            COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN balance_due END), 0) as overdue_amount,
            COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_invoices
          FROM invoices
          WHERE facility_id = $1
            AND balance_due > 0
            AND voided = false
        ),
        insurance_summary AS (
          SELECT
            COUNT(*) as pending_claims,
            COALESCE(SUM(total_amount), 0) as claim_amount
          FROM insurance_claims
          WHERE facility_id = $1
            AND status IN ('Draft', 'Submitted', 'Validated')
        ),
        payment_methods AS (
          SELECT
            p.payment_method,
            COUNT(*) as transaction_count,
            SUM(p.amount) as total
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= NOW() - INTERVAL '30 days'
            AND p.voided = false
          GROUP BY p.payment_method
        ),
        daily_revenue AS (
          SELECT
            DATE(p.payment_date) as date,
            SUM(p.amount) as revenue
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= NOW() - INTERVAL '7 days'
            AND p.voided = false
          GROUP BY DATE(p.payment_date)
          ORDER BY date
        )
        SELECT
          (SELECT row_to_json(revenue_summary) FROM revenue_summary) as revenue,
          (SELECT row_to_json(outstanding_summary) FROM outstanding_summary) as outstanding,
          (SELECT row_to_json(insurance_summary) FROM insurance_summary) as insurance,
          (SELECT json_agg(payment_methods) FROM payment_methods) as payment_methods,
          (SELECT json_agg(daily_revenue) FROM daily_revenue) as daily_trend
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: dashboard.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get operational dashboard data
   * @route   GET /api/v1/dashboard/operational
   * @access  Private (Operations Manager)
   */
  async getOperationalDashboard(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      // verify beds table exists before running a query that references it
      const {
        rows: [{ name: bedsTable }],
      } = await db.query("SELECT to_regclass('public.beds') AS name");
      const {
        rows: [{ name: batchesTable }],
      } = await db.query(
        "SELECT to_regclass('public.inventory_batches') AS name"
      );

      let dashboard;

      // build four variations depending on which optional tables exist
      if (bedsTable && batchesTable) {
        dashboard = await db.query(
          `
          WITH bed_occupancy AS (
            SELECT
              COUNT(*) as total_beds,
              COUNT(CASE WHEN is_occupied THEN 1 END) as occupied_beds,
              COUNT(CASE WHEN is_occupied THEN 1 END)::float / COUNT(*)::float * 100 as occupancy_rate
            FROM beds
            WHERE facility_id = $1
          ),
          appointment_backlog AS (
            SELECT
              COUNT(*) as total_waiting,
              AVG(EXTRACT(EPOCH FROM (NOW() - checked_in_time))/60) as avg_wait_time
            FROM appointments
            WHERE facility_id = $1
              AND checked_in_time IS NOT NULL
              AND checked_out_time IS NULL
          ),
          resource_utilization AS (
            SELECT
              d.department_name,
              COUNT(a.id) as appointments_today,
              COUNT(CASE WHEN a.checked_in_time IS NOT NULL THEN 1 END) as patients_seen
            FROM departments d
            LEFT JOIN appointments a ON d.id = a.department_id
              AND a.appointment_date = CURRENT_DATE
            WHERE d.facility_id = $1
            GROUP BY d.department_name
          ),
          inventory_alerts AS (
            SELECT
              'Low Stock' as alert_type,
              COUNT(*) as count
            FROM inventory_batches b
            JOIN inventory_items i ON b.item_id = i.id
            WHERE b.facility_id = $1
              AND b.quantity_on_hand <= i.reorder_level
              AND b.quantity_on_hand > 0
            UNION ALL
            SELECT
              'Expiring Soon' as alert_type,
              COUNT(*) as count
            FROM inventory_batches
            WHERE facility_id = $1
              AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
              AND quantity_on_hand > 0
            UNION ALL
            SELECT
              'Expired' as alert_type,
              COUNT(*) as count
            FROM inventory_batches
            WHERE facility_id = $1
              AND expiry_date < NOW()
              AND quantity_on_hand > 0
          ),
          staff_on_duty AS (
            SELECT
              COUNT(*) as total_staff,
              COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as assigned
            FROM users
            WHERE facility_id = $1
              AND user_status = 'Active'
          )
          SELECT
            (SELECT row_to_json(bed_occupancy) FROM bed_occupancy) as beds,
            (SELECT row_to_json(appointment_backlog) FROM appointment_backlog) as appointments,
            (SELECT json_agg(resource_utilization) FROM resource_utilization) as resource_usage,
            (SELECT json_agg(inventory_alerts) FROM inventory_alerts) as inventory_alerts,
            (SELECT row_to_json(staff_on_duty) FROM staff_on_duty) as staff
        `,
          [facilityId]
        );
      } else if (bedsTable && !batchesTable) {
        dashboard = await db.query(
          `
          WITH bed_occupancy AS (
            SELECT
              COUNT(*) as total_beds,
              COUNT(CASE WHEN is_occupied THEN 1 END) as occupied_beds,
              COUNT(CASE WHEN is_occupied THEN 1 END)::float / COUNT(*)::float * 100 as occupancy_rate
            FROM beds
            WHERE facility_id = $1
          ),
          appointment_backlog AS (
            SELECT
              COUNT(*) as total_waiting,
              AVG(EXTRACT(EPOCH FROM (NOW() - checked_in_time))/60) as avg_wait_time
            FROM appointments
            WHERE facility_id = $1
              AND checked_in_time IS NOT NULL
              AND checked_out_time IS NULL
          ),
          resource_utilization AS (
            SELECT
              d.department_name,
              COUNT(a.id) as appointments_today,
              COUNT(CASE WHEN a.checked_in_time IS NOT NULL THEN 1 END) as patients_seen
            FROM departments d
            LEFT JOIN appointments a ON d.id = a.department_id
              AND a.appointment_date = CURRENT_DATE
            WHERE d.facility_id = $1
            GROUP BY d.department_name
          ),
          staff_on_duty AS (
            SELECT
              COUNT(*) as total_staff,
              COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as assigned
            FROM users
            WHERE facility_id = $1
              AND user_status = 'Active'
          )
          SELECT
            (SELECT row_to_json(bed_occupancy) FROM bed_occupancy) as beds,
            (SELECT row_to_json(appointment_backlog) FROM appointment_backlog) as appointments,
            (SELECT json_agg(resource_utilization) FROM resource_utilization) as resource_usage,
            (SELECT row_to_json(staff_on_duty) FROM staff_on_duty) as staff
        `,
          [facilityId]
        );
      } else if (!bedsTable && batchesTable) {
        dashboard = await db.query(
          `
          WITH appointment_backlog AS (
            SELECT
              COUNT(*) as total_waiting,
              AVG(EXTRACT(EPOCH FROM (NOW() - checked_in_time))/60) as avg_wait_time
            FROM appointments
            WHERE facility_id = $1
              AND checked_in_time IS NOT NULL
              AND checked_out_time IS NULL
          ),
          resource_utilization AS (
            SELECT
              d.department_name,
              COUNT(a.id) as appointments_today,
              COUNT(CASE WHEN a.checked_in_time IS NOT NULL THEN 1 END) as patients_seen
            FROM departments d
            LEFT JOIN appointments a ON d.id = a.department_id
              AND a.appointment_date = CURRENT_DATE
            WHERE d.facility_id = $1
            GROUP BY d.department_name
          ),
          inventory_alerts AS (
            SELECT
              'Low Stock' as alert_type,
              COUNT(*) as count
            FROM inventory_batches b
            JOIN inventory_items i ON b.item_id = i.id
            WHERE b.facility_id = $1
              AND b.quantity_on_hand <= i.reorder_level
              AND b.quantity_on_hand > 0
            UNION ALL
            SELECT
              'Expiring Soon' as alert_type,
              COUNT(*) as count
            FROM inventory_batches
            WHERE facility_id = $1
              AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
              AND quantity_on_hand > 0
            UNION ALL
            SELECT
              'Expired' as alert_type,
              COUNT(*) as count
            FROM inventory_batches
            WHERE facility_id = $1
              AND expiry_date < NOW()
              AND quantity_on_hand > 0
          ),
          staff_on_duty AS (
            SELECT
              COUNT(*) as total_staff,
              COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as assigned
            FROM users
            WHERE facility_id = $1
              AND user_status = 'Active'
          )
          SELECT
            NULL::json as beds,
            (SELECT row_to_json(appointment_backlog) FROM appointment_backlog) as appointments,
            (SELECT json_agg(resource_utilization) FROM resource_utilization) as resource_usage,
            (SELECT json_agg(inventory_alerts) FROM inventory_alerts) as inventory_alerts,
            (SELECT row_to_json(staff_on_duty) FROM staff_on_duty) as staff
        `,
          [facilityId]
        );
      } else {
        dashboard = await db.query(
          `
          WITH appointment_backlog AS (
            SELECT
              COUNT(*) as total_waiting,
              AVG(EXTRACT(EPOCH FROM (NOW() - checked_in_time))/60) as avg_wait_time
            FROM appointments
            WHERE facility_id = $1
              AND checked_in_time IS NOT NULL
              AND checked_out_time IS NULL
          ),
          resource_utilization AS (
            SELECT
              d.department_name,
              COUNT(a.id) as appointments_today,
              COUNT(CASE WHEN a.checked_in_time IS NOT NULL THEN 1 END) as patients_seen
            FROM departments d
            LEFT JOIN appointments a ON d.id = a.department_id
              AND a.appointment_date = CURRENT_DATE
            WHERE d.facility_id = $1
            GROUP BY d.department_name
          ),
          staff_on_duty AS (
            SELECT
              COUNT(*) as total_staff,
              COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as assigned
            FROM users
            WHERE facility_id = $1
              AND user_status = 'Active'
          )
          SELECT
            NULL::json as beds,
            (SELECT row_to_json(appointment_backlog) FROM appointment_backlog) as appointments,
            (SELECT json_agg(resource_utilization) FROM resource_utilization) as resource_usage,
            (SELECT row_to_json(staff_on_duty) FROM staff_on_duty) as staff
        `,
          [facilityId]
        );
      }

      // Referral stats derived from visits table (always available)
      const referralStats = await db.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE referring_facility IS NOT NULL OR referred_by IS NOT NULL)  AS referrals_in,
          COUNT(*) FILTER (WHERE referring_facility IS NULL AND referred_by IS NULL) AS self_referrals
        FROM visits
        WHERE facility_id = $1
          AND visit_date >= CURRENT_DATE - INTERVAL '30 days'
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: {
          ...dashboard.rows[0],
          referrals: {
            referrals_in: Number(referralStats.rows[0]?.referrals_in ?? 0),
            referrals_out: null, // outbound referrals require a dedicated referrals table
            self_referrals: Number(referralStats.rows[0]?.self_referrals ?? 0),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get departmental dashboard
   * @route   GET /api/v1/dashboard/department/:departmentId
   * @access  Private (Department staff)
   */
  async getDepartmentDashboard(req, res, next) {
    try {
      const { departmentId } = req.params;

      const dashboard = await db.query(
        `
        WITH today_stats AS (
          SELECT
            COUNT(*) as appointments_today,
            COUNT(CASE WHEN checked_in_time IS NOT NULL THEN 1 END) as checked_in,
            COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
          FROM appointments
          WHERE department_id = $1
            AND appointment_date = CURRENT_DATE
        ),
        wait_times AS (
          SELECT
            AVG(EXTRACT(EPOCH FROM (checked_in_time - (appointment_date::timestamp + start_time::time)))/60) as avg_checkin_delay,
            AVG(EXTRACT(EPOCH FROM (checked_out_time - checked_in_time))/60) as avg_visit_duration
          FROM appointments
          WHERE department_id = $1
            AND checked_in_time IS NOT NULL
            AND appointment_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        staff_load AS (
          SELECT
            u.first_name || ' ' || u.last_name as staff_name,
            COUNT(a.id) as appointments
          FROM users u
          LEFT JOIN appointments a ON u.id = a.doctor_id
            AND a.appointment_date = CURRENT_DATE
          WHERE u.department_id = $1
            AND u.user_status = 'Active'
          GROUP BY u.id, u.first_name, u.last_name
        ),
        common_procedures AS (
          SELECT
            p.procedure_name,
            COUNT(*) as count
          FROM patient_procedures pp
          JOIN procedures p ON pp.procedure_id = p.id
          JOIN visits v ON pp.visit_id = v.id
          WHERE v.department_id = $1
            AND pp.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY p.procedure_name
          ORDER BY count DESC
          LIMIT 5
        )
        SELECT
          (SELECT row_to_json(today_stats) FROM today_stats) as today,
          (SELECT row_to_json(wait_times) FROM wait_times) as wait_times,
          (SELECT json_agg(staff_load) FROM staff_load) as staff,
          (SELECT json_agg(common_procedures) FROM common_procedures) as top_procedures
      `,
        [departmentId]
      );

      res.json({
        success: true,
        data: dashboard.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get KPI metrics
   * @route   GET /api/v1/dashboard/kpis
   * @access  Private
   */
  async getKPIs(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      // Check whether the optional patient_complaints table has been created yet
      const {
        rows: [{ comp_exists }],
      } = await db.query(
        "SELECT to_regclass('public.patient_complaints') IS NOT NULL AS comp_exists"
      );

      const complaintsNow = comp_exists
        ? `(SELECT COUNT(*) FROM patient_complaints WHERE facility_id = $1 AND created_at >= NOW() - INTERVAL '30 days')`
        : "0";
      const complaintsPrev = comp_exists
        ? `(SELECT COUNT(*) FROM patient_complaints WHERE facility_id = $1 AND created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days')`
        : "0";

      const kpis = await db.query(
        `
        WITH current_period AS (
          SELECT
            -- Patient KPIs
            (SELECT COUNT(*) FROM patients WHERE facility_id = $1 AND created_at >= NOW() - INTERVAL '30 days') as new_patients,

            -- Clinical KPIs
            (SELECT COUNT(*) FROM visits WHERE facility_id = $1 AND visit_date >= NOW() - INTERVAL '30 days') as total_visits,
            (SELECT AVG(CASE WHEN check_in_time IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(check_out_time, updated_at) - check_in_time))/60 END)
             FROM visits WHERE facility_id = $1 AND visit_date >= NOW() - INTERVAL '30 days') as avg_visit_duration,

            -- Financial KPIs
            (SELECT COALESCE(SUM(amount), 0) FROM payments p
             JOIN invoices i ON p.invoice_id = i.id
             WHERE i.facility_id = $1 AND p.payment_date >= NOW() - INTERVAL '30 days' AND p.voided = false) as revenue,

            -- Appointment KPIs
            (SELECT COUNT(*) FROM appointments WHERE facility_id = $1 AND appointment_date >= NOW() - INTERVAL '30 days') as appointments,
            (SELECT COUNT(*) FROM appointments WHERE facility_id = $1 AND status = 'No Show' AND appointment_date >= NOW() - INTERVAL '30 days') as no_shows,

            -- Quality KPIs
            (SELECT COUNT(*) FROM lab_order_items loi
             JOIN lab_orders lo ON loi.lab_order_id = lo.id
             WHERE lo.facility_id = $1 AND loi.is_critical = true AND loi.verified_at >= NOW() - INTERVAL '30 days') as critical_results,

            ${complaintsNow} as complaints
        ),
        previous_period AS (
          SELECT
            (SELECT COUNT(*) FROM patients WHERE facility_id = $1 AND created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days') as new_patients,
            (SELECT COUNT(*) FROM visits WHERE facility_id = $1 AND visit_date BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days') as total_visits,
            (SELECT COALESCE(SUM(amount), 0) FROM payments p
             JOIN invoices i ON p.invoice_id = i.id
             WHERE i.facility_id = $1 AND p.payment_date BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND p.voided = false) as revenue
        )
        SELECT
          cp.*,
          -- Calculate growth percentages
          CASE WHEN pp.new_patients > 0
            THEN ((cp.new_patients - pp.new_patients)::float / pp.new_patients * 100)
            ELSE 0 END as patient_growth,
          CASE WHEN pp.total_visits > 0
            THEN ((cp.total_visits - pp.total_visits)::float / pp.total_visits * 100)
            ELSE 0 END as visit_growth,
          CASE WHEN pp.revenue > 0
            THEN ((cp.revenue - pp.revenue)::float / pp.revenue * 100)
            ELSE 0 END as revenue_growth,
          -- Calculate derived metrics
          CASE WHEN cp.appointments > 0
            THEN (cp.no_shows::float / cp.appointments * 100)
            ELSE 0 END as no_show_rate,
          CASE WHEN cp.total_visits > 0
            THEN (cp.critical_results::float / cp.total_visits * 100)
            ELSE 0 END as critical_result_rate
        FROM current_period cp, previous_period pp
      `,
        [facilityId]
      );

      res.json({
        success: true,
        data: kpis.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get real-time updates (for WebSocket)
   * @route   GET /api/v1/dashboard/realtime
   * @access  Private
   */
  async getRealTimeUpdates(req, res, next) {
    try {
      const facilityId = req.user.facilityId;

      let updates;
      try {
        updates = await db.query(
          `
          SELECT
            (SELECT COUNT(*) FROM visits WHERE facility_id = $1 AND visit_status = 'Active') as active_visits,
            (SELECT COUNT(*) FROM appointments WHERE facility_id = $1 AND checked_in_time IS NOT NULL AND checked_out_time IS NULL) as waiting_patients,
            (SELECT COUNT(*) FROM lab_orders WHERE facility_id = $1 AND status = 'In Progress') as lab_in_progress,
            (SELECT COALESCE(SUM(amount), 0) FROM payments p
             JOIN invoices i ON p.invoice_id = i.id
             WHERE i.facility_id = $1 AND DATE(p.payment_date) = CURRENT_DATE AND p.voided = false) as today_revenue,
          (
            SELECT json_agg(row_to_json(q)) FROM (
              SELECT
                v.id,
                p.first_name || ' ' || p.last_name as patient_name,
                v.check_in_time,
                EXTRACT(EPOCH FROM (NOW() - v.check_in_time))/60 as waiting_minutes
              FROM visits v
              JOIN patients p ON v.patient_id = p.id
              WHERE v.facility_id = $1
                AND v.visit_status = 'Active'
                AND v.triage_time IS NULL
              ORDER BY
                CASE WHEN v.is_emergency THEN 0 ELSE 1 END,
                v.check_in_time
              LIMIT 5
            ) q
          ) as waiting_queue
      `,
          [facilityId]
        );
      } catch (err) {
        if (
          err.code === "42703" &&
          err.message.includes("lab_orders.facility_id")
        ) {
          // fallback version counting via visit join
          updates = await db.query(
            `
            SELECT
              (SELECT COUNT(*) FROM visits WHERE facility_id = $1 AND visit_status = 'Active') as active_visits,
              (SELECT COUNT(*) FROM appointments WHERE facility_id = $1 AND checked_in_time IS NOT NULL AND checked_out_time IS NULL) as waiting_patients,
              (SELECT COUNT(*)
                 FROM lab_orders lo
                 JOIN visits v ON lo.visit_id = v.id
                 WHERE v.facility_id = $1 AND lo.status = 'In Progress') as lab_in_progress,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p
               JOIN invoices i ON p.invoice_id = i.id
               WHERE i.facility_id = $1 AND DATE(p.payment_date) = CURRENT_DATE AND p.voided = false) as today_revenue,
              (
                SELECT json_agg(row_to_json(q)) FROM (
                  SELECT
                    v.id,
                    p.first_name || ' ' || p.last_name as patient_name,
                    v.check_in_time,
                    EXTRACT(EPOCH FROM (NOW() - v.check_in_time))/60 as waiting_minutes
                  FROM visits v
                  JOIN patients p ON v.patient_id = p.id
                  WHERE v.facility_id = $1
                    AND v.visit_status = 'Active'
                    AND v.triage_time IS NULL
                  ORDER BY
                    CASE WHEN v.is_emergency THEN 0 ELSE 1 END,
                    v.check_in_time
                  LIMIT 5
                ) q
              ) as waiting_queue
          `,
            [facilityId]
          );
        } else {
          throw err;
        }
      }

      res.json({
        success: true,
        data: updates.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get user-specific dashboard
   * @route   GET /api/v1/dashboard/my
   * @access  Private
   */
  async getMyDashboard(req, res, next) {
    try {
      // choose which dashboard handler to delegate to based on primary role
      const userRole = req.user.roles[0];

      switch (userRole) {
        case "SYS_ADMIN":
        case "MED_SUPT":
        case "DISTRICT_HD":
          return await this.getExecutiveDashboard(req, res, next);
        case "DOCTOR":
        case "MED_OFFICER":
        case "NURSE":
          return await this.getClinicalDashboard(req, res, next);
        case "ACCOUNTS":
        case "CASHIER":
          return await this.getFinancialDashboard(req, res, next);
        case "PHARMACIST":
          return await require("./pharmacyController").getDashboard(
            req,
            res,
            next
          );
        case "LAB_TECH":
          return await require("./labController").getDashboard(req, res, next);
        case "DENTIST":
        case "DENTAL_SURGEON":
          return await require("./dentalController").getDashboard(
            req,
            res,
            next
          );
        case "OPTOMETRIST":
        case "OPHTHALMOLOGIST":
          return await require("./eyeController").getDashboard(req, res, next);
        default:
          return await this.getOperationalDashboard(req, res, next);
      }
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
