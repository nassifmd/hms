-- ============================================================================
-- HMS – HOSPITAL MANAGEMENT SYSTEM
-- PostgreSQL Database Schema  |  v2.1  |  May 2026
-- ============================================================================
--
-- SECTION 1 – FOUNDATION
-- Extensions, ENUM types, and PL/pgSQL trigger functions.
--
-- This file is FULLY IDEMPOTENT and may be re-run safely on any installation.
-- All trigger functions use CREATE OR REPLACE and are therefore always current.
-- All ENUM types are created conditionally (DO $$ … END $$) so the script
-- succeeds whether the type already exists or not.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EXECUTION GUIDE
-- ─────────────────────────────────────────────────────────────────────────────
--
--   FRESH INSTALLATION
--     01_create_database.sql    ← this file
--     02_create_tables.sql
--     03_insert_standard_values.sql
--     07_create_dental_bpe.sql
--     08_inventory_stock_location.sql
--
--   MIGRATING AN EXISTING INSTALLATION
--     01_create_database.sql    ← always (idempotent)
--     04_rename_tables.sql      ← back up existing tables with x_ prefix
--     05_update_tables.sql      ← apply ALTER TABLE migrations
--     06_delete_old_tables.sql  ← drop x_ backups after verification
--     07_create_dental_bpe.sql
--     08_inventory_stock_location.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
--
--  ┌──────────┬──────────────────────────────────────────────────────────────┐
--  │ SECTION  │ CONTENTS                                                     │
--  ├──────────┼──────────────────────────────────────────────────────────────┤
--  │    1     │ Extensions · ENUM types · trigger functions  (this file)     │
--  │    2     │ Tables · indexes · triggers                                  │
--  │    3     │ Seed data: roles · permissions · users                       │
--  │    4     │ Rename tables → x_ prefixed backups  (existing DBs only)     │
--  │    5     │ ALTER TABLE migrations                 (existing DBs only)    │
--  │    6     │ Drop x_ backup tables after migration                        │
--  └──────────┴──────────────────────────────────────────────────────────────┘
--
-- ============================================================================

SET search_path TO public;

-- ============================================================================
-- 1.1  EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_bytes(), crypt()

-- ============================================================================
-- 1.2  ENUM TYPES
--
-- Each type is wrapped in a DO block so that re-running this file on a
-- database that already has the types does not raise "already exists" errors.
-- ============================================================================

