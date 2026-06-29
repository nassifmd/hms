const db = require('../config/database');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { reportQueue } = require('./queueService');

class ReportService {
  constructor() {
    this.reportTypes = new Map();
    this.initialize();
  }

  /**
   * Initialize report service
   */
  initialize() {
    // Register report types
    this.registerReportTypes();
    logger.info('Report service initialized');
  }

  /**
   * Register available report types
   */
  registerReportTypes() {
    this.reportTypes.set('patient_demographics', {
      name: 'Patient Demographics Report',
      category: 'clinical',
      description: 'Analysis of patient population by age, gender, and location',
      handler: this.generatePatientDemographics.bind(this)
    });

    this.reportTypes.set('clinical_activity', {
      name: 'Clinical Activity Report',
      category: 'clinical',
      description: 'Overview of clinical activities including visits, diagnoses, and procedures',
      handler: this.generateClinicalActivity.bind(this)
    });

    this.reportTypes.set('financial', {
      name: 'Financial Report',
      category: 'financial',
      description: 'Revenue analysis by payment method, service type, and insurance',
      handler: this.generateFinancialReport.bind(this)
    });

    this.reportTypes.set('inventory', {
      name: 'Inventory Report',
      category: 'inventory',
      description: 'Current inventory levels, low stock alerts, and expiring items',
      handler: this.generateInventoryReport.bind(this)
    });

    this.reportTypes.set('lab', {
      name: 'Laboratory Report',
      category: 'lab',
      description: 'Lab orders, test frequencies, and turnaround times',
      handler: this.generateLabReport.bind(this)
    });

    this.reportTypes.set('appointments', {
      name: 'Appointment Report',
      category: 'operations',
      description: 'Appointment statistics, no-shows, and provider performance',
      handler: this.generateAppointmentReport.bind(this)
    });

    this.reportTypes.set('insurance_claims', {
      name: 'Insurance Claims Report',
      category: 'financial',
      description: 'Claim status, approval rates, and payment tracking',
      handler: this.generateInsuranceClaimsReport.bind(this)
    });

    this.reportTypes.set('pharmacy', {
      name: 'Pharmacy Report',
      category: 'pharmacy',
      description: 'Medication dispensing patterns and consumption analysis',
      handler: this.generatePharmacyReport.bind(this)
    });

    this.reportTypes.set('dental', {
      name: 'Dental Services Report',
      category: 'specialty',
      description: 'Dental procedures and treatment statistics',
      handler: this.generateDentalReport.bind(this)
    });

    this.reportTypes.set('eye_clinic', {
      name: 'Eye Clinic Report',
      category: 'specialty',
      description: 'Eye examinations and glasses prescriptions',
      handler: this.generateEyeClinicReport.bind(this)
    });
  }

  /**
   * Get available report types
   */
  getReportTypes() {
    return Array.from(this.reportTypes.entries()).map(([key, value]) => ({
      id: key,
      name: value.name,
      category: value.category,
      description: value.description
    }));
  }

  /**
   * Generate report
   */
  async generateReport(reportType, params, options = {}) {
    const reportConfig = this.reportTypes.get(reportType);
    
    if (!reportConfig) {
      throw new AppError('Invalid report type', 400, 'INVALID_REPORT_TYPE');
    }

    const {
      format = 'json',
      async = false,
      notify = false,
      userId = null
    } = options;

    // If async, queue the report generation
    if (async) {
      const job = await reportQueue.add('generate', {
        reportType,
        params,
        format,
        userId
      }, {
        jobId: `report_${Date.now()}`,
        attempts: 2
      });

      return {
        success: true,
        async: true,
        jobId: job.id,
        message: 'Report generation started'
      };
    }

    // Generate report synchronously
    const data = await reportConfig.handler(params);
    
    // Format output
    if (format === 'excel') {
      return this.exportToExcel(data, reportType);
    } else if (format === 'pdf') {
      return this.exportToPDF(data, reportConfig.name);
    }

    return data;
  }

