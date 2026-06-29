const nodemailer = require("nodemailer");
const fs = require("fs").promises;
const path = require("path");
const handlebars = require("handlebars");
const logger = require("./logger");

class EmailConfig {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initialize();
  }

  initialize() {
    this.registerHelpers();

    const options = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
    };

    // Add TLS options for production
    if (process.env.NODE_ENV === "production") {
      options.tls = {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      };
    }

    this.transporter = nodemailer.createTransport(options);

    // Load email templates
    this.loadTemplates();
  }

  registerHelpers() {
    handlebars.registerHelper("eq", (a, b) => a === b);
    handlebars.registerHelper("ne", (a, b) => a !== b);
    handlebars.registerHelper("currency", (num) => {
      const n = parseFloat(num);
      return isNaN(n)
        ? "0.00"
        : `GH₵ ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    });
    handlebars.registerHelper("upper", (str) =>
      (str || "").toString().toUpperCase()
    );
    handlebars.registerHelper("titleCase", (str) =>
      (str || "")
        .toString()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info("Email service connected successfully");
    } catch (error) {
      logger.error("Email service connection failed:", error);
    }
  }

  async loadTemplates() {
    const templateDir = path.join(__dirname, "../templates/email");

    try {
      const files = await fs.readdir(templateDir);

      for (const file of files) {
        if (file.endsWith(".hbs")) {
          const templateName = path.basename(file, ".hbs");
          const content = await fs.readFile(
            path.join(templateDir, file),
            "utf-8"
          );
          this.templates.set(templateName, handlebars.compile(content));
          logger.debug(`Loaded email template: ${templateName}`);
        }
      }

      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.warn("No email templates found, using default formatting");
    }
  }

  async sendEmail(options) {
    try {
      const mailOptions = {
        from:
          options.from || `"Hospital Management" <${process.env.EMAIL_FROM}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        attachments: options.attachments || [],
      };

      // Handle template or direct content
      if (options.template && this.templates.has(options.template)) {
        const template = this.templates.get(options.template);
        mailOptions.html = template(options.data || {});

        if (options.text) {
          mailOptions.text = options.text;
        }
      } else {
        mailOptions.html = options.html;
        mailOptions.text = options.text;
      }

      // Add tracking
      if (options.track) {
        mailOptions.headers = {
          "X-Track-Id": options.track.id,
          "X-Track-User": options.track.userId,
        };
      }

      const info = await this.transporter.sendMail(mailOptions);

      logger.info("Email sent successfully", {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
        template: options.template,
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      logger.error("Failed to send email", {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });

      throw error;
    }
  }

  // Appointment reminders
  async sendAppointmentReminder(appointment) {
    const template = "appointment-reminder";
    const subject = `Appointment Reminder: Dr. ${appointment.doctor_name} on ${appointment.appointment_date}`;

    const data = {
      patientName: appointment.patient_name,
      doctorName: appointment.doctor_name,
      department: appointment.department_name,
      date: new Date(appointment.appointment_date).toLocaleDateString("en-GH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: appointment.start_time,
      location: appointment.facility_name,
      address: appointment.facility_address,
      contact: appointment.facility_phone,
      confirmationLink: `${process.env.APP_URL}/appointments/${appointment.id}/confirm`,
      rescheduleLink: `${process.env.APP_URL}/appointments/${appointment.id}/reschedule`,
    };

    return this.sendEmail({
      to: appointment.patient_email,
      subject,
      template,
      data,
      track: {
        id: appointment.id,
        userId: appointment.patient_id,
      },
    });
  }

  // Welcome email for new patients
  async sendWelcomeEmail(patient) {
    const template = "welcome-patient";
    const subject = "Welcome to Our Hospital";

    const data = {
      name: `${patient.first_name} ${patient.last_name}`,
      patientNumber: patient.patient_number,
      registrationDate: new Date(patient.created_at).toLocaleDateString(
        "en-GH"
      ),
      loginLink: `${process.env.APP_URL}/login`,
      supportEmail: process.env.SUPPORT_EMAIL,
      supportPhone: process.env.SUPPORT_PHONE,
    };

    return this.sendEmail({
      to: patient.email,
      subject,
      template,
      data,
    });
  }

  // Lab result notification
  async sendLabResultNotification(labOrder, patient) {
    const template = "lab-result";
    const subject = "Your Lab Results Are Ready";

    const data = {
      patientName: `${patient.first_name} ${patient.last_name}`,
      orderNumber: labOrder.order_number,
      orderDate: new Date(labOrder.order_date).toLocaleDateString("en-GH"),
      tests: labOrder.items.map((item) => ({
        name: item.test_name,
        result: item.result_value,
        reference: item.reference_range,
        status: item.is_abnormal ? "Abnormal" : "Normal",
      })),
      viewLink: `${process.env.APP_URL}/lab/results/${labOrder.id}`,
    };

    return this.sendEmail({
      to: patient.email,
      subject,
      template,
      data,
    });
  }

  // Invoice/Payment receipt
  async sendInvoice(invoice, patient) {
    const template = "invoice";
    const subject = `Invoice #${invoice.invoice_number}`;

    const data = {
      patientName: `${patient.first_name} ${patient.last_name}`,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: new Date(invoice.invoice_date).toLocaleDateString("en-GH"),
      dueDate: new Date(invoice.due_date).toLocaleDateString("en-GH"),
      items: invoice.items,
      subtotal: invoice.subtotal,
      discount: invoice.discount_amount,
      tax: invoice.tax_amount,
      total: invoice.total_amount,
      paid: invoice.amount_paid,
      balance: invoice.balance_due,
      paymentLink: `${process.env.APP_URL}/payments/${invoice.id}`,
    };

    return this.sendEmail({
      to: patient.email,
      subject,
      template,
      data,
      attachments: invoice.attachments,
    });
  }

  // Password reset
  async sendPasswordResetEmail(user, resetToken) {
    const template = "password-reset";
    const subject = "Password Reset Request";

    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    const data = {
      name: `${user.first_name} ${user.last_name}`,
      resetLink,
      expiryMinutes: 60,
      supportEmail: process.env.SUPPORT_EMAIL,
    };

    return this.sendEmail({
      to: user.email,
      subject,
      template,
      data,
    });
  }

  // Security alert
  async sendSecurityAlert(user, alertType, details) {
    const template = "security-alert";
    const subject = `Security Alert: ${alertType}`;

    const data = {
      name: `${user.first_name} ${user.last_name}`,
      alertType,
      time: new Date().toLocaleString("en-GH"),
      ipAddress: details.ip,
      device: details.device,
      location: details.location,
      action: details.action,
    };

    return this.sendEmail({
      to: user.email,
      subject,
      template,
      data,
    });
  }

  // Monthly report
  async sendMonthlyReport(facility, reportData, recipients) {
    const template = "monthly-report";
    const subject = `Monthly Report - ${facility.name} - ${reportData.month}`;

    return this.sendEmail({
      to: recipients.join(","),
      subject,
      template,
      data: {
        facility: facility.name,
        month: reportData.month,
        year: reportData.year,
        stats: reportData.stats,
        financials: reportData.financials,
        clinical: reportData.clinical,
        reportLink: `${process.env.APP_URL}/reports/${reportData.id}`,
        downloadLink: `${process.env.APP_URL}/reports/${reportData.id}/download`,
      },
      attachments: reportData.attachments,
    });
  }

  // Send bulk emails with rate limiting
  async sendBulkEmails(emails, options, concurrency = 5) {
    const results = [];
    const batches = this.chunkArray(emails, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map((email) =>
        this.sendEmail({ ...options, to: email }).catch((error) => ({
          email,
          error: error.message,
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Wait between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Close transporter
  async close() {
    logger.info("Closing email transporter...");
    await this.transporter.close();
  }
}

module.exports = new EmailConfig();
