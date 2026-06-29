-- ============================================================================
-- HMS – HOSPITAL MANAGEMENT SYSTEM
-- PostgreSQL Database Schema  |  v2.1  |  May 2026
-- ============================================================================
--
-- SECTION 2 – TABLES, INDEXES, AND TRIGGERS
--
-- All tables are created with CREATE TABLE IF NOT EXISTS so that this file is
-- safe to re-run after a partial failure.  All triggers use
-- CREATE OR REPLACE TRIGGER (PostgreSQL 14+) for the same reason.
-- Trigger functions referenced here are defined in Section 1
-- (01_create_database.sql) and must be run first.
--
-- ─────────────────────────────────────────────────────────────────────────────
--
-- TABLE GROUPS
--   2.1  Core Infrastructure   – facilities, branches, departments
--   2.2  User Management       – users, roles, permissions, settings
--   2.3  Patient Management    – patients, kin, insurance, allergies, vitals
--   2.4  Visits & Appointments – visits, appointments, reminders
--   2.5  Clinical              – diagnoses, procedures, prescriptions
--   2.6  Laboratory            – tests, panels, orders, results
--   2.7  Pharmacy              – drugs, inventory, dispensing
--   2.8  Dental Module (PAID)  – charts, teeth, procedures, BPE, treatment plans
--   2.9  Eye Clinic Module (PAID) – examinations, field tests, glasses Rx, optical inv
--   2.10 Billing & Finance     – price lists, invoices, payments
--   2.11 Insurance & Claims    – claims, items, history, NHIS logs
--   2.12 Inventory & Supply    – suppliers, purchase orders, stock movements
--   2.13 Reporting & Scheduling
--   2.14 Notifications
--   2.15 Backup / Restore History
--   2.16 ICD-10 Catalogue
--   2.17 General Inventory     – items, batches, stock-takes
--   2.18 Patient Complaints
--   2.19 Module Licensing
--
-- INDEXES  – Section 2.20
-- TRIGGERS – Section 2.21
--
-- ============================================================================

SET search_path TO public;

-- ============================================================================
-- 2.1  CORE INFRASTRUCTURE
-- ============================================================================

-- Facilities – top-level entities (hospitals, clinics, health centres)
CREATE TABLE IF NOT EXISTS facilities (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_code             VARCHAR(50)  UNIQUE NOT NULL,
    facility_name             VARCHAR(255) NOT NULL,
    facility_type             VARCHAR(100) NOT NULL,
    registration_number       VARCHAR(100) UNIQUE,
    ghs_certificate_number    VARCHAR(100),
    nhis_accreditation_number VARCHAR(100),
    address                   TEXT,
    city                      VARCHAR(100),
    region                    VARCHAR(100),
    country                   VARCHAR(100) DEFAULT 'Ghana',
    postal_code               VARCHAR(20),
    phone_primary             VARCHAR(20),
    phone_secondary           VARCHAR(20),
    email                     VARCHAR(255),
    website                   VARCHAR(255),
    logo_url                  TEXT,
    currency                  VARCHAR(3)  DEFAULT 'GHS',
    timezone                  VARCHAR(50) DEFAULT 'Africa/Accra',
    is_active                 BOOLEAN DEFAULT true,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE facilities IS
    'Top-level entity representing a hospital, clinic or health centre.
     Each facility is independently licensed and configured.';

-- Facility Branches – sub-locations under a parent facility
-- A SUPER_ADMIN manages the branches of their own facility.
CREATE TABLE IF NOT EXISTS facility_branches (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id               UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    parent_branch_id          UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    branch_code               VARCHAR(50)  NOT NULL,
    branch_name               VARCHAR(255) NOT NULL,
    branch_type               VARCHAR(100) NOT NULL, -- Main, Annex, Outreach, Satellite, Specialist
    registration_number       VARCHAR(100),
    ghis_code                 VARCHAR(100),          -- Ghana Health Information System code
    nhis_accreditation_number VARCHAR(100),
    address                   TEXT,
    city                      VARCHAR(100),
    region                    VARCHAR(100),
    country                   VARCHAR(100) DEFAULT 'Ghana',
    postal_code               VARCHAR(20),
    phone_primary             VARCHAR(20),
    phone_secondary           VARCHAR(20),
    email                     VARCHAR(255),
    branch_head_id            UUID,                  -- set after users table is populated
    operational_hours         JSONB,                 -- {"monday":{"open":"08:00","close":"17:00"}, ...}
    services_offered          TEXT[],
    bed_capacity              INTEGER DEFAULT 0,
    is_active                 BOOLEAN DEFAULT true,
    status                    branch_status_type DEFAULT 'Active',
    notes                     TEXT,
    created_by                UUID,                  -- references users(id)
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, branch_code)
);
-- FK for branch_head_id is deferred to avoid circular dependency with users table:
-- ALTER TABLE facility_branches ADD CONSTRAINT fk_branch_head
--     FOREIGN KEY (branch_head_id) REFERENCES users(id);

COMMENT ON TABLE facility_branches IS
    'Sub-locations (annexes, outreach sites, satellites) operated under a parent facility.';

-- Departments
CREATE TABLE IF NOT EXISTS departments (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id          UUID REFERENCES facilities(id),
    branch_id            UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    department_code      VARCHAR(50)  UNIQUE NOT NULL,
    department_name      VARCHAR(255) NOT NULL,
    department_type      VARCHAR(100) NOT NULL, -- Clinical, Administrative, Ancillary
    parent_department_id UUID REFERENCES departments(id),
    head_of_department   UUID,                  -- references users(id)
    floor_location       VARCHAR(100),
    extension_number     VARCHAR(20),
    is_active            BOOLEAN DEFAULT true,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE departments IS
    'Clinical, administrative and ancillary departments within a facility or branch.';

-- ============================================================================
-- 2.2  USER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id                    VARCHAR(50)  UNIQUE NOT NULL,
    facility_id                    UUID REFERENCES facilities(id),
    department_id                  UUID REFERENCES departments(id),
    branch_id                      UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    title                          VARCHAR(50),
    first_name                     VARCHAR(100) NOT NULL,
    middle_name                    VARCHAR(100),
    last_name                      VARCHAR(100) NOT NULL,
    date_of_birth                  DATE,
    gender                         gender_type,
    phone_number                   VARCHAR(20),
    alternate_phone                VARCHAR(20),
    email                          VARCHAR(255) UNIQUE NOT NULL,
    username                       VARCHAR(100) UNIQUE,
    password_hash                  TEXT NOT NULL,
    profile_picture_url            TEXT,
    national_id_type               VARCHAR(50),  -- Ghana Card, Passport, Voters ID
    national_id_number             VARCHAR(100),
    professional_license_number    VARCHAR(100),
    license_expiry_date            DATE,
    specialization                 VARCHAR(255),
    qualification                  TEXT,
    years_of_experience            INTEGER,
    joining_date                   DATE,
    employment_status              VARCHAR(50),  -- Permanent, Contract, Locum, Intern
    emergency_contact_name         VARCHAR(255),
    emergency_contact_phone        VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    address                        TEXT,
    city                           VARCHAR(100),
    region                         VARCHAR(100),
    postal_code                    VARCHAR(20),
    last_login                     TIMESTAMP,
    login_attempts                 INTEGER DEFAULT 0,
    account_locked                 BOOLEAN DEFAULT false,
    user_status                    user_status_type DEFAULT 'Active',
    two_factor_enabled             BOOLEAN DEFAULT false,
    two_factor_secret              TEXT,
    refresh_token                  TEXT,
    password_reset_token           TEXT,
    password_reset_expires         TIMESTAMP,
    created_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by                     UUID REFERENCES users(id),
    updated_by                     UUID REFERENCES users(id)
);