  /**
   * Generate patient demographics report
   */
  async generatePatientDemographics(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH demographics AS (
        SELECT 
          gender,
          COUNT(*) as count,
          AVG(EXTRACT(YEAR FROM AGE(date_of_birth))) as avg_age,
          MIN(EXTRACT(YEAR FROM AGE(date_of_birth))) as min_age,
          MAX(EXTRACT(YEAR FROM AGE(date_of_birth))) as max_age
        FROM patients
        WHERE facility_id = $1
          AND created_at BETWEEN $2 AND $3
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
          AND created_at BETWEEN $2 AND $3
        GROUP BY age_group
      ),
      by_region AS (
        SELECT 
          region,
          COUNT(*) as count
        FROM patients
        WHERE facility_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY region
        ORDER BY count DESC
      ),
      monthly_trend AS (
        SELECT 
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          COUNT(*) as new_patients
        FROM patients
        WHERE facility_id = $1
          AND created_at BETWEEN $2 AND $3
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      )
      SELECT 
        (SELECT json_agg(demographics) FROM demographics) as by_gender,
        (SELECT json_agg(age_groups) FROM age_groups) as age_distribution,
        (SELECT json_agg(by_region) FROM by_region) as by_region,
        (SELECT json_agg(monthly_trend) FROM monthly_trend) as monthly_trend,
        (SELECT COUNT(*) FROM patients WHERE facility_id = $1 AND created_at BETWEEN $2 AND $3) as total_patients
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate clinical activity report
   */
  async generateClinicalActivity(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH visit_stats AS (
        SELECT 
          COUNT(*) as total_visits,
          COUNT(DISTINCT patient_id) as unique_patients,
          AVG(CASE WHEN check_in_time IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(check_out_time, updated_at) - check_in_time))/60 END) as avg_visit_duration,
          COUNT(CASE WHEN is_emergency THEN 1 END) as emergency_visits
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
          AND d.created_at BETWEEN $2 AND $3
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
          AND pp.created_at BETWEEN $2 AND $3
        GROUP BY p.procedure_name
        ORDER BY count DESC
        LIMIT 10
      )
      SELECT 
        (SELECT row_to_json(visit_stats) FROM visit_stats) as summary,
        (SELECT json_agg(by_department) FROM by_department) as by_department,
        (SELECT json_agg(diagnosis_stats) FROM diagnosis_stats) as top_diagnoses,
        (SELECT json_agg(procedure_stats) FROM procedure_stats) as top_procedures
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate financial report
   */
  async generateFinancialReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH revenue_summary AS (
        SELECT 
          COALESCE(SUM(p.amount), 0) as total_revenue,
          COUNT(DISTINCT p.id) as transaction_count,
          COUNT(DISTINCT p.patient_id) as paying_patients,
          AVG(p.amount) as avg_transaction
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.facility_id = $1
          AND p.payment_date BETWEEN $2 AND $3
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
          AND p.payment_date BETWEEN $2 AND $3
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
          AND i.invoice_date BETWEEN $2 AND $3
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
          AND p.payment_date BETWEEN $2 AND $3
          AND p.voided = false
        GROUP BY DATE(p.payment_date)
        ORDER BY date
      )
      SELECT 
        (SELECT row_to_json(revenue_summary) FROM revenue_summary) as summary,
        (SELECT json_agg(by_payment_method) FROM by_payment_method) as by_payment_method,
        (SELECT json_agg(by_service_type) FROM by_service_type) as by_service_type,
        (SELECT json_agg(daily_revenue) FROM daily_revenue) as daily_trend
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate inventory report
   */
  async generateInventoryReport(params) {
    const { facility_id } = params;

    const result = await db.query(`
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
    `, [facility_id]);

    return result.rows[0];
  }

