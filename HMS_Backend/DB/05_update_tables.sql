SET search_path TO public;
-- ============================================================================
-- HMS - HOSPITAL MANAGEMENT SYSTEM
-- PostgreSQL Database Schema  |  v2.0  |  March 2026
-- ============================================================================
--
-- EXECUTION GUIDE
-- ──────────────────────────────────────────────────────────────────────────
--   FRESH INSTALLATION  ->  Run  Section 1  ->  Section 2  ->  Section 3
--
--   EXISTING DATABASE   ->  Run  Section 1  (idempotent)
--                       ->  Run  Section 4  (create x_ backup copies)
--                       ->  Run  Section 5  (apply ALTER TABLE migrations)
--                       ->  Run  Section 6  (drop x_ backups after verification)
-- ──────────────────────────────────────────────────────────────────────────
--
--  +----------+-------------------------------------------------------------+
--  | SECTION  | CONTENTS                                                    |
--  +----------+-------------------------------------------------------------+
--  |    1     | CREATE DATABASE  - extensions, enum types, functions        |
--  |    2     | CREATE TABLES    - tables, indexes, triggers                |
--  |    3     | INSERT STANDARD VALUES - roles, permissions, users          |
--  |    4     | RENAME TABLES    - x_ prefixed backups (existing DBs only)  |
--  |    5     | UPDATE TABLES    - ALTER TABLE migrations (existing only)   |
--  |    6     | DELETE OLD TABLES - drop x_ backups after migration         |
--  +----------+-------------------------------------------------------------+
--
-- ============================================================================
-- ============================================================================
-- SECTION 5 | UPDATE TABLES
-- Idempotent ALTER TABLE migrations for existing installations.
--
-- WARNING: Run this section ONLY on EXISTING installations, AFTER Section 4.
-- WARNING: SKIP for fresh installations - all columns are already present
--          in the Section 2 CREATE TABLE statements.
-- ============================================================================

-- Add branch_status_type enum if the installation pre-dates it
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_status_type') THEN
        CREATE TYPE branch_status_type AS ENUM (
            'Active', 'Inactive', 'Under Construction', 'Suspended'
        );
    END IF;
END $$;

-- Ensure payment_status_type includes 'Overdue'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'payment_status_type' AND e.enumlabel = 'Overdue'
    ) THEN
        ALTER TYPE payment_status_type ADD VALUE 'Overdue';
    END IF;
END $$;

-- Ensure claim_status_type includes 'Failed'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'claim_status_type' AND e.enumlabel = 'Failed'
    ) THEN
        ALTER TYPE claim_status_type ADD VALUE 'Failed';
    END IF;
END $$;

-- patients: add facility scope
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

-- patients: add branch scope
ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL;

-- users: add branch assignment
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL;

-- departments: add branch assignment
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL;

-- appointments: add branch scope
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL;

-- visits: add branch scope
ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL;

-- Ensure new roles exist (idempotent)
INSERT INTO roles (role_code, role_name, description, role_category, is_system_role)
SELECT role_code, role_name, description, role_category, is_system_role
FROM (VALUES
    ('SUPER_ADMIN', 'Super Administrator', 'Facility-level super admin; manages all branches and staff', 'Administrative', true),
    ('INVENTORY',   'Inventory Manager',   'Inventory and stock management',                             'Administrative', true),
    ('INSURANCE',   'Insurance Officer',   'Insurance claims and authorisations',                        'Administrative', true)
) AS new_roles(role_code, role_name, description, role_category, is_system_role)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.role_code = new_roles.role_code);

