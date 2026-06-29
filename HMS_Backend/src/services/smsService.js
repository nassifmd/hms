const twilio = require('twilio');
const axios = require('axios');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');

// SMSService supports multiple providers (Hubtel preferred, Twilio fallback).
// It performs Ghana number normalization, rate limiting, history logging,
// and exposes convenience methods for common hospital notifications.
class SMSService {
  constructor() {
    this.client = null;
    this.fromNumber = null;
    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Initialize SMS service
   */
  initialize() {
    try {
      // pick provider from environment
      if (
        process.env.HUBTEL_SMS_CLIENT_ID &&
        process.env.HUBTEL_SMS_CLIENT_SECRET
      ) {
        this.provider = 'hubtel';
        this.fromNumber = process.env.HUBTEL_SMS_FROM || 'HMS';
        logger.info('SMS service initialized with Hubtel');
      } else if (
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN
      ) {
        this.provider = 'twilio';
        this.client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        logger.info('SMS service initialized with Twilio');
      } else {
        logger.warn('SMS service running in mock mode (no SMS provider configured)');
      }

      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
      throw new AppError('SMS service initialization failed', 500, 'SMS_INIT_ERROR');
    }
  }

  /**
   * Format phone number to Ghana format
   */
  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Ghana number formats
    if (cleaned.length === 9 && ['2', '5'].includes(cleaned[0])) {
      // 24XXXXXXX -> 23324XXXXXXX
      cleaned = '233' + cleaned;
    } else if (cleaned.length === 10 && cleaned.startsWith('0')) {
      // 024XXXXXXX -> 23324XXXXXXX
      cleaned = '233' + cleaned.substring(1);
    } else if (cleaned.length === 12 && cleaned.startsWith('233')) {
      // Already in correct format
    } else if (cleaned.length === 13 && cleaned.startsWith('233')) {
      // With plus
      cleaned = cleaned.substring(1);
    } else {
      // Assume it's a local number, add 233 prefix
      cleaned = '233' + cleaned;
    }

    // Ensure it starts with 233
    if (!cleaned.startsWith('233')) {
      cleaned = '233' + cleaned;
    }

    return '+' + cleaned;
  }

  /**
   * Delivery via Hubtel API
   */
  async sendViaHubtel(formattedNumber, message, options = {}) {
    const toNumber = formattedNumber.replace(/^\+/, '');

    const payload = {
      From: this.fromNumber || 'HMS',
      To: toNumber,
      Content: message,
      ...options
    };

    const auth = Buffer.from(
      `${process.env.HUBTEL_SMS_CLIENT_ID}:${process.env.HUBTEL_SMS_CLIENT_SECRET}`
    ).toString('base64');

    const resp = await axios.post(
      'https://sms.hubtel.com/v1/messages/send',
      payload,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      provider: 'hubtel',
      messageId: resp.data && resp.data.MessageId,
      raw: resp.data
    };
  }

  /**
   * Send SMS
   */
  async sendSMS(to, message, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new AppError('SMS service not initialized', 503, 'SMS_NOT_READY');
      }

      const formattedNumber = this.formatPhoneNumber(to);

      // Check rate limiting
      const rateKey = `sms:rate:${formattedNumber}`;
      const sentCount = await redis.incr(rateKey);
      if (sentCount === 1) {
        await redis.expire(rateKey, 3600); // 1 hour window
      }
      
      if (sentCount > 10) {
        throw new AppError('SMS rate limit exceeded', 429, 'SMS_RATE_LIMIT');
      }

      // Log SMS attempt
      logger.info('Sending SMS', {
        to: formattedNumber,
        messageLength: message.length,
        options
      });

      let result;

      if (this.provider === 'hubtel') {
        result = await this.sendViaHubtel(formattedNumber, message, options);
      } else if (this.provider === 'twilio' && this.client) {
        const twilioResult = await this.client.messages.create({
          body: message,
          from: this.fromNumber,
          to: formattedNumber,
          ...options
        });

        result = {
          success: true,
          provider: 'twilio',
          messageId: twilioResult.sid,
          status: twilioResult.status
        };
      } else {
        // Mock mode for development
        logger.debug('MOCK SMS:', { to: formattedNumber, message });
        result = {
          success: true,
          provider: 'mock',
          messageId: `mock_${Date.now()}`,
          status: 'sent'
        };
      }

      // Store in history
      await this.saveToHistory(formattedNumber, message, result);