  /**
   * Generate lab report
   */
  async generateLabReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
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
          AND lo.order_date BETWEEN $2 AND $3
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
          AND lo.order_date BETWEEN $2 AND $3
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
          AND loi.verified_at BETWEEN $2 AND $3
        ORDER BY loi.verified_at DESC
      )
      SELECT 
        (SELECT row_to_json(lab_summary) FROM lab_summary) as summary,
        (SELECT json_agg(by_test_type) FROM by_test_type) as by_test_type,
        (SELECT json_agg(critical_results) FROM critical_results) as critical_results
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate appointment report
   */
  async generateAppointmentReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH appointment_summary AS (
        SELECT 
          COUNT(*) as total_appointments,
          COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) as cancelled,
          COUNT(CASE WHEN status = 'No Show' THEN 1 END) as no_show,
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
      )
      SELECT 
        (SELECT row_to_json(appointment_summary) FROM appointment_summary) as summary,
        (SELECT json_agg(by_department) FROM by_department) as by_department,
        (SELECT json_agg(by_doctor) FROM by_doctor) as by_doctor
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate insurance claims report
   */
  async generateInsuranceClaimsReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH claim_summary AS (
        SELECT 
          COUNT(*) as total_claims,
          SUM(total_amount) as total_claimed,
          SUM(approved_amount) as total_approved,
          SUM(paid_amount) as total_paid,
          AVG(approved_amount / NULLIF(total_amount, 0)) * 100 as avg_approval_rate
        FROM insurance_claims
        WHERE facility_id = $1
          AND claim_date BETWEEN $2 AND $3
      ),
      by_provider AS (
        SELECT 
          pi.insurance_provider,
          COUNT(ic.id) as claim_count,
          SUM(ic.total_amount) as total_claimed,
          SUM(ic.approved_amount) as total_approved,
          SUM(ic.paid_amount) as total_paid
        FROM insurance_claims ic
        JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
        WHERE ic.facility_id = $1
          AND ic.claim_date BETWEEN $2 AND $3
        GROUP BY pi.insurance_provider
        ORDER BY total_claimed DESC
      ),
      by_status AS (
        SELECT 
          status,
          COUNT(*) as count,
          SUM(total_amount) as amount
        FROM insurance_claims
        WHERE facility_id = $1
          AND claim_date BETWEEN $2 AND $3
        GROUP BY status
      )
      SELECT 
        (SELECT row_to_json(claim_summary) FROM claim_summary) as summary,
        (SELECT json_agg(by_provider) FROM by_provider) as by_provider,
        (SELECT json_agg(by_status) FROM by_status) as by_status
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate pharmacy report
   */
  async generatePharmacyReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH dispensing_summary AS (
        SELECT 
          COUNT(*) as total_dispensing,
          COUNT(DISTINCT dd.patient_id) as unique_patients,
          SUM(di.quantity_dispensed) as total_items,
          AVG(di.quantity_dispensed) as avg_items_per_dispense
        FROM drug_dispensing dd
        JOIN dispensing_items di ON dd.id = di.dispensing_id
        WHERE dd.dispensed_date BETWEEN $2 AND $3
      ),
      top_drugs AS (
        SELECT 
          d.drug_name,
          COUNT(*) as dispensing_count,
          SUM(di.quantity_dispensed) as total_quantity
        FROM drug_dispensing dd
        JOIN dispensing_items di ON dd.id = di.dispensing_id
        JOIN drug_inventory inv ON di.drug_inventory_id = inv.id
        JOIN drugs d ON inv.drug_id = d.id
        WHERE dd.dispensed_date BETWEEN $2 AND $3
        GROUP BY d.drug_name
        ORDER BY dispensing_count DESC
        LIMIT 10
      ),
      daily_dispensing AS (
        SELECT 
          DATE(dd.dispensed_date) as date,
          COUNT(*) as dispensing_count
        FROM drug_dispensing dd
        WHERE dd.dispensed_date BETWEEN $2 AND $3
        GROUP BY DATE(dd.dispensed_date)
        ORDER BY date
      )
      SELECT 
        (SELECT row_to_json(dispensing_summary) FROM dispensing_summary) as summary,
        (SELECT json_agg(top_drugs) FROM top_drugs) as top_drugs,
        (SELECT json_agg(daily_dispensing) FROM daily_dispensing) as daily_trend
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Generate dental report
   */
  async generateDentalReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_procedures,
        COUNT(DISTINCT v.patient_id) as unique_patients,
        json_agg(
          json_build_object(
            'procedure_name', p.procedure_name,
            'count', COUNT(*)
          )
        ) as procedures_breakdown
      FROM patient_dental_procedures dp
      JOIN dental_procedures p ON dp.procedure_id = p.id
      JOIN visits v ON dp.visit_id = v.id
      WHERE v.facility_id = $1
        AND dp.procedure_date BETWEEN $2 AND $3
      GROUP BY p.procedure_name
    `, [facility_id, start_date, end_date]);

    return result.rows;
  }

  /**
   * Generate eye clinic report
   */
  async generateEyeClinicReport(params) {
    const { facility_id, start_date, end_date } = params;

    const result = await db.query(`
      WITH exam_summary AS (
        SELECT 
          COUNT(*) as total_exams,
          COUNT(DISTINCT v.patient_id) as unique_patients,
          COUNT(CASE WHEN glasses_prescribed THEN 1 END) as glasses_prescribed
        FROM eye_examinations e
        JOIN visits v ON e.visit_id = v.id
        WHERE v.facility_id = $1
          AND e.examination_date BETWEEN $2 AND $3
      ),
      common_diagnoses AS (
        SELECT 
          diagnosis,
          COUNT(*) as count
        FROM (
          SELECT diagnosis_right as diagnosis FROM eye_examinations
          WHERE diagnosis_right IS NOT NULL
          UNION ALL
          SELECT diagnosis_left FROM eye_examinations
          WHERE diagnosis_left IS NOT NULL
          UNION ALL
          SELECT diagnosis_binocular FROM eye_examinations
          WHERE diagnosis_binocular IS NOT NULL
        ) d
        GROUP BY diagnosis
        ORDER BY count DESC
        LIMIT 10
      )
      SELECT 
        (SELECT row_to_json(exam_summary) FROM exam_summary) as summary,
        (SELECT json_agg(common_diagnoses) FROM common_diagnoses) as common_diagnoses
    `, [facility_id, start_date, end_date]);

    return result.rows[0];
  }

  /**
   * Export data to Excel
   */
  async exportToExcel(data, reportType) {
    const workbook = new ExcelJS.Workbook();
    
    // Add metadata
    workbook.creator = 'Hospital Management System';
    workbook.lastModifiedBy = 'System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Create summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    this.addSummaryToExcel(summarySheet, data);

    // Create detail sheets
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        const sheet = workbook.addWorksheet(this.formatSheetName(key));
        this.addArrayToExcel(sheet, value);
      }
    }

    return workbook;
  }

  /**
   * Add summary data to Excel sheet
   */
  addSummaryToExcel(sheet, data) {
    // Add title
    sheet.mergeCells('A1', 'C1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Report Summary';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    let row = 3;
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value) && typeof value !== 'object') {
        sheet.getCell(`A${row}`).value = this.formatLabel(key);
        sheet.getCell(`B${row}`).value = value;
        row++;
      }
    }

    // Style headers
    sheet.getColumn('A').width = 30;
    sheet.getColumn('B').width = 20;
  }

  /**
   * Add array data to Excel sheet
   */
  addArrayToExcel(sheet, data) {
    if (data.length === 0) return;

    // Add headers
    const headers = Object.keys(data[0]);
    sheet.addRow(headers.map(h => this.formatLabel(h)));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    data.forEach(item => {
      const row = headers.map(h => item[h]);
      sheet.addRow(row);
    });

    // Auto-fit columns
    sheet.columns.forEach(column => {
      column.width = 15;
    });
  }

  /**
   * Export data to PDF
   */
  async exportToPDF(data, reportName) {
    const doc = new PDFDocument({ margin: 50 });
    
    // Add title
    doc.fontSize(20).text(reportName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated on: ${moment().format('YYYY-MM-DD HH:mm:ss')}`, { align: 'right' });
    doc.moveDown();

    // Add summary
    if (data.summary) {
      doc.fontSize(16).text('Summary');
      doc.fontSize(12);
      
      for (const [key, value] of Object.entries(data.summary)) {
        if (typeof value !== 'object') {
          doc.text(`${this.formatLabel(key)}: ${value}`);
        }
      }
      doc.moveDown();
    }

    // Add tables
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        doc.fontSize(14).text(this.formatLabel(key));
        doc.moveDown();

        const headers = Object.keys(value[0]);
        let tableData = '';

        // Create simple table
        headers.forEach(h => {
          tableData += this.formatLabel(h).padEnd(20);
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

    return doc;
  }

  /**
   * Format label for display
   */
  formatLabel(str) {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Format sheet name
   */
  formatSheetName(str) {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .substring(0, 31); // Excel sheet name max length
  }
}

module.exports = new ReportService();