# HMS – Hospital Management System
## Product Architecture & Schema Reference

> **Version:** 2.0 · **Database:** PostgreSQL 14+ · **Regulatory:** GHS / DHIMS-2 / IDSR / NHIA claimsIT v3.4

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Application Architecture](#3-application-architecture)
4. [Module Map](#4-module-map)
5. [Database Domain Map](#5-database-domain-map)
6. [Entity–Relationship Summary](#6-entityrelationship-summary)
7. [ENUM Types Reference](#7-enum-types-reference)
8. [Role & Permission Model](#8-role--permission-model)
9. [API Route Structure](#9-api-route-structure)
10. [Frontend Page Structure](#10-frontend-page-structure)
11. [License System](#11-license-system)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [Database File Execution Order](#13-database-file-execution-order)

---

## 1. System Overview

HMS is a full-stack web application for Ghanaian district hospitals and clinics.  It handles the complete patient journey — from registration and triage, through clinical consultation, diagnostics, dispensing, and billing — with optional paid modules for Dental and Eye clinics.

**Key characteristics:**

| Characteristic        | Detail                                                    |
|-----------------------|-----------------------------------------------------------|
| Regulatory compliance | GHS, DHIMS-2, IDSR, NHIA claimsIT v3.4                   |
| Multi-tenancy         | Per-facility + per-branch data isolation                  |
| Paid modules          | Dental, Eye, extended Lab, Insurance (runtime toggle)     |
| Authentication        | JWT + refresh tokens, account lockout, optional 2FA       |
| Authorisation         | Database-driven RBAC (roles → permissions, per-facility)  |
| Real-time             | Socket.io for live dashboard updates                      |
| Background jobs       | Cron: appointment reminders, backups, inventory alerts    |
| Exports               | PDF (PDFKit), Excel (ExcelJS), CSV                        |
| Storage               | Local disk + Sharp image processing                       |

---

## 2. Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│  HMS_Frontend          React 18 · TypeScript · Vite         │
│                        Tailwind CSS · Axios · Socket.io      │
├─────────────────────────────────────────────────────────────┤
│  HMS_Backend           Node.js 18 · Express 5               │
│                        node-postgres (pg) · Socket.io        │
│                        PDFKit · ExcelJS · Sharp · node-cron  │
├─────────────────────────────────────────────────────────────┤
│  Database              PostgreSQL 14+                        │
│                        uuid-ossp · pgcrypto                  │
├─────────────────────────────────────────────────────────────┤
│  Cache / Pub-Sub       Built-in in-memory Redis shim         │
│                        (no external Redis required)          │
├─────────────────────────────────────────────────────────────┤
│  license_generator     Node.js CLI (offline, HMAC-based)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Application Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                             │
│   HMS_Frontend  –  React 18 / TypeScript / Vite / Tailwind       │
│                                                                  │
│   AuthContext  ──►  JWT stored in httpOnly cookie                │
│   ModulesContext ──►  enabled paid modules per facility          │
│   Pages → Components → lib/api (Axios) → REST API               │
└─────────────────────┬────────────────────────────────────────────┘
                      │  HTTPS  (REST + Socket.io)
┌─────────────────────▼────────────────────────────────────────────┐
│                     HMS_Backend  (Node.js / Express)             │
│                                                                  │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ authRoutes│  │ v1 routes│  │ WebSocket│  │  Cron jobs    │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│        │              │             │                │            │
│  ┌─────▼──────────────▼─────────────▼────────────────▼────────┐ │
│  │                 Middleware Layer                             │ │
│  │  Auth (JWT) · RBAC · Module-gate · Audit · Validation       │ │
│  └──────────────────────────┬───────────────────────────────── ┘ │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────── ┐ │
│  │                  Controllers / Services                      │ │
│  │  patient · appointment · clinical · billing · pharmacy      │ │
│  │  lab · dental · eye · insurance · inventory · reports       │ │
│  └──────────────────────────┬───────────────────────────────── ┘ │
└─────────────────────────────│────────────────────────────────────┘
                              │  pg (node-postgres)
┌─────────────────────────────▼────────────────────────────────────┐
│                       PostgreSQL 14+                             │
│   Extensions: uuid-ossp · pgcrypto                               │
│   Schemas:    public (all tables)                                │
│   Triggers:   updated_at · patient_number · BMI · stock alerts   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Map

### Core Modules (always active)

| Module                | Key Tables                                                       | Routes prefix          |
|-----------------------|------------------------------------------------------------------|------------------------|
| **Authentication**    | `users`, `roles`, `permissions`, `role_permissions`              | `/api/v1/auth`         |
| **Patient Registry**  | `patients`, `patient_next_of_kin`, `patient_allergies`           | `/api/v1/patients`     |
| **OPD / Visits**      | `visits`, `appointments`, `patient_vitals`, `diagnoses`          | `/api/v1/appointments` |
| **Clinical**          | `diagnoses`, `procedures`, `patient_procedures`, `prescriptions` | `/api/v1/clinical`     |
| **Laboratory**        | `lab_tests`, `lab_panels`, `lab_orders`, `lab_order_items`       | `/api/v1/lab`          |
| **Pharmacy**          | `drugs`, `drug_inventory`, `drug_dispensing`, `dispensing_items` | `/api/v1/pharmacy`     |
| **Billing**           | `invoices`, `invoice_items`, `payments`, `price_lists`           | `/api/v1/billing`      |
| **Insurance**         | `insurance_claims`, `claim_items`, `nhis_verification_logs`      | `/api/v1/insurance`    |
| **Inventory**         | `inventory_items`, `inventory_batches`, `stock_movements`        | `/api/v1/inventory`    |
| **Branches**          | `facility_branches`, `departments`                               | `/api/v1/branches`     |
| **Users / Admin**     | `users`, `user_roles`, `audit_logs`, `system_settings`           | `/api/v1/admin`        |
| **Reports**           | `report_schedules`, `generated_reports`                          | `/api/v1/reports`      |
| **Dashboard**         | Aggregation queries across core tables                           | `/api/v1/dashboard`    |

### Paid / Licensed Modules (feature-flagged per `module_subscriptions`)

| Module         | `module_code` | Key Tables                                                                | Routes prefix    |
|----------------|---------------|---------------------------------------------------------------------------|------------------|
| **Dental**     | `DENTAL`      | `dental_charts`, `dental_teeth`, `dental_procedures`, `dental_bpe_examinations`, `dental_treatment_plans`, `dental_imaging_requests` | `/api/v1/dental` |
| **Eye Clinic** | `EYE`         | `eye_examinations`, `visual_field_tests`, `glasses_prescriptions`, `optical_inventory` | `/api/v1/eye`    |

---

## 5. Database Domain Map

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE DOMAIN                                    │
│  facilities  ──►  facility_branches  ──►  departments                        │
│                         │                                                    │
│                    system_settings                                           │
│                    module_subscriptions                                      │
│                    module_usage_logs                                         │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     USER & ACCESS DOMAIN                                     │
│  users  ──┬──►  user_roles  ──►  roles  ──►  role_permissions  ──►  permissions │
│           └──►  audit_logs                                                   │
│                 system_logs                                                  │
│                 notification_preferences                                     │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     PATIENT DOMAIN                                           │
│  patients  ──┬──►  patient_next_of_kin                                       │
│              ├──►  patient_insurance                                         │
│              ├──►  patient_allergies                                         │
│              └──►  patient_vitals                                            │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     VISIT & APPOINTMENT DOMAIN                               │
│  visits  ──┬──►  diagnoses  ──►  diagnosis_catalogue                         │
│            ├──►  patient_procedures  ──►  procedures                         │
│            ├──►  prescriptions  ──►  prescription_items                      │
│            ├──►  lab_orders  ──►  lab_order_items  ──►  lab_tests            │
│            ├──►  patient_vitals                                              │
│            ├──►  dental_charts  (DENTAL module)                              │
│            └──►  eye_examinations  (EYE module)                              │
│                                                                              │
│  appointments  ──►  appointment_reminders                                    │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     PHARMACY & INVENTORY DOMAIN                              │
│  drugs  ──►  drug_inventory  ──►  drug_dispensing  ──►  dispensing_items     │
│                                                                              │
│  suppliers  ──►  purchase_orders  ──►  purchase_order_items                  │
│  inventory_items  ──►  inventory_batches  ──►  stock_movements               │
│                        inventory_transfers                                   │
│  stock_take_logs                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     BILLING & FINANCE DOMAIN                                 │
│  price_lists  ──►  service_prices                                            │
│  invoices  ──►  invoice_items  ──►  payments                                 │
│  insurance_claims  ──►  claim_items  ──►  claim_status_history               │
│  nhis_verification_logs                                                      │
│  patient_complaints                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     DENTAL DOMAIN  (PAID)                                    │
│  dental_charts  ──┬──►  dental_teeth                                         │
│                   ├──►  patient_dental_procedures  ──►  dental_procedures    │
│                   │      ├──►  dental_imaging_requests                       │
│                   │      └──►  dental_procedure_attachments                  │
│                   ├──►  dental_treatment_plans                               │
│                   └──►  dental_bpe_examinations                              │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     EYE CLINIC DOMAIN  (PAID)                                │
│  eye_examinations  ──┬──►  visual_field_tests                                │
│                      ├──►  glasses_prescriptions                             │
│                      └──►  optical_inventory                                 │
└──────────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────────────┐
│                     REPORTING & SYSTEM DOMAIN                                │
│  report_schedules  ──►  generated_reports                                    │
│  job_executions                                                              │
│  notifications  ·  in_app_notifications  ·  notification_templates           │
│  backup_history  ·  restore_history                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Entity–Relationship Summary

### Infrastructure

```
facilities (1) ──< facility_branches (N)  [branch of a facility]
facilities (1) ──< departments (N)        [dept belongs to facility]
facility_branches (1) ──< departments (N) [dept scoped to branch]
```

### Users & Roles

```
users (N) >──< roles (M)           via user_roles
roles (N) >──< permissions (M)     via role_permissions
users (1) ──< audit_logs (N)
```

### Patients

```
patients (1) ──< patient_next_of_kin (N)
patients (1) ──< patient_insurance (N)
patients (1) ──< patient_allergies (N)
patients (1) ──< patient_vitals (N)
patients (1) ──< visits (N)
patients (1) ──< appointments (N)
```

### Clinical Workflow

```
visits (1) ──< diagnoses (N)
visits (1) ──< patient_procedures (N)
visits (1) ──< prescriptions (N) ──< prescription_items (N)
visits (1) ──< lab_orders (N)    ──< lab_order_items (N)
visits (1) ──< patient_vitals (N)
visits (1) ──< dental_charts (1)
visits (1) ──< eye_examinations (1)
```

### Billing

```
visits (1) ──< invoices (N) ──< invoice_items (N)
invoices (1) ──< payments (N)
invoices (1) ──< insurance_claims (N) ──< claim_items (N)
```

### Pharmacy

```
drugs (1) ──< drug_inventory (N)       [batches by facility]
prescriptions (1) ──< drug_dispensing (N) ──< dispensing_items (N)
dispensing_items (N) >── drug_inventory (N)
```

### Inventory

```
suppliers (1) ──< purchase_orders (N) ──< purchase_order_items (N)
inventory_items (1) ──< inventory_batches (N)
inventory_batches (1) ──< stock_movements (N)
inventory_batches (1) ──< inventory_transfers (N)
```

---

## 7. ENUM Types Reference

| Type                      | Values                                                                                     |
|---------------------------|--------------------------------------------------------------------------------------------|
| `gender_type`             | `Male`, `Female`, `Other`                                                                  |
| `blood_group_type`        | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`                                          |
| `marital_status_type`     | `Single`, `Married`, `Divorced`, `Widowed`, `Separated`                                    |
| `patient_status_type`     | `Active`, `Inactive`, `Deceased`, `Transferred`                                            |
| `appointment_status_type` | `Scheduled`, `Confirmed`, `In Progress`, `Completed`, `Cancelled`, `No Show`, `Rescheduled`|
| `payment_status_type`     | `Pending`, `Partially Paid`, `Overdue`, `Paid`, `Refunded`, `Cancelled`                    |
| `claim_status_type`       | `Draft`, `Validated`, `Submitted`, `Accepted`, `Rejected`, `Paid`, `Partially Paid`, `Failed` |
| `visit_type`              | `Outpatient`, `Inpatient`, `Emergency`, `Review`, `Consultation`                           |
| `user_status_type`        | `Active`, `Inactive`, `Suspended`, `Locked`                                                |
| `branch_status_type`      | `Active`, `Inactive`, `Under Construction`, `Suspended`                                    |

---

## 8. Role & Permission Model

### Roles

| Role Code        | Category       | Description                                        |
|------------------|----------------|----------------------------------------------------|
| `SUPER_ADMIN`    | Administrative | Facility-level super admin; manages all branches   |
| `SYS_ADMIN`      | Administrative | Full system access and configuration               |
| `MED_SUPT`       | Clinical       | Medical superintendent — clinical governance       |
| `RECORDS`        | Administrative | Patient registration and records management        |
| `RECEPTION`      | Administrative | Front desk and appointment management              |
| `NURSE`          | Clinical       | Triage and nursing care                            |
| `DOCTOR`         | Clinical       | Medical consultation and treatment                 |
| `DENTIST`        | Clinical       | Dental consultation and procedures                 |
| `DENTAL_TECH`    | Technical      | Dental laboratory work                             |
| `OPTOMETRIST`    | Clinical       | Eye examinations and refraction                    |
| `OPHTHALMOLOGIST`| Clinical       | Eye surgeries and medical treatment                |
| `TECHNICIAN`     | Technical      | Technical support and equipment                    |
| `PHARMACIST`     | Pharmacy       | Pharmacy and dispensing                            |
| `LAB_TECH`       | Laboratory     | Lab tests and results                              |
| `ACCOUNTS`       | Finance        | Financial management                               |
| `CASHIER`        | Finance        | Payment collection                                 |
| `DISTRICT_HD`    | Administrative | Regional oversight                                 |
| `MED_OFFICER`    | Clinical       | General medical practice                           |
| `DENTAL_SURGEON` | Clinical       | Advanced dental procedures                         |
| `REGISTRAR`      | Administrative | Records management                                 |
| `INVENTORY`      | Administrative | Inventory and stock management                     |
| `INSURANCE`      | Administrative | Insurance claims and authorisations                |

### Key Permissions

| Area             | Codes                                                                      |
|------------------|----------------------------------------------------------------------------|
| Branches         | `MANAGE_BRANCHES`, `VIEW_ALL_BRANCHES`, `ASSIGN_BRANCH_USERS`              |
| Departments      | `MANAGE_DEPARTMENTS`                                                       |
| Roles / Users    | `MANAGE_ROLES`, `CREATE_USER`, `UPDATE_USER`, `DELETE_USER`, `BULK_IMPORT` |
| Audit / Logs     | `VIEW_AUDIT_LOGS`, `VIEW_SYSTEM_LOGS`                                      |
| System           | `MANAGE_BACKUPS`, `VIEW_BACKUPS`, `MANAGE_SYSTEM`                          |
| Paid — Dental    | `MODULE_DENTAL_ACCESS`, `MODULE_DENTAL_PROCEDURES`                         |
| Paid — Eye       | `MODULE_EYE_ACCESS`, `MODULE_EYE_EXAM`, `MODULE_EYE_SURGERY`               |
| Paid — Insurance | `MODULE_CLAIMS_IT`                                                         |
| Paid — Reports   | `MODULE_ADV_REPORTING`                                                     |

---

## 9. API Route Structure

All routes are versioned under `/api/v1/`.

```
/api/v1/
├── auth/               POST login · POST logout · POST refresh · POST forgot-password
├── patients/           CRUD patients · next-of-kin · insurance · vitals · allergies
├── appointments/       CRUD appointments · check-in/out · reminders
├── clinical/           diagnoses · procedures · prescriptions · vitals
├── lab/                test catalogue · panels · orders · results
├── pharmacy/           drug catalogue · inventory · dispensing · GRN
├── billing/            invoices · payments · price lists · receipt print
├── insurance/          claims (ClaimsIT) · NHIS verification · claim history
├── inventory/          items · batches · POs · stock-take · transfers
├── dental/             charts · teeth · procedures · BPE · treatment plans   [PAID]
├── eye/                examinations · field tests · glasses Rx · optical inv  [PAID]
├── branches/           CRUD branches
├── reports/            OPD · admissions · finance · DHIMS-2 · IDSR · custom
├── dashboard/          KPI summary · module stats
├── admin/              users · roles · permissions · system settings · backups · audit
└── modules/            active modules per facility (module-gate check)
```

---

## 10. Frontend Page Structure

```
src/pages/
├── auth/               Login · ForgotPassword · ResetPassword
├── dashboard/          Dashboard (facility KPIs)
├── patients/           PatientList · PatientRegister · PatientDetail · PatientEdit
├── appointments/       AppointmentList · AppointmentBook · AppointmentDetail
├── clinical/           ClinicalWorkflow · DiagnosisEntry · ProcedureEntry
├── lab/                LabOrders · LabResults · LabCatalogue
├── pharmacy/           DrugCatalogue · Dispensing · StockManagement · GRN
├── billing/            InvoiceList · InvoiceCreate · PaymentCapture · PriceList
├── insurance/          ClaimsList · ClaimCreate · NHISVerification
├── inventory/          ItemCatalogue · Batches · PurchaseOrders · StockTake
├── dental/             DentalChartViewer · DentalProcedures · BPEForm        [PAID]
├── eye/                EyeExamForm · GlassesPrescription · OpticalInventory  [PAID]
├── branches/           BranchList · BranchDetail
├── reports/            ReportList · ReportViewer · Scheduler
├── admin/              UserManagement · RoleManagement · SystemSettings · AuditLogs
└── errors/             404 · 403 · 500
```

---

## 11. License System

The `license_generator/` tool is an offline Node.js CLI that generates and verifies HMAC-signed license keys for paid modules.

### Key Structure

```
<base64url(JSON payload)>.<HMAC-SHA256 signature>
```

### Payload Fields

| Field | Description                                           |
|-------|-------------------------------------------------------|
| `mod` | Module code (`DENTAL`, `EYE`, `LAB`, `PHARMACY`, …)  |
| `lid` | Unique license ID (UUID)                              |
| `fid` | Facility UUID, or `*` for any facility (wildcard)     |
| `iss` | Unix timestamp — issue date                           |
| `exp` | Unix timestamp — expiry date                          |

### Commands

```bash
# Generate a new license key (interactive prompts)
LICENSE_SECRET=<secret> node index.js generate

# Verify an existing key
LICENSE_SECRET=<secret> node index.js verify <key>
```

### Verification Flow (Backend)

```
Request arrives → middleware extracts facility_id + module_code
  → checks module_subscriptions table for active subscription
  → if not found, checks license key header
  → validates HMAC signature + expiry + facility match
  → grants or denies module access
```

---

## 12. Data Flow Diagrams

### Patient Visit Workflow

```
Reception           Nurse              Doctor              Billing
    │                 │                  │                    │
    ▼                 │                  │                    │
Register / Check-in   │                  │                    │
    │─────────────────►                  │                    │
    │              Triage                │                    │
    │              Vitals                │                    │
    │                 │──────────────────►                    │
    │                 │          Consultation                  │
    │                 │          Diagnosis (ICD-10)            │
    │                 │          Prescriptions                 │
    │                 │          Lab Orders                    │
    │                 │          Dental / Eye (if module on)   │
    │                 │──────────────────►────────────────────►
    │                 │                  │         Invoice created
    │                 │                  │         (auto from services)
    │                 │                  │                    │
    │◄────────────────────────────────────────────────────────
    │         Patient pays → Receipt → Claim to insurer       │
```

### Billing & Insurance Flow

```
Services rendered → invoice_items → invoices (totals via trigger)
                                         │
                         ┌───────────────┴────────────────┐
                         │                                │
                     Cash / MoMo / Card             NHIS / Private
                         │                                │
                       payments                   insurance_claims
                         │                          (ClaimsIT JSON)
                         │                                │
                    receipt_number              claim submitted → accepted/rejected
```

### Stock Replenishment Flow

```
Inventory Officer creates purchase_order
  → purchase_order_items added
  → PO approved → sent to supplier
  → GRN (goods received): inventory_batches created / updated
  → stock_movements logged (type: Receipt)
  → Pharmacist transfers batches: Store → Pharmacy (inventory_transfers)
  → Dispensing: dispensing_items deduct from inventory_batches (FEFO)
  → Low-stock trigger → system_logs WARNING inserted
```

---

## 13. Database File Execution Order

| File                          | Section | Purpose                                            | When to run               |
|-------------------------------|---------|----------------------------------------------------|-----------------------------|
| `00_delete_all_tables.sql`    | —       | **Destructive** — drops everything                 | Dev reset only              |
| `01_create_database.sql`      | 1       | Extensions, ENUM types, trigger functions          | Always (idempotent)         |
| `02_create_tables.sql`        | 2       | All tables, indexes, triggers                      | Fresh install               |
| `03_insert_standard_values.sql`| 3      | Roles, permissions, seed facility, default users   | Fresh install               |
| `04_rename_tables.sql`        | 4       | Rename existing tables with `x_` prefix (backup)  | Existing DB migration only  |
| `05_update_tables.sql`        | 5       | `ALTER TABLE` migrations for existing installs     | Existing DB migration only  |
| `06_delete_old_tables.sql`    | 6       | Drop `x_` backup tables after migration verified   | Existing DB migration only  |
| `07_create_dental_bpe.sql`    | —       | `dental_bpe_examinations` table + indexes          | Always (idempotent)         |
| `08_inventory_stock_location.sql` | —   | `inventory_transfers` + `stock_location` column    | Always (idempotent)         |

### Fresh Installation

```bash
psql -d hms_db -f DB/01_create_database.sql
psql -d hms_db -f DB/02_create_tables.sql
psql -d hms_db -f DB/03_insert_standard_values.sql
psql -d hms_db -f DB/07_create_dental_bpe.sql
psql -d hms_db -f DB/08_inventory_stock_location.sql
```

### Migrating an Existing Database

```bash
psql -d hms_db -f DB/01_create_database.sql   # idempotent
psql -d hms_db -f DB/04_rename_tables.sql      # back up old tables
psql -d hms_db -f DB/05_update_tables.sql      # apply ALTER statements
# verify data integrity, then:
psql -d hms_db -f DB/06_delete_old_tables.sql  # drop x_ backups
psql -d hms_db -f DB/07_create_dental_bpe.sql
psql -d hms_db -f DB/08_inventory_stock_location.sql
```

---

*Last updated: May 2026*
