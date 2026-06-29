# Hospital Management System - Services

This directory contains all service modules for the Hospital Management System. Each service handles specific business logic and integrations.

## Service Overview

### Database setup & migrations

This project uses a single `Database.sql` file to bootstrap the PostgreSQL schema. When deploying against an existing database you must run any new `ALTER TABLE` statements manually (or simply re‑apply `Database.sql`).

For example, after the 2026‑02 update the patients table now includes a `last_visit_date` column:

```sql
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS last_visit_date TIMESTAMP;
```

The dental module was recently extended to record which anaesthetist was involved in a procedure.  Existing installations will need to add that field as well:

```sql
ALTER TABLE patient_dental_procedures
ADD COLUMN IF NOT EXISTS anaesthetist_id UUID REFERENCES users(id);
```

Additionally the procedure catalog table now tracks when a record was updated.  To avoid the 42703 error shown earlier you should also add:

```sql
ALTER TABLE dental_procedures
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

The treatment‑planning feature requires a new table.  If it isn’t already present run:

```sql
CREATE TABLE IF NOT EXISTS dental_treatment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id),
    dental_chart_id UUID REFERENCES dental_charts(id),
    created_by UUID REFERENCES users(id),
    plan_date TIMESTAMP NOT NULL,
    diagnosis TEXT,
    treatment_description TEXT,
    estimated_cost DECIMAL(12,2),
    estimated_duration INTEGER,
    priority VARCHAR(50) DEFAULT 'Normal',
    status VARCHAR(50) DEFAULT 'Active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

The eye‑clinic module also now supports visual field tests; add this table if you haven’t:

```sql
CREATE TABLE IF NOT EXISTS visual_field_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id),
    eye_examination_id UUID REFERENCES eye_examinations(id) ON DELETE SET NULL,
    test_date TIMESTAMP NOT NULL,
    eye VARCHAR(10), -- Right, Left, Both
    mean_deviation DECIMAL(5,2),
    pattern_standard_deviation DECIMAL(5,2),
    visual_field_index DECIMAL(5,2),
    test_duration INTEGER,
    reliability VARCHAR(50),
    defects TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```sql
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS last_visit_date TIMESTAMP;
```

The same convention is used for enum types.  A recent release introduced an **Overdue** value
for invoice payment statuses.  If you are running against an existing database, add the new
enum value manually before redeploying:

```sql
ALTER TYPE payment_status_type ADD VALUE IF NOT EXISTS 'Overdue';
```

(The application also includes a guarded `DO` block in `Database.sql` that performs this
check automatically when bootstrapping.)

> **Note:** the application may connect with a limited‑privilege user that is not the owner
> of the table. In such cases the automatic migration guard can’t run an `ALTER TABLE` due to
> permission errors (`42501`).  The code logs a warning and continues, but the column will
> still need to be added by an administrator. Failure to do so will cause visit creations to
> skip the history update and log an undefined‑column warning (`42703`).

This column will be added automatically when the first visit is created, thanks to a guard in `src/models/Visit.js`, provided the connecting role has sufficient rights.

### Core Services

#### emailService.js
Handles all email communications using Nodemailer.
- Email templates with Handlebars
- Queue-based sending
- Retry logic
- Multiple provider support
- Tracking and logging

#### smsService.js
Manages SMS communications via configurable provider (Hubtel preferred, Twilio fallback).
- Ghana phone number formatting
- Rate limiting
- Delivery status tracking (Twilio only)
- Hubtel integration with basic auth
- Bulk messaging
- Mock mode for development

#### notificationService.js
Centralized notification management.
- Multi-channel (email, SMS, in-app)
- User preferences
- Template management
- Delivery tracking
- Priority queuing

### Integration Services

#### claimsITService.js
Integration with ClaimsIT for insurance claims.
- Claim submission
- Status tracking
- Validation
- Webhook handling
- Batch processing

#### nhisVerificationService.js
NHIS (National Health Insurance Scheme) verification.
- Real-time verification
- Eligibility checking
- Member details lookup
- History logging
- Batch verification

#### paymentService.js
Payment processing with multiple providers.
- Cash, Mobile Money, Card, Bank Transfer, Cheque
- Receipt generation
- Refund handling
- Provider abstraction
- Transaction logging

### Business Services

#### inventoryService.js
Inventory management and monitoring.
- Low stock alerts
- Expiry tracking
- Stock movements (receipt, issue, transfer)
- FIFO dispensing
- Inventory valuation

#### reportService.js
Report generation and export.
- Multiple report types
- Excel and PDF export
- Scheduled reports
- Custom report builder
- Data aggregation

### Infrastructure Services

#### queueService.js
Job queue management using Bull.
- Multiple queues (email, sms, notifications, reports, claims, backup)
- Retry with backoff
- Job prioritization
- Queue monitoring
- Distributed processing

#### backupService.js
Database backup and restore.
- Scheduled backups
- Multiple backup types (full, schema, data)
- Compression
- Retention policy
- Restore verification

## Usage Examples

### Sending an Email
```javascript
const { emailService } = require('./services');

await emailService.sendEmail({
  to: 'patient@example.com',
  subject: 'Appointment Reminder',
  template: 'appointment-reminder',
  data: {
    patientName: 'John Doe',
    appointmentDate: '2024-02-20',
    doctorName: 'Dr. Smith'
  }
});