COMMENT ON TABLE users IS
    'Staff accounts for all facility personnel. Credentials are stored as a
     bcrypt hash in password_hash. Refresh tokens are rotated on each use.';

CREATE TABLE IF NOT EXISTS roles (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_code      VARCHAR(50)  UNIQUE NOT NULL,
    role_name      VARCHAR(100) NOT NULL,
    description    TEXT,
    role_category  VARCHAR(50),  -- Clinical, Administrative, Financial, etc.
    is_system_role BOOLEAN DEFAULT false,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User <-> Role (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_roles (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
    facility_id   UUID REFERENCES facilities(id),
    department_id UUID REFERENCES departments(id),
    assigned_by   UUID REFERENCES users(id),
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date   DATE,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id, facility_id, department_id)
);

CREATE TABLE IF NOT EXISTS permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permission_code VARCHAR(100) UNIQUE NOT NULL,
    permission_name VARCHAR(255) NOT NULL,
    module          VARCHAR(100),
    description     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role <-> Permission (Many-to-Many)
CREATE TABLE IF NOT EXISTS role_permissions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id       UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- System-wide or per-facility settings
CREATE TABLE IF NOT EXISTS system_settings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id   UUID REFERENCES facilities(id),
    setting_key   VARCHAR(100) NOT NULL,
    setting_value TEXT,
    category      VARCHAR(100),
    description   TEXT,
    updated_by    UUID REFERENCES users(id),
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(setting_key, facility_id)
);

-- ============================================================================
-- 2.3  PATIENT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS patients (
    id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_number                 VARCHAR(50) UNIQUE NOT NULL,
    facility_id                    UUID REFERENCES facilities(id),
    branch_id                      UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    ghs_unique_identifier          VARCHAR(100),  -- Ghana Health Service unique ID
    nhis_number                    VARCHAR(50),
    nhis_expiry_date               DATE,
    title                          VARCHAR(20),
    first_name                     VARCHAR(100) NOT NULL,
    middle_name                    VARCHAR(100),
    last_name                      VARCHAR(100) NOT NULL,
    date_of_birth                  DATE NOT NULL,
    gender                         gender_type NOT NULL,
    blood_group                    blood_group_type,
    genotype                       VARCHAR(10),
    marital_status                 marital_status_type,
    occupation                     VARCHAR(255),
    employer_name                  VARCHAR(255),
    employer_address               TEXT,
    nationality                    VARCHAR(100) DEFAULT 'Ghanaian',
    region_of_origin               VARCHAR(100),
    district_of_origin             VARCHAR(100),
    hometown                       VARCHAR(100),
    tribe                          VARCHAR(100),
    religion                       VARCHAR(100),
    email                          VARCHAR(255),
    phone_number                   VARCHAR(20),
    alternate_phone                VARCHAR(20),
    address_line1                  TEXT,
    address_line2                  TEXT,
    city                           VARCHAR(100),
    district                       VARCHAR(100),
    region                         VARCHAR(100),
    postal_code                    VARCHAR(20),
    digital_address                VARCHAR(50),   -- GhanaPost GPS
    emergency_contact_name         VARCHAR(255),
    emergency_contact_phone        VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    emergency_contact_address      TEXT,
    registration_date              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    registered_by                  UUID REFERENCES users(id),
    patient_photo_url              TEXT,
    id_type                        VARCHAR(50),
    id_number                      VARCHAR(100),
    id_issue_date                  DATE,
    id_expiry_date                 DATE,
    id_document_url                TEXT,
    allergies                      TEXT,
    chronic_conditions             TEXT,
    current_medications            TEXT,
    surgical_history               TEXT,
    family_history                 TEXT,
    social_history                 TEXT,
    registration_fee_paid          BOOLEAN DEFAULT false,
    is_active                      BOOLEAN DEFAULT true,
    patient_status                 patient_status_type DEFAULT 'Active',
    deceased_date                  DATE,
    cause_of_death                 TEXT,
    last_visit_date                TIMESTAMP,   -- updated when a new visit is created
    created_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by                     UUID REFERENCES users(id),
    updated_by                     UUID REFERENCES users(id)
);

COMMENT ON TABLE patients IS
    'Master patient registry. patient_number is auto-generated by trigger
     (format YYYY-NNNNNN). Medical history fields are free-text summaries;
     structured records are stored in the dedicated clinical tables.';