-- Ensure all permissions exist (idempotent)
INSERT INTO permissions (permission_code, permission_name, module, description)
SELECT permission_code, permission_name, module, description
FROM (VALUES
    ('MANAGE_BRANCHES',          'Manage Branches',             'Administrative', 'Create, update, deactivate or remove facility branches'),
    ('VIEW_ALL_BRANCHES',        'View All Branches',           'Administrative', 'View data across all branches in the facility'),
    ('ASSIGN_BRANCH_USERS',      'Assign Users to Branches',    'Administrative', 'Assign or transfer staff to branches'),
    ('MANAGE_DEPARTMENTS',       'Manage Departments',          'Administrative', 'Create, update or remove departments'),
    ('MANAGE_ROLES',             'Manage Roles',                'Administrative', 'Create, update, delete and assign roles'),
    ('CREATE_USER',              'Create User',                 'Administrative', 'Create new user accounts'),
    ('UPDATE_USER',              'Update User',                 'Administrative', 'Update existing user accounts'),
    ('DELETE_USER',              'Delete User',                 'Administrative', 'Deactivate or delete user accounts'),
    ('BULK_IMPORT',              'Bulk Import Users',           'Administrative', 'Import multiple users at once via CSV or spreadsheet'),
    ('VIEW_AUDIT_LOGS',          'View Audit Logs',             'Administrative', 'View system audit trail and login history'),
    ('VIEW_SYSTEM_LOGS',         'View System Logs',            'Administrative', 'View application and error logs'),
    ('MANAGE_BACKUPS',           'Manage Backups',              'Administrative', 'Create and restore system backups'),
    ('VIEW_BACKUPS',             'View Backups',                'Administrative', 'View list of available system backups'),
    ('MANAGE_SYSTEM',            'Manage System',               'Administrative', 'Run migrations, clear cache, toggle maintenance mode and manage system configuration'),
    ('MODULE_DENTAL_ACCESS',     'Access Dental Module',        'Dental',         'Can access dental clinic features'),
    ('MODULE_DENTAL_PROCEDURES', 'Perform Dental Procedures',   'Dental',         'Can perform and bill dental procedures'),
    ('MODULE_EYE_ACCESS',        'Access Eye Clinic Module',    'Eye',            'Can access eye clinic features'),
    ('MODULE_EYE_EXAM',          'Perform Eye Examinations',    'Eye',            'Can perform comprehensive eye exams'),
    ('MODULE_EYE_SURGERY',       'Perform Eye Surgeries',       'Eye',            'Can perform ophthalmic surgeries'),
    ('MODULE_CLAIMS_IT',         'ClaimsIT Integration',        'Insurance',      'Can process and submit ClaimsIT claims'),
    ('MODULE_ADV_REPORTING',     'Advanced Reporting',          'Reports',        'Access to advanced analytics and reports')
) AS new_perms(permission_code, permission_name, module, description)
WHERE NOT EXISTS (
    SELECT 1 FROM permissions p WHERE p.permission_code = new_perms.permission_code
);

