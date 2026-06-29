const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');

class PaymentService {
  constructor() {
    this.providers = new Map();
    this.initialize();
  }

  /**
   * Initialize payment service
   */
  initialize() {
    // Register payment providers
    this.registerProvider('cash', new CashPaymentProvider());
    this.registerProvider('mobile_money', new MobileMoneyPaymentProvider());
    this.registerProvider('card', new CardPaymentProvider());
    this.registerProvider('bank_transfer', new BankTransferPaymentProvider());
    this.registerProvider('cheque', new ChequePaymentProvider());

    logger.info('Payment service initialized');
  }

  /**
   * Register payment provider
   */
  registerProvider(name, provider) {
    this.providers.set(name, provider);
  }

  /**
   * Process payment
   */
  async processPayment(paymentData) {
    const {
      invoice_id,
      patient_id,
      amount,
      payment_method,
      metadata = {}
    } = paymentData;

    try {
      // Validate payment method
      const provider = this.providers.get(payment_method);
      if (!provider) {
        throw new AppError('Invalid payment method', 400, 'INVALID_PAYMENT_METHOD');
      }

      // Validate amount
      if (amount <= 0) {
        throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
      }

      // Check invoice exists and is not fully paid
      const invoice = await db.query(`
        SELECT * FROM invoices 
        WHERE id = $1 AND voided = false
      `, [invoice_id]);

      if (invoice.rows.length === 0) {
        throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
      }

      const currentInvoice = invoice.rows[0];
      const outstanding = currentInvoice.total_amount - currentInvoice.amount_paid;

      if (amount > outstanding) {
        throw new AppError('Payment amount exceeds outstanding balance', 400, 'AMOUNT_EXCEEDS_BALANCE');
      }

      // Process payment with provider
      const paymentResult = await provider.processPayment({
        amount,
        metadata,
        invoice: currentInvoice,
        patient_id
      });

      // Record payment
      const payment = await this.recordPayment({
        invoice_id,
        patient_id,
        amount,
        payment_method,
        reference: paymentResult.reference,
        provider_data: paymentResult.provider_data,
        metadata
      });

      // Send notifications
      await this.sendPaymentNotifications(payment, currentInvoice);

      logger.info('Payment processed successfully', {
        paymentId: payment.id,
        amount,
        method: payment_method
      });

      return payment;
    } catch (error) {
      logger.error('Payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Record payment in database
   */
  async recordPayment(paymentData) {
    return db.transaction(async (client) => {
      // Generate payment number
      const year = new Date().getFullYear();
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number FROM 8) AS BIGINT)), 0) + 1 as next_seq
        FROM payments
        WHERE payment_number LIKE $1
          AND LENGTH(payment_number) = 13
      `, [`PAY${year}%`]);
      
      const paymentNumber = `PAY${year}${seqResult.rows[0].next_seq.toString().padStart(6, '0')}`;

      // Create payment record
      const paymentResult = await client.query(`
        INSERT INTO payments (
          payment_number, invoice_id, patient_id, payment_date,
          payment_method, payment_reference, amount,
          provider_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
      `, [
        paymentNumber,
        paymentData.invoice_id,
        paymentData.patient_id,
        new Date(),
        paymentData.payment_method,
        paymentData.reference,
        paymentData.amount,
        JSON.stringify(paymentData.provider_data)
      ]);

      // Update invoice
      const invoice = await client.query(`
        SELECT * FROM invoices WHERE id = $1 FOR UPDATE
      `, [paymentData.invoice_id]);

      const currentInvoice = invoice.rows[0];
      const newPaid = currentInvoice.amount_paid + paymentData.amount;
      const paymentStatus = newPaid >= currentInvoice.total_amount ? 'Paid' : 'Partially Paid';

      await client.query(`
        UPDATE invoices 
        SET 
          amount_paid = $1,
          balance_due = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [
        newPaid,
        currentInvoice.total_amount - newPaid,
        paymentStatus,
        paymentData.invoice_id
      ]);

      return paymentResult.rows[0];
    });
  }

  /**
   * Send payment notifications
   */
  async sendPaymentNotifications(payment, invoice) {
    try {
      // Get patient details
      const patient = await db.query(`
        SELECT * FROM patients WHERE id = $1
      `, [payment.patient_id]);

      if (patient.rows.length === 0) return;

      const patientData = patient.rows[0];

      // Send SMS if phone number exists
      if (patientData.phone_number) {
        await notificationService.send({
          userId: patientData.id,
          type: 'payment_confirmation',
          title: 'Payment Confirmed',
          body: `Payment of GHS ${payment.amount} for invoice #${invoice.invoice_number} has been received.`,
          channels: ['sms'],
          data: { payment, invoice }
        });
      }

      // Send email if email exists
      if (patientData.email) {
        await notificationService.send({
          userId: patientData.id,
          type: 'payment_confirmation',
          title: 'Payment Confirmed',
          body: `Payment of GHS ${payment.amount} for invoice #${invoice.invoice_number} has been received.`,
          channels: ['email'],
          data: { payment, invoice }
        });
      }
    } catch (error) {
      logger.error('Failed to send payment notifications:', error);
    }
  }

  /**
   * Void payment
   */
  async voidPayment(paymentId, reason, userId) {
    return db.transaction(async (client) => {
      // Get payment
      const payment = await client.query(`
        SELECT * FROM payments 
        WHERE id = $1 AND voided = false
        FOR UPDATE
      `, [paymentId]);

      if (payment.rows.length === 0) {
        throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
      }

      // Void payment
      await client.query(`
        UPDATE payments 
        SET 
          voided = true,
          voided_by = $1,
          voided_reason = $2,
          voided_date = NOW()
        WHERE id = $3
      `, [userId, reason, paymentId]);

      // Update invoice
      await client.query(`
        UPDATE invoices 
        SET 
          amount_paid = amount_paid - $1,
          balance_due = balance_due + $1,
          payment_status = CASE 
            WHEN amount_paid - $1 <= 0 THEN 'Pending'
            WHEN amount_paid - $1 < total_amount THEN 'Partially Paid'
            ELSE payment_status
          END,
          updated_at = NOW()
        WHERE id = $2
      `, [payment.rows[0].amount, payment.rows[0].invoice_id]);

      return true;
    });
  }

  /**
   * Get payment methods
   */
  getPaymentMethods() {
    return Array.from(this.providers.entries()).map(([key, provider]) => ({
      code: key,
      name: provider.getName(),
      description: provider.getDescription(),
      enabled: provider.isEnabled()
    }));
  }

  /**
   * Generate receipt
   */
  async generateReceipt(paymentId) {
    const result = await db.query(`
      SELECT 
        p.*,
        i.invoice_number,
        i.total_amount,
        i.subtotal,
        i.discount_amount,
        i.tax_amount,
        json_build_object(
          'id', pt.id,
          'patient_number', pt.patient_number,
          'name', pt.first_name || ' ' || pt.last_name,
          'address', pt.address_line1 || ', ' || pt.city,
          'phone', pt.phone_number
        ) as patient,
        (
          SELECT json_agg(
            json_build_object(
              'item_name', ii.item_name,
              'quantity', ii.quantity,
              'unit_price', ii.unit_price,
              'total', ii.total_price
            )
          )
          FROM invoice_items ii
          WHERE ii.invoice_id = i.id
        ) as items
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN patients pt ON p.patient_id = pt.id
      WHERE p.id = $1 AND p.voided = false
    `, [paymentId]);

    if (result.rows.length === 0) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    return result.rows[0];
  }

  /**
   * Get payment statistics
   */
  async getStatistics(facilityId, startDate, endDate) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        COUNT(DISTINCT patient_id) as unique_patients,
        json_agg(
          json_build_object(
            'method', payment_method,
            'count', COUNT(*),
            'total', SUM(amount)
          )
        ) FILTER (WHERE payment_method IS NOT NULL) as by_method,
        json_agg(
          json_build_object(
            'date', DATE(payment_date),
            'total', SUM(amount)
          )
        ) FILTER (WHERE payment_date IS NOT NULL) as daily_totals
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE i.facility_id = $1
        AND p.payment_date BETWEEN $2 AND $3
        AND p.voided = false
      GROUP BY payment_method, DATE(payment_date)
    `, [facilityId, startDate, endDate]);

    return result.rows;
  }
}

/**
 * Base payment provider class
 */
class BasePaymentProvider {
  constructor() {
    this.name = 'Base Provider';
    this.description = '';
    this.enabled = true;
  }

  getName() {
    return this.name;
  }

  getDescription() {
    return this.description;
  }

  isEnabled() {
    return this.enabled;
  }

  async processPayment(data) {
    throw new Error('processPayment must be implemented by subclass');
  }

  async validatePayment(data) {
    throw new Error('validatePayment must be implemented by subclass');
  }
}

/**
 * Cash payment provider
 */
class CashPaymentProvider extends BasePaymentProvider {
  constructor() {
    super();
    this.name = 'Cash';
    this.description = 'Pay with cash at the counter';
  }

  async processPayment(data) {
    const reference = `CASH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      reference,
      provider_data: {
        received_by: data.metadata.cashier,
        received_at: new Date().toISOString()
      }
    };
  }

  async validatePayment(data) {
    return true;
  }
}