-- Gender
DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM ('Male', 'Female', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE gender_type IS
    'Biological or social gender recorded at patient / staff registration.';

-- Blood group (ABO + Rh)
DO $$ BEGIN
    CREATE TYPE blood_group_type AS ENUM (
        'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE blood_group_type IS 'ABO blood group with Rh factor.';

-- Marital status
DO $$ BEGIN
    CREATE TYPE marital_status_type AS ENUM (
        'Single', 'Married', 'Divorced', 'Widowed', 'Separated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE marital_status_type IS 'Civil / marital status of a person.';

-- Patient lifecycle status
DO $$ BEGIN
    CREATE TYPE patient_status_type AS ENUM (
        'Active', 'Inactive', 'Deceased', 'Transferred'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE patient_status_type IS
    'Lifecycle state of a patient record.
     Active      – attending / receiving care.
     Inactive    – no recent activity.
     Deceased    – date and cause recorded on the patients row.
     Transferred – moved to another facility.';

-- Appointment lifecycle status
DO $$ BEGIN
    CREATE TYPE appointment_status_type AS ENUM (
        'Scheduled',
        'Confirmed',
        'In Progress',
        'Completed',
        'Cancelled',
        'No Show',
        'Rescheduled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE appointment_status_type IS
    'Lifecycle states for a scheduled appointment.';

-- Invoice / payment status
DO $$ BEGIN
    CREATE TYPE payment_status_type AS ENUM (
        'Pending',
        'Partially Paid',
        'Overdue',
        'Paid',
        'Refunded',
        'Cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE payment_status_type IS
    'Payment state of an invoice.
     Overdue is set by a background job when due_date passes without full payment.';

-- Insurance claim lifecycle status
-- NOTE: "Failed" is included here so that fresh installations do not require
--       the Section 5 migration that adds it to pre-existing databases.
DO $$ BEGIN
    CREATE TYPE claim_status_type AS ENUM (
        'Draft',
        'Validated',
        'Submitted',
        'Accepted',
        'Rejected',
        'Paid',
        'Partially Paid',
        'Failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE claim_status_type IS
    'NHIA claimsIT v3.4 claim lifecycle states.
     Failed – submission attempt returned a network or API error.';

-- Visit / encounter type
DO $$ BEGIN
    CREATE TYPE visit_type AS ENUM (
        'Outpatient',
        'Inpatient',
        'Emergency',
        'Review',
        'Consultation'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE visit_type IS 'Classification of a patient encounter / visit.';

-- User account status
DO $$ BEGIN
    CREATE TYPE user_status_type AS ENUM (
        'Active', 'Inactive', 'Suspended', 'Locked'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE user_status_type IS
    'Operational state of a staff user account.
     Locked    – set automatically after repeated failed login attempts.
     Suspended – set manually by an administrator.';

-- Facility branch operational status
DO $$ BEGIN
    CREATE TYPE branch_status_type AS ENUM (
        'Active', 'Inactive', 'Under Construction', 'Suspended'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE branch_status_type IS 'Operational status of a facility branch.';

-- ============================================================================
-- 1.3  TRIGGER FUNCTIONS
--
-- All functions use CREATE OR REPLACE and are therefore always idempotent.
-- Each function pins its own search_path to prevent search_path injection
-- (OWASP: SQL Injection – A03).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- update_updated_at_column()
-- Stamps updated_at with the current transaction timestamp on every UPDATE.
-- Attach to any table that carries an updated_at column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at_column() IS
    'Generic BEFORE UPDATE trigger: keeps updated_at current on every row change.';

-- ---------------------------------------------------------------------------
-- generate_patient_number()
-- Auto-generates a unique, year-scoped patient number (format YYYY-NNNNNN,
-- e.g. 2026-000123).  Called BEFORE INSERT when patient_number IS NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_patient_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year_prefix  TEXT;
    v_sequence_num INTEGER;
BEGIN
    v_year_prefix := to_char(CURRENT_DATE, 'YYYY');

    SELECT COALESCE(
        MAX(CAST(SUBSTRING(patient_number FROM 6) AS INTEGER)), 0
    ) + 1
    INTO v_sequence_num
    FROM patients
    WHERE patient_number LIKE v_year_prefix || '-%';

    NEW.patient_number := v_year_prefix || '-' || LPAD(v_sequence_num::TEXT, 6, '0');
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION generate_patient_number() IS
    'BEFORE INSERT trigger on patients.
     Generates a year-scoped patient number (YYYY-NNNNNN) when patient_number is NULL.';

-- ---------------------------------------------------------------------------
-- calculate_bmi()
-- Derives BMI from height_cm and weight_kg and stores it in the bmi column.
-- Called BEFORE INSERT OR UPDATE on patient_vitals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_bmi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_height_m NUMERIC;
BEGIN
    IF NEW.height_cm IS NOT NULL
       AND NEW.height_cm > 0
       AND NEW.weight_kg IS NOT NULL
    THEN
        v_height_m := NEW.height_cm / 100.0;
        NEW.bmi    := ROUND((NEW.weight_kg / (v_height_m * v_height_m))::NUMERIC, 2);
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION calculate_bmi() IS
    'BEFORE INSERT OR UPDATE trigger on patient_vitals.
     Calculates BMI = weight_kg / (height_m)^2 and stores it in the bmi column.';

-- ---------------------------------------------------------------------------
-- update_invoice_totals()
-- Recomputes invoices.subtotal and invoices.total_amount whenever a row in
-- invoice_items is inserted, updated, or deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id UUID;
BEGIN
    -- Determine which invoice was affected by this change
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    UPDATE invoices
    SET
        subtotal     = COALESCE((
            SELECT SUM(quantity * unit_price)
            FROM   invoice_items
            WHERE  invoice_id = v_invoice_id
        ), 0),
        total_amount = COALESCE((
            SELECT SUM(total_price)
            FROM   invoice_items
            WHERE  invoice_id = v_invoice_id
        ), 0),
        updated_at   = CURRENT_TIMESTAMP
    WHERE id = v_invoice_id;

    RETURN NULL;  -- AFTER trigger; return value is not used
END;
$$;

COMMENT ON FUNCTION update_invoice_totals() IS
    'AFTER INSERT OR UPDATE OR DELETE trigger on invoice_items.
     Recomputes invoices.subtotal and invoices.total_amount for the affected invoice.';

-- ---------------------------------------------------------------------------
-- check_stock_levels()
-- Inserts a WARNING row into system_logs when drug_inventory.quantity_on_hand
-- falls at or below the drug''s configured reorder_level.
-- Uses a single lookup to avoid redundant subqueries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_stock_levels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_drug_name     TEXT;
    v_reorder_level INTEGER;
BEGIN
    -- Retrieve drug name and reorder threshold in a single query
    SELECT drug_name, reorder_level
    INTO   v_drug_name, v_reorder_level
    FROM   drugs
    WHERE  id = NEW.drug_id;

    IF v_reorder_level IS NOT NULL
       AND NEW.quantity_on_hand <= v_reorder_level
    THEN
        INSERT INTO system_logs (log_level, module, message, details)
        VALUES (
            'WARNING',
            'Pharmacy',
            'Low stock: ' || COALESCE(v_drug_name, NEW.drug_id::TEXT),
            jsonb_build_object(
                'drug_id',          NEW.drug_id,
                'drug_name',        v_drug_name,
                'batch_number',     NEW.batch_number,
                'quantity_on_hand', NEW.quantity_on_hand,
                'reorder_level',    v_reorder_level
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_stock_levels() IS
    'AFTER UPDATE trigger on drug_inventory.
     Inserts a WARNING into system_logs when quantity_on_hand drops to or
     below the drug''s configured reorder_level.';

-- ============================================================================
-- END OF SECTION 1
-- ============================================================================
