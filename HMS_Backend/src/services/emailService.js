const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.defaultFrom = process.env.EMAIL_FROM || 'noreply@hospital.gov.gh';
    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    try {
      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5
      });

      // Verify connection
      await this.transporter.verify();
      
      // Load email templates
      await this.loadTemplates();
      
      this.isInitialized = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      throw new AppError('Email service initialization failed', 500, 'EMAIL_INIT_ERROR');
    }
  }

  /**
   * Load email templates from files
   */
  async loadTemplates() {
    const templateDir = path.join(__dirname, '../templates/email');
    
    try {
      // Create template directory if it doesn't exist
      try {
        await fs.access(templateDir);
      } catch {
        await fs.mkdir(templateDir, { recursive: true });
      }

      const files = await fs.readdir(templateDir);
      
      for (const file of files) {
        if (file.endsWith('.hbs') || file.endsWith('.html')) {
          const templateName = path.basename(file, path.extname(file));
          const content = await fs.readFile(path.join(templateDir, file), 'utf-8');
          this.templates.set(templateName, handlebars.compile(content));
          logger.debug(`Loaded email template: ${templateName}`);
        }
      }
      
      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.warn('Failed to load email templates:', error);
    }
  }

  /**
   * Send email
   */
  async sendEmail(options) {
    try {
      if (!this.isInitialized) {
        throw new AppError('Email service not initialized', 503, 'EMAIL_NOT_READY');
      }

      const {
        to,
        cc,
        bcc,
        subject,
        template,
        data = {},
        attachments = [],
        from = this.defaultFrom
      } = options;

      // Validate recipients
      if (!to && !cc && !bcc) {
        throw new AppError('No recipients specified', 400, 'NO_RECIPIENTS');
      }

      // start with any explicit html/text passed in
      let html = options.html;
      let text = options.text;

      // If a template was specified, try to compile it
      if (template) {
        if (this.templates.has(template)) {
          const templateFn = this.templates.get(template);
          html = templateFn(data);
        } else {
          // template requested but not loaded - log and fall back to plain text
          logger.warn(`Requested email template '${template}' not found; using fallback text`);
          if (!text) {
            // provide a generic placeholder if we have some data to work with
            text = data.resetLink
              ? `Please use the following link to complete your request: ${data.resetLink}`
              : 'Please contact support.';
          }
        }
      }

      // Create plain text version from html if still missing
      if (!text && html) {
        text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }

      const mailOptions = {
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        cc: Array.isArray(cc) ? cc.join(', ') : cc,
        bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc,
        subject,
        html,
        text,
        attachments,
        headers: {
          'X-Priority': options.priority || '3',
          'X-MT-Request-ID': options.requestId
        }
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: to,
        subject,
        template
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new AppError('Failed to send email', 500, 'EMAIL_SEND_FAILED');
    }
  }

  /**
   * Send email with retry logic
   */
  async sendWithRetry(options, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendEmail(options);
      } catch (error) {
        lastError = error;
        logger.warn(`Email send attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(appointment, patient, doctor) {
    const data = {
      patientName: `${patient.first_name} ${patient.last_name}`,
      doctorName: `${doctor.first_name} ${doctor.last_name}`,
      department: appointment.department_name,
      date: new Date(appointment.appointment_date).toLocaleDateString('en-GH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: appointment.start_time,
      location: process.env.FACILITY_NAME,
      address: process.env.FACILITY_ADDRESS,
      contact: process.env.FACILITY_PHONE,
      confirmationLink: `${process.env.APP_URL}/appointments/${appointment.id}/confirm`,
      rescheduleLink: `${process.env.APP_URL}/appointments/${appointment.id}/reschedule`
    };

    return this.sendEmail({
      to: patient.email,
      subject: 'Appointment Reminder',
      template: 'appointment-reminder',
      data
    });
  }

  /**
   * Send lab result notification
   */
  async sendLabResultNotification(patient, labOrder, results) {
    const data = {
      patientName: `${patient.first_name} ${patient.last_name}`,
      patientNumber: patient.patient_number,
      orderNumber: labOrder.order_number,
      orderDate: new Date(labOrder.order_date).toLocaleDateString('en-GH'),
      results: results.map(r => ({
        test: r.test_name,
        result: r.result_value,
        reference: r.reference_range,
        flag: r.is_abnormal ? 'Abnormal' : 'Normal'
      })),
      viewLink: `${process.env.APP_URL}/lab/results/${labOrder.id}`,
      facilityName: process.env.FACILITY_NAME,
      facilityPhone: process.env.FACILITY_PHONE
    };

    return this.sendEmail({
      to: patient.email,
      subject: `Lab Results Ready - Order #${labOrder.order_number}`,
      template: 'lab-results',
      data
    });
  }

  /**
   * Send invoice
   */
  async sendInvoice(patient, invoice, items) {
    const data = {
      patientName: `${patient.first_name} ${patient.last_name}`,
      patientNumber: patient.patient_number,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: new Date(invoice.invoice_date).toLocaleDateString('en-GH'),
      dueDate: new Date(invoice.due_date).toLocaleDateString('en-GH'),
      items: items.map(i => ({
        description: i.item_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total_price
      })),
      subtotal: invoice.subtotal,
      discount: invoice.discount_amount,
      tax: invoice.tax_amount,
      total: invoice.total_amount,
      paid: invoice.amount_paid,
      balance: invoice.balance_due,
      paymentLink: `${process.env.APP_URL}/payments/${invoice.id}`,
      facilityName: process.env.FACILITY_NAME,
      facilityPhone: process.env.FACILITY_PHONE,
      facilityEmail: process.env.FACILITY_EMAIL
    };

    return this.sendEmail({
      to: patient.email,
      subject: `Invoice #${invoice.invoice_number}`,
      template: 'invoice',
      data,
      attachments: invoice.attachments
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    const data = {
      name: `${user.first_name} ${user.last_name}`,
      resetLink,
      expiryMinutes: 60,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE
    };

    return this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      data
    });
  }

  /**
   * Send welcome email to new patient
   */
  async sendWelcomeEmail(patient) {
    const data = {
      name: `${patient.first_name} ${patient.last_name}`,
      patientNumber: patient.patient_number,
      registrationDate: new Date(patient.created_at).toLocaleDateString('en-GH'),
      loginLink: `${process.env.APP_URL}/login`,
      portalLink: `${process.env.APP_URL}/patient-portal`,
      facilityName: process.env.FACILITY_NAME,
      facilityPhone: process.env.FACILITY_PHONE,
      facilityEmail: process.env.FACILITY_EMAIL,
      supportEmail: process.env.SUPPORT_EMAIL
    };

    return this.sendEmail({
      to: patient.email,
      subject: 'Welcome to Our Hospital',
      template: 'welcome-patient',
      data
    });
  }

  /**
   * Send welcome email to new staff
   */
  async sendStaffWelcomeEmail(user, temporaryPassword) {
    const data = {
      name: `${user.first_name} ${user.last_name}`,
      employeeId: user.employee_id,
      loginLink: `${process.env.APP_URL}/login`,
      temporaryPassword,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE,
      facilityName: process.env.FACILITY_NAME
    };

    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to the Team',
      template: 'welcome-staff',
      data
    });
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(user, alertType, details) {
    const data = {
      name: `${user.first_name} ${user.last_name}`,
      alertType,
      time: new Date().toLocaleString('en-GH'),
      ipAddress: details.ip,
      device: details.device,
      location: details.location,
      action: details.action,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE
    };

    return this.sendEmail({
      to: user.email,
      subject: `Security Alert: ${alertType}`,
      template: 'security-alert',
      data
    });
  }

  /**
   * Send monthly report
   */
  async sendMonthlyReport(facility, reportData, recipients) {
    const data = {
      facilityName: facility.name,
      month: reportData.month,
      year: reportData.year,
      stats: reportData.stats,
      financials: reportData.financials,
      clinical: reportData.clinical,
      reportLink: `${process.env.APP_URL}/reports/${reportData.id}`,
      downloadLink: `${process.env.APP_URL}/reports/${reportData.id}/download`
    };

    return this.sendEmail({
      to: recipients,
      subject: `Monthly Report - ${facility.name} - ${reportData.month} ${reportData.year}`,
      template: 'monthly-report',
      data,
      attachments: reportData.attachments
    });
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails, options, concurrency = 5) {
    const results = [];
    const batches = this.chunkArray(emails, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(email =>
        this.sendEmail({ ...options, to: email })
          .then(result => ({ email, success: true, result }))
          .catch(error => ({ email, success: false, error: error.message }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value));

      // Wait between batches
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Chunk array for batch processing
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Close transporter
   */
  async close() {
    if (this.transporter) {
      await this.transporter.close();
      logger.info('Email transporter closed');
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    return {
      initialized: this.isInitialized,
      templateCount: this.templates.size,
      transporter: this.transporter ? 'connected' : 'disconnected'
    };
  }
}

module.exports = new EmailService();