      return result;
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw new AppError('Failed to send SMS', 500, 'SMS_SEND_FAILED');
    }
  }

  /**
   * Send SMS with retry logic
   */
  async sendWithRetry(to, message, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendSMS(to, message, options);
      } catch (error) {
        lastError = error;
        logger.warn(`SMS attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(patient, appointment, doctor) {
    const message = `Reminder: You have an appointment with Dr. ${doctor.last_name} on ${new Date(appointment.appointment_date).toLocaleDateString('en-GH')} at ${appointment.start_time}. Reply 1 to confirm, 2 to reschedule.`;

    return this.sendSMS(patient.phone_number, message, {
      statusCallback: `${process.env.API_URL}/webhooks/sms/status`
    });
  }

  /**
   * Send lab result notification
   */
  async sendLabResultNotification(patient, labOrder) {
    const message = `Your lab results for order #${labOrder.order_number} are ready. Please log in to your patient portal to view them or visit the hospital.`;

    return this.sendSMS(patient.phone_number, message);
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(patient, payment, invoice) {
    const message = `Payment confirmed: GHS ${payment.amount} received for invoice #${invoice.invoice_number}. Thank you for choosing our hospital.`;

    return this.sendSMS(patient.phone_number, message);
  }

  /**
   * Send prescription ready notification
   */
  async sendPrescriptionReady(patient, prescription) {
    const message = `Your prescription #${prescription.prescription_number} is ready for pickup at the pharmacy. Please bring your prescription ID.`;

    return this.sendSMS(patient.phone_number, message);
  }

  /**
   * Send OTP
   */
  async sendOTP(phone, otp, purpose = 'verification') {
    const message = `Your verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;

    return this.sendSMS(phone, message);
  }

  /**
   * Send emergency alert
   */
  async sendEmergencyAlert(emergencyTeam, patientInfo, location) {
    const message = `EMERGENCY: Patient ${patientInfo.name} (${patientInfo.patient_number}) requires immediate assistance at ${location}. Please respond immediately.`;

    const results = [];
    for (const contact of emergencyTeam) {
      try {
        const result = await this.sendSMS(contact.phone, message);
        results.push(result);
      } catch (error) {
        logger.error('Failed to send emergency alert', {
          contact: contact.phone,
          error: error.message
        });
      }
    }
    return results;
  }

  /**
   * Send bulk SMS
   */
  async sendBulkSMS(recipients, message, options = {}) {
    const results = [];
const batchSize = 50; // conservative batch size for any provider

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const batchPromises = batch.map(recipient =>
        this.sendSMS(recipient.phone, message, options)
          .then(result => ({ ...recipient, success: true, result }))
          .catch(error => ({ ...recipient, success: false, error: error.message }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value));

      // Wait between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Save SMS to history
   */
  async saveToHistory(phone, message, result) {
    try {
      const key = `sms:history:${phone}`;
      const entry = {
        timestamp: new Date().toISOString(),
        phone,
        message: message.substring(0, 100), // Truncate for storage
        result,
        ttl: 30 * 24 * 60 * 60 // 30 days
      };

      await redis.lpush(key, entry);
      await redis.ltrim(key, 0, 99); // Keep last 100 messages
    } catch (error) {
      logger.error('Failed to save SMS history:', error);
    }
  }

  /**
   * Get SMS history
   */
  async getHistory(phone, limit = 50) {
    const key = `sms:history:${phone}`;
    const history = await redis.lrange(key, 0, limit - 1);
    return history;
  }

  /**
   * Check message status
   */
  async getMessageStatus(messageId) {
    if (this.provider === 'hubtel') {
      return { status: 'unknown', messageId, provider: 'hubtel' };
    }

    if (!this.client) {
      return { status: 'mock', messageId };
    }

    try {
      const message = await this.client.messages(messageId).fetch();
      return {
        messageId: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateSent: message.dateSent,
        dateCreated: message.dateCreated
      };
    } catch (error) {
      logger.error('Failed to get message status:', error);
      throw new AppError('Failed to get message status', 500, 'SMS_STATUS_FAILED');
    }
  }

  /**
   * Handle incoming SMS webhook
   */
  async handleIncomingSMS(req) {
    const {
      From: from,
      Body: body,
      MessageSid: messageSid,
      To: to
    } = req.body;

    logger.info('Incoming SMS received', {
      from,
      to,
      messageSid,
      body: body.substring(0, 50)
    });

    // Parse response for appointment confirmation
    if (body.match(/^[123]$/)) {
      return this.handleAppointmentResponse(from, body);
    }

    return {
      success: true,
      message: 'SMS received'
    };
  }

  /**
   * Handle appointment response
   */
  async handleAppointmentResponse(phone, response) {
    // This would integrate with the appointment service
    let reply;
    switch (response) {
      case '1':
        reply = 'Your appointment has been confirmed. Thank you.';
        break;
      case '2':
        reply = 'Please call the hospital to reschedule your appointment.';
        break;
      case '3':
        reply = 'Your appointment has been cancelled. Please call to reschedule if needed.';
        break;
      default:
        reply = 'Invalid response. Please reply 1 to confirm, 2 to reschedule, or 3 to cancel.';
    }

    // Send response
    await this.sendSMS(phone, reply);

    return {
      success: true,
      response
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      provider: this.provider || (this.client ? 'twilio' : 'mock'),
      fromNumber: this.fromNumber
    };
  }
}

module.exports = new SMSService();