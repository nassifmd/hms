const twilio = require("twilio");
const axios = require("axios");
const logger = require("./logger");

class SMSConfig {
  constructor() {
    this.client = null;
    this.initialize();
  }

  initialize() {
    try {
      // pick provider based on environment variables
      if (
        process.env.HUBTEL_SMS_CLIENT_ID &&
        process.env.HUBTEL_SMS_CLIENT_SECRET
      ) {
        this.provider = "hubtel";
        this.fromNumber = process.env.HUBTEL_SMS_FROM || "HMS";
        logger.info("SMS service initialized with Hubtel");
      } else if (
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN
      ) {
        this.provider = "twilio";
        this.client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        logger.info("SMS service initialized with Twilio");
      } else {
        // no provider configured -> mock mode
        this.provider = "mock";
        logger.warn("SMS service running in mock mode (no credentials)");
      }
    } catch (error) {
      logger.error("Failed to initialize SMS service:", error);
    }
  }

  async sendSMS(to, message, options = {}) {
    try {
      // Format phone number (Ghana format)
      const formattedNumber = this.formatPhoneNumber(to);

      let result;

      if (this.provider === "hubtel") {
        result = await this.sendViaHubtel(formattedNumber, message, options);
      } else if (this.provider === "twilio") {
        const messageOptions = {
          body: message,
          from: this.fromNumber,
          to: formattedNumber,
          ...options,
        };

        const twilioResult = await this.client.messages.create(messageOptions);
        logger.info("SMS sent successfully", {
          to: formattedNumber,
          sid: twilioResult.sid,
          status: twilioResult.status,
        });
        result = {
          success: true,
          sid: twilioResult.sid,
          status: twilioResult.status,
          provider: "twilio",
        };
      } else {
        // mock
        logger.debug("MOCK SMS:", { to: formattedNumber, message });
        result = {
          success: true,
          sid: `mock_${Date.now()}`,
          status: "sent",
          provider: "mock",
        };
      }

      return result;
    } catch (error) {
      logger.error("Failed to send SMS", {
        to,
        error: error.message,
      });

      throw error;
    }
  }

  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, "");

    // Ghana numbers: 024XXXXXXX -> +23324XXXXXXX
    if (cleaned.length === 9 && cleaned.startsWith("24")) {
      cleaned = "233" + cleaned;
    } else if (cleaned.length === 10 && cleaned.startsWith("0")) {
      cleaned = "233" + cleaned.substring(1);
    } else if (cleaned.length === 12 && cleaned.startsWith("233")) {
      // Already in correct format
    } else if (cleaned.length === 13 && cleaned.startsWith("+233")) {
      cleaned = cleaned.substring(1);
    }

    // Ensure it starts with 233
    if (!cleaned.startsWith("233")) {
      cleaned = "233" + cleaned;
    }

    return "+" + cleaned;
  }

  // Delivery via Hubtel helper

  async sendViaHubtel(formattedNumber, message, options = {}) {
    // Hubtel expects numbers without the leading '+'
    const toNumber = formattedNumber.replace(/^\+/, "");

    const payload = {
      From: this.fromNumber || "HMS",
      To: toNumber,
      Content: message,
      ...options,
    };

    const auth = Buffer.from(
      `${process.env.HUBTEL_SMS_CLIENT_ID}:${process.env.HUBTEL_SMS_CLIENT_SECRET}`
    ).toString("base64");

    const resp = await axios.post(
      "https://sms.hubtel.com/v1/messages/send",
      payload,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      provider: "hubtel",
      messageId: resp.data && resp.data.MessageId,
      raw: resp.data,
    };
  }
  async sendAppointmentReminder(patient, appointment) {
    const message = `Reminder: You have an appointment with Dr. ${appointment.doctor_name} on ${appointment.appointment_date} at ${appointment.start_time}. Reply 1 to confirm, 2 to reschedule, or 3 to cancel.`;

    return this.sendSMS(patient.phone_number, message, {
      statusCallback: `${process.env.API_URL}/webhooks/sms/status`,
    });
  }

  // Lab result notification
  async sendLabResultNotification(patient, labOrder) {
    const message = `Your lab results for ${labOrder.order_number} are ready. Please log in to your patient portal to view them or visit the hospital.`;

    return this.sendSMS(patient.phone_number, message);
  }

  // Payment confirmation
  async sendPaymentConfirmation(patient, payment) {
    const message = `Payment confirmed: GHS ${payment.amount} received for invoice #${payment.invoice_number}. Thank you for choosing our hospital.`;

    return this.sendSMS(patient.phone_number, message);
  }

  // Prescription ready
  async sendPrescriptionReady(patient, prescription) {
    const message = `Your prescription #${prescription.prescription_number} is ready for pickup at the pharmacy. Please bring your prescription ID.`;

    return this.sendSMS(patient.phone_number, message);
  }

  // OTP for verification
  async sendOTP(phone, otp, purpose) {
    const message = `Your verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;

    return this.sendSMS(phone, message);
  }

  // Emergency alert
  async sendEmergencyAlert(emergencyTeam, patientInfo, location) {
    const message = `EMERGENCY: Patient ${patientInfo.name} (${patientInfo.patient_number}) requires immediate assistance at ${location}. Please respond immediately.`;

    const results = [];
    for (const contact of emergencyTeam) {
      try {
        const result = await this.sendSMS(contact.phone, message);
        results.push(result);
      } catch (error) {
        logger.error("Failed to send emergency alert", {
          contact: contact.phone,
          error: error.message,
        });
      }
    }
    return results;
  }

  // Bulk SMS for notifications
  async sendBulkSMS(recipients, message, options = {}) {
    const results = [];
    const batchSize = 50; // Twilio rate limit

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchPromises = batch.map((recipient) =>
        this.sendSMS(recipient.phone, message, options).catch((error) => ({
          phone: recipient.phone,
          error: error.message,
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Wait 1 second between batches
      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // Check message status
  async getMessageStatus(sid) {
    if (this.provider === "hubtel") {
      // Hubtel does not provide a simple fetch by id; return placeholder
      return {
        messageId: sid,
        status: "unknown",
        provider: "hubtel",
      };
    }

    try {
      const message = await this.client.messages(sid).fetch();

      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateSent: message.dateSent,
      };
    } catch (error) {
      logger.error("Failed to get message status", {
        sid,
        error: error.message,
      });
      throw error;
    }
  }

  // Get account balance (only Twilio for now)
  async getAccountBalance() {
    if (this.provider !== "twilio") {
      return { balance: null, currency: null, provider: this.provider };
    }

    try {
      const balance = await this.client.api
        .accounts(process.env.TWILIO_ACCOUNT_SID)
        .balance()
        .fetch();

      return {
        balance: balance.balance,
        currency: balance.currency,
      };
    } catch (error) {
      logger.error("Failed to get account balance:", error);
      throw error;
    }
  }

  // Handle SMS webhook
  handleIncomingSMS(req) {
    const { From: from, Body: body, MessageSid: messageSid, To: to } = req.body;

    logger.info("Incoming SMS received", {
      from,
      to,
      messageSid,
      body: body.substring(0, 50),
    });

    // Parse response for appointment confirmation
    if (body.match(/^[123]$/)) {
      return this.handleAppointmentResponse(from, body);
    }

    return {
      success: true,
      message: "SMS received",
    };
  }

  async handleAppointmentResponse(phone, response) {
    // Logic to handle appointment confirmation/cancellation
    const patient = await this.findPatientByPhone(phone);

    if (!patient) {
      return this.sendSMS(
        phone,
        "Sorry, we could not find your record. Please contact the hospital directly."
      );
    }

    let reply;
    switch (response) {
      case "1":
        reply = "Your appointment has been confirmed. Thank you.";
        break;
      case "2":
        reply = "Please call the hospital to reschedule your appointment.";
        break;
      case "3":
        reply =
          "Your appointment has been cancelled. Please call to reschedule if needed.";
        break;
      default:
        reply =
          "Invalid response. Please reply 1 to confirm, 2 to reschedule, or 3 to cancel.";
    }

    return this.sendSMS(phone, reply);
  }

  async findPatientByPhone(phone) {
    // Database lookup would go here
    return null;
  }
}

module.exports = new SMSConfig();
