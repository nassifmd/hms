const db = require('../config/database');
const Audit = require('../models/Audit');
const logger = require('../config/logger');
const redis = require('../config/redis');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const cronParser = require('cron-parser');

class ReportController {
  constructor() {
    this.getPatientDemographics = this.getPatientDemographics.bind(this);
    this.getClinicalActivity    = this.getClinicalActivity.bind(this);
    this.getFinancialReport     = this.getFinancialReport.bind(this);
    this.getInventoryReport     = this.getInventoryReport.bind(this);
    this.getLabReport           = this.getLabReport.bind(this);
    this.getAppointmentReport   = this.getAppointmentReport.bind(this);
    this.getMortalityReport     = this.getMortalityReport.bind(this);
    this.getCustomReport        = this.getCustomReport.bind(this);
    this.getReportTemplates     = this.getReportTemplates.bind(this);
    this.scheduleReport         = this.scheduleReport.bind(this);
    this.exportToExcel          = this.exportToExcel.bind(this);
    this.exportToPDF            = this.exportToPDF.bind(this);
  }

  /**
   * @desc    Generate patient demographics report
   * @route   GET /api/v1/reports/patient-demographics
   * @access  Private
   */
  async getPatientDemographics(req, res, next) {
    try {
      const { start_date, end_date, format = 'json' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const report = await db.query(`
        WITH demographics AS (
          SELECT 
            gender,
            COUNT(*) as count,
            AVG(EXTRACT(YEAR FROM AGE(date_of_birth))) as avg_age,
            MIN(EXTRACT(YEAR FROM AGE(date_of_birth))) as min_age,
            MAX(EXTRACT(YEAR FROM AGE(date_of_birth))) as max_age
          FROM patients
          WHERE facility_id = $1
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY gender
        ),
        age_groups AS (
          SELECT 
            CASE 
              WHEN AGE(date_of_birth) < INTERVAL '18 years' THEN '0-17'
              WHEN AGE(date_of_birth) < INTERVAL '35 years' THEN '18-34'
              WHEN AGE(date_of_birth) < INTERVAL '50 years' THEN '35-49'
              WHEN AGE(date_of_birth) < INTERVAL '65 years' THEN '50-64'
              ELSE '65+'
            END as age_group,
            COUNT(*) as count
          FROM patients
          WHERE facility_id = $1
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY age_group
        ),
        by_region AS (
          SELECT 
            region,
            COUNT(*) as count
          FROM patients
          WHERE facility_id = $1
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY region
          ORDER BY count DESC
          LIMIT 10
        ),
        monthly_trend AS (
          SELECT 
            TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
            COUNT(*) as new_patients
          FROM patients
          WHERE facility_id = $1
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month
        )
        SELECT 
          (SELECT json_agg(demographics) FROM demographics) as by_gender,
          (SELECT json_agg(age_groups) FROM age_groups) as age_distribution,
          (SELECT json_agg(by_region) FROM by_region) as by_region,
          (SELECT json_agg(monthly_trend) FROM monthly_trend) as monthly_trend,
          (SELECT COUNT(*) FROM patients WHERE facility_id = $1 AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day') as total_patients
      `, [req.user.facilityId, start_date, end_date]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'patient_demographics', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'patient_demographics', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate clinical activity report
   * @route   GET /api/v1/reports/clinical-activity
   * @access  Private
   */
  async getClinicalActivity(req, res, next) {
    try {
      const { start_date, end_date, format = 'json' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const report = await db.query(`
        WITH visit_stats AS (
          SELECT 
            COUNT(*) as total_visits,
            COUNT(DISTINCT patient_id) as unique_patients,
            AVG(CASE WHEN check_in_time IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(check_out_time, updated_at) - check_in_time))/60 END) as avg_visit_duration,
            COUNT(CASE WHEN is_emergency THEN 1 END) as emergency_visits,
            COUNT(CASE WHEN visit_type = 'Inpatient' THEN 1 END) as inpatient_visits,
            COUNT(CASE WHEN visit_type = 'Outpatient' THEN 1 END) as outpatient_visits
          FROM visits
          WHERE facility_id = $1
            AND visit_date BETWEEN $2 AND $3
        ),
        by_department AS (
          SELECT 
            d.department_name,
            COUNT(*) as visit_count,
            COUNT(DISTINCT v.patient_id) as unique_patients
          FROM visits v
          JOIN departments d ON v.department_id = d.id
          WHERE v.facility_id = $1
            AND v.visit_date BETWEEN $2 AND $3
          GROUP BY d.department_name
          ORDER BY visit_count DESC
        ),
        diagnosis_stats AS (
          SELECT 
            d.diagnosis_name,
            COUNT(*) as count
          FROM diagnoses d
          JOIN visits v ON d.visit_id = v.id
          WHERE v.facility_id = $1
            AND d.created_at >= $2::date AND d.created_at < $3::date + INTERVAL '1 day'
          GROUP BY d.diagnosis_name
          ORDER BY count DESC
          LIMIT 10
        ),
        procedure_stats AS (
          SELECT 
            p.procedure_name,
            COUNT(*) as count
          FROM patient_procedures pp
          JOIN procedures p ON pp.procedure_id = p.id
          JOIN visits v ON pp.visit_id = v.id
          WHERE v.facility_id = $1
            AND pp.created_at >= $2::date AND pp.created_at < $3::date + INTERVAL '1 day'
          GROUP BY p.procedure_name
          ORDER BY count DESC
          LIMIT 10
        ),
        daily_activity AS (
          SELECT 
            DATE(visit_date) as date,
            COUNT(*) as visits
          FROM visits
          WHERE facility_id = $1
            AND visit_date BETWEEN $2 AND $3
          GROUP BY DATE(visit_date)
          ORDER BY date
        )
        SELECT 
          (SELECT row_to_json(visit_stats) FROM visit_stats) as summary,
          (SELECT json_agg(by_department) FROM by_department) as by_department,
          (SELECT json_agg(diagnosis_stats) FROM diagnosis_stats) as top_diagnoses,
          (SELECT json_agg(procedure_stats) FROM procedure_stats) as top_procedures,
          (SELECT json_agg(daily_activity) FROM daily_activity) as daily_trend
      `, [req.user.facilityId, start_date, end_date]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'clinical_activity', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'clinical_activity', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate financial report
   * @route   GET /api/v1/reports/financial
   * @access  Private
   */
  async getFinancialReport(req, res, next) {
    try {
      const { start_date, end_date, format = 'json' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const report = await db.query(`
        WITH revenue_summary AS (
          SELECT 
            COALESCE(SUM(p.amount), 0) as total_revenue,
            COUNT(DISTINCT p.id) as transaction_count,
            COUNT(DISTINCT p.patient_id) as paying_patients,
            AVG(p.amount) as avg_transaction
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= $2::date AND p.payment_date < $3::date + INTERVAL '1 day'
            AND p.voided = false
        ),
        by_payment_method AS (
          SELECT 
            p.payment_method,
            COUNT(*) as count,
            SUM(p.amount) as total
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= $2::date AND p.payment_date < $3::date + INTERVAL '1 day'
            AND p.voided = false
          GROUP BY p.payment_method
        ),
        by_service_type AS (
          SELECT 
            ii.item_type,
            COUNT(*) as count,
            SUM(ii.total_price) as revenue
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          WHERE i.facility_id = $1
            AND i.invoice_date >= $2::date AND i.invoice_date < $3::date + INTERVAL '1 day'
            AND i.voided = false
          GROUP BY ii.item_type
        ),
        daily_revenue AS (
          SELECT 
            DATE(p.payment_date) as date,
            SUM(p.amount) as revenue
          FROM payments p
          JOIN invoices i ON p.invoice_id = i.id
          WHERE i.facility_id = $1
            AND p.payment_date >= $2::date AND p.payment_date < $3::date + INTERVAL '1 day'
            AND p.voided = false
          GROUP BY DATE(p.payment_date)
          ORDER BY date
        ),
        insurance_revenue AS (
          SELECT 
            pi.insurance_provider,
            SUM(ic.paid_amount) as amount
          FROM insurance_claims ic
          JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
          WHERE ic.facility_id = $1
            AND ic.processed_date >= $2::date AND ic.processed_date < $3::date + INTERVAL '1 day'
          GROUP BY pi.insurance_provider
        )
        SELECT 
          (SELECT row_to_json(revenue_summary) FROM revenue_summary) as summary,
          (SELECT json_agg(by_payment_method) FROM by_payment_method) as by_payment_method,
          (SELECT json_agg(by_service_type) FROM by_service_type) as by_service_type,
          (SELECT json_agg(daily_revenue) FROM daily_revenue) as daily_trend,
          (SELECT json_agg(insurance_revenue) FROM insurance_revenue) as insurance_breakdown
      `, [req.user.facilityId, start_date, end_date]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'financial_report', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'financial_report', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate inventory report
   * @route   GET /api/v1/reports/inventory
   * @access  Private
   */
  async getInventoryReport(req, res, next) {
    try {
      const { format = 'json' } = req.query;

      const report = await db.query(`
        WITH inventory_summary AS (
          SELECT 
            COUNT(DISTINCT drug_id) as unique_drugs,
            SUM(quantity_on_hand) as total_units,
            SUM(quantity_on_hand * unit_cost) as total_value,
            SUM(quantity_on_hand * selling_price) as retail_value
          FROM drug_inventory
          WHERE facility_id = $1
        ),
        by_category AS (
          SELECT 
            d.drug_category,
            COUNT(DISTINCT d.id) as drug_count,
            SUM(di.quantity_on_hand) as total_quantity,
            SUM(di.quantity_on_hand * di.unit_cost) as total_value
          FROM drug_inventory di
          JOIN drugs d ON di.drug_id = d.id
          WHERE di.facility_id = $1
          GROUP BY d.drug_category
        ),
        low_stock AS (
          SELECT 
            d.drug_name,
            d.drug_code,
            SUM(di.quantity_on_hand) as current_stock,
            d.reorder_level,
            MIN(di.expiry_date) as earliest_expiry
          FROM drug_inventory di
          JOIN drugs d ON di.drug_id = d.id
          WHERE di.facility_id = $1
          GROUP BY d.id, d.drug_name, d.drug_code, d.reorder_level
          HAVING SUM(di.quantity_on_hand) <= d.reorder_level
        ),
        expiring_soon AS (
          SELECT 
            d.drug_name,
            d.drug_code,
            di.batch_number,
            di.expiry_date,
            di.quantity_on_hand,
            EXTRACT(DAY FROM di.expiry_date - NOW()) as days_to_expiry
          FROM drug_inventory di
          JOIN drugs d ON di.drug_id = d.id
          WHERE di.facility_id = $1
            AND di.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
            AND di.quantity_on_hand > 0
          ORDER BY di.expiry_date
        )
        SELECT 
          (SELECT row_to_json(inventory_summary) FROM inventory_summary) as summary,
          (SELECT json_agg(by_category) FROM by_category) as by_category,
          (SELECT json_agg(low_stock) FROM low_stock) as low_stock_items,
          (SELECT json_agg(expiring_soon) FROM expiring_soon) as expiring_items
      `, [req.user.facilityId]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'inventory_report', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'inventory_report', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate lab report
   * @route   GET /api/v1/reports/lab
   * @access  Private
   */
  async getLabReport(req, res, next) {
    try {
      const { start_date, end_date, format = 'json' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const report = await db.query(`
        WITH lab_summary AS (
          SELECT 
            COUNT(*) as total_orders,
            COUNT(DISTINCT patient_id) as unique_patients,
            COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
            COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
            AVG(EXTRACT(EPOCH FROM (loi.verified_at - lo.order_date))/3600) as avg_turnaround_hours
          FROM lab_orders lo
          LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
          WHERE lo.facility_id = $1
            AND lo.order_date >= $2::date AND lo.order_date < $3::date + INTERVAL '1 day'
        ),
        by_test_type AS (
          SELECT 
            lt.test_name,
            lt.test_category,
            COUNT(*) as order_count,
            COUNT(DISTINCT lo.patient_id) as unique_patients,
            COUNT(CASE WHEN loi.is_abnormal THEN 1 END) as abnormal_results
          FROM lab_orders lo
          JOIN lab_order_items loi ON lo.id = loi.lab_order_id
          JOIN lab_tests lt ON loi.test_id = lt.id
          WHERE lo.facility_id = $1
            AND lo.order_date >= $2::date AND lo.order_date < $3::date + INTERVAL '1 day'
          GROUP BY lt.test_name, lt.test_category
          ORDER BY order_count DESC
        ),
        critical_results AS (
          SELECT 
            lt.test_name,
            loi.result_value,
            p.first_name || ' ' || p.last_name as patient_name,
            loi.verified_at
          FROM lab_order_items loi
          JOIN lab_tests lt ON loi.test_id = lt.id
          JOIN lab_orders lo ON loi.lab_order_id = lo.id
          JOIN patients p ON lo.patient_id = p.id
          WHERE lo.facility_id = $1
            AND loi.is_critical = true
            AND loi.verified_at >= $2::date AND loi.verified_at < $3::date + INTERVAL '1 day'
          ORDER BY loi.verified_at DESC
        ),
        daily_volume AS (
          SELECT 
            DATE(lo.order_date) as date,
            COUNT(*) as orders
          FROM lab_orders lo
          WHERE lo.facility_id = $1
            AND lo.order_date >= $2::date AND lo.order_date < $3::date + INTERVAL '1 day'
          GROUP BY DATE(lo.order_date)
          ORDER BY date
        )
        SELECT 
          (SELECT row_to_json(lab_summary) FROM lab_summary) as summary,
          (SELECT json_agg(by_test_type) FROM by_test_type) as by_test_type,
          (SELECT json_agg(critical_results) FROM critical_results) as critical_results,
          (SELECT json_agg(daily_volume) FROM daily_volume) as daily_trend
      `, [req.user.facilityId, start_date, end_date]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'lab_report', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'lab_report', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate appointment report
   * @route   GET /api/v1/reports/appointments
   * @access  Private
   */
  async getAppointmentReport(req, res, next) {
    try {
      const { start_date, end_date, format = 'json' } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DATES',
            message: 'Start date and end date are required'
          }
        });
      }

      const report = await db.query(`
        WITH appointment_summary AS (
          SELECT 
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
            COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) as cancelled,
            COUNT(CASE WHEN status = 'No Show' THEN 1 END) as no_show,
            COUNT(CASE WHEN is_emergency THEN 1 END) as emergency,
            AVG(EXTRACT(EPOCH FROM (checked_in_time - (appointment_date::timestamp + start_time::time)))/60) as avg_checkin_delay
          FROM appointments
          WHERE facility_id = $1
            AND appointment_date BETWEEN $2 AND $3
        ),
        by_department AS (
          SELECT 
            d.department_name,
            COUNT(*) as total,
            COUNT(CASE WHEN a.status = 'Completed' THEN 1 END) as completed
          FROM appointments a
          JOIN departments d ON a.department_id = d.id
          WHERE a.facility_id = $1
            AND a.appointment_date BETWEEN $2 AND $3
          GROUP BY d.department_name
        ),
        by_doctor AS (
          SELECT 
            u.first_name || ' ' || u.last_name as doctor_name,
            COUNT(*) as total,
            COUNT(CASE WHEN a.status = 'Completed' THEN 1 END) as completed
          FROM appointments a
          JOIN users u ON a.doctor_id = u.id
          WHERE a.facility_id = $1
            AND a.appointment_date BETWEEN $2 AND $3
          GROUP BY u.first_name, u.last_name
          ORDER BY total DESC
          LIMIT 10
        ),
        daily_breakdown AS (
          SELECT 
            appointment_date,
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
          FROM appointments
          WHERE facility_id = $1
            AND appointment_date BETWEEN $2 AND $3
          GROUP BY appointment_date
          ORDER BY appointment_date
        )
        SELECT 
          (SELECT row_to_json(appointment_summary) FROM appointment_summary) as summary,
          (SELECT json_agg(by_department) FROM by_department) as by_department,
          (SELECT json_agg(by_doctor) FROM by_doctor) as by_doctor,
          (SELECT json_agg(daily_breakdown) FROM daily_breakdown) as daily_trend
      `, [req.user.facilityId, start_date, end_date]);

      const data = report.rows[0];

      if (format === 'excel') {
        return this.exportToExcel(data, 'appointment_report', res);
      } else if (format === 'pdf') {
        return this.exportToPDF(data, 'appointment_report', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate custom report
   * @route   POST /api/v1/reports/custom
   * @access  Private (Admin only)
   */
  async getCustomReport(req, res, next) {
    try {
      const {
        metrics,
        dimensions,
        filters,
        start_date,
        end_date,
        format = 'json'
      } = req.body;

      if (!metrics || !metrics.length) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_METRICS',
            message: 'At least one metric is required'
          }
        });
      }

      // Build dynamic query based on selected metrics and dimensions
      let selectClause = metrics.join(', ');
      if (dimensions && dimensions.length) {
        selectClause = dimensions.join(', ') + ', ' + selectClause;
      }

      // This is a simplified example - in production, you'd need a more robust
      // query builder to handle different combinations safely
      const result = await db.query(`
        SELECT ${selectClause}
        FROM visits v
        JOIN patients p ON v.patient_id = p.id
        WHERE v.facility_id = $1
          AND v.visit_date BETWEEN $2 AND $3
        ${filters ? 'AND ' + filters : ''}
        GROUP BY ${dimensions ? dimensions.join(', ') : '1'}
      `, [req.user.facilityId, start_date, end_date]);

      const data = result.rows;

      if (format === 'excel') {
        return this.exportToExcel({ custom_data: data }, 'custom_report', res);
      } else if (format === 'pdf') {
        return this.exportToPDF({ custom_data: data }, 'custom_report', res);
      }

      res.json({
        success: true,
        data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Export data to Excel
   * @access  Private
   */
  async exportToExcel(data, filename, res) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add headers
    const headers = Object.keys(data).filter(key => typeof data[key] !== 'object');
    worksheet.addRow(headers);

    // Add data
    const row = headers.map(header => data[header]);
    worksheet.addRow(row);

    // Handle nested objects
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        const sheet = workbook.addWorksheet(key);
        const itemHeaders = Object.keys(value[0]);
        sheet.addRow(itemHeaders);
        value.forEach(item => {
          sheet.addRow(itemHeaders.map(h => item[h]));
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * @desc    Export data to PDF
   * @access  Private
   */
  async exportToPDF(data, filename, res) {
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);

    doc.pipe(res);

    // Add title
    doc.fontSize(20).text(filename.replace(/_/g, ' ').toUpperCase(), { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();

    // Add summary
    if (data.summary) {
      doc.fontSize(16).text('Summary');
      doc.fontSize(12);
      Object.entries(data.summary).forEach(([key, value]) => {
        doc.text(`${key.replace(/_/g, ' ')}: ${value}`);
      });
      doc.moveDown();
    }

    // Add tables for arrays
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        doc.fontSize(16).text(key.replace(/_/g, ' ').toUpperCase());
        doc.moveDown();

        const headers = Object.keys(value[0]);
        let tableData = '';

        // Create simple table
        headers.forEach(h => {
          tableData += h.padEnd(20);
        });
        tableData += '\n' + '-'.repeat(headers.length * 20) + '\n';

        value.slice(0, 20).forEach(item => {
          headers.forEach(h => {
            tableData += (item[h] || '').toString().substring(0, 15).padEnd(20);
          });
          tableData += '\n';
        });

        doc.fontSize(10).text(tableData);
        doc.moveDown();
      }
    }

    doc.end();
  }

  /**
   * @desc    Get available report templates
   * @route   GET /api/v1/reports/templates
   * @access  Private
   */
  async getReportTemplates(req, res, next) {
    try {
      const templates = [
        {
          id: 'patient_demographics',
          name: 'Patient Demographics Report',
          description: 'Analysis of patient population by age, gender, and location',
          category: 'Clinical'
        },
        {
          id: 'clinical_activity',
          name: 'Clinical Activity Report',
          description: 'Overview of clinical activities including visits, diagnoses, and procedures',
          category: 'Clinical'
        },
        {
          id: 'financial',
          name: 'Financial Report',
          description: 'Revenue analysis by payment method, service type, and insurance',
          category: 'Financial'
        },
        {
          id: 'inventory',
          name: 'Inventory Report',
          description: 'Current inventory levels, low stock alerts, and expiring items',
          category: 'Inventory'
        },
        {
          id: 'lab',
          name: 'Laboratory Report',
          description: 'Lab orders, test frequencies, and turnaround times',
          category: 'Laboratory'
        },
        {
          id: 'appointments',
          name: 'Appointment Report',
          description: 'Appointment statistics, no-shows, and provider performance',
          category: 'Operations'
        },
        {
          id: 'insurance_claims',
          name: 'Insurance Claims Report',
          description: 'Claim status, approval rates, and payment tracking',
          category: 'Financial'
        },
        {
          id: 'pharmacy_dispensing',
          name: 'Pharmacy Dispensing Report',
          description: 'Medication dispensing patterns and consumption analysis',
          category: 'Pharmacy'
        },
        {
          id: 'dental',
          name: 'Dental Services Report',
          description: 'Dental procedures and treatment statistics',
          category: 'Specialty'
        },
        {
          id: 'eye_clinic',
          name: 'Eye Clinic Report',
          description: 'Eye examinations and glasses prescriptions',
          category: 'Specialty'
        }
      ];

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Generate mortality report from patients.deceased_date and cause_of_death
   * @route   GET /api/v1/reports/mortality
   * @access  Private
   */
  async getMortalityReport(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_DATES', message: 'Start date and end date are required' }
        });
      }

      const report = await db.query(`
        WITH deaths AS (
          SELECT *
          FROM patients
          WHERE facility_id = $1
            AND deceased_date BETWEEN $2 AND $3
        ),
        gender_breakdown AS (
          SELECT gender, COUNT(*) AS count
          FROM deaths
          GROUP BY gender
        ),
        age_breakdown AS (
          SELECT
            CASE
              WHEN AGE(date_of_birth) < INTERVAL '1 year'  THEN 'Under 1 year'
              WHEN AGE(date_of_birth) < INTERVAL '5 years' THEN '1–4 years'
              WHEN AGE(date_of_birth) < INTERVAL '15 years' THEN '5–14 years'
              WHEN AGE(date_of_birth) < INTERVAL '60 years' THEN '15–59 years'
              ELSE '60+ years'
            END AS age_group,
            COUNT(*) AS count
          FROM deaths
          GROUP BY age_group
          ORDER BY count DESC
        ),
        cause_breakdown AS (
          SELECT
            COALESCE(NULLIF(TRIM(cause_of_death), ''), 'Not recorded') AS cause,
            COUNT(*) AS count
          FROM deaths
          GROUP BY cause
          ORDER BY count DESC
          LIMIT 20
        ),
        monthly_trend AS (
          SELECT
            TO_CHAR(DATE_TRUNC('month', deceased_date), 'YYYY-MM') AS month,
            COUNT(*) AS deaths
          FROM deaths
          GROUP BY DATE_TRUNC('month', deceased_date)
          ORDER BY month
        )
        SELECT
          (SELECT COUNT(*) FROM deaths)                               AS total_deaths,
          (SELECT json_agg(gender_breakdown) FROM gender_breakdown)   AS by_gender,
          (SELECT json_agg(age_breakdown)    FROM age_breakdown)      AS by_age_group,
          (SELECT json_agg(cause_breakdown)  FROM cause_breakdown)    AS by_cause,
          (SELECT json_agg(monthly_trend)    FROM monthly_trend)      AS monthly_trend
      `, [req.user.facilityId, start_date, end_date]);

      res.json({ success: true, data: report.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Schedule automated report
   * @route   POST /api/v1/reports/schedule
   * @access  Private (Admin only)
   */
  async scheduleReport(req, res, next) {
    try {
      const {
        report_type,
        schedule,
        recipients,
        format = 'pdf',
        filters = {}
      } = req.body;

      // ensure schedule_config is valid JSONB; clients may send a bare cron
      // string or an object with additional fields.  We wrap strings so the
      // database always stores an object.
      const scheduleConfig =
        typeof schedule === 'string' ? { cron: schedule } : schedule || {};

      if (!report_type || !scheduleConfig || !recipients) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Report type, schedule, and recipients are required'
          }
        });
      }

      if (!Array.isArray(recipients)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RECIPIENTS',
            message: 'Recipients must be an array of email addresses'
          }
        });
      }

      // schedule object may be a cron string or an object.  We try to derive a
      // simple frequency label and compute the initial `next_run_at` using the
      // cron expression.  Storing both makes the job logic easier and also
      // allows manual overrides.
      let frequency = null;
      let nextRunAt = new Date();
      try {
        let cronExpr;
        if (typeof scheduleConfig === 'string') {
          cronExpr = scheduleConfig;
        } else if (scheduleConfig && scheduleConfig.cron) {
          cronExpr = scheduleConfig.cron;
        } else {
          cronExpr = String(scheduleConfig);
        }

        // compute next run time from cron expression
        nextRunAt = cronParser.parseExpression(cronExpr).next().toDate();

        // guess human frequency (daily/weekly/monthly) from the pattern
        const parts = cronExpr.trim().split(/\s+/);
        if (parts.length === 5) {
          const [, , dayOfMonth, , dayOfWeek] = parts;
          if (dayOfMonth !== '*' && dayOfWeek === '*') {
            frequency = 'monthly';
          } else if (dayOfWeek !== '*' && dayOfMonth === '*') {
            frequency = 'weekly';
          } else if (dayOfMonth === '*' && dayOfWeek === '*') {
            frequency = 'daily';
          }
        }

        // allow user to explicitly pass a frequency property as well
        if (!frequency && schedule && schedule.frequency) {
          frequency = schedule.frequency;
        }
      } catch (err) {
        logger.error('Failed to parse cron expression in scheduleReport:', err.message || err);
        // if cron-parser fails, leave defaults; the job will fall back to a
        // 24‑hour interval and the custom date range logic
        frequency = schedule && schedule.frequency ? schedule.frequency : null;
      }

      // Save schedule to database
      const result = await db.query(`
        INSERT INTO report_schedules (
          facility_id, report_type, schedule_config, recipients,
          format, filters, frequency, next_run_at, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
      `, [
        req.user.facilityId,
        report_type,
        JSON.stringify(scheduleConfig),
        JSON.stringify(recipients),
        format,
        JSON.stringify(filters),
        frequency,
        nextRunAt,
        req.user.userId
      ]);

      res.status(201).json({
        success: true,
        data: { id: result.rows[0].id },
        message: 'Report scheduled successfully'
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();