CREATE TABLE IF NOT EXISTS patient_next_of_kin (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    relationship    VARCHAR(100) NOT NULL,
    phone_number    VARCHAR(20),
    alternate_phone VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    is_primary      BOOLEAN DEFAULT false,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_insurance (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id                UUID REFERENCES patients(id) ON DELETE CASCADE,
    insurance_provider        VARCHAR(255) NOT NULL,
    policy_number             VARCHAR(100) NOT NULL,
    membership_number         VARCHAR(100),
    insurance_type            VARCHAR(50),   -- NHIS, Private, etc.
    plan_name                 VARCHAR(255),
    coverage_details          TEXT,
    start_date                DATE NOT NULL,
    expiry_date               DATE NOT NULL,
    is_verified               BOOLEAN DEFAULT false,
    verified_by               UUID REFERENCES users(id),
    verified_date             TIMESTAMP,
    verification_document_url TEXT,
    is_active                 BOOLEAN DEFAULT true,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_allergies (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id     UUID REFERENCES patients(id) ON DELETE CASCADE,
    allergen       VARCHAR(255) NOT NULL,
    reaction       VARCHAR(255),
    severity       VARCHAR(50),  -- Mild, Moderate, Severe
    diagnosis_date DATE,
    is_active      BOOLEAN DEFAULT true,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by     UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS patient_vitals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID REFERENCES patients(id) ON DELETE CASCADE,
    visit_id            UUID,  -- references visits(id)
    recorded_by         UUID REFERENCES users(id),
    recorded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    height_cm           DECIMAL(5,2),
    weight_kg           DECIMAL(5,2),
    bmi                 DECIMAL(4,2),
    temperature_celsius DECIMAL(4,2),
    systolic_bp         INTEGER,
    diastolic_bp        INTEGER,
    heart_rate          INTEGER,
    respiratory_rate    INTEGER,
    oxygen_saturation   DECIMAL(4,2),
    blood_glucose       DECIMAL(5,2),
    pain_scale          INTEGER CHECK (pain_scale >= 0 AND pain_scale <= 10),
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.4  VISITS & APPOINTMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS visits (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_number                  VARCHAR(50) UNIQUE NOT NULL,
    patient_id                    UUID REFERENCES patients(id) ON DELETE CASCADE,
    facility_id                   UUID REFERENCES facilities(id),
    branch_id                     UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    department_id                 UUID REFERENCES departments(id),
    visit_type                    visit_type NOT NULL,
    visit_date                    DATE NOT NULL,
    check_in_time                 TIMESTAMP,
    check_out_time                TIMESTAMP,
    triage_time                   TIMESTAMP,
    consultation_time             TIMESTAMP,
    referred_by                   UUID REFERENCES users(id),
    referring_facility            VARCHAR(255),
    referring_reason              TEXT,
    chief_complaint               TEXT,
    presenting_complaint          TEXT,
    history_of_presenting_illness TEXT,
    triage_notes                  TEXT,
    triage_by                     UUID REFERENCES users(id),
    consultation_notes            TEXT,
    diagnosis                     TEXT,
    treatment_plan                TEXT,
    discharge_notes               TEXT,
    discharge_date                TIMESTAMP,
    discharge_by                  UUID REFERENCES users(id),
    visit_status                  VARCHAR(50) DEFAULT 'Active', -- Active, Completed, Cancelled, Discharged
    is_emergency                  BOOLEAN DEFAULT false,
    created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by                    UUID REFERENCES users(id),
    updated_by                    UUID REFERENCES users(id)
);

COMMENT ON TABLE visits IS
    'A patient encounter / admission record. One visit maps to one invoice.
     visit_status lifecycle: Active → Completed | Cancelled | Discharged.';

CREATE TABLE IF NOT EXISTS appointments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_number  VARCHAR(50) UNIQUE NOT NULL,
    patient_id          UUID REFERENCES patients(id) ON DELETE CASCADE,
    facility_id         UUID REFERENCES facilities(id),
    branch_id           UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
    department_id       UUID REFERENCES departments(id),
    doctor_id           UUID REFERENCES users(id),
    appointment_date    DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    duration_minutes    INTEGER,
    appointment_type    VARCHAR(100),  -- Consultation, Review, Procedure, etc.
    reason              TEXT,
    notes               TEXT,
    is_emergency        BOOLEAN DEFAULT false,
    is_referral         BOOLEAN DEFAULT false,
    referring_doctor_id UUID REFERENCES users(id),
    status              appointment_status_type DEFAULT 'Scheduled',
    cancellation_reason TEXT,
    rescheduled_from    UUID REFERENCES appointments(id),
    checked_in_time     TIMESTAMP,
    checked_in_by       UUID REFERENCES users(id),
    checked_out_time    TIMESTAMP,
    checked_out_by      UUID REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS appointment_reminders (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    reminder_type  VARCHAR(50),  -- SMS, Email, Push
    scheduled_time TIMESTAMP NOT NULL,
    sent_time      TIMESTAMP,
    status         VARCHAR(50),  -- Pending, Sent, Failed
    error_message  TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.5  CLINICAL DOCUMENTATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS diagnoses (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id              UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id            UUID REFERENCES patients(id),
    diagnosis_code        VARCHAR(20),   -- ICD-11 code
    diagnosis_name        VARCHAR(255) NOT NULL,
    diagnosis_type        VARCHAR(50),   -- Primary, Secondary, Differential, etc.
    diagnosis_description TEXT,
    diagnosed_by          UUID REFERENCES users(id),
    diagnosed_date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_confirmed          BOOLEAN DEFAULT false,
    is_chronic            BOOLEAN DEFAULT false,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Diagnosis catalogue (GHS-approved ICD-10 reference list)
CREATE TABLE IF NOT EXISTS diagnosis_catalogue (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    diagnosis_code   VARCHAR(20) UNIQUE NOT NULL,  -- ICD-10 code
    diagnosis_name   VARCHAR(255) NOT NULL,
    icd_chapter      VARCHAR(10),                  -- ICD-10 chapter (e.g. 'I', 'II')
    icd_category     VARCHAR(100),                 -- Chapter description
    ghs_approved     BOOLEAN DEFAULT true,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diag_cat_code ON diagnosis_catalogue(diagnosis_code);

-- Procedure catalogue
CREATE TABLE IF NOT EXISTS procedures (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procedure_code     VARCHAR(20) UNIQUE NOT NULL,
    procedure_name     VARCHAR(255) NOT NULL,
    procedure_category VARCHAR(100),
    description        TEXT,
    standard_duration  INTEGER,  -- minutes
    requires_consent   BOOLEAN DEFAULT true,
    consent_form_url   TEXT,
    is_active          BOOLEAN DEFAULT true,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_procedures (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id         UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id       UUID REFERENCES patients(id),
    procedure_id     UUID REFERENCES procedures(id),
    procedure_name   VARCHAR(255),
    procedure_date   TIMESTAMP NOT NULL,
    performed_by     UUID REFERENCES users(id),
    assisted_by      UUID REFERENCES users(id),
    anaesthetist_id  UUID REFERENCES users(id),
    anaesthesia_type VARCHAR(100),
    findings         TEXT,
    outcome          TEXT,
    complications    TEXT,
    notes            TEXT,
    consent_obtained BOOLEAN DEFAULT false,
    consent_form_url TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_number VARCHAR(50) UNIQUE NOT NULL,
    visit_id            UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id          UUID REFERENCES patients(id),
    prescribed_by       UUID REFERENCES users(id),
    prescription_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    diagnosis_id        UUID REFERENCES diagnoses(id),
    notes               TEXT,
    is_dispensed        BOOLEAN DEFAULT false,
    dispensed_by        UUID REFERENCES users(id),
    dispensed_date      TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id       UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
    medication_name       VARCHAR(255) NOT NULL,
    dosage                VARCHAR(100) NOT NULL,
    frequency             VARCHAR(100) NOT NULL,
    duration              VARCHAR(100),
    route                 VARCHAR(50),   -- Oral, IV, Topical, etc.
    quantity              INTEGER,
    refills               INTEGER DEFAULT 0,
    instructions          TEXT,
    is_compound           BOOLEAN DEFAULT false,
    compound_instructions TEXT,
    status                VARCHAR(50) DEFAULT 'Active',  -- Active, Completed, Cancelled
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.6  LABORATORY MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lab_tests (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_code               VARCHAR(50)  UNIQUE NOT NULL,
    test_name               VARCHAR(255) NOT NULL,
    test_category           VARCHAR(100),  -- Hematology, Microbiology, etc.
    specimen_type           VARCHAR(100),
    collection_method       VARCHAR(100),
    container_type          VARCHAR(100),
    volume_required         VARCHAR(50),
    turnaround_time_hours   INTEGER,
    reference_range         TEXT,
    critical_ranges         TEXT,
    instructions            TEXT,
    interpretation_guidance TEXT,
    price                   DECIMAL(10,2),
    is_active               BOOLEAN DEFAULT true,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_panels (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    panel_code  VARCHAR(50)  UNIQUE NOT NULL,
    panel_name  VARCHAR(255) NOT NULL,
    description TEXT,
    price       DECIMAL(10,2),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Panel <-> Test (Many-to-Many)
CREATE TABLE IF NOT EXISTS panel_tests (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    panel_id   UUID REFERENCES lab_panels(id) ON DELETE CASCADE,
    test_id    UUID REFERENCES lab_tests(id)  ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_id, test_id)
);

CREATE TABLE IF NOT EXISTS lab_orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number  VARCHAR(50) UNIQUE NOT NULL,
    visit_id      UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id    UUID REFERENCES patients(id),
    ordered_by    UUID REFERENCES users(id),
    order_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    facility_id   UUID REFERENCES facilities(id),
    priority      VARCHAR(50) DEFAULT 'Routine',  -- Routine, Urgent, STAT
    clinical_info TEXT,
    diagnosis     TEXT,
    is_panel      BOOLEAN DEFAULT false,
    panel_id      UUID REFERENCES lab_panels(id),
    notes         TEXT,
    status        VARCHAR(50) DEFAULT 'Pending',  -- Pending, Collected, In Progress, Completed, Cancelled
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_order_items (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_order_id          UUID REFERENCES lab_orders(id) ON DELETE CASCADE,
    test_id               UUID REFERENCES lab_tests(id),
    specimen_id           VARCHAR(100),
    specimen_collected_at TIMESTAMP,
    specimen_collected_by UUID REFERENCES users(id),
    specimen_received_at  TIMESTAMP,
    specimen_received_by  UUID REFERENCES users(id),
    specimen_condition    VARCHAR(50),
    rejection_reason      TEXT,
    performed_by          UUID REFERENCES users(id),
    performed_at          TIMESTAMP,
    verified_by           UUID REFERENCES users(id),
    verified_at           TIMESTAMP,
    result_value          TEXT,
    result_unit           VARCHAR(50),
    reference_range       TEXT,
    is_abnormal           BOOLEAN DEFAULT false,
    is_critical           BOOLEAN DEFAULT false,
    critical_alert_sent   BOOLEAN DEFAULT false,
    notes                 TEXT,
    status                VARCHAR(50) DEFAULT 'Pending',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.7  PHARMACY MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS drugs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drug_code               VARCHAR(50)  UNIQUE NOT NULL,
    drug_name               VARCHAR(255) NOT NULL,
    generic_name            VARCHAR(255),
    brand_name              VARCHAR(255),
    drug_category           VARCHAR(100),
    drug_class              VARCHAR(100),
    dosage_form             VARCHAR(100),  -- Tablet, Capsule, Syrup, etc.
    strength                VARCHAR(100),
    manufacturer            VARCHAR(255),
    supplier_id             UUID,          -- references suppliers(id)
    reorder_level           INTEGER,
    maximum_level           INTEGER,
    storage_conditions      TEXT,
    requires_prescription   BOOLEAN DEFAULT true,
    is_controlled_substance BOOLEAN DEFAULT false,
    is_active               BOOLEAN DEFAULT true,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drug_inventory (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id          UUID REFERENCES facilities(id),
    drug_id              UUID REFERENCES drugs(id),
    batch_number         VARCHAR(100) NOT NULL,
    expiry_date          DATE NOT NULL,
    quantity_on_hand     INTEGER DEFAULT 0,
    quantity_reserved    INTEGER DEFAULT 0,
    unit_cost            DECIMAL(10,2),
    selling_price        DECIMAL(10,2),
    location_in_pharmacy VARCHAR(100),
    received_date        DATE,
    received_by          UUID REFERENCES users(id),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, drug_id, batch_number)
);

CREATE TABLE IF NOT EXISTS drug_dispensing (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispensing_number VARCHAR(50) UNIQUE NOT NULL,
    prescription_id   UUID REFERENCES prescriptions(id),
    patient_id        UUID REFERENCES patients(id),
    dispensed_by      UUID REFERENCES users(id),
    dispensed_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes             TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispensing_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispensing_id       UUID REFERENCES drug_dispensing(id) ON DELETE CASCADE,
    drug_inventory_id   UUID REFERENCES drug_inventory(id),
    quantity_dispensed   INTEGER NOT NULL,
    dosage_instructions  TEXT,
    inventory_batch_id   UUID,                               -- FK to inventory_batches added after that table is defined below
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.8  DENTAL MODULE  (PAID – requires module_code = 'DENTAL' subscription)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dental_charts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    visit_id   UUID REFERENCES visits(id),
    created_by UUID REFERENCES users(id),
    chart_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chart_type VARCHAR(50) DEFAULT 'Adult',  -- Adult (32 teeth), Child (20 teeth)
    notes      TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dental_teeth (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dental_chart_id UUID REFERENCES dental_charts(id) ON DELETE CASCADE,
    tooth_number    INTEGER NOT NULL,  -- FDI: 11-48 permanent, 51-85 deciduous
    quadrant        INTEGER,           -- 1-4 permanent, 5-8 deciduous
    tooth_type      VARCHAR(50),       -- Incisor, Canine, Premolar, Molar
    status          VARCHAR(50) DEFAULT 'Present',  -- Present, Missing, Impacted, Crown, Bridge
    condition_notes TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dental_procedures (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procedure_code     VARCHAR(50) UNIQUE NOT NULL,
    procedure_name     VARCHAR(255) NOT NULL,
    procedure_category VARCHAR(100),  -- Restorative, Surgical, Orthodontic, etc.
    tooth_specific     BOOLEAN DEFAULT true,
    description        TEXT,
    standard_duration  INTEGER,
    price              DECIMAL(10,2),
    is_active          BOOLEAN DEFAULT true,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_dental_procedures (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id           UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id         UUID REFERENCES patients(id),
    dental_chart_id    UUID REFERENCES dental_charts(id),
    tooth_number       INTEGER,
    procedure_id       UUID REFERENCES dental_procedures(id),
    procedure_date     TIMESTAMP NOT NULL,
    performed_by       UUID REFERENCES users(id),
    assisted_by        UUID REFERENCES users(id),
    anaesthetist_id    UUID REFERENCES users(id),
    findings           TEXT,
    outcome            TEXT,
    complications      TEXT,
    materials_used     TEXT,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date     DATE,
    notes              TEXT,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dental_treatment_plans (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id            UUID REFERENCES patients(id),
    dental_chart_id       UUID REFERENCES dental_charts(id),
    created_by            UUID REFERENCES users(id),
    plan_date             TIMESTAMP NOT NULL,
    diagnosis             TEXT,
    treatment_description TEXT,
    estimated_cost        DECIMAL(12,2),
    estimated_duration    INTEGER,
    priority              VARCHAR(50) DEFAULT 'Normal',
    status                VARCHAR(50) DEFAULT 'Active',
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dental_imaging_requests (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    procedure_id UUID         NOT NULL REFERENCES patient_dental_procedures(id) ON DELETE CASCADE,
    patient_id   UUID         NOT NULL REFERENCES patients(id),
    imaging_type VARCHAR(100) NOT NULL,
    notes        TEXT,
    status       VARCHAR(50)  NOT NULL DEFAULT 'Pending',
    requested_by UUID         REFERENCES users(id),
    facility_id  UUID         REFERENCES facilities(id),
    requested_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dental_procedure_attachments (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    procedure_id UUID         NOT NULL REFERENCES patient_dental_procedures(id) ON DELETE CASCADE,
    patient_id   UUID         NOT NULL REFERENCES patients(id),
    file_name    VARCHAR(255) NOT NULL,
    file_path    TEXT         NOT NULL,
    file_type    VARCHAR(100),
    file_size    INTEGER,
    description  TEXT,
    uploaded_by  UUID         REFERENCES users(id),
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.9  EYE CLINIC MODULE  (PAID – requires module_code = 'EYE' subscription)
-- ============================================================================

CREATE TABLE IF NOT EXISTS eye_examinations (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id                      UUID REFERENCES visits(id) ON DELETE CASCADE,
    patient_id                    UUID REFERENCES patients(id),
    examination_date              TIMESTAMP NOT NULL,
    examined_by                   UUID REFERENCES users(id),
    -- Visual Acuity - Distance
    va_distance_right_uncorrected VARCHAR(20),
    va_distance_right_corrected   VARCHAR(20),
    va_distance_left_uncorrected  VARCHAR(20),
    va_distance_left_corrected    VARCHAR(20),
    va_distance_binocular         VARCHAR(20),
    -- Visual Acuity - Near
    va_near_right_uncorrected     VARCHAR(20),
    va_near_right_corrected       VARCHAR(20),
    va_near_left_uncorrected      VARCHAR(20),
    va_near_left_corrected        VARCHAR(20),
    va_near_binocular             VARCHAR(20),
    -- Refraction
    refraction_method             VARCHAR(50),  -- Autorefraction, Retinoscopy, Subjective
    sphere_right                  DECIMAL(4,2),
    sphere_left                   DECIMAL(4,2),
    cylinder_right                DECIMAL(4,2),
    cylinder_left                 DECIMAL(4,2),
    axis_right                    INTEGER,
    axis_left                     INTEGER,
    addition_right                DECIMAL(4,2),
    addition_left                 DECIMAL(4,2),
    prism_right                   VARCHAR(50),
    prism_left                    VARCHAR(50),
    -- Intraocular Pressure
    iop_right                     DECIMAL(4,2),
    iop_left                      DECIMAL(4,2),
    iop_method                    VARCHAR(50),  -- Goldmann, Non-contact, etc.
    iop_time                      TIME,
    -- Anterior / Posterior Segment
    anterior_segment_right        TEXT,
    anterior_segment_left         TEXT,
    posterior_segment_right       TEXT,
    posterior_segment_left        TEXT,
    -- Diagnosis
    diagnosis_right               TEXT,
    diagnosis_left                TEXT,
    diagnosis_binocular           TEXT,
    -- Treatment Plan flags
    treatment_plan                TEXT,
    glasses_prescribed            BOOLEAN DEFAULT false,
    medication_prescribed         BOOLEAN DEFAULT false,
    surgery_recommended           BOOLEAN DEFAULT false,
    follow_up_required            BOOLEAN DEFAULT false,
    follow_up_period              VARCHAR(50),
    notes                         TEXT,
    created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visual_field_tests (
    id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id                 UUID REFERENCES patients(id),
    eye_examination_id         UUID REFERENCES eye_examinations(id) ON DELETE SET NULL,
    test_date                  TIMESTAMP NOT NULL,
    eye                        VARCHAR(10),  -- Right, Left, Both
    mean_deviation             DECIMAL(5,2),
    pattern_standard_deviation DECIMAL(5,2),
    visual_field_index         DECIMAL(5,2),
    test_duration              INTEGER,
    reliability                VARCHAR(50),
    defects                    TEXT,
    notes                      TEXT,
    created_by                 UUID REFERENCES users(id),
    created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS glasses_prescriptions (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eye_examination_id          UUID REFERENCES eye_examinations(id) ON DELETE CASCADE,
    patient_id                  UUID REFERENCES patients(id),
    prescription_date           DATE NOT NULL,
    prescribed_by               UUID REFERENCES users(id),
    -- Distance Prescription
    distance_sphere_right       DECIMAL(4,2),
    distance_sphere_left        DECIMAL(4,2),
    distance_cylinder_right     DECIMAL(4,2),
    distance_cylinder_left      DECIMAL(4,2),
    distance_axis_right         INTEGER,
    distance_axis_left          INTEGER,
    distance_prism_right        VARCHAR(50),
    distance_prism_left         VARCHAR(50),
    -- Near Prescription
    near_sphere_right           DECIMAL(4,2),
    near_sphere_left            DECIMAL(4,2),
    near_cylinder_right         DECIMAL(4,2),
    near_cylinder_left          DECIMAL(4,2),
    near_axis_right             INTEGER,
    near_axis_left              INTEGER,
    near_prism_right            VARCHAR(50),
    near_prism_left             VARCHAR(50),
    -- Intermediate (optional)
    intermediate_sphere_right   DECIMAL(4,2),
    intermediate_sphere_left    DECIMAL(4,2),
    intermediate_cylinder_right DECIMAL(4,2),
    intermediate_cylinder_left  DECIMAL(4,2),
    intermediate_axis_right     INTEGER,
    intermediate_axis_left      INTEGER,
    pupil_distance              DECIMAL(5,2),
    glasses_type                VARCHAR(50),  -- Single Vision, Bifocal, Progressive
    lens_type                   VARCHAR(50),  -- Standard, Photochromic, Blue Cut, etc.
    coating                     TEXT,
    notes                       TEXT,
    is_dispensed                BOOLEAN DEFAULT false,
    dispensed_by                UUID REFERENCES users(id),
    dispensed_date              DATE,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS optical_inventory (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id      UUID REFERENCES facilities(id),
    item_type        VARCHAR(50),   -- Frame, Lens, Contact Lens, Solution
    item_code        VARCHAR(50) UNIQUE NOT NULL,
    item_name        VARCHAR(255) NOT NULL,
    brand            VARCHAR(255),
    model            VARCHAR(255),
    color            VARCHAR(100),
    size             VARCHAR(50),
    material         VARCHAR(100),
    quantity_on_hand INTEGER DEFAULT 0,
    unit_cost        DECIMAL(10,2),
    selling_price    DECIMAL(10,2),
    supplier_id      UUID,          -- references suppliers(id)
    reorder_level    INTEGER,
    location         VARCHAR(100),
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.10  BILLING & FINANCE MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_lists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id     UUID REFERENCES facilities(id),
    price_list_code VARCHAR(50) UNIQUE NOT NULL,
    price_list_name VARCHAR(255) NOT NULL,
    price_list_type VARCHAR(50),   -- Standard, NHIS, Corporate, etc.
    valid_from      DATE NOT NULL,
    valid_to        DATE,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_prices (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    price_list_id    UUID REFERENCES price_lists(id) ON DELETE CASCADE,
    service_type     VARCHAR(50),   -- Consultation, Procedure, Lab Test, Drug, Dental, Optical
    service_id       UUID,          -- optional FK to the respective service table (NULL for free-text services)
    service_code     VARCHAR(50),
    service_name     VARCHAR(255),
    price            DECIMAL(10,2) NOT NULL,
    nhis_tariff      DECIMAL(10,2),
    discount_allowed BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number         VARCHAR(50) UNIQUE NOT NULL,
    visit_id               UUID REFERENCES visits(id),
    patient_id             UUID REFERENCES patients(id),
    facility_id            UUID REFERENCES facilities(id),
    invoice_date           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    due_date               DATE,
    subtotal               DECIMAL(10,2) DEFAULT 0,
    discount_amount        DECIMAL(10,2) DEFAULT 0,
    discount_percentage    DECIMAL(5,2),
    discount_reason        TEXT,
    tax_amount             DECIMAL(10,2) DEFAULT 0,
    tax_percentage         DECIMAL(5,2),
    total_amount           DECIMAL(10,2) DEFAULT 0,
    amount_paid            DECIMAL(10,2) DEFAULT 0,
    balance_due            DECIMAL(10,2) DEFAULT 0,
    payment_status         payment_status_type DEFAULT 'Pending',
    insurance_claim_id     UUID,          -- references insurance_claims(id)
    insurance_coverage     DECIMAL(10,2) DEFAULT 0,
    patient_responsibility DECIMAL(10,2) DEFAULT 0,
    notes                  TEXT,
    created_by             UUID REFERENCES users(id),
    voided                 BOOLEAN DEFAULT false,
    voided_by              UUID REFERENCES users(id),
    voided_reason          TEXT,
    voided_date            TIMESTAMP,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE invoices IS
    'Invoice header. subtotal and total_amount are maintained by the
     update_invoice_totals() trigger whenever invoice_items rows change.';

CREATE TABLE IF NOT EXISTS invoice_items (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id                    UUID REFERENCES invoices(id) ON DELETE CASCADE,
    item_type                     VARCHAR(50) NOT NULL,  -- Consultation, Procedure, Lab, Drug, Dental, Optical
    item_id                       UUID,                  -- generic FK to respective item table
    item_code                     VARCHAR(50),
    item_name                     VARCHAR(255) NOT NULL,
    description                   TEXT,
    quantity                      INTEGER DEFAULT 1,
    unit_price                    DECIMAL(10,2) NOT NULL,
    discount_amount               DECIMAL(10,2) DEFAULT 0,
    tax_amount                    DECIMAL(10,2) DEFAULT 0,
    total_price                   DECIMAL(10,2) NOT NULL,
    is_insurance_covered          BOOLEAN DEFAULT false,
    insurance_coverage_percentage DECIMAL(5,2),
    created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_number        VARCHAR(50) UNIQUE NOT NULL,
    invoice_id            UUID REFERENCES invoices(id),
    patient_id            UUID REFERENCES patients(id),
    payment_date          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method        VARCHAR(50) NOT NULL,  -- Cash, Mobile Money, Card, Bank Transfer, Cheque
    payment_reference     VARCHAR(255),
    amount                DECIMAL(10,2) NOT NULL,
    mobile_money_provider VARCHAR(50),  -- MTN, Vodafone, AirtelTigo
    mobile_money_number   VARCHAR(20),
    card_last_four        VARCHAR(4),
    bank_name             VARCHAR(255),
    cheque_number         VARCHAR(50),
    receipt_number        VARCHAR(50),
    received_by           UUID REFERENCES users(id),
    notes                 TEXT,
    voided                BOOLEAN DEFAULT false,
    voided_by             UUID REFERENCES users(id),
    voided_reason         TEXT,
    voided_date           TIMESTAMP,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.11  INSURANCE & CLAIMS MODULE  (NHIA claimsIT v3.4 integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_claims (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number         VARCHAR(50) UNIQUE NOT NULL,
    claimsit_claim_id    VARCHAR(100),  -- ClaimsIT reference ID
    patient_id           UUID REFERENCES patients(id),
    patient_insurance_id UUID REFERENCES patient_insurance(id),
    visit_id             UUID REFERENCES visits(id),
    invoice_id           UUID REFERENCES invoices(id),
    facility_id          UUID REFERENCES facilities(id),
    claim_date           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submission_date      TIMESTAMP,
    total_amount         DECIMAL(10,2) NOT NULL,
    approved_amount      DECIMAL(10,2),
    paid_amount          DECIMAL(10,2),
    status               claim_status_type DEFAULT 'Draft',
    validation_response  TEXT,
    rejection_reason     TEXT,
    resubmission_count   INTEGER DEFAULT 0,
    submitted_by         UUID REFERENCES users(id),
    processed_by         UUID REFERENCES users(id),
    processed_date       TIMESTAMP,
    notes                TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id            UUID REFERENCES insurance_claims(id) ON DELETE CASCADE,
    invoice_item_id     UUID REFERENCES invoice_items(id),
    service_code        VARCHAR(50) NOT NULL,  -- ICD-11, CPT, etc.
    service_description TEXT,
    quantity            INTEGER DEFAULT 1,
    unit_price          DECIMAL(10,2) NOT NULL,
    total_price         DECIMAL(10,2) NOT NULL,
    approved_price      DECIMAL(10,2),
    rejection_reason    TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim_status_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id    UUID REFERENCES insurance_claims(id) ON DELETE CASCADE,
    status      claim_status_type NOT NULL,
    status_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes       TEXT,
    changed_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nhis_verification_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID REFERENCES patients(id),
    nhis_number         VARCHAR(50),
    verification_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_status VARCHAR(50),  -- Verified, Invalid, Expired
    response_data       JSONB,
    verified_by         UUID REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.12  INVENTORY & SUPPLY CHAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_code     VARCHAR(50) UNIQUE NOT NULL,
    supplier_name     VARCHAR(255) NOT NULL,
    contact_person    VARCHAR(255),
    phone_number      VARCHAR(20),
    alternate_phone   VARCHAR(20),
    email             VARCHAR(255),
    address           TEXT,
    city              VARCHAR(100),
    region            VARCHAR(100),
    tax_id            VARCHAR(100),
    payment_terms     VARCHAR(255),
    supply_categories TEXT,
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number              VARCHAR(50) UNIQUE NOT NULL,
    supplier_id            UUID REFERENCES suppliers(id),
    facility_id            UUID REFERENCES facilities(id),
    order_date             DATE NOT NULL,
    expected_delivery_date DATE,
    delivery_date          DATE,
    order_status           VARCHAR(50) DEFAULT 'Draft',  -- Draft, Sent, Confirmed, Partially Received, Received, Cancelled
    subtotal               DECIMAL(10,2),
    tax_amount             DECIMAL(10,2),
    shipping_cost          DECIMAL(10,2),
    total_amount           DECIMAL(10,2),
    notes                  TEXT,
    created_by             UUID REFERENCES users(id),
    approved_by            UUID REFERENCES users(id),
    approved_date          TIMESTAMP,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id             UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_type         VARCHAR(50),   -- Drug, Lab Supply, Dental Supply, Optical, General
    item_id           UUID,          -- generic FK to the respective item table
    item_code         VARCHAR(50),
    item_name         VARCHAR(255),
    quantity_ordered  INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_price        DECIMAL(10,2) NOT NULL,
    total_price       DECIMAL(10,2) NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id    UUID REFERENCES facilities(id),
    movement_type  VARCHAR(50) NOT NULL,  -- Receipt, Issue, Transfer, Adjustment, Return
    item_type      VARCHAR(50) NOT NULL,  -- Drug, Lab, Dental, Optical, General
    item_id        UUID,
    batch_number   VARCHAR(100),
    quantity       INTEGER NOT NULL,
    unit_cost      DECIMAL(10,2),
    reference_type VARCHAR(50),           -- PO, Dispensing, Transfer, Adjustment
    reference_id   UUID,
    batch_id       UUID,                                    -- FK to inventory_batches added after that table is defined below
    notes          TEXT,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.13  REPORTING, AUDIT & SCHEDULING
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    facility_id UUID REFERENCES facilities(id),
    action      VARCHAR(50) NOT NULL,  -- CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT
    table_name  VARCHAR(100),
    record_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_logs IS
    'Immutable audit trail of all data mutations and authentication events.
     old_values / new_values store JSONB snapshots for forensic review.';

CREATE TABLE IF NOT EXISTS system_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_level  VARCHAR(20) NOT NULL,  -- INFO, WARNING, ERROR, CRITICAL
    module     VARCHAR(100),
    message    TEXT,
    details    JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.14  MODULE SUBSCRIPTIONS  (Paid module activation records)
-- ============================================================================

CREATE TABLE IF NOT EXISTS module_subscriptions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id       UUID REFERENCES facilities(id),
    module_code       VARCHAR(50)  NOT NULL,  -- DENTAL, EYE, LAB, PHARMACY, etc.
    module_name       VARCHAR(255) NOT NULL,
    subscription_type VARCHAR(50),             -- Monthly, Annual, Per-User, Per-Procedure
    price             DECIMAL(10,2) NOT NULL,
    currency          VARCHAR(3) DEFAULT 'GHS',
    max_users         INTEGER,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    is_active         BOOLEAN DEFAULT true,
    auto_renew        BOOLEAN DEFAULT true,
    payment_status    VARCHAR(50) DEFAULT 'Pending',
    payment_date      TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS module_usage_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id  UUID REFERENCES facilities(id),
    module_code  VARCHAR(50) NOT NULL,
    usage_type   VARCHAR(50) NOT NULL,  -- Consultation, Procedure, User
    reference_id UUID,
    quantity     INTEGER DEFAULT 1,
    unit_price   DECIMAL(10,2),
    total_price  DECIMAL(10,2),
    billing_date DATE,
    is_billed    BOOLEAN DEFAULT false,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.15  SCHEDULING & REPORTING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id     UUID REFERENCES facilities(id),
    report_type     VARCHAR(100) NOT NULL,
    schedule_config JSONB NOT NULL,
    recipients      JSONB,
    format          VARCHAR(10) DEFAULT 'pdf',
    filters         JSONB,
    frequency       VARCHAR(20),
    is_active       BOOLEAN DEFAULT true,
    last_run_at     TIMESTAMP,
    next_run_at     TIMESTAMP,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_reports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(100) NOT NULL,
    params      JSONB,
    format      VARCHAR(10),
    file_path   TEXT,
    file_size   INTEGER,
    created_by  UUID REFERENCES users(id),
    schedule_id UUID REFERENCES report_schedules(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_executions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name   VARCHAR(100),
    start_time TIMESTAMP,
    end_time   TIMESTAMP,
    duration   INTEGER,
    details    JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.16  NOTIFICATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel    VARCHAR(20) NOT NULL,
    type       VARCHAR(50),
    enabled    BOOLEAN DEFAULT true,
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_templates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key  VARCHAR(100) UNIQUE NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    subject       VARCHAR(500),
    body          TEXT NOT NULL,
    channel       VARCHAR(20) NOT NULL,
    variables     JSONB DEFAULT '[]'::jsonb,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50)  NOT NULL,
    title      VARCHAR(255) NOT NULL,
    body       TEXT,
    data       JSONB DEFAULT '{}'::jsonb,
    channels   TEXT[],
    priority   VARCHAR(20) DEFAULT 'normal',
    expires_at TIMESTAMP,
    results    JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    body       TEXT,
    type       VARCHAR(50),
    data       JSONB DEFAULT '{}'::jsonb,
    priority   VARCHAR(20) DEFAULT 'normal',
    read_at    TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2.17  BACKUP / RESTORE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename      VARCHAR(500) NOT NULL,
    backup_type   VARCHAR(20)  NOT NULL,
    size          BIGINT,
    tables_count  INTEGER DEFAULT 0,
    records_count BIGINT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restore_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename      VARCHAR(500) NOT NULL,
    restored_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status        VARCHAR(20) NOT NULL,
    error_message TEXT
);

-- ============================================================================
-- 2.20  INDEXES
-- ============================================================================

CREATE INDEX idx_facility_branches_facility_id ON facility_branches(facility_id);
CREATE INDEX idx_facility_branches_status      ON facility_branches(status);

CREATE INDEX idx_patients_number  ON patients(patient_number);
CREATE INDEX idx_patients_name    ON patients(last_name, first_name);
CREATE INDEX idx_patients_phone   ON patients(phone_number);
CREATE INDEX idx_patients_nhis    ON patients(nhis_number);
CREATE INDEX idx_patients_ghs_id  ON patients(ghs_unique_identifier);

CREATE INDEX idx_visits_patient      ON visits(patient_id);
CREATE INDEX idx_visits_date         ON visits(visit_date);
CREATE INDEX idx_visits_status       ON visits(visit_status);
CREATE INDEX idx_visits_department   ON visits(department_id);
CREATE INDEX idx_visits_visit_number ON visits(visit_number);

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor  ON appointments(doctor_id);
CREATE INDEX idx_appointments_date    ON appointments(appointment_date);
CREATE INDEX idx_appointments_status  ON appointments(status);

CREATE INDEX idx_diagnoses_visit       ON diagnoses(visit_id);
CREATE INDEX idx_diagnoses_patient     ON diagnoses(patient_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_status  ON prescriptions(is_dispensed);
CREATE INDEX idx_prescriptions_visit   ON prescriptions(visit_id);

CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_visit   ON lab_orders(visit_id);
CREATE INDEX idx_lab_orders_status  ON lab_orders(status);
CREATE INDEX idx_lab_order_items_order ON lab_order_items(lab_order_id);

CREATE INDEX idx_invoices_patient  ON invoices(patient_id);
CREATE INDEX idx_invoices_visit    ON invoices(visit_id);
CREATE INDEX idx_invoices_status   ON invoices(payment_status);
CREATE INDEX idx_payments_invoice  ON payments(invoice_id);
CREATE INDEX idx_payments_patient  ON payments(patient_id);

CREATE INDEX idx_claims_patient ON insurance_claims(patient_id);
CREATE INDEX idx_claims_status  ON insurance_claims(status);
CREATE INDEX idx_claims_visit   ON insurance_claims(visit_id);

CREATE INDEX idx_dental_charts_patient        ON dental_charts(patient_id);
CREATE INDEX idx_dental_procedures_patient    ON patient_dental_procedures(patient_id);
CREATE INDEX idx_dental_imaging_procedure     ON dental_imaging_requests(procedure_id);
CREATE INDEX idx_dental_imaging_patient       ON dental_imaging_requests(patient_id);
CREATE INDEX idx_dental_attachments_procedure ON dental_procedure_attachments(procedure_id);
CREATE INDEX idx_dental_attachments_patient   ON dental_procedure_attachments(patient_id);

CREATE INDEX idx_eye_exams_patient ON eye_examinations(patient_id);
CREATE INDEX idx_eye_exams_date    ON eye_examinations(examination_date);

CREATE INDEX idx_stock_movements_item ON stock_movements(item_id, item_type);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_visit ON patient_vitals(visit_id);

CREATE INDEX idx_audit_logs_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table   ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run_at);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user   ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_active ON notification_preferences(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notification_templates_key ON notification_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user        ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type        ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created     ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_user         ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_unread       ON in_app_notifications(user_id, read_at)
    WHERE read_at IS NULL;

-- Missing indexes for query performance
CREATE INDEX IF NOT EXISTS idx_patient_next_of_kin_patient
    ON patient_next_of_kin(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient
    ON patient_insurance(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_facility
    ON patients(facility_id);
CREATE INDEX IF NOT EXISTS idx_visits_facility_date
    ON visits(facility_id, visit_date);

-- ============================================================================
-- 2.21  TRIGGERS
-- All trigger functions are defined in Section 1 (01_create_database.sql).
-- CREATE OR REPLACE TRIGGER requires PostgreSQL 14+.
-- ============================================================================

-- Stamp updated_at on every UPDATE
CREATE OR REPLACE TRIGGER update_facilities_updated_at
    BEFORE UPDATE ON facilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_facility_branches_updated_at
    BEFORE UPDATE ON facility_branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_visits_updated_at
    BEFORE UPDATE ON visits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate patient_number on INSERT when not supplied
CREATE OR REPLACE TRIGGER generate_patient_number_trigger
    BEFORE INSERT ON patients
    FOR EACH ROW
    WHEN (NEW.patient_number IS NULL)
    EXECUTE FUNCTION generate_patient_number();

-- Auto-calculate BMI on patient_vitals INSERT or UPDATE
CREATE OR REPLACE TRIGGER calculate_bmi_trigger
    BEFORE INSERT OR UPDATE ON patient_vitals
    FOR EACH ROW
    EXECUTE FUNCTION calculate_bmi();

-- Recompute invoice totals after any invoice_items change
CREATE OR REPLACE TRIGGER update_invoice_totals_trigger
    AFTER INSERT OR UPDATE OR DELETE ON invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_totals();

-- Log low-stock WARNING when drug_inventory quantity decreases
CREATE OR REPLACE TRIGGER check_stock_levels_trigger
    AFTER UPDATE ON drug_inventory
    FOR EACH ROW
    WHEN (NEW.quantity_on_hand < OLD.quantity_on_hand)
    EXECUTE FUNCTION check_stock_levels();

-- ============================================================================
-- 2.22  ICD-10 DIAGNOSIS CATALOGUE
-- GHS / NHIS approved ICD-10 codes — used for autocomplete and validation
-- ============================================================================
CREATE TABLE IF NOT EXISTS icd10_codes (
    id          SERIAL       PRIMARY KEY,
    code        VARCHAR(10)  UNIQUE NOT NULL,
    description TEXT         NOT NULL,
    category    VARCHAR(100) NOT NULL,   -- Block heading e.g. "Infectious diseases"
    block       VARCHAR(20),             -- e.g. "A00-A09"
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_icd10_code    ON icd10_codes (code);
CREATE INDEX IF NOT EXISTS idx_icd10_desc    ON icd10_codes USING gin(to_tsvector('english', description));

-- ============================================================================
-- 2.23  GENERAL INVENTORY MODULE
-- Non-pharmacy stock items, batches, and stock-take audit logs
-- ============================================================================

-- Master catalogue of all stock items
CREATE TABLE IF NOT EXISTS inventory_items (
    id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code          VARCHAR(50)   UNIQUE NOT NULL,
    item_name          VARCHAR(255)  NOT NULL,
    item_type          VARCHAR(100)  NOT NULL,  -- Medicine, Consumable, Equipment, Reagent, PPE, Other
    category           VARCHAR(100),
    description        TEXT,
    manufacturer       VARCHAR(255),
    supplier_id        UUID          REFERENCES suppliers(id) ON DELETE SET NULL,
    unit_of_measure    VARCHAR(50),
    reorder_level      NUMERIC(10,2) DEFAULT 0,
    maximum_level      NUMERIC(10,2),
    storage_location   VARCHAR(255),
    storage_conditions VARCHAR(255),
    is_active          BOOLEAN       NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_code   ON inventory_items (item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name   ON inventory_items (item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type   ON inventory_items (item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items (is_active);

-- Per-facility stock batches linked to inventory items
CREATE TABLE IF NOT EXISTS inventory_batches (
    id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id         UUID          NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    item_id             UUID          NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    batch_number        VARCHAR(100)  NOT NULL,
    expiry_date         DATE,
    manufacturing_date  DATE,
    quantity_on_hand    NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(10,2) NOT NULL DEFAULT 0,
    received_date       TIMESTAMPTZ   DEFAULT NOW(),
    received_by         UUID          REFERENCES users(id) ON DELETE SET NULL,
    location            VARCHAR(255),
    notes               TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (facility_id, batch_number, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_batches_facility ON inventory_batches (facility_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_item     ON inventory_batches (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry   ON inventory_batches (expiry_date);

-- Audit trail for physical stock counts
CREATE TABLE IF NOT EXISTS stock_take_logs (
    id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id         UUID          NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    conducted_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
    conducted_date      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    discrepancies_count INTEGER       NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_take_facility ON stock_take_logs (facility_id);

-- FK constraints for columns referencing inventory_batches (defined above)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_movements_batch_id'
    ) THEN
        ALTER TABLE stock_movements
            ADD CONSTRAINT fk_stock_movements_batch_id
                FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_id ON stock_movements (batch_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispensing_items_inv_batch_id'
    ) THEN
        ALTER TABLE dispensing_items
            ADD CONSTRAINT fk_dispensing_items_inv_batch_id
                FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dispensing_items_batch_id ON dispensing_items (inventory_batch_id);

-- ============================================================================
-- 2.24  PATIENT COMPLAINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_complaints (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id      UUID      REFERENCES facilities(id),
    patient_id       UUID      REFERENCES patients(id) ON DELETE SET NULL,
    visit_id         UUID      REFERENCES visits(id) ON DELETE SET NULL,
    complaint_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    category         VARCHAR(100),
    -- Categories: Clinical Care, Staff Behaviour, Waiting Time, Billing,
    --             Cleanliness, Communication, Medication, Other
    description      TEXT      NOT NULL,
    severity         VARCHAR(20) DEFAULT 'Low',
    -- Severity: Low, Medium, High, Critical
    status           VARCHAR(50) DEFAULT 'Open',
    -- Status: Open, Under Investigation, Resolved, Closed
    assigned_to      UUID      REFERENCES users(id) ON DELETE SET NULL,
    resolved_at      TIMESTAMP,
    resolution_notes TEXT,
    created_by       UUID      REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_complaints_facility ON patient_complaints (facility_id);
CREATE INDEX IF NOT EXISTS idx_patient_complaints_patient  ON patient_complaints (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_complaints_status   ON patient_complaints (status);
CREATE INDEX IF NOT EXISTS idx_patient_complaints_created  ON patient_complaints (created_at);

-- ============================================================================
-- 2.25  MODULE LICENSING
-- Paid-module activation records per facility (populated by license_generator)
-- ============================================================================

CREATE TABLE IF NOT EXISTS module_licenses (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id   UUID         NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    module_code   VARCHAR(50)  NOT NULL
                               CHECK (module_code IN ('CLINICAL','DENTAL','EYE','LAB','INSURANCE')),
    license_key   TEXT         NOT NULL,
    license_id    VARCHAR(50),
    issued_at     TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ  NOT NULL,
    activated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT true,

    -- One active entry per module per facility
    UNIQUE (facility_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_module_licenses_facility ON module_licenses (facility_id);
CREATE INDEX IF NOT EXISTS idx_module_licenses_expires  ON module_licenses (expires_at);
