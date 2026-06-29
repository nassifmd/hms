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
-- SECTION 6 | DELETE OLD TABLES
-- Drops the x_ prefixed backup tables created in Section 4.
--
-- WARNING: Run ONLY after Section 5 migrations have been fully verified.
-- WARNING: Confirm data integrity in live tables before running this section.
-- WARNING: SKIP for fresh installations (x_ tables were never created).
--
-- Verification checklist before dropping:
--   * patients.facility_id  column present with correct values
--   * patients.branch_id, visits.branch_id, appointments.branch_id exist
--   * users.branch_id, departments.branch_id exist
--   * Application queries return correct results against live tables
-- ============================================================================

DROP TABLE IF EXISTS x_patients;
DROP TABLE IF EXISTS x_visits;
DROP TABLE IF EXISTS x_appointments;
DROP TABLE IF EXISTS x_users;
DROP TABLE IF EXISTS x_departments;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
