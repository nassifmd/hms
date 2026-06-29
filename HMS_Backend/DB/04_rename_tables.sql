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
-- SECTION 4 | RENAME TABLES
-- Creates x_ prefixed copies of tables that receive structural changes in
-- Section 5.  These copies preserve existing row data as a safety backup.
--
-- WARNING: Run this section ONLY on EXISTING installations, BEFORE Section 5.
-- WARNING: SKIP for fresh installations (tables don't yet contain data).
--
-- Workflow
-- --------
--   Step 1  Run Section 4  -> x_ copies are created (structure + data)
--   Step 2  Run Section 5  -> ALTER TABLE migrations applied to live tables
--   Step 3  Verify data    -> confirm live tables are correct
--   Step 4  Run Section 6  -> drop the x_ backup copies
-- ============================================================================

-- Backup tables that receive new columns in Section 5
-- CREATE TABLE ... AS TABLE copies both the column structure and all current rows.

CREATE TABLE IF NOT EXISTS x_patients     AS TABLE patients;
CREATE TABLE IF NOT EXISTS x_visits       AS TABLE visits;
CREATE TABLE IF NOT EXISTS x_appointments AS TABLE appointments;
CREATE TABLE IF NOT EXISTS x_users        AS TABLE users;
CREATE TABLE IF NOT EXISTS x_departments  AS TABLE departments;