-- Ensure SYS_ADMIN role-permission grants exist (idempotent)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_code = 'SYS_ADMIN'
  AND p.permission_code IN (
    'MANAGE_DEPARTMENTS',  'MANAGE_ROLES',          'MANAGE_BRANCHES',
    'VIEW_ALL_BRANCHES',   'ASSIGN_BRANCH_USERS',
    'CREATE_USER',         'UPDATE_USER',            'DELETE_USER',      'BULK_IMPORT',
    'VIEW_AUDIT_LOGS',     'VIEW_SYSTEM_LOGS',
    'MANAGE_BACKUPS',      'VIEW_BACKUPS',           'MANAGE_SYSTEM',
    'MODULE_DENTAL_ACCESS','MODULE_DENTAL_PROCEDURES',
    'MODULE_EYE_ACCESS',   'MODULE_EYE_EXAM',        'MODULE_EYE_SURGERY',
    'MODULE_CLAIMS_IT',    'MODULE_ADV_REPORTING'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Ensure SUPER_ADMIN role-permission grants exist (idempotent)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.role_code = 'SUPER_ADMIN'
  AND p.permission_code IN (
    'MANAGE_DEPARTMENTS',  'MANAGE_ROLES',
    'MANAGE_BRANCHES',     'VIEW_ALL_BRANCHES',      'ASSIGN_BRANCH_USERS',
    'CREATE_USER',         'UPDATE_USER',             'DELETE_USER',      'BULK_IMPORT',
    'VIEW_AUDIT_LOGS',
    'VIEW_SYSTEM_LOGS',    'MANAGE_BACKUPS',          'VIEW_BACKUPS',     'MANAGE_SYSTEM',
    'MODULE_DENTAL_ACCESS','MODULE_DENTAL_PROCEDURES',
    'MODULE_EYE_ACCESS',   'MODULE_EYE_EXAM',         'MODULE_EYE_SURGERY',
    'MODULE_CLAIMS_IT',    'MODULE_ADV_REPORTING'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Ensure module subscriptions for default facility exist (idempotent)
INSERT INTO module_subscriptions (
    facility_id, module_code, module_name,
    subscription_type, price, currency,
    start_date, end_date,
    is_active, auto_renew, payment_status
)
SELECT
    f.id, m.module_code, m.module_name,
    'Annual', 0.00, 'GHS',
    CURRENT_DATE, CURRENT_DATE + INTERVAL '10 years',
    true, true, 'Paid'
FROM facilities f
CROSS JOIN (VALUES
    ('DENTAL',   'Dental Module'),
    ('EYE',      'Eye Clinic Module'),
    ('LAB',      'Laboratory Module'),
    ('PHARMACY', 'Pharmacy Module')
) AS m(module_code, module_name)
WHERE f.facility_code = 'GHS001'
  AND NOT EXISTS (
    SELECT 1 FROM module_subscriptions ms
    WHERE ms.facility_id = f.id AND ms.module_code = m.module_code
  );

-- ============================================================
-- Migrations 0002, 0008, 0009, 0010, 0011
-- Schema additions from migration files (idempotent for existing DBs)
-- ============================================================

-- 0002: dental_procedures.updated_at
ALTER TABLE dental_procedures
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 0003: dental_treatment_plans.priority default (column exists but may lack default)
ALTER TABLE dental_treatment_plans
    ALTER COLUMN priority SET DEFAULT 'Normal';

-- 0008: Inventory tables (master catalogue, batches, stock takes)
CREATE TABLE IF NOT EXISTS inventory_items (
    id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code          VARCHAR(50)   UNIQUE NOT NULL,
    item_name          VARCHAR(255)  NOT NULL,
    item_type          VARCHAR(100)  NOT NULL,
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

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_id ON stock_movements (batch_id);

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

-- 0009: dispensing_items.inventory_batch_id
ALTER TABLE dispensing_items
    ADD COLUMN IF NOT EXISTS inventory_batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dispensing_items_batch_id ON dispensing_items (inventory_batch_id);

-- 0010: Patient complaints
CREATE TABLE IF NOT EXISTS patient_complaints (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id      UUID      REFERENCES facilities(id),
    patient_id       UUID      REFERENCES patients(id) ON DELETE SET NULL,
    visit_id         UUID      REFERENCES visits(id) ON DELETE SET NULL,
    complaint_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    category         VARCHAR(100),
    description      TEXT      NOT NULL,
    severity         VARCHAR(20) DEFAULT 'Low',
    status           VARCHAR(50) DEFAULT 'Open',
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

-- 0011: Module licenses
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
    UNIQUE (facility_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_module_licenses_facility ON module_licenses (facility_id);
CREATE INDEX IF NOT EXISTS idx_module_licenses_expires  ON module_licenses (expires_at);

-- 0012: Dental imaging requests
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

CREATE INDEX IF NOT EXISTS idx_dental_imaging_procedure ON dental_imaging_requests(procedure_id);
CREATE INDEX IF NOT EXISTS idx_dental_imaging_patient   ON dental_imaging_requests(patient_id);

-- 0013: Dental procedure attachments
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

CREATE INDEX IF NOT EXISTS idx_dental_attachments_procedure ON dental_procedure_attachments(procedure_id);
CREATE INDEX IF NOT EXISTS idx_dental_attachments_patient   ON dental_procedure_attachments(patient_id);