/**
 * Mobile money payment provider
 */
class MobileMoneyPaymentProvider extends BasePaymentProvider {
  constructor() {
    super();
    this.name = 'Mobile Money';
    this.description = 'Pay via MTN Mobile Money, Vodafone Cash, or AirtelTigo Money';
    this.providers = {
      MTN: 'MTN Mobile Money',
      VODAFONE: 'Vodafone Cash',
      AIRTELTIGO: 'AirtelTigo Money'
    };
  }

  async processPayment(data) {
    const { provider, phone } = data.metadata;

    if (!provider || !phone) {
      throw new AppError('Mobile money provider and phone number required', 400, 'INVALID_MOMO_DATA');
    }

    // In production, integrate with mobile money API
    const reference = `MOMO_${provider}_${Date.now()}`;

    return {
      success: true,
      reference,
      provider_data: {
        provider,
        phone,
        transaction_id: `TXN_${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePayment(data) {
    return !!(data.metadata?.provider && data.metadata?.phone);
  }
}

/**
 * Card payment provider
 */
class CardPaymentProvider extends BasePaymentProvider {
  constructor() {
    super();
    this.name = 'Card';
    this.description = 'Pay with debit or credit card';
  }

  async processPayment(data) {
    const { card_last_four, card_type } = data.metadata;

    if (!card_last_four) {
      throw new AppError('Card details required', 400, 'INVALID_CARD_DATA');
    }

    // In production, integrate with payment gateway
    const reference = `CARD_${Date.now()}`;

    return {
      success: true,
      reference,
      provider_data: {
        card_last_four,
        card_type,
        authorization_code: `AUTH_${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePayment(data) {
    return !!(data.metadata?.card_last_four);
  }
}

/**
 * Bank transfer payment provider
 */
class BankTransferPaymentProvider extends BasePaymentProvider {
  constructor() {
    super();
    this.name = 'Bank Transfer';
    this.description = 'Pay via bank transfer';
  }

  async processPayment(data) {
    const { bank_name, account_number, transaction_reference } = data.metadata;

    const reference = transaction_reference || `BT_${Date.now()}`;

    return {
      success: true,
      reference,
      provider_data: {
        bank_name,
        account_number,
        transaction_reference: reference,
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePayment(data) {
    return true;
  }
}

/**
 * Cheque payment provider
 */
class ChequePaymentProvider extends BasePaymentProvider {
  constructor() {
    super();
    this.name = 'Cheque';
    this.description = 'Pay with cheque';
  }

  async processPayment(data) {
    const { cheque_number, bank_name, drawer_name } = data.metadata;

    if (!cheque_number) {
      throw new AppError('Cheque number required', 400, 'INVALID_CHEQUE_DATA');
    }

    const reference = `CHQ_${cheque_number}`;

    return {
      success: true,
      reference,
      provider_data: {
        cheque_number,
        bank_name,
        drawer_name,
        status: 'pending_clearance',
        timestamp: new Date().toISOString()
      }
    };
  }

  async validatePayment(data) {
    return !!(data.metadata?.cheque_number);
  }
}

module.exports = new PaymentService();