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
-- SECTION 3 | INSERT STANDARD VALUES
-- Seed data: roles, permissions, role-permission grants, default facility,
-- module subscriptions, and default system users.
-- ============================================================================

-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO roles (role_code, role_name, description, role_category, is_system_role) VALUES
('SUPER_ADMIN',     'Super Administrator',         'Facility-level super admin; can manage all branches and staff',  'Administrative', true),
('SYS_ADMIN',       'System Administrator',        'Full system access and configuration',                           'Administrative', true),
('MED_SUPT',        'Medical Superintendent',      'Clinical governance and oversight',                              'Clinical',       true),
('RECORDS',         'Records Officer',             'Patient registration and records management',                    'Administrative', true),
('RECEPTION',       'Reception',                   'Front desk and appointment management',                          'Administrative', true),
('NURSE',           'Nurse',                       'Triage and nursing care',                                        'Clinical',       true),
('DOCTOR',          'Doctor',                      'Medical consultation and treatment',                             'Clinical',       true),
('DENTIST',         'Dentist',                     'Dental consultation and procedures',                             'Clinical',       true),
('DENTAL_TECH',     'Dental Technician',           'Dental laboratory work',                                         'Technical',      true),
('OPTOMETRIST',     'Optometrist',                 'Eye examinations and refraction',                                'Clinical',       true),
('OPHTHALMOLOGIST', 'Ophthalmologist',             'Eye surgeries and medical treatment',                            'Clinical',       true),
('TECHNICIAN',      'Technician',                  'Technical support and equipment',                                'Technical',      true),
('PHARMACIST',      'Pharmacist',                  'Pharmacy and dispensing',                                        'Pharmacy',       true),
('LAB_TECH',        'Laboratory Technician',       'Lab tests and results',                                          'Laboratory',     true),
('ACCOUNTS',        'Accounts',                    'Financial management',                                           'Finance',        true),
('CASHIER',         'Cashier',                     'Payment collection',                                             'Finance',        true),
('DISTRICT_HD',     'District Health Directorate', 'Regional oversight',                                             'Administrative', true),
('MED_OFFICER',     'Medical Officer',             'General medical practice',                                       'Clinical',       true),
('DENTAL_SURGEON',  'Dental Surgeon',              'Advanced dental procedures',                                     'Clinical',       true),
('REGISTRAR',       'Registrar',                   'Records management',                                             'Administrative', true),
('INVENTORY',       'Inventory Manager',           'Inventory and stock management',                                 'Administrative', true),
('INSURANCE',       'Insurance Officer',           'Insurance claims and authorisations',                            'Administrative', true);

-- ============================================================
-- PERMISSIONS
-- ============================================================
INSERT INTO permissions (permission_code, permission_name, module, description) VALUES
-- Module gates (paid modules)
('MODULE_DENTAL_ACCESS',     'Access Dental Module',        'Dental',         'Can access dental clinic features'),
('MODULE_DENTAL_PROCEDURES', 'Perform Dental Procedures',   'Dental',         'Can perform and bill dental procedures'),
('MODULE_EYE_ACCESS',        'Access Eye Clinic Module',    'Eye',            'Can access eye clinic features'),
('MODULE_EYE_EXAM',          'Perform Eye Examinations',    'Eye',            'Can perform comprehensive eye exams'),
('MODULE_EYE_SURGERY',       'Perform Eye Surgeries',       'Eye',            'Can perform ophthalmic surgeries'),
('MODULE_CLAIMS_IT',         'ClaimsIT Integration',        'Insurance',      'Can process and submit ClaimsIT claims'),
('MODULE_ADV_REPORTING',     'Advanced Reporting',          'Reports',        'Access to advanced analytics and reports'),
-- Branch management
('MANAGE_BRANCHES',          'Manage Branches',             'Administrative', 'Create, update, deactivate or remove facility branches'),
('VIEW_ALL_BRANCHES',        'View All Branches',           'Administrative', 'View data across all branches in the facility'),
('ASSIGN_BRANCH_USERS',      'Assign Users to Branches',    'Administrative', 'Assign or transfer staff to branches'),
-- Department management
('MANAGE_DEPARTMENTS',       'Manage Departments',          'Administrative', 'Create, update or remove departments'),
-- Role management
('MANAGE_ROLES',             'Manage Roles',                'Administrative', 'Create, update, delete and assign roles'),
-- User CRUD
('CREATE_USER',              'Create User',                 'Administrative', 'Create new user accounts'),
('UPDATE_USER',              'Update User',                 'Administrative', 'Update existing user accounts'),
('DELETE_USER',              'Delete User',                 'Administrative', 'Deactivate or delete user accounts'),
('BULK_IMPORT',              'Bulk Import Users',           'Administrative', 'Import multiple users at once via CSV or spreadsheet'),
-- Audit & logging
('VIEW_AUDIT_LOGS',          'View Audit Logs',             'Administrative', 'View system audit trail and login history'),
-- System administration
('VIEW_SYSTEM_LOGS',         'View System Logs',            'Administrative', 'View application and error logs'),
('MANAGE_BACKUPS',           'Manage Backups',              'Administrative', 'Create and restore system backups'),
('VIEW_BACKUPS',             'View Backups',                'Administrative', 'View list of available system backups'),
('MANAGE_SYSTEM',            'Manage System',               'Administrative', 'Run migrations, clear cache, toggle maintenance mode and manage system configuration');

-- ============================================================
-- ROLE -> PERMISSION GRANTS
-- ============================================================

-- SYS_ADMIN: full administrative + all module access
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
  );

-- SUPER_ADMIN: branch + user management + module access
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
  );

-- ============================================================
-- DEFAULT FACILITY
-- ============================================================
INSERT INTO facilities (facility_code, facility_name, facility_type, region, city)
VALUES ('GHS001', 'Test Hospital', 'Clinic Hospital', 'Ashanti', 'Kumasi');

-- ============================================================
-- DEFAULT DEPARTMENTS FOR DEFAULT FACILITY
-- ============================================================
INSERT INTO departments (facility_id, department_code, department_name, department_type)
SELECT
    f.id, d.code, d.name, d.type
FROM facilities f
CROSS JOIN (VALUES
    -- Clinical departments
    ('OPD',       'Outpatient Department',        'Clinical'),
    ('EMERG',     'Emergency & Casualty',         'Clinical'),
    ('IPD',       'Inpatient / Wards',            'Clinical'),
    ('MATERNITY', 'Maternity & Obstetrics',       'Clinical'),
    ('PAEDS',     'Paediatrics',                  'Clinical'),
    ('SURGERY',   'Surgery',                      'Clinical'),
    ('DENTAL',    'Dental Clinic',                'Clinical'),
    ('EYE',       'Eye Clinic',                   'Clinical'),
    ('ENT',       'ENT Clinic',                   'Clinical'),
    ('ORTHO',     'Orthopaedics',                 'Clinical'),
    ('DERMA',     'Dermatology',                  'Clinical'),
    ('MENTAL',    'Mental Health',                'Clinical'),
    ('PHYSIO',    'Physiotherapy',                'Clinical'),
    ('NUTRITION', 'Nutrition & Dietetics',        'Clinical'),
    -- Ancillary / diagnostic departments
    ('LAB',       'Laboratory',                   'Ancillary'),
    ('RADIOLOGY', 'Radiology & Imaging',          'Ancillary'),
    ('PHARMACY',  'Pharmacy',                     'Ancillary'),
    ('BLOOD_BANK','Blood Bank',                   'Ancillary'),
    ('ICU',       'Intensive Care Unit',          'Ancillary'),
    -- Administrative departments
    ('RECORDS',   'Medical Records',              'Administrative'),
    ('RECEPTION', 'Reception & Front Desk',       'Administrative'),
    ('BILLING',   'Billing & Accounts',           'Administrative'),
    ('INSURANCE', 'Insurance Office',             'Administrative'),
    ('STORES',    'Stores & Inventory',           'Administrative'),
    ('HR',        'Human Resources',              'Administrative'),
    ('ADMIN',     'General Administration',       'Administrative'),
    ('IT',        'Information Technology',       'Administrative')
) AS d(code, name, type)
WHERE f.facility_code = 'GHS001'
  AND NOT EXISTS (
    SELECT 1 FROM departments dep
    WHERE dep.facility_id = f.id AND dep.department_code = d.code
  );

-- ============================================================
-- MODULE SUBSCRIPTIONS FOR DEFAULT FACILITY
-- Enables all gated modules for out-of-the-box access.
-- Adjust end_date for production licensing.
-- ============================================================
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
-- DEFAULT SYSTEM USERS
-- WARNING: CHANGE THESE PASSWORDS IMMEDIATELY AFTER FIRST LOGIN
--
--   Role        | Email                        | Default Password
--   ------------|------------------------------|-----------------
--  SYS_ADMIN   | systemadmin@hms.local      | Admin123@
--  SYS_ADMIN   | nabgyamfi@hms.local      | Asamoah6523@
--  SYS_ADMIN   | drmarfo@hms.local      | Admin123@
--  SUPER_ADMIN | superadmin@hospital.local    | Admin@HMS2026!
--
-- Passwords are hashed with bcrypt (cost 10) via pgcrypto crypt().
-- The $2a$ prefix produced by pgcrypto is accepted by Node.js bcrypt.compare().
-- ============================================================
DO $$
DECLARE
    v_facility_id   UUID;
    v_sys_role_id   UUID;
    v_super_role_id UUID;
    v_sys_user_id   UUID;
    v_super_user_id UUID;
BEGIN
    SELECT id INTO v_facility_id   FROM facilities WHERE facility_code = 'GHS001'   LIMIT 1;
    SELECT id INTO v_sys_role_id   FROM roles      WHERE role_code = 'SYS_ADMIN'   LIMIT 1;
    SELECT id INTO v_super_role_id FROM roles      WHERE role_code = 'SUPER_ADMIN' LIMIT 1;

    -- SYS_ADMIN user
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sysadmin@hospital.local') THEN
        INSERT INTO users (
            employee_id,    facility_id,   title,
            first_name,     last_name,     email,
            username,       password_hash,  user_status,   two_factor_enabled,
            joining_date,   employment_status
        ) VALUES (
            'EMP-SYS-0001', v_facility_id, 'Mr',
            'System',      'Administrator','sysadmin@hospital.local',
            'sysadmin',
            crypt('Admin@HMS2026!', gen_salt('bf', 10)),
            'Active', false,
            CURRENT_DATE, 'Permanent'
        )
        RETURNING id INTO v_sys_user_id;
    ELSE
        SELECT id INTO v_sys_user_id FROM users WHERE email = 'sysadmin@hospital.local';
    END IF;

    INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
    SELECT v_sys_user_id, v_sys_role_id, v_facility_id, v_sys_user_id, true
    WHERE NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id     = v_sys_user_id
          AND role_id     = v_sys_role_id
          AND facility_id IS NOT DISTINCT FROM v_facility_id
          AND department_id IS NULL
    );

    -- SUPER_ADMIN user
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'superadmin@hospital.local') THEN
        INSERT INTO users (
            employee_id,     facility_id,   title,
            first_name,      last_name,     email,
            username,        password_hash,  user_status,   two_factor_enabled,
            joining_date,    employment_status
        ) VALUES (
            'EMP-SUP-0001',  v_facility_id, 'Mr',
            'Super',        'Administrator','superadmin@hospital.local',
            'superadmin',
            crypt('Admin@HMS2026!', gen_salt('bf', 10)),
            'Active', false,
            CURRENT_DATE, 'Permanent'
        )
        RETURNING id INTO v_super_user_id;
    ELSE
        SELECT id INTO v_super_user_id FROM users WHERE email = 'superadmin@hospital.local';
    END IF;

    INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
    SELECT v_super_user_id, v_super_role_id, v_facility_id, v_sys_user_id, true
    WHERE NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id     = v_super_user_id
          AND role_id     = v_super_role_id
          AND facility_id IS NOT DISTINCT FROM v_facility_id
          AND department_id IS NULL
    );

    -- ============================================================
    -- Additional SYS_ADMIN users (seeded on demand)
    -- ============================================================

    -- systemadmin@hms.local
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'systemadmin@hms.local') THEN
        INSERT INTO users (
            employee_id,    facility_id,   title,
            first_name,     last_name,     email,
            username,       password_hash, user_status,   two_factor_enabled,
            joining_date,   employment_status
        ) VALUES (
            'EMP-SYS-0002', v_facility_id, 'Mr',
            'System',      'Admin',       'systemadmin@hms.local',
            'systemadmin',
            crypt('Admin123@', gen_salt('bf', 10)),
            'Active', false,
            CURRENT_DATE, 'Permanent'
        );
    END IF;

    -- Assign SYS_ADMIN role to systemadmin
    INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
    SELECT u.id, v_sys_role_id, v_facility_id, v_sys_user_id, true
    FROM users u
    WHERE u.email = 'systemadmin@hms.local'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role_id = v_sys_role_id
          AND ur.facility_id IS NOT DISTINCT FROM v_facility_id
          AND ur.department_id IS NULL
    );

    -- nabgyamfi@hms.local
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'nabgyamfi@hms.local') THEN
        INSERT INTO users (
            employee_id,    facility_id,   title,
            first_name,     last_name,     email,
            username,       password_hash, user_status,   two_factor_enabled,
            joining_date,   employment_status
        ) VALUES (
            'EMP-SYS-0003', v_facility_id, 'Mr',
            'Nana',        'Gyamfi',      'nabgyamfi@hms.local',
            'nabgyamfi',
            crypt('Asamoah6523@', gen_salt('bf', 10)),
            'Active', false,
            CURRENT_DATE, 'Permanent'
        );
    END IF;

    -- Assign SYS_ADMIN role to nabgyamfi
    INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
    SELECT u.id, v_sys_role_id, v_facility_id, v_sys_user_id, true
    FROM users u
    WHERE u.email = 'nabgyamfi@hms.local'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role_id = v_sys_role_id
          AND ur.facility_id IS NOT DISTINCT FROM v_facility_id
          AND ur.department_id IS NULL
    );

    -- drmarfo@hms.local
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'drmarfo@hms.local') THEN
        INSERT INTO users (
            employee_id,    facility_id,   title,
            first_name,     last_name,     email,
            username,       password_hash, user_status,   two_factor_enabled,
            joining_date,   employment_status
        ) VALUES (
            'EMP-SYS-0004', v_facility_id, 'Dr',
            'Samuel',      'Marfo',       'drmarfo@hms.local',
            'drmarfo',
            crypt('Admin123@', gen_salt('bf', 10)),
            'Active', false,
            CURRENT_DATE, 'Permanent'
        );
    END IF;

    -- Assign SYS_ADMIN role to drmarfo
    INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
    SELECT u.id, v_sys_role_id, v_facility_id, v_sys_user_id, true
    FROM users u
    WHERE u.email = 'drmarfo@hms.local'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role_id = v_sys_role_id
          AND ur.facility_id IS NOT DISTINCT FROM v_facility_id
          AND ur.department_id IS NULL
    );

END $$;

-- ============================================================
-- DIAGNOSIS CATALOGUE  (Ghana Health Service – ICD-10)
-- Source: GHS Standard Treatment Guidelines (8th Ed.) &
--         ICD-10 codes approved for use in Ghana
-- ============================================================
INSERT INTO diagnosis_catalogue (diagnosis_code, diagnosis_name, icd_chapter, icd_category) VALUES

-- ── CHAPTER I  Certain infectious and parasitic diseases (A00–B99) ─────────
-- Intestinal infectious diseases
('A00.0', 'Cholera due to Vibrio cholerae 01, biovar cholerae',           'I', 'Intestinal infectious diseases'),
('A00.9', 'Cholera, unspecified',                                          'I', 'Intestinal infectious diseases'),
('A01.0', 'Typhoid fever',                                                 'I', 'Intestinal infectious diseases'),
('A01.1', 'Paratyphoid fever A',                                           'I', 'Intestinal infectious diseases'),
('A02.0', 'Salmonella enteritis',                                          'I', 'Intestinal infectious diseases'),
('A03.9', 'Shigellosis, unspecified',                                      'I', 'Intestinal infectious diseases'),
('A04.0', 'Enteropathogenic Escherichia coli infection',                   'I', 'Intestinal infectious diseases'),
('A06.0', 'Acute amoebic dysentery',                                       'I', 'Intestinal infectious diseases'),
('A06.9', 'Amoebiasis, unspecified',                                       'I', 'Intestinal infectious diseases'),
('A07.1', 'Giardiasis',                                                    'I', 'Intestinal infectious diseases'),
('A09',   'Other gastroenteritis and colitis of infectious origin',        'I', 'Intestinal infectious diseases'),
-- Tuberculosis
('A15.0', 'Tuberculosis of lung, confirmed by sputum smear',               'I', 'Tuberculosis'),
('A15.3', 'Tuberculosis of lung, confirmed by unspecified means',          'I', 'Tuberculosis'),
('A16.0', 'Tuberculosis of lung, smear-negative',                          'I', 'Tuberculosis'),
('A16.9', 'Respiratory tuberculosis, unspecified',                         'I', 'Tuberculosis'),
('A17.0', 'Tuberculous meningitis',                                        'I', 'Tuberculosis'),
('A18.0', 'Tuberculosis of bones and joints',                              'I', 'Tuberculosis'),
('A18.1', 'Tuberculosis of genitourinary system',                          'I', 'Tuberculosis'),
('A19.9', 'Miliary tuberculosis, unspecified',                             'I', 'Tuberculosis'),
-- Bacterial zoonoses
('A22.9', 'Anthrax, unspecified',                                          'I', 'Bacterial zoonoses'),
('A27.9', 'Leptospirosis, unspecified',                                    'I', 'Bacterial zoonoses'),
-- Tetanus/diphtheria/pertussis
('A33',   'Tetanus neonatorum',                                            'I', 'Tetanus and related'),
('A34',   'Obstetrical tetanus',                                           'I', 'Tetanus and related'),
('A35',   'Other tetanus',                                                 'I', 'Tetanus and related'),
('A36.0', 'Pharyngeal diphtheria',                                         'I', 'Tetanus and related'),
('A37.0', 'Whooping cough due to Bordetella pertussis',                    'I', 'Tetanus and related'),
('A38',   'Scarlet fever',                                                 'I', 'Tetanus and related'),
-- Septicaemia / meningitis
('A39.0', 'Meningococcal meningitis',                                      'I', 'Bacterial septicaemia and meningitis'),
('A40.9', 'Streptococcal septicaemia, unspecified',                        'I', 'Bacterial septicaemia and meningitis'),
('A41.9', 'Septicaemia, unspecified',                                      'I', 'Bacterial septicaemia and meningitis'),
('A46',   'Erysipelas',                                                    'I', 'Bacterial septicaemia and meningitis'),
('A48.0', 'Gas gangrene',                                                  'I', 'Bacterial septicaemia and meningitis'),
('A49.0', 'Staphylococcal infection, unspecified site',                    'I', 'Bacterial septicaemia and meningitis'),
('A49.1', 'Streptococcal infection, unspecified site',                     'I', 'Bacterial septicaemia and meningitis'),
-- STIs
('A50.9', 'Congenital syphilis, unspecified',                              'I', 'Sexually transmitted infections'),
('A51.0', 'Primary genital syphilis',                                      'I', 'Sexually transmitted infections'),
('A51.9', 'Early syphilis, unspecified',                                   'I', 'Sexually transmitted infections'),
('A52.9', 'Late syphilis, unspecified',                                    'I', 'Sexually transmitted infections'),
('A53.9', 'Syphilis, unspecified',                                         'I', 'Sexually transmitted infections'),
('A54.0', 'Gonococcal infection of lower genitourinary tract',             'I', 'Sexually transmitted infections'),
('A54.9', 'Gonococcal infection, unspecified',                             'I', 'Sexually transmitted infections'),
('A55',   'Chlamydial lymphogranuloma (venereum)',                         'I', 'Sexually transmitted infections'),
('A56.0', 'Chlamydial infection of lower genitourinary tract',             'I', 'Sexually transmitted infections'),
('A57',   'Chancroid',                                                     'I', 'Sexually transmitted infections'),
('A59.0', 'Urogenital trichomoniasis',                                     'I', 'Sexually transmitted infections'),
('A60.0', 'Herpesviral infection of genitalia and urogenital tract',       'I', 'Sexually transmitted infections'),
('A63.0', 'Anogenital (venereal) warts',                                   'I', 'Sexually transmitted infections'),
('A64',   'Unspecified sexually transmitted disease',                      'I', 'Sexually transmitted infections'),
-- Rickettsia / other bacterial
('A69.0', 'Necrotising ulcerative stomatitis',                             'I', 'Other bacterial diseases'),
('A74.9', 'Chlamydial infection, unspecified',                             'I', 'Other bacterial diseases'),
-- Viral infections of CNS
('A80.9', 'Acute poliomyelitis, unspecified',                              'I', 'Viral infections of CNS'),
('A82.0', 'Sylvatic rabies',                                               'I', 'Viral infections of CNS'),
('A87.0', 'Enteroviral meningitis',                                        'I', 'Viral infections of CNS'),
('A87.9', 'Viral meningitis, unspecified',                                 'I', 'Viral infections of CNS'),
-- Arthropod-borne viral fevers
('A90',   'Dengue fever',                                                  'I', 'Arthropod-borne viral fevers'),
('A91',   'Dengue haemorrhagic fever',                                     'I', 'Arthropod-borne viral fevers'),
('A92.0', 'Chikungunya virus disease',                                     'I', 'Arthropod-borne viral fevers'),
('A95.0', 'Sylvatic yellow fever',                                         'I', 'Arthropod-borne viral fevers'),
('A95.1', 'Urban yellow fever',                                            'I', 'Arthropod-borne viral fevers'),
('A95.9', 'Yellow fever, unspecified',                                     'I', 'Arthropod-borne viral fevers'),
-- Viral haemorrhagic fevers
('A98.3', 'Marburg virus disease',                                         'I', 'Viral haemorrhagic fevers'),
('A98.4', 'Ebola virus disease',                                           'I', 'Viral haemorrhagic fevers'),
-- Herpesviral
('B00.0', 'Eczema herpeticum',                                             'I', 'Herpesviral diseases'),
('B00.1', 'Herpesviral vesicular dermatitis',                              'I', 'Herpesviral diseases'),
('B00.5', 'Herpesviral ocular disease',                                    'I', 'Herpesviral diseases'),
('B00.9', 'Herpesviral infection, unspecified',                            'I', 'Herpesviral diseases'),
('B01.9', 'Varicella without complication (chickenpox)',                   'I', 'Herpesviral diseases'),
('B02.9', 'Zoster without complication (shingles)',                        'I', 'Herpesviral diseases'),
-- Measles / rubella / pox
('B05.0', 'Measles complicated by encephalitis',                           'I', 'Viral exanthemata'),
('B05.9', 'Measles without complication',                                  'I', 'Viral exanthemata'),
('B06.9', 'Rubella without complication',                                  'I', 'Viral exanthemata'),
('B07',   'Viral warts',                                                   'I', 'Viral exanthemata'),
('B09',   'Unspecified viral infection with skin/mucous membrane lesions', 'I', 'Viral exanthemata'),
-- Viral hepatitis
('B15.0', 'Hepatitis A with hepatic coma',                                 'I', 'Viral hepatitis'),
('B15.9', 'Hepatitis A without hepatic coma',                              'I', 'Viral hepatitis'),
('B16.9', 'Acute hepatitis B without delta-agent, without coma',           'I', 'Viral hepatitis'),
('B17.1', 'Acute hepatitis C',                                             'I', 'Viral hepatitis'),
('B18.0', 'Chronic viral hepatitis B with delta-agent',                    'I', 'Viral hepatitis'),
('B18.1', 'Chronic viral hepatitis B without delta-agent',                 'I', 'Viral hepatitis'),
('B18.2', 'Chronic viral hepatitis C',                                     'I', 'Viral hepatitis'),
('B19.9', 'Unspecified viral hepatitis without hepatic coma',              'I', 'Viral hepatitis'),
-- HIV disease
('B20.0', 'HIV disease resulting in mycobacterial infection',              'I', 'HIV disease'),
('B20.9', 'HIV disease resulting in unspecified infectious disease',       'I', 'HIV disease'),
('B22.0', 'HIV disease resulting in encephalopathy',                       'I', 'HIV disease'),
('B23.8', 'HIV disease resulting in other specified conditions',           'I', 'HIV disease'),
('B24',   'Unspecified human immunodeficiency virus (HIV) disease',        'I', 'HIV disease'),
-- Mycoses
('B35.0', 'Tinea capitis (ringworm of scalp)',                             'I', 'Mycoses'),
('B35.1', 'Tinea unguium (onychomycosis)',                                 'I', 'Mycoses'),
('B35.3', 'Tinea pedis (athlete''s foot)',                                 'I', 'Mycoses'),
('B35.4', 'Tinea corporis (ringworm of the body)',                         'I', 'Mycoses'),
('B36.0', 'Pityriasis versicolor',                                         'I', 'Mycoses'),
('B37.0', 'Candidal stomatitis (oral thrush)',                             'I', 'Mycoses'),
('B37.2', 'Candidiasis of skin and nail',                                  'I', 'Mycoses'),
('B37.3', 'Candidiasis of vulva and vagina',                               'I', 'Mycoses'),
('B37.9', 'Candidiasis, unspecified',                                      'I', 'Mycoses'),
('B44.1', 'Other pulmonary aspergillosis',                                 'I', 'Mycoses'),
('B45.0', 'Pulmonary cryptococcosis',                                      'I', 'Mycoses'),
('B45.1', 'Cerebral cryptococcosis',                                       'I', 'Mycoses'),
('B47.0', 'Eumycetoma',                                                    'I', 'Mycoses'),
('B49',   'Unspecified mycosis',                                           'I', 'Mycoses'),
-- Malaria (highest priority in Ghana)
('B50.0', 'Plasmodium falciparum malaria with cerebral complications',     'I', 'Malaria'),
('B50.9', 'Plasmodium falciparum malaria, unspecified',                    'I', 'Malaria'),
('B51.0', 'Plasmodium vivax malaria with rupture of spleen',               'I', 'Malaria'),
('B51.9', 'Plasmodium vivax malaria without complication',                 'I', 'Malaria'),
('B52.9', 'Plasmodium malariae malaria without complication',              'I', 'Malaria'),
('B53.8', 'Other parasitologically confirmed malaria',                     'I', 'Malaria'),
('B54',   'Unspecified malaria',                                           'I', 'Malaria'),
-- Leishmaniasis / trypanosomiasis
('B55.0', 'Visceral leishmaniasis (kala-azar)',                            'I', 'Protozoan diseases'),
('B55.1', 'Cutaneous leishmaniasis',                                       'I', 'Protozoan diseases'),
('B57.2', 'Chagas disease (chronic) with heart involvement',               'I', 'Protozoan diseases'),
-- Helminthiases
('B65.0', 'Schistosomiasis due to Schistosoma haematobium',               'I', 'Helminthiases'),
('B65.1', 'Schistosomiasis due to Schistosoma mansoni',                   'I', 'Helminthiases'),
('B65.9', 'Schistosomiasis, unspecified',                                  'I', 'Helminthiases'),
('B68.0', 'Taenia solium taeniasis',                                       'I', 'Helminthiases'),
('B68.9', 'Taeniasis, unspecified',                                        'I', 'Helminthiases'),
('B69.0', 'Cysticercosis of central nervous system',                       'I', 'Helminthiases'),
('B72',   'Dracunculiasis (Guinea-worm disease)',                          'I', 'Helminthiases'),
('B73',   'Onchocerciasis (river blindness)',                              'I', 'Helminthiases'),
('B74.0', 'Filariasis due to Wuchereria bancrofti (lymphatic filariasis)', 'I', 'Helminthiases'),
('B74.3', 'Loiasis',                                                       'I', 'Helminthiases'),
('B76.0', 'Ancylostomiasis (hookworm)',                                    'I', 'Helminthiases'),
('B76.9', 'Hookworm disease, unspecified',                                 'I', 'Helminthiases'),
('B77.0', 'Ascariasis with intestinal complications',                      'I', 'Helminthiases'),
('B77.9', 'Ascariasis, unspecified',                                       'I', 'Helminthiases'),
('B78.0', 'Intestinal strongyloidiasis',                                   'I', 'Helminthiases'),
('B79',   'Trichuriasis (whipworm)',                                       'I', 'Helminthiases'),
('B80',   'Enterobiasis (pinworm)',                                        'I', 'Helminthiases'),
-- Ectoparasites
('B85.0', 'Pediculosis due to Pediculus humanus capitis (head lice)',      'I', 'Ectoparasites'),
('B86',   'Scabies',                                                       'I', 'Ectoparasites'),
('B87.0', 'Cutaneous myiasis',                                             'I', 'Ectoparasites'),

-- ── CHAPTER II  Neoplasms (C00–D48) ────────────────────────────────────────
('C15.9', 'Malignant neoplasm of oesophagus, unspecified',                 'II', 'Malignant neoplasms'),
('C16.9', 'Malignant neoplasm of stomach, unspecified',                    'II', 'Malignant neoplasms'),
('C18.9', 'Malignant neoplasm of colon, unspecified',                      'II', 'Malignant neoplasms'),
('C20',   'Malignant neoplasm of rectum',                                  'II', 'Malignant neoplasms'),
('C22.0', 'Hepatocellular carcinoma',                                      'II', 'Malignant neoplasms'),
('C22.9', 'Malignant neoplasm of liver, unspecified',                      'II', 'Malignant neoplasms'),
('C25.9', 'Malignant neoplasm of pancreas, unspecified',                   'II', 'Malignant neoplasms'),
('C34.9', 'Malignant neoplasm of bronchus and lung, unspecified',          'II', 'Malignant neoplasms'),
('C43.9', 'Malignant melanoma of skin, unspecified',                       'II', 'Malignant neoplasms'),
('C44.9', 'Other malignant neoplasm of skin, unspecified',                 'II', 'Malignant neoplasms'),
('C50.9', 'Malignant neoplasm of breast, unspecified',                     'II', 'Malignant neoplasms'),
('C53.9', 'Malignant neoplasm of cervix uteri, unspecified',               'II', 'Malignant neoplasms'),
('C54.1', 'Malignant neoplasm of endometrium',                             'II', 'Malignant neoplasms'),
('C56',   'Malignant neoplasm of ovary',                                   'II', 'Malignant neoplasms'),
('C61',   'Malignant neoplasm of prostate',                                'II', 'Malignant neoplasms'),
('C67.9', 'Malignant neoplasm of bladder, unspecified',                    'II', 'Malignant neoplasms'),
('C71.9', 'Malignant neoplasm of brain, unspecified',                      'II', 'Malignant neoplasms'),
('C73',   'Malignant neoplasm of thyroid gland',                           'II', 'Malignant neoplasms'),
('C80.9', 'Malignant neoplasm, unspecified',                               'II', 'Malignant neoplasms'),
('C81.9', 'Hodgkin lymphoma, unspecified',                                 'II', 'Malignant neoplasms'),
('C83.9', 'Non-Hodgkin lymphoma, unspecified',                             'II', 'Malignant neoplasms'),
('C90.0', 'Multiple myeloma',                                              'II', 'Malignant neoplasms'),
('C91.0', 'Acute lymphoblastic leukaemia',                                 'II', 'Malignant neoplasms'),
('C92.0', 'Acute myeloblastic leukaemia',                                  'II', 'Malignant neoplasms'),
('D05.9', 'Carcinoma in situ of breast, unspecified',                      'II', 'In situ neoplasms'),
('D25.9', 'Leiomyoma of uterus, unspecified (fibroids)',                   'II', 'Benign neoplasms'),
('D27',   'Benign neoplasm of ovary',                                      'II', 'Benign neoplasms'),
('D34',   'Benign neoplasm of thyroid gland',                              'II', 'Benign neoplasms'),

-- ── CHAPTER III  Blood and blood-forming organs (D50–D89) ──────────────────
('D50.0', 'Iron deficiency anaemia secondary to blood loss (chronic)',     'III', 'Anaemias'),
('D50.9', 'Iron deficiency anaemia, unspecified',                          'III', 'Anaemias'),
('D51.0', 'Vitamin B12 deficiency anaemia due to intrinsic factor deficiency', 'III', 'Anaemias'),
('D52.0', 'Dietary folate deficiency anaemia',                             'III', 'Anaemias'),
('D53.9', 'Nutritional anaemia, unspecified',                              'III', 'Anaemias'),
('D55.0', 'Anaemia due to glucose-6-phosphate dehydrogenase (G6PD) deficiency', 'III', 'Anaemias'),
('D56.0', 'Alpha thalassaemia',                                            'III', 'Haemolytic anaemias'),
('D56.1', 'Beta thalassaemia',                                             'III', 'Haemolytic anaemias'),
('D57.0', 'Sickle-cell anaemia with crisis',                               'III', 'Haemolytic anaemias'),
('D57.1', 'Sickle-cell anaemia without crisis',                            'III', 'Haemolytic anaemias'),
('D57.2', 'Double heterozygous sickling disorders (HbSC disease)',         'III', 'Haemolytic anaemias'),
('D64.9', 'Anaemia, unspecified',                                          'III', 'Anaemias'),
('D65',   'Disseminated intravascular coagulation (DIC)',                  'III', 'Coagulation defects'),
('D69.3', 'Idiopathic thrombocytopenic purpura (ITP)',                     'III', 'Coagulation defects'),

-- ── CHAPTER IV  Endocrine, nutritional and metabolic diseases (E00–E90) ────
('E01.2', 'Iodine-deficiency related diffuse goitre',                      'IV', 'Thyroid disorders'),
('E03.9', 'Hypothyroidism, unspecified',                                   'IV', 'Thyroid disorders'),
('E05.0', 'Thyrotoxicosis with diffuse goitre (Graves'' disease)',         'IV', 'Thyroid disorders'),
('E06.3', 'Autoimmune thyroiditis (Hashimoto''s disease)',                 'IV', 'Thyroid disorders'),
('E10.0', 'Type 1 diabetes mellitus with coma',                            'IV', 'Diabetes mellitus'),
('E10.9', 'Type 1 diabetes mellitus without complications',                'IV', 'Diabetes mellitus'),
('E11.0', 'Type 2 diabetes mellitus with coma',                            'IV', 'Diabetes mellitus'),
('E11.5', 'Type 2 diabetes mellitus with peripheral circulatory complications', 'IV', 'Diabetes mellitus'),
('E11.6', 'Type 2 diabetes mellitus with other specified complications',   'IV', 'Diabetes mellitus'),
('E11.9', 'Type 2 diabetes mellitus without complications',                'IV', 'Diabetes mellitus'),
('E14.9', 'Unspecified diabetes mellitus without complications',           'IV', 'Diabetes mellitus'),
('E16.2', 'Hypoglycaemia, unspecified',                                    'IV', 'Diabetes mellitus'),
('E27.1', 'Primary adrenocortical insufficiency (Addison''s disease)',     'IV', 'Adrenal disorders'),
-- Malnutrition (significant disease burden in Ghana)
('E40',   'Kwashiorkor',                                                   'IV', 'Malnutrition'),
('E41',   'Nutritional marasmus',                                          'IV', 'Malnutrition'),
('E43',   'Unspecified severe protein-energy malnutrition',                'IV', 'Malnutrition'),
('E44.0', 'Moderate protein-energy malnutrition',                          'IV', 'Malnutrition'),
('E44.1', 'Mild protein-energy malnutrition',                              'IV', 'Malnutrition'),
('E45',   'Retarded development following protein-energy malnutrition',    'IV', 'Malnutrition'),
('E46',   'Unspecified protein-energy malnutrition',                       'IV', 'Malnutrition'),
('E50.0', 'Vitamin A deficiency with conjunctival xerosis',                'IV', 'Vitamin deficiencies'),
('E50.9', 'Vitamin A deficiency, unspecified',                             'IV', 'Vitamin deficiencies'),
('E51.1', 'Beriberi',                                                      'IV', 'Vitamin deficiencies'),
('E55.0', 'Rickets, active',                                               'IV', 'Vitamin deficiencies'),
('E55.9', 'Vitamin D deficiency, unspecified',                             'IV', 'Vitamin deficiencies'),
('E64.0', 'Sequelae of protein-energy malnutrition',                       'IV', 'Malnutrition'),
('E66.9', 'Obesity, unspecified',                                          'IV', 'Obesity'),
('E78.0', 'Pure hypercholesterolaemia',                                    'IV', 'Metabolic disorders'),
('E78.5', 'Hyperlipidaemia, unspecified',                                  'IV', 'Metabolic disorders'),
('E87.1', 'Hypo-osmolality and hyponatraemia',                             'IV', 'Metabolic disorders'),
('E87.6', 'Hypokalaemia',                                                  'IV', 'Metabolic disorders'),
('E87.7', 'Fluid overload',                                                'IV', 'Metabolic disorders'),

-- ── CHAPTER V  Mental and behavioural disorders (F00–F99) ──────────────────
('F05.9', 'Delirium, unspecified',                                         'V', 'Mental disorders'),
('F10.2', 'Mental and behavioural disorders due to alcohol, dependence',   'V', 'Substance use disorders'),
('F19.2', 'Mental disorders due to multiple drug use, dependence',         'V', 'Substance use disorders'),
('F20.0', 'Paranoid schizophrenia',                                        'V', 'Psychotic disorders'),
('F20.9', 'Schizophrenia, unspecified',                                    'V', 'Psychotic disorders'),
('F23.9', 'Acute and transient psychotic disorder, unspecified',           'V', 'Psychotic disorders'),
('F25.9', 'Schizoaffective disorder, unspecified',                         'V', 'Psychotic disorders'),
('F31.9', 'Bipolar affective disorder, unspecified',                       'V', 'Mood disorders'),
('F32.0', 'Mild depressive episode',                                       'V', 'Mood disorders'),
('F32.1', 'Moderate depressive episode',                                   'V', 'Mood disorders'),
('F32.2', 'Severe depressive episode without psychotic symptoms',          'V', 'Mood disorders'),
('F32.9', 'Depressive episode, unspecified',                               'V', 'Mood disorders'),
('F33.9', 'Recurrent depressive disorder, unspecified',                    'V', 'Mood disorders'),
('F40.1', 'Social phobias',                                                'V', 'Anxiety disorders'),
('F41.0', 'Panic disorder (episodic paroxysmal anxiety)',                  'V', 'Anxiety disorders'),
('F41.1', 'Generalised anxiety disorder',                                  'V', 'Anxiety disorders'),
('F41.9', 'Anxiety disorder, unspecified',                                 'V', 'Anxiety disorders'),
('F43.1', 'Post-traumatic stress disorder (PTSD)',                         'V', 'Anxiety disorders'),
('F50.0', 'Anorexia nervosa',                                              'V', 'Eating disorders'),
('F70',   'Mild intellectual disability',                                  'V', 'Intellectual disabilities'),
('F84.0', 'Childhood autism',                                              'V', 'Pervasive developmental disorders'),
('F90.0', 'Disturbance of activity and attention (ADHD)',                  'V', 'Behavioural disorders'),
('F99',   'Mental disorder, not otherwise specified',                      'V', 'Mental disorders'),

-- ── CHAPTER VI  Diseases of the nervous system (G00–G99) ───────────────────
('G00.0', 'Haemophilus meningitis',                                        'VI', 'Inflammatory diseases of CNS'),
('G00.1', 'Pneumococcal meningitis',                                       'VI', 'Inflammatory diseases of CNS'),
('G00.3', 'Staphylococcal meningitis',                                     'VI', 'Inflammatory diseases of CNS'),
('G00.9', 'Bacterial meningitis, unspecified',                             'VI', 'Inflammatory diseases of CNS'),
('G03.9', 'Meningitis, unspecified',                                       'VI', 'Inflammatory diseases of CNS'),
('G04.9', 'Encephalitis, myelitis and encephalomyelitis, unspecified',     'VI', 'Inflammatory diseases of CNS'),
('G20',   'Parkinson''s disease',                                          'VI', 'Extrapyramidal disorders'),
('G35',   'Multiple sclerosis',                                            'VI', 'Demyelinating diseases'),
('G40.0', 'Localisation-related epilepsy with seizures of localised onset','VI', 'Episodic disorders'),
('G40.3', 'Generalised idiopathic epilepsy and epileptic syndromes',       'VI', 'Episodic disorders'),
('G40.9', 'Epilepsy, unspecified',                                         'VI', 'Episodic disorders'),
('G43.0', 'Migraine without aura (common migraine)',                       'VI', 'Episodic disorders'),
('G43.9', 'Migraine, unspecified',                                         'VI', 'Episodic disorders'),
('G44.2', 'Tension-type headache',                                         'VI', 'Episodic disorders'),
('G45.9', 'Transient cerebral ischaemic attack (TIA), unspecified',        'VI', 'Episodic disorders'),
('G47.0', 'Disorders of initiating and maintaining sleep (insomnia)',      'VI', 'Sleep disorders'),
('G51.0', 'Bell palsy',                                                    'VI', 'Nerve, nerve root and plexus disorders'),
('G62.9', 'Polyneuropathy, unspecified',                                   'VI', 'Polyneuropathies'),
('G63.2', 'Diabetic polyneuropathy',                                       'VI', 'Polyneuropathies'),
('G80.1', 'Spastic diplegic cerebral palsy',                               'VI', 'Cerebral palsy'),
('G81.9', 'Hemiplegia, unspecified',                                       'VI', 'Paralytic syndromes'),
('G93.1', 'Anoxic brain damage, not elsewhere classified',                 'VI', 'Other disorders of brain'),

-- ── CHAPTER VII  Diseases of the eye (H00–H59) ─────────────────────────────
('H00.0', 'Hordeolum (stye)',                                              'VII', 'Disorders of eyelid'),
('H01.0', 'Blepharitis',                                                   'VII', 'Disorders of eyelid'),
('H02.0', 'Entropion',                                                     'VII', 'Disorders of eyelid'),
('H02.1', 'Ectropion',                                                     'VII', 'Disorders of eyelid'),
('H04.3', 'Acute inflammation of lacrimal passages (dacryocystitis)',      'VII', 'Disorders of lacrimal system'),
('H10.0', 'Mucopurulent conjunctivitis',                                   'VII', 'Conjunctival disorders'),
('H10.1', 'Acute atopic conjunctivitis',                                   'VII', 'Conjunctival disorders'),
('H10.3', 'Acute conjunctivitis, unspecified',                             'VII', 'Conjunctival disorders'),
('H10.9', 'Conjunctivitis, unspecified',                                   'VII', 'Conjunctival disorders'),
('H11.3', 'Conjunctival haemorrhage',                                      'VII', 'Conjunctival disorders'),
('H16.0', 'Corneal ulcer',                                                 'VII', 'Keratitis'),
('H16.9', 'Keratitis, unspecified',                                        'VII', 'Keratitis'),
('H20.0', 'Acute and subacute iridocyclitis (uveitis)',                    'VII', 'Disorders of iris and ciliary body'),
('H25.0', 'Senile incipient cataract (age-related cataract)',              'VII', 'Disorders of lens'),
('H25.9', 'Senile cataract, unspecified',                                  'VII', 'Disorders of lens'),
('H26.0', 'Infantile and juvenile cataract',                               'VII', 'Disorders of lens'),
('H26.9', 'Unspecified cataract',                                          'VII', 'Disorders of lens'),
('H33.0', 'Retinal detachment with retinal break',                         'VII', 'Disorders of choroid and retina'),
('H35.0', 'Background retinopathy and retinal vascular changes',           'VII', 'Disorders of choroid and retina'),
('H36.0', 'Diabetic retinopathy',                                          'VII', 'Disorders of choroid and retina'),
('H40.1', 'Open-angle glaucoma',                                           'VII', 'Glaucoma'),
('H40.2', 'Primary angle-closure glaucoma',                                'VII', 'Glaucoma'),
('H40.9', 'Glaucoma, unspecified',                                         'VII', 'Glaucoma'),
('H43.1', 'Vitreous haemorrhage',                                          'VII', 'Disorders of vitreous body'),
('H46',   'Optic neuritis',                                                'VII', 'Disorders of optic nerve'),
('H50.0', 'Convergent concomitant strabismus (esotropia)',                 'VII', 'Strabismus'),
('H50.1', 'Divergent concomitant strabismus (exotropia)',                  'VII', 'Strabismus'),
('H52.0', 'Hypermetropia (long-sightedness)',                              'VII', 'Disorders of refraction'),
('H52.1', 'Myopia (short-sightedness)',                                    'VII', 'Disorders of refraction'),
('H52.2', 'Astigmatism',                                                   'VII', 'Disorders of refraction'),
('H52.4', 'Presbyopia',                                                    'VII', 'Disorders of refraction'),
('H53.0', 'Amblyopia ex anopsia',                                          'VII', 'Visual disturbances'),
('H54.0', 'Blindness, both eyes',                                          'VII', 'Visual impairment'),
('H54.4', 'Blindness, one eye',                                            'VII', 'Visual impairment'),
('H57.1', 'Ocular pain',                                                   'VII', 'Visual disturbances'),
-- Diseases of ear
('H66.0', 'Acute suppurative otitis media',                                'VIII', 'Diseases of middle ear'),
('H66.1', 'Chronic tubotympanic suppurative otitis media',                 'VIII', 'Diseases of middle ear'),
('H66.9', 'Otitis media, unspecified',                                     'VIII', 'Diseases of middle ear'),
('H70.0', 'Acute mastoiditis',                                             'VIII', 'Diseases of middle ear'),
('H72.0', 'Central perforation of tympanic membrane',                     'VIII', 'Diseases of middle ear'),
('H81.0', 'Meniere''s disease',                                            'VIII', 'Diseases of inner ear'),
('H90.0', 'Conductive hearing loss, bilateral',                            'VIII', 'Hearing loss'),
('H91.9', 'Hearing loss, unspecified',                                     'VIII', 'Hearing loss'),

-- ── CHAPTER IX  Diseases of the circulatory system (I00–I99) ───────────────
('I00',   'Rheumatic fever without heart involvement',                     'IX', 'Acute rheumatic fever'),
('I01.9', 'Rheumatic fever with heart involvement, unspecified',           'IX', 'Acute rheumatic fever'),
('I05.0', 'Rheumatic mitral stenosis',                                     'IX', 'Chronic rheumatic heart disease'),
('I09.0', 'Rheumatic myocarditis',                                         'IX', 'Chronic rheumatic heart disease'),
('I10',   'Essential (primary) hypertension',                              'IX', 'Hypertensive diseases'),
('I11.0', 'Hypertensive heart disease with congestive heart failure',      'IX', 'Hypertensive diseases'),
('I11.9', 'Hypertensive heart disease without congestive heart failure',   'IX', 'Hypertensive diseases'),
('I12.0', 'Hypertensive renal disease with renal failure',                 'IX', 'Hypertensive diseases'),
('I13.0', 'Hypertensive heart and renal disease with heart failure',       'IX', 'Hypertensive diseases'),
('I15.9', 'Secondary hypertension, unspecified',                           'IX', 'Hypertensive diseases'),
('I20.0', 'Unstable angina',                                               'IX', 'Ischaemic heart disease'),
('I20.9', 'Angina pectoris, unspecified',                                  'IX', 'Ischaemic heart disease'),
('I21.0', 'Acute transmural myocardial infarction of anterior wall (STEMI)', 'IX', 'Ischaemic heart disease'),
('I21.4', 'Acute subendocardial myocardial infarction (NSTEMI)',           'IX', 'Ischaemic heart disease'),
('I21.9', 'Acute myocardial infarction, unspecified',                      'IX', 'Ischaemic heart disease'),
('I25.1', 'Atherosclerotic heart disease (coronary artery disease)',       'IX', 'Ischaemic heart disease'),
('I25.9', 'Chronic ischaemic heart disease, unspecified',                  'IX', 'Ischaemic heart disease'),
('I26.9', 'Pulmonary embolism without mention of acute cor pulmonale',     'IX', 'Pulmonary embolism'),
('I42.0', 'Dilated cardiomyopathy',                                        'IX', 'Cardiomyopathy'),
('I42.9', 'Cardiomyopathy, unspecified',                                   'IX', 'Cardiomyopathy'),
('I48.0', 'Paroxysmal atrial fibrillation',                                'IX', 'Cardiac arrhythmias'),
('I48.9', 'Atrial fibrillation and flutter, unspecified',                  'IX', 'Cardiac arrhythmias'),
('I49.9', 'Cardiac arrhythmia, unspecified',                               'IX', 'Cardiac arrhythmias'),
('I50.0', 'Congestive heart failure',                                      'IX', 'Heart failure'),
('I50.1', 'Left ventricular failure',                                      'IX', 'Heart failure'),
('I50.9', 'Heart failure, unspecified',                                    'IX', 'Heart failure'),
('I60.9', 'Subarachnoid haemorrhage, unspecified',                         'IX', 'Cerebrovascular diseases'),
('I61.9', 'Intracerebral haemorrhage, unspecified',                        'IX', 'Cerebrovascular diseases'),
('I63.9', 'Cerebral infarction, unspecified',                              'IX', 'Cerebrovascular diseases'),
('I64',   'Stroke, not specified as haemorrhage or infarction',            'IX', 'Cerebrovascular diseases'),
('I67.4', 'Hypertensive encephalopathy',                                   'IX', 'Cerebrovascular diseases'),
('I69.4', 'Sequelae of stroke, not specified as haemorrhage or infarction','IX', 'Cerebrovascular diseases'),
('I70.2', 'Atherosclerosis of arteries of extremities',                    'IX', 'Diseases of arteries'),
('I73.9', 'Peripheral vascular disease, unspecified',                      'IX', 'Diseases of arteries'),
('I80.1', 'Phlebitis and thrombophlebitis of femoral vein',                'IX', 'Diseases of veins'),
('I83.9', 'Varicose veins of lower extremities without ulcer',             'IX', 'Diseases of veins'),
('I84.9', 'Unspecified haemorrhoids',                                      'IX', 'Diseases of veins'),
('I89.0', 'Lymphoedema, not elsewhere classified',                         'IX', 'Diseases of lymphatic system'),
('I95.1', 'Orthostatic hypotension',                                       'IX', 'Other disorders of circulatory system'),

-- ── CHAPTER X  Diseases of the respiratory system (J00–J99) ────────────────
('J00',   'Acute nasopharyngitis (common cold)',                            'X', 'Acute upper respiratory infections'),
('J01.0', 'Acute maxillary sinusitis',                                     'X', 'Acute upper respiratory infections'),
('J01.9', 'Acute sinusitis, unspecified',                                  'X', 'Acute upper respiratory infections'),
('J02.0', 'Streptococcal pharyngitis',                                     'X', 'Acute upper respiratory infections'),
('J02.9', 'Acute pharyngitis, unspecified',                                'X', 'Acute upper respiratory infections'),
('J03.0', 'Streptococcal tonsillitis',                                     'X', 'Acute upper respiratory infections'),
('J03.9', 'Acute tonsillitis, unspecified',                                'X', 'Acute upper respiratory infections'),
('J04.0', 'Acute laryngitis',                                              'X', 'Acute upper respiratory infections'),
('J06.9', 'Acute upper respiratory infection, unspecified',                'X', 'Acute upper respiratory infections'),
('J10.1', 'Influenza with other respiratory manifestations, virus identified', 'X', 'Influenza and pneumonia'),
('J11.0', 'Influenza with pneumonia, virus not identified',                'X', 'Influenza and pneumonia'),
('J11.1', 'Influenza with other respiratory manifestations, virus not identified', 'X', 'Influenza and pneumonia'),
('J12.9', 'Viral pneumonia, unspecified',                                  'X', 'Influenza and pneumonia'),
('J13',   'Pneumonia due to Streptococcus pneumoniae',                     'X', 'Influenza and pneumonia'),
('J14',   'Pneumonia due to Haemophilus influenzae',                       'X', 'Influenza and pneumonia'),
('J15.0', 'Pneumonia due to Klebsiella pneumoniae',                        'X', 'Influenza and pneumonia'),
('J15.2', 'Pneumonia due to staphylococci',                                'X', 'Influenza and pneumonia'),
('J15.9', 'Unspecified bacterial pneumonia',                               'X', 'Influenza and pneumonia'),
('J18.0', 'Bronchopneumonia, unspecified',                                 'X', 'Influenza and pneumonia'),
('J18.1', 'Lobar pneumonia, unspecified',                                  'X', 'Influenza and pneumonia'),
('J18.9', 'Pneumonia, unspecified',                                        'X', 'Influenza and pneumonia'),
('J20.9', 'Acute bronchitis, unspecified',                                 'X', 'Acute lower respiratory infections'),
('J21.0', 'Acute bronchiolitis due to respiratory syncytial virus',        'X', 'Acute lower respiratory infections'),
('J21.9', 'Acute bronchiolitis, unspecified',                              'X', 'Acute lower respiratory infections'),
('J22',   'Unspecified acute lower respiratory infection',                 'X', 'Acute lower respiratory infections'),
('J30.4', 'Allergic rhinitis, unspecified',                                'X', 'Chronic rhinitis and sinusitis'),
('J31.0', 'Chronic rhinitis',                                              'X', 'Chronic rhinitis and sinusitis'),
('J32.0', 'Chronic maxillary sinusitis',                                   'X', 'Chronic rhinitis and sinusitis'),
('J35.0', 'Chronic tonsillitis',                                           'X', 'Chronic diseases of tonsils'),
('J40',   'Bronchitis, not specified as acute or chronic',                 'X', 'Chronic lower respiratory diseases'),
('J44.0', 'COPD with acute lower respiratory infection',                   'X', 'Chronic lower respiratory diseases'),
('J44.1', 'COPD with acute exacerbation',                                  'X', 'Chronic lower respiratory diseases'),
('J44.9', 'Chronic obstructive pulmonary disease, unspecified',            'X', 'Chronic lower respiratory diseases'),
('J45.0', 'Predominantly allergic asthma',                                 'X', 'Asthma'),
('J45.1', 'Nonallergic asthma',                                            'X', 'Asthma'),
('J45.9', 'Asthma, unspecified',                                           'X', 'Asthma'),
('J46',   'Status asthmaticus',                                            'X', 'Asthma'),
('J47',   'Bronchiectasis',                                                'X', 'Chronic lower respiratory diseases'),
('J81',   'Pulmonary oedema',                                              'X', 'Other respiratory diseases'),
('J85.2', 'Abscess of lung with pneumonia',                                'X', 'Suppurative lung conditions'),
('J86.9', 'Pyothorax without fistula (empyema)',                           'X', 'Pleural disorders'),
('J90',   'Pleural effusion, not elsewhere classified',                    'X', 'Pleural disorders'),
('J93.9', 'Pneumothorax, unspecified',                                     'X', 'Pleural disorders'),
('J96.0', 'Acute respiratory failure',                                     'X', 'Respiratory failure'),
('J96.1', 'Chronic respiratory failure',                                   'X', 'Respiratory failure'),

-- ── CHAPTER XI  Diseases of the digestive system (K00–K93) ─────────────────
-- Dental and oral
('K02.0', 'Dental caries limited to enamel',                               'XI', 'Diseases of oral cavity'),
('K02.1', 'Dental caries of dentine',                                      'XI', 'Diseases of oral cavity'),
('K02.9', 'Dental caries, unspecified',                                    'XI', 'Diseases of oral cavity'),
('K04.0', 'Pulpitis',                                                      'XI', 'Diseases of oral cavity'),
('K04.1', 'Necrosis of pulp',                                              'XI', 'Diseases of oral cavity'),
('K04.7', 'Periapical abscess without sinus',                              'XI', 'Diseases of oral cavity'),
('K05.0', 'Acute gingivitis',                                              'XI', 'Periodontal diseases'),
('K05.1', 'Chronic gingivitis',                                            'XI', 'Periodontal diseases'),
('K05.2', 'Acute periodontitis',                                           'XI', 'Periodontal diseases'),
('K05.3', 'Chronic periodontitis',                                         'XI', 'Periodontal diseases'),
('K12.0', 'Recurrent oral aphthae',                                        'XI', 'Diseases of oral cavity'),
('K12.1', 'Other forms of stomatitis',                                     'XI', 'Diseases of oral cavity'),
('K12.2', 'Cellulitis and abscess of mouth',                               'XI', 'Diseases of oral cavity'),
-- Oesophageal / gastric
('K21.0', 'Gastro-oesophageal reflux disease with oesophagitis',          'XI', 'Diseases of oesophagus and stomach'),
('K21.9', 'Gastro-oesophageal reflux disease without oesophagitis',       'XI', 'Diseases of oesophagus and stomach'),
('K25.0', 'Gastric ulcer, acute with haemorrhage',                        'XI', 'Peptic ulcer'),
('K25.9', 'Gastric ulcer, unspecified',                                    'XI', 'Peptic ulcer'),
('K26.0', 'Duodenal ulcer, acute with haemorrhage',                       'XI', 'Peptic ulcer'),
('K26.9', 'Duodenal ulcer, unspecified',                                   'XI', 'Peptic ulcer'),
('K29.7', 'Gastritis, unspecified',                                        'XI', 'Gastritis and duodenitis'),
('K30',   'Functional dyspepsia',                                          'XI', 'Gastritis and duodenitis'),
-- Appendix / hernia
('K35.9', 'Acute appendicitis, unspecified',                               'XI', 'Diseases of appendix'),
('K37',   'Unspecified appendicitis',                                      'XI', 'Diseases of appendix'),
('K40.9', 'Inguinal hernia without obstruction or gangrene, unspecified',  'XI', 'Hernia'),
('K41.9', 'Femoral hernia without obstruction or gangrene, unspecified',   'XI', 'Hernia'),
('K42.9', 'Umbilical hernia without obstruction or gangrene',              'XI', 'Hernia'),
('K46.9', 'Unspecified abdominal hernia without obstruction or gangrene',  'XI', 'Hernia'),
-- Large/small bowel
('K52.9', 'Noninfective gastroenteritis and colitis, unspecified',         'XI', 'Noninfective enteritis and colitis'),
('K56.2', 'Volvulus',                                                      'XI', 'Intestinal obstruction'),
('K56.6', 'Other and unspecified intestinal obstruction',                  'XI', 'Intestinal obstruction'),
('K57.3', 'Diverticular disease of large intestine without perforation',   'XI', 'Diverticular disease'),
('K59.0', 'Constipation',                                                  'XI', 'Functional intestinal disorders'),
('K60.0', 'Acute anal fissure',                                            'XI', 'Anal diseases'),
('K61.0', 'Anal abscess',                                                  'XI', 'Anal diseases'),
-- Liver / gallbladder / pancreas
('K70.3', 'Alcoholic cirrhosis of liver',                                  'XI', 'Diseases of liver'),
('K72.0', 'Acute and subacute hepatic failure',                            'XI', 'Diseases of liver'),
('K72.1', 'Chronic hepatic failure',                                       'XI', 'Diseases of liver'),
('K74.6', 'Other and unspecified cirrhosis of liver',                      'XI', 'Diseases of liver'),
('K75.0', 'Abscess of liver',                                              'XI', 'Diseases of liver'),
('K76.0', 'Fatty (change of) liver (fatty liver disease)',                 'XI', 'Diseases of liver'),
('K80.0', 'Calculus of gallbladder with acute cholecystitis',              'XI', 'Diseases of gallbladder'),
('K80.2', 'Calculus of gallbladder without cholecystitis',                 'XI', 'Diseases of gallbladder'),
('K81.0', 'Acute cholecystitis',                                           'XI', 'Diseases of gallbladder'),
('K85.9', 'Acute pancreatitis, unspecified',                               'XI', 'Diseases of pancreas'),
('K86.1', 'Other chronic pancreatitis',                                    'XI', 'Diseases of pancreas'),
('K92.0', 'Haematemesis',                                                  'XI', 'Other diseases of digestive system'),
('K92.1', 'Melaena',                                                       'XI', 'Other diseases of digestive system'),
('K92.2', 'Gastrointestinal haemorrhage, unspecified',                     'XI', 'Other diseases of digestive system'),

-- ── CHAPTER XII  Diseases of the skin (L00–L99) ─────────────────────────────
('L01.0', 'Impetigo',                                                      'XII', 'Skin infections'),
('L02.9', 'Cutaneous abscess, furuncle and carbuncle, unspecified',        'XII', 'Skin infections'),
('L03.1', 'Cellulitis of other parts of limb',                             'XII', 'Skin infections'),
('L03.9', 'Cellulitis, unspecified',                                       'XII', 'Skin infections'),
('L08.0', 'Pyoderma',                                                      'XII', 'Skin infections'),
('L20.9', 'Atopic dermatitis, unspecified (eczema)',                       'XII', 'Dermatitis and eczema'),
('L23.9', 'Allergic contact dermatitis, unspecified',                      'XII', 'Dermatitis and eczema'),
('L24.9', 'Irritant contact dermatitis, unspecified',                      'XII', 'Dermatitis and eczema'),
('L27.0', 'Generalised skin eruption due to drugs and medicaments',        'XII', 'Dermatitis and eczema'),
('L29.9', 'Pruritus, unspecified',                                         'XII', 'Pruritus'),
('L40.0', 'Psoriasis vulgaris',                                            'XII', 'Papulosquamous disorders'),
('L40.9', 'Psoriasis, unspecified',                                        'XII', 'Papulosquamous disorders'),
('L43.9', 'Lichen planus, unspecified',                                    'XII', 'Papulosquamous disorders'),
('L50.0', 'Allergic urticaria',                                            'XII', 'Urticaria and erythema'),
('L50.9', 'Urticaria, unspecified',                                        'XII', 'Urticaria and erythema'),
('L51.1', 'Bullous erythema multiforme (Stevens-Johnson syndrome)',         'XII', 'Urticaria and erythema'),
('L63.9', 'Alopecia areata, unspecified',                                  'XII', 'Hair and nail disorders'),
('L70.0', 'Acne vulgaris',                                                 'XII', 'Disorders of skin appendages'),
('L80',   'Vitiligo',                                                      'XII', 'Other skin disorders'),
('L89.0', 'Pressure ulcer stage I',                                        'XII', 'Ulcers of skin'),
('L97',   'Ulcer of lower limb, not elsewhere classified',                 'XII', 'Ulcers of skin'),

-- ── CHAPTER XIII  Musculoskeletal system (M00–M99) ──────────────────────────
('M00.9', 'Pyogenic arthritis, unspecified (septic arthritis)',            'XIII', 'Inflammatory arthropathies'),
('M05.9', 'Seropositive rheumatoid arthritis, unspecified',                'XIII', 'Inflammatory arthropathies'),
('M06.9', 'Rheumatoid arthritis, unspecified',                             'XIII', 'Inflammatory arthropathies'),
('M10.0', 'Idiopathic gout',                                               'XIII', 'Crystal arthropathies'),
('M10.9', 'Gout, unspecified',                                             'XIII', 'Crystal arthropathies'),
('M13.9', 'Arthritis, unspecified',                                        'XIII', 'Inflammatory arthropathies'),
('M17.0', 'Primary gonarthrosis, bilateral (knee osteoarthritis)',         'XIII', 'Osteoarthritis'),
('M17.9', 'Gonarthrosis, unspecified',                                     'XIII', 'Osteoarthritis'),
('M19.9', 'Arthrosis, unspecified',                                        'XIII', 'Osteoarthritis'),
('M25.5', 'Pain in joint',                                                 'XIII', 'Other joint disorders'),
('M32.9', 'Systemic lupus erythematosus, unspecified',                     'XIII', 'Systemic connective tissue disorders'),
('M45',   'Ankylosing spondylitis',                                        'XIII', 'Spondylopathies'),
('M47.9', 'Spondylosis, unspecified',                                      'XIII', 'Spondylopathies'),
('M51.1', 'Lumbar and other intervertebral disc degeneration',             'XIII', 'Disc disorders'),
('M54.2', 'Cervicalgia (neck pain)',                                       'XIII', 'Dorsopathies'),
('M54.4', 'Lumbago with sciatica',                                         'XIII', 'Dorsopathies'),
('M54.5', 'Low back pain',                                                 'XIII', 'Dorsopathies'),
('M75.0', 'Adhesive capsulitis of shoulder (frozen shoulder)',             'XIII', 'Soft tissue disorders'),
('M75.1', 'Rotator cuff syndrome',                                         'XIII', 'Soft tissue disorders'),
('M77.1', 'Lateral epicondylitis (tennis elbow)',                          'XIII', 'Soft tissue disorders'),
('M81.0', 'Postmenopausal osteoporosis',                                   'XIII', 'Osteopathies'),
('M86.9', 'Osteomyelitis, unspecified',                                    'XIII', 'Bone diseases'),

-- ── CHAPTER XIV  Genitourinary system (N00–N99) ─────────────────────────────
('N00.9', 'Acute nephritic syndrome, unspecified',                         'XIV', 'Glomerular diseases'),
('N03.9', 'Chronic nephritic syndrome, unspecified',                       'XIV', 'Glomerular diseases'),
('N04.9', 'Nephrotic syndrome, unspecified',                               'XIV', 'Glomerular diseases'),
('N10',   'Acute tubulo-interstitial nephritis (acute pyelonephritis)',    'XIV', 'Renal tubulo-interstitial diseases'),
('N11.9', 'Chronic tubulo-interstitial nephritis, unspecified',            'XIV', 'Renal tubulo-interstitial diseases'),
('N17.0', 'Acute renal failure with tubular necrosis',                     'XIV', 'Renal failure'),
('N17.9', 'Acute renal failure, unspecified (acute kidney injury)',        'XIV', 'Renal failure'),
('N18.0', 'End-stage renal disease',                                       'XIV', 'Renal failure'),
('N18.9', 'Chronic renal failure, unspecified (CKD)',                      'XIV', 'Renal failure'),
('N19',   'Unspecified renal failure',                                     'XIV', 'Renal failure'),
('N20.0', 'Calculus of kidney (renal stone)',                              'XIV', 'Urolithiasis'),
('N20.1', 'Calculus of ureter',                                            'XIV', 'Urolithiasis'),
('N20.9', 'Urinary calculus, unspecified',                                 'XIV', 'Urolithiasis'),
('N23',   'Unspecified renal colic',                                       'XIV', 'Urolithiasis'),
('N30.0', 'Acute cystitis',                                                'XIV', 'Urinary tract infections'),
('N30.9', 'Cystitis, unspecified',                                         'XIV', 'Urinary tract infections'),
('N39.0', 'Urinary tract infection, site not specified (UTI)',             'XIV', 'Urinary tract infections'),
('N40',   'Hyperplasia of prostate (BPH)',                                 'XIV', 'Diseases of male genital organs'),
('N41.0', 'Acute prostatitis',                                             'XIV', 'Diseases of male genital organs'),
('N45.9', 'Orchitis and epididymitis, unspecified',                        'XIV', 'Diseases of male genital organs'),
('N46',   'Male infertility',                                              'XIV', 'Diseases of male genital organs'),
('N61',   'Inflammatory disorders of breast (mastitis)',                   'XIV', 'Disorders of breast'),
('N63',   'Unspecified lump in breast',                                    'XIV', 'Disorders of breast'),
('N70.0', 'Acute salpingitis and oophoritis',                              'XIV', 'Inflammatory diseases of female pelvis'),
('N70.9', 'Salpingitis and oophoritis, unspecified',                       'XIV', 'Inflammatory diseases of female pelvis'),
('N73.9', 'Female pelvic inflammatory disease, unspecified (PID)',         'XIV', 'Inflammatory diseases of female pelvis'),
('N75.1', 'Abscess of Bartholin''s gland',                                 'XIV', 'Inflammatory diseases of female pelvis'),
('N76.0', 'Acute vaginitis',                                               'XIV', 'Inflammatory diseases of female pelvis'),
('N80.9', 'Endometriosis, unspecified',                                    'XIV', 'Noninflammatory disorders of female genital tract'),
('N83.2', 'Other and unspecified ovarian cysts',                           'XIV', 'Noninflammatory disorders of female genital tract'),
('N91.2', 'Amenorrhoea, unspecified',                                      'XIV', 'Menstrual disorders'),
('N92.0', 'Excessive and frequent menstruation with regular cycle',        'XIV', 'Menstrual disorders'),
('N94.4', 'Primary dysmenorrhoea',                                         'XIV', 'Menstrual disorders'),
('N94.5', 'Secondary dysmenorrhoea',                                       'XIV', 'Menstrual disorders'),
('N95.1', 'Menopausal and female climacteric states',                      'XIV', 'Menopausal disorders'),
('N97.9', 'Female infertility, unspecified',                               'XIV', 'Female infertility'),

-- ── CHAPTER XV  Pregnancy, childbirth and puerperium (O00–O99) ─────────────
('O00.1', 'Tubal pregnancy (ectopic pregnancy)',                           'XV', 'Ectopic and molar pregnancy'),
('O00.9', 'Ectopic pregnancy, unspecified',                                'XV', 'Ectopic and molar pregnancy'),
('O02.1', 'Missed abortion',                                               'XV', 'Other abnormal products of conception'),
('O03.9', 'Spontaneous abortion, complete or unspecified, without complication', 'XV', 'Spontaneous abortion'),
('O10.0', 'Pre-existing essential hypertension complicating pregnancy',    'XV', 'Hypertensive disorders in pregnancy'),
('O13',   'Gestational (pregnancy-induced) hypertension',                  'XV', 'Hypertensive disorders in pregnancy'),
('O14.0', 'Mild to moderate pre-eclampsia',                                'XV', 'Hypertensive disorders in pregnancy'),
('O14.1', 'Severe pre-eclampsia',                                          'XV', 'Hypertensive disorders in pregnancy'),
('O14.9', 'Pre-eclampsia, unspecified',                                    'XV', 'Hypertensive disorders in pregnancy'),
('O15.0', 'Eclampsia in pregnancy',                                        'XV', 'Hypertensive disorders in pregnancy'),
('O15.9', 'Eclampsia, unspecified',                                        'XV', 'Hypertensive disorders in pregnancy'),
('O20.0', 'Threatened abortion',                                           'XV', 'Haemorrhage in early pregnancy'),
('O21.0', 'Mild hyperemesis gravidarum',                                   'XV', 'Vomiting in pregnancy'),
('O21.9', 'Vomiting of pregnancy, unspecified',                            'XV', 'Vomiting in pregnancy'),
('O24.0', 'Pre-existing type 1 diabetes mellitus in pregnancy',            'XV', 'Diabetes in pregnancy'),
('O24.4', 'Diabetes mellitus arising in pregnancy (gestational diabetes)', 'XV', 'Diabetes in pregnancy'),
('O30.0', 'Twin pregnancy',                                                'XV', 'Multiple gestation'),
('O32.1', 'Maternal care for breech presentation',                         'XV', 'Malpresentation and malposition'),
('O42.0', 'Premature rupture of membranes',                                'XV', 'Disorders related to membranes'),
('O44.0', 'Placenta praevia without haemorrhage',                          'XV', 'Placental disorders'),
('O44.1', 'Placenta praevia with haemorrhage',                             'XV', 'Placental disorders'),
('O45.0', 'Premature separation of placenta (abruptio placentae)',         'XV', 'Placental disorders'),
('O45.9', 'Premature separation of placenta, unspecified',                 'XV', 'Placental disorders'),
('O60.0', 'Preterm labour without delivery',                               'XV', 'Preterm delivery'),
('O62.1', 'Secondary uterine inertia (prolonged labour)',                  'XV', 'Complications of labour'),
('O64.0', 'Obstructed labour due to incomplete rotation of fetal head',    'XV', 'Obstructed labour'),
('O65.4', 'Obstructed labour due to fetopelvic disproportion, unspecified','XV', 'Obstructed labour'),
('O72.0', 'Third-stage haemorrhage (PPH with retained placenta)',          'XV', 'Postpartum haemorrhage'),
('O72.1', 'Other immediate postpartum haemorrhage (PPH)',                  'XV', 'Postpartum haemorrhage'),
('O80',   'Single spontaneous delivery',                                   'XV', 'Delivery'),
('O82.0', 'Delivery by elective caesarean section',                        'XV', 'Delivery'),
('O82.1', 'Delivery by emergency caesarean section',                       'XV', 'Delivery'),
('O85',   'Puerperal sepsis',                                              'XV', 'Complications of puerperium'),
('O86.1', 'Other infection of genital tract following delivery',           'XV', 'Complications of puerperium'),
('O91.1', 'Abscess of breast associated with childbirth',                  'XV', 'Complications of puerperium'),
('O99.0', 'Anaemia complicating pregnancy, childbirth and the puerperium', 'XV', 'Complications of puerperium'),

-- ── CHAPTER XVI  Conditions in the perinatal period (P00–P96) ──────────────
('P05.0', 'Newborn light for gestational age (low birth weight)',          'XVI', 'Fetal growth retardation'),
('P07.0', 'Extremely low birth weight newborn',                            'XVI', 'Preterm newborn'),
('P07.3', 'Other preterm infant',                                          'XVI', 'Preterm newborn'),
('P21.0', 'Severe birth asphyxia',                                         'XVI', 'Birth asphyxia'),
('P21.9', 'Birth asphyxia, unspecified',                                   'XVI', 'Birth asphyxia'),
('P22.0', 'Respiratory distress syndrome of newborn (IRDS)',               'XVI', 'Respiratory distress of newborn'),
('P22.9', 'Respiratory distress of newborn, unspecified',                  'XVI', 'Respiratory distress of newborn'),
('P23.9', 'Congenital pneumonia, unspecified',                             'XVI', 'Congenital pneumonia'),
('P24.0', 'Neonatal aspiration of meconium',                               'XVI', 'Neonatal aspiration syndromes'),
('P36.9', 'Bacterial sepsis of newborn, unspecified (neonatal sepsis)',    'XVI', 'Infections specific to perinatal period'),
('P38',   'Omphalitis of newborn',                                         'XVI', 'Infections specific to perinatal period'),
('P59.9', 'Neonatal jaundice, unspecified (neonatal hyperbilirubinaemia)', 'XVI', 'Neonatal jaundice'),

-- ── CHAPTER XVII  Congenital malformations (Q00–Q99) ───────────────────────
('Q03.9', 'Congenital hydrocephalus, unspecified',                         'XVII', 'Congenital malformations of nervous system'),
('Q05.9', 'Spina bifida, unspecified',                                     'XVII', 'Congenital malformations of nervous system'),
('Q21.0', 'Ventricular septal defect (VSD)',                               'XVII', 'Congenital malformations of cardiac septa'),
('Q21.1', 'Atrial septal defect (ASD)',                                    'XVII', 'Congenital malformations of cardiac septa'),
('Q21.3', 'Tetralogy of Fallot (TOF)',                                     'XVII', 'Congenital malformations of cardiac septa'),
('Q25.0', 'Patent ductus arteriosus (PDA)',                                'XVII', 'Congenital malformations of great arteries'),
('Q35.9', 'Cleft palate, unspecified',                                     'XVII', 'Craniofacial malformations'),
('Q36.9', 'Cleft lip, unspecified',                                        'XVII', 'Craniofacial malformations'),
('Q37.9', 'Cleft palate with cleft lip, unspecified',                      'XVII', 'Craniofacial malformations'),
('Q40.2', 'Congenital hypertrophic pyloric stenosis',                      'XVII', 'Congenital malformations of digestive system'),
('Q42.3', 'Congenital absence of anus without fistula (imperforate anus)', 'XVII', 'Congenital malformations of digestive system'),
('Q43.1', 'Hirschsprung''s disease',                                       'XVII', 'Congenital malformations of digestive system'),
('Q53.1', 'Undescended testicle, unilateral (cryptorchidism)',             'XVII', 'Congenital malformations of genital organs'),
('Q54.0', 'Hypospadias, balanic',                                          'XVII', 'Congenital malformations of genital organs'),
('Q65.0', 'Congenital dislocation of hip, unilateral',                    'XVII', 'Congenital malformations of musculoskeletal system'),
('Q66.0', 'Talipes equinovarus (clubfoot)',                                 'XVII', 'Congenital malformations of musculoskeletal system'),
('Q90.9', 'Down syndrome, unspecified (Trisomy 21)',                       'XVII', 'Chromosomal abnormalities'),

-- ── CHAPTER XVIII  Symptoms, signs and abnormal findings (R00–R99) ──────────
('R00.0', 'Tachycardia, unspecified',                                      'XVIII', 'Circulatory and respiratory signs'),
('R00.1', 'Bradycardia, unspecified',                                      'XVIII', 'Circulatory and respiratory signs'),
('R04.0', 'Epistaxis (nosebleed)',                                         'XVIII', 'Circulatory and respiratory signs'),
('R04.2', 'Haemoptysis',                                                   'XVIII', 'Circulatory and respiratory signs'),
('R05',   'Cough',                                                         'XVIII', 'Circulatory and respiratory signs'),
('R06.0', 'Dyspnoea',                                                      'XVIII', 'Circulatory and respiratory signs'),
('R06.2', 'Wheezing',                                                      'XVIII', 'Circulatory and respiratory signs'),
('R07.4', 'Chest pain, unspecified',                                       'XVIII', 'Circulatory and respiratory signs'),
('R10.0', 'Acute abdomen',                                                 'XVIII', 'Digestive and abdominal signs'),
('R10.4', 'Other and unspecified abdominal pain',                          'XVIII', 'Digestive and abdominal signs'),
('R11',   'Nausea and vomiting',                                           'XVIII', 'Digestive and abdominal signs'),
('R12',   'Heartburn',                                                     'XVIII', 'Digestive and abdominal signs'),
('R13',   'Dysphagia',                                                     'XVIII', 'Digestive and abdominal signs'),
('R17',   'Unspecified jaundice',                                          'XVIII', 'Digestive and abdominal signs'),
('R18',   'Ascites',                                                       'XVIII', 'Digestive and abdominal signs'),
('R21',   'Rash and other nonspecific skin eruption',                      'XVIII', 'Skin signs'),
('R30.0', 'Dysuria',                                                       'XVIII', 'Urinary signs'),
('R31',   'Unspecified haematuria',                                        'XVIII', 'Urinary signs'),
('R32',   'Unspecified urinary incontinence',                              'XVIII', 'Urinary signs'),
('R33',   'Retention of urine',                                            'XVIII', 'Urinary signs'),
('R35',   'Polyuria',                                                      'XVIII', 'Urinary signs'),
('R40.2', 'Coma, unspecified',                                             'XVIII', 'Nervous and musculoskeletal signs'),
('R42',   'Dizziness and giddiness',                                       'XVIII', 'Nervous and musculoskeletal signs'),
('R50.0', 'Fever with chills',                                             'XVIII', 'General signs'),
('R50.9', 'Fever, unspecified',                                            'XVIII', 'General signs'),
('R51',   'Headache',                                                      'XVIII', 'General signs'),
('R53',   'Malaise and fatigue',                                           'XVIII', 'General signs'),
('R55',   'Syncope and collapse',                                          'XVIII', 'General signs'),
('R56.0', 'Febrile convulsions',                                           'XVIII', 'General signs'),
('R56.9', 'Unspecified convulsions',                                       'XVIII', 'General signs'),
('R57.0', 'Cardiogenic shock',                                             'XVIII', 'General signs'),
('R57.9', 'Shock, unspecified',                                            'XVIII', 'General signs'),
('R60.9', 'Oedema, unspecified',                                           'XVIII', 'General signs'),
('R62.8', 'Failure to thrive in childhood',                                'XVIII', 'Growth signs'),
('R63.0', 'Anorexia',                                                      'XVIII', 'Growth signs'),
('R63.4', 'Abnormal weight loss',                                          'XVIII', 'Growth signs'),
('R64',   'Cachexia',                                                      'XVIII', 'Growth signs'),
('R73.9', 'Hyperglycaemia, unspecified',                                   'XVIII', 'Laboratory findings'),
('R80',   'Proteinuria',                                                   'XVIII', 'Laboratory findings'),

-- ── CHAPTER XIX  Injury, poisoning and external causes (S00–T98) ────────────
-- Head injuries
('S06.0', 'Concussion',                                                    'XIX', 'Intracranial injuries'),
('S06.1', 'Traumatic cerebral oedema',                                     'XIX', 'Intracranial injuries'),
('S06.2', 'Diffuse brain injury',                                          'XIX', 'Intracranial injuries'),
('S06.9', 'Intracranial injury, unspecified',                              'XIX', 'Intracranial injuries'),
('S09.9', 'Unspecified injury of head',                                    'XIX', 'Head injuries'),
-- Thorax injuries
('S22.3', 'Fracture of rib',                                               'XIX', 'Injuries of thorax'),
('S27.0', 'Traumatic pneumothorax',                                        'XIX', 'Injuries of thorax'),
('S27.1', 'Traumatic haemothorax',                                         'XIX', 'Injuries of thorax'),
-- Abdominal injuries
('S36.0', 'Injury of spleen',                                              'XIX', 'Injuries of abdomen and pelvis'),
('S36.1', 'Injury of liver and gallbladder',                               'XIX', 'Injuries of abdomen and pelvis'),
-- Upper limb fractures
('S42.0', 'Fracture of clavicle',                                          'XIX', 'Fractures of upper limb'),
('S42.2', 'Fracture of upper end of humerus',                             'XIX', 'Fractures of upper limb'),
('S52.5', 'Fracture of lower end of radius (Colles'' fracture)',           'XIX', 'Fractures of upper limb'),
('S52.9', 'Fracture of forearm, unspecified',                              'XIX', 'Fractures of upper limb'),
-- Lower limb fractures
('S72.0', 'Fracture of neck of femur (hip fracture)',                      'XIX', 'Fractures of lower limb'),
('S72.1', 'Pertrochanteric fracture of femur',                             'XIX', 'Fractures of lower limb'),
('S72.9', 'Fracture of femur, unspecified',                                'XIX', 'Fractures of lower limb'),
('S82.1', 'Fracture of upper end of tibia',                                'XIX', 'Fractures of lower limb'),
('S82.9', 'Fracture of lower leg, unspecified',                            'XIX', 'Fractures of lower limb'),
('S92.0', 'Fracture of calcaneus',                                         'XIX', 'Fractures of ankle and foot'),
-- Burns
('T20.1', 'Burn of second degree of head and neck',                        'XIX', 'Burns'),
('T20.2', 'Burn of third degree of head and neck',                         'XIX', 'Burns'),
('T21.1', 'Burn of second degree of trunk',                                'XIX', 'Burns'),
('T21.2', 'Burn of third degree of trunk',                                 'XIX', 'Burns'),
('T22.2', 'Burn of third degree of shoulder and upper limb',               'XIX', 'Burns'),
('T24.2', 'Burn of third degree of lower limb',                            'XIX', 'Burns'),
('T30.0', 'Burn of unspecified body region, unspecified degree',           'XIX', 'Burns'),
('T31.0', 'Burns involving less than 10% of body surface',                 'XIX', 'Burns'),
-- Poisoning
('T36.0', 'Poisoning by penicillins',                                      'XIX', 'Poisoning by drugs'),
('T39.0', 'Poisoning by salicylates (aspirin)',                            'XIX', 'Poisoning by drugs'),
('T39.1', 'Poisoning by paracetamol (4-aminophenol derivatives)',          'XIX', 'Poisoning by drugs'),
('T39.3', 'Poisoning by non-steroidal anti-inflammatory drugs (NSAIDs)',   'XIX', 'Poisoning by drugs'),
('T40.0', 'Poisoning by opium',                                            'XIX', 'Poisoning by narcotic analgesics'),
('T42.4', 'Poisoning by benzodiazepines',                                  'XIX', 'Poisoning by drugs'),
('T51.0', 'Toxic effects of ethanol (alcohol poisoning)',                  'XIX', 'Toxic effects of substances'),
('T58',   'Toxic effect of carbon monoxide',                               'XIX', 'Toxic effects of substances'),
('T60.0', 'Toxic effects of organophosphate insecticides',                 'XIX', 'Toxic effects of pesticides'),
('T63.0', 'Venom of snakes (snakebite)',                                   'XIX', 'Effects of venomous animals'),
('T63.2', 'Venom of scorpion (scorpion sting)',                            'XIX', 'Effects of venomous animals'),
('T63.4', 'Venom of other arthropods (bee/wasp sting)',                    'XIX', 'Effects of venomous animals'),
('T71',   'Asphyxiation (suffocation)',                                    'XIX', 'Effects of external causes'),
-- Abuse
('T74.1', 'Physical abuse',                                                'XIX', 'Maltreatment syndromes'),
('T74.2', 'Sexual abuse',                                                  'XIX', 'Maltreatment syndromes'),
-- Allergic reactions
('T78.0', 'Anaphylactic shock due to adverse food reaction',               'XIX', 'Adverse effects'),
('T78.2', 'Anaphylactic shock, unspecified',                               'XIX', 'Adverse effects'),
('T78.4', 'Allergy, unspecified',                                          'XIX', 'Adverse effects'),
-- Complications of procedures
('T81.0', 'Haemorrhage and haematoma complicating a procedure',            'XIX', 'Complications of surgical procedures'),
('T81.4', 'Infection following a procedure',                               'XIX', 'Complications of surgical procedures')

ON CONFLICT (diagnosis_code) DO NOTHING;


-- ============================================================================
-- GHS-APPROVED LAB TESTS SEED
-- Ghana Health Service laboratory catalogue
-- ============================================================================

INSERT INTO lab_tests (
  test_code, test_name, test_category, specimen_type,
  collection_method, container_type, volume_required,
  turnaround_time_hours, reference_range, instructions, price, is_active
) VALUES

-- ============================================================
-- HAEMATOLOGY
-- ============================================================
('HEM-001', 'Full Blood Count (FBC)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 2,
  'WBC: 4.5–11.0 ×10⁹/L, RBC: M 4.5–5.9, F 4.0–5.2 ×10¹²/L, Hb: M 130–175, F 120–160 g/L, Hct: M 40–52%, F 37–47%, MCV: 80–100 fL, MCH: 27–33 pg, MCHC: 315–360 g/L, Platelets: 150–400 ×10⁹/L, WBC diff: Neutrophils 40–75%, Lymphocytes 20–45%, Monocytes 2–10%, Eosinophils 1–6%, Basophils 0–1%',
  'Gently mix tube by inversion 8 times. Do not use haemolysed samples.', 20.00, true),

('HEM-002', 'Haemoglobin (Hb)', 'Haematology', 'Whole Blood',
  'Venepuncture or Fingerprick', 'EDTA (Purple/Lavender)', '2 mL', 1,
  'Males: 130–175 g/L; Females: 120–160 g/L; Children 6–12 yr: 115–155 g/L; Pregnant: ≥110 g/L',
  'EDTA tube preferred. Point-of-care HemoCue acceptable for screening.', 10.00, true),

('HEM-003', 'Erythrocyte Sedimentation Rate (ESR)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Citrate (Blue) or EDTA', '2 mL', 2,
  'Males <50 yr: 0–15 mm/hr; Males ≥50 yr: 0–20 mm/hr; Females <50 yr: 0–20 mm/hr; Females ≥50 yr: 0–30 mm/hr',
  'Process within 4 hours of collection. Westergren method preferred.', 12.00, true),

('HEM-004', 'Peripheral Blood Film', 'Haematology', 'Whole Blood',
  'Venepuncture or Fingerprick', 'EDTA (Purple/Lavender)', '2 mL', 4,
  'Normocytic normochromic red cells, no significant abnormal cells',
  'Prepare thin and thick smears. Air-dry before staining with Giemsa or Leishman.', 20.00, true),

('HEM-005', 'Reticulocyte Count', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 4,
  '0.5–2.5% of RBCs; Absolute: 25–125 ×10⁹/L',
  'Submit with FBC request. Keep refrigerated if delayed.', 20.00, true),

('HEM-006', 'Blood Group and Rhesus (ABO/Rh)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '5 mL', 2,
  'Result reported as blood group (A, B, AB, O) and Rh type (Positive/Negative)',
  'Use two separate tubes from two separate draws for critical patients.', 20.00, true),

('HEM-007', 'Crossmatch (Compatibility Test)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '10 mL', 2,
  'Compatible = No agglutination or haemolysis',
  'Clearly label sample with full patient name, ID and DOB. Required for all blood transfusions.', 30.00, true),

('HEM-008', 'Sickle Cell Test (Sickling)', 'Haematology', 'Whole Blood',
  'Venepuncture or Fingerprick', 'EDTA (Purple/Lavender)', '2 mL', 2,
  'Negative (no sickling); Positive (sickling present – requires Hb electrophoresis confirmation)',
  'Metabisulphite method. Confirm positives with Haemoglobin Electrophoresis.', 20.00, true),

('HEM-009', 'Haemoglobin Electrophoresis', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '5 mL', 24,
  'HbAA: Normal; HbAS: Sickle Cell Trait; HbSS: Sickle Cell Disease; HbSC: SC Disease; HbAC: Haemoglobin C Trait; HbCC: Haemoglobin C Disease; HbF: Fetal Hb (normal in newborns)',
  'HPLC or cellulose acetate electrophoresis. Essential for sickle cell confirmation.', 60.00, true),

('HEM-010', 'G6PD Screening', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 4,
  'Normal G6PD activity: ≥70% of normal reference; Deficiency: <30%',
  'Do not test during acute haemolytic episode – reticulocytosis may give false normal.', 40.00, true),

('HEM-011', 'Platelet Count', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 2,
  '150–400 ×10⁹/L',
  'Part of FBC. Order separately if FBC not required.', 15.00, true),

('HEM-012', 'Prothrombin Time (PT) / INR', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Sodium Citrate (Blue) 3.2%', '2.7 mL to line', 4,
  'PT: 11–13.5 seconds; INR (therapeutic warfarin): 2.0–3.0; Prophylaxis (mechanical valves): 2.5–3.5',
  'Fill citrate tube EXACTLY to line. Process within 4 hours. Keep at room temperature.', 30.00, true),

('HEM-013', 'Activated Partial Thromboplastin Time (APTT)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Sodium Citrate (Blue) 3.2%', '2.7 mL to line', 4,
  '25–35 seconds; Therapeutic heparin: 60–100 seconds',
  'Fill citrate tube EXACTLY to line. Process within 4 hours.', 30.00, true),

('HEM-014', 'Fibrinogen', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Sodium Citrate (Blue) 3.2%', '2.7 mL to line', 4,
  '1.5–4.0 g/L; In pregnancy: may increase to 6.0 g/L',
  'Fill citrate tube to the line. Process within 4 hours. Keep at room temperature.', 40.00, true),

('HEM-015', 'D-Dimer', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Sodium Citrate (Blue) or Plain (Gold)', '3 mL', 4,
  'Normal: <0.50 mg/L FEU; Elevated suggests DVT/PE (requires clinical correlation)',
  'Age-adjusted cut-off: age × 0.01 mg/L FEU for patients >50 years.', 80.00, true),

('HEM-016', 'Bleeding Time (BT)', 'Haematology', 'Whole Blood',
  'Lancet/Template', 'No tube required (direct)', 'N/A', 1,
  'Template: 2–9 minutes; Ivy: 1–6 minutes',
  'Do not perform if patient is on aspirin or NSAIDs. Use standardised template method.', 15.00, true),

('HEM-017', 'Clotting Time (CT)', 'Haematology', 'Whole Blood',
  'Venepuncture', 'Plain (Red) – no additive', '5 mL', 1,
  'Lee White method: 4–10 minutes',
  'Keep sample at 37°C during test.', 15.00, true),

('HEM-018', 'Packed Cell Volume (PCV / Haematocrit)', 'Haematology', 'Whole Blood',
  'Venepuncture or Fingerprick', 'EDTA (Purple/Lavender)', '2 mL', 1,
  'Males: 40–52%; Females: 37–47%; Children: 35–44%; Pregnant: ≥33%',
  'Microhaematocrit centrifuge at 12,000 rpm for 5 minutes.', 10.00, true),

-- ============================================================
-- BLOOD GLUCOSE & DIABETES
-- ============================================================
('DM-001', 'Fasting Blood Sugar (FBS)', 'Biochemistry', 'Whole Blood or Plasma',
  'Venepuncture (fasting ≥8 hr)', 'Fluoride (Grey)', '3 mL', 2,
  'Normal: 3.9–5.5 mmol/L; Impaired: 5.6–6.9 mmol/L; Diabetes: ≥7.0 mmol/L',
  'Patient must fast for 8–12 hours. Water is permitted.', 15.00, true),

('DM-002', 'Random Blood Sugar (RBS)', 'Biochemistry', 'Whole Blood or Plasma',
  'Venepuncture', 'Fluoride (Grey)', '3 mL', 1,
  'Normal: <7.8 mmol/L; Diabetes: ≥11.1 mmol/L with symptoms',
  'No fasting required.', 12.00, true),

('DM-003', '2-Hour Post-Prandial Blood Sugar (PP-BS)', 'Biochemistry', 'Whole Blood or Plasma',
  'Venepuncture (2 hrs after meal)', 'Fluoride (Grey)', '3 mL', 2,
  'Normal: <7.8 mmol/L; Impaired glucose tolerance: 7.8–11.0 mmol/L; Diabetes: ≥11.1 mmol/L',
  'Collect exactly 2 hours after start of meal.', 15.00, true),

('DM-004', 'Oral Glucose Tolerance Test (OGTT)', 'Biochemistry', 'Whole Blood or Plasma',
  'Venepuncture (fasting & 2-hr)', 'Fluoride (Grey) x2', '3 mL each', 3,
  'Normal 2-hr: <7.8 mmol/L; Impaired: 7.8–11.0 mmol/L; Diabetes: ≥11.1 mmol/L',
  'Patient fasts ≥8 hr, drinks 75 g glucose in 250 mL water, collect at 0 and 120 min.', 30.00, true),

('DM-005', 'HbA1c (Glycated Haemoglobin)', 'Biochemistry', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 4,
  'Non-diabetic: <5.7% (<39 mmol/mol); Pre-diabetes: 5.7–6.4% (39–47 mmol/mol); Diabetes: ≥6.5% (≥48 mmol/mol); Target for treatment: <7.0% (<53 mmol/mol)',
  'No fasting required. Do not use in haemoglobinopathies or haemolytic anaemia.', 50.00, true),

-- ============================================================
-- RENAL FUNCTION
-- ============================================================
('REN-001', 'Serum Creatinine', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Males: 62–115 µmol/L; Females: 44–97 µmol/L; Children: 27–62 µmol/L',
  'Jaffe or enzymatic method. Avoid haemolysis.', 20.00, true),

('REN-002', 'Blood Urea Nitrogen (BUN) / Urea', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Urea: 2.5–7.5 mmol/L; BUN: 7–21 mg/dL',
  'High-protein diet elevates results. Note hydration status.', 20.00, true),

('REN-003', 'Urea & Electrolytes (U&E)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Na: 136–146 mmol/L; K: 3.5–5.1 mmol/L; Cl: 98–107 mmol/L; HCO3: 22–29 mmol/L; Urea: 2.5–7.5 mmol/L; Creatinine (males): 62–115 µmol/L; Creatinine (females): 44–97 µmol/L',
  'Panel includes Na, K, Cl, HCO3, Urea, Creatinine. Avoid haemolysis for K.', 40.00, true),

('REN-004', 'eGFR (Estimated Glomerular Filtration Rate)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Normal: ≥90 mL/min/1.73m²; Stage 2 CKD: 60–89; Stage 3a: 45–59; Stage 3b: 30–44; Stage 4: 15–29; Stage 5 (Failure): <15',
  'Calculated from serum creatinine, age, sex and race using CKD-EPI formula.', 30.00, true),

('REN-005', 'Serum Uric Acid', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Males: 208–428 µmol/L (3.5–7.2 mg/dL); Females: 155–357 µmol/L (2.6–6.0 mg/dL)',
  'Fasting preferred. Avoid purines 24 hr before.', 20.00, true),

('REN-006', 'Serum Cystatin C', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  '0.62–1.11 mg/L (adults)',
  'Superior to creatinine for early CKD detection. Not affected by muscle mass.', 80.00, true),

-- ============================================================
-- LIVER FUNCTION
-- ============================================================
('LFT-001', 'Liver Function Tests (LFTs) – Full Panel', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Total Bilirubin: 5–21 µmol/L; Direct Bili: 0–5 µmol/L; ALT: 7–56 U/L (M), 7–45 U/L (F); AST: 10–40 U/L; ALP: 44–147 U/L; GGT: 9–48 U/L (M), 9–32 U/L (F); Total Protein: 64–83 g/L; Albumin: 34–54 g/L',
  'Panel includes: Total/Direct bilirubin, ALT, AST, ALP, GGT, Total Protein, Albumin.', 60.00, true),

('LFT-002', 'Total Bilirubin', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Adults: 5–21 µmol/L; Neonates (physiological): up to 200 µmol/L at day 4',
  'Protect from light. Process promptly.', 15.00, true),

('LFT-003', 'Direct Bilirubin', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Adults: 0–5 µmol/L (< 20% of total)',
  'Protect from light. Elevated in cholestatic liver disease.', 15.00, true),

('LFT-004', 'Alanine Aminotransferase (ALT / SGPT)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Males: 7–56 U/L; Females: 7–45 U/L',
  'Most specific for hepatocellular damage. Avoid haemolysis.', 20.00, true),

('LFT-005', 'Aspartate Aminotransferase (AST / SGOT)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '10–40 U/L',
  'Present in heart, liver, muscle. Elevated in MI and liver disease.', 20.00, true),

('LFT-006', 'Alkaline Phosphatase (ALP)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Adults: 44–147 U/L; Children (growing): up to 3× adult upper limit',
  'Elevated in cholestasis, bone disease, and pregnancy.', 20.00, true),

('LFT-007', 'Gamma-Glutamyl Transferase (GGT)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Males: 9–48 U/L; Females: 9–32 U/L',
  'Sensitive marker of alcohol use and biliary obstruction.', 20.00, true),

('LFT-008', 'Serum Albumin', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '34–54 g/L',
  'Indicator of chronic liver disease and nutritional status. Decreases in fluid retention.', 20.00, true),

('LFT-009', 'Total Protein', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '64–83 g/L',
  'Includes albumin and globulins. Calculated globulin = TP − Albumin.', 15.00, true),

('LFT-010', 'Serum Amylase', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '30–110 U/L',
  'Elevated in acute pancreatitis (rises within 2–12 hrs, peaks at 12–72 hrs).', 25.00, true),

('LFT-011', 'Serum Lipase', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '16–63 U/L',
  'More specific than amylase for pancreatitis. Remains elevated longer.', 35.00, true),

-- ============================================================
-- LIPID PROFILE
-- ============================================================
('LIP-001', 'Lipid Profile (Full)', 'Biochemistry', 'Serum',
  'Venepuncture (fasting 9–12 hr)', 'Plain/SST (Gold)', '5 mL', 4,
  'Total Cholesterol: <5.2 mmol/L optimal; LDL: <3.4 mmol/L; HDL: M >1.0, F >1.3 mmol/L; Triglycerides: <1.7 mmol/L; Non-HDL-C: <4.1 mmol/L',
  'Patient must fast 9–12 hours. Calculate LDL using Friedewald equation (not valid if TG >4.5 mmol/L).', 50.00, true),

('LIP-002', 'Total Cholesterol', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Desirable: <5.2 mmol/L; Borderline high: 5.2–6.2 mmol/L; High: >6.2 mmol/L',
  'Fasting not required for screening only.', 15.00, true),

('LIP-003', 'LDL Cholesterol', 'Biochemistry', 'Serum',
  'Venepuncture (fasting 9–12 hr)', 'Plain/SST (Gold)', '5 mL', 4,
  'Optimal: <2.6 mmol/L (high risk: <1.8 mmol/L); Near optimal: 2.6–3.3 mmol/L; Borderline: 3.4–4.1 mmol/L; High: 4.1–4.9 mmol/L; Very high: >4.9 mmol/L',
  'Calculated using Friedewald or measured directly if TG >4.5 mmol/L.', 20.00, true),

('LIP-004', 'HDL Cholesterol', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  'Low (risk): Males <1.0 mmol/L; Females <1.3 mmol/L; High (protective): >1.6 mmol/L',
  'No fasting required.', 20.00, true),

('LIP-005', 'Triglycerides (TG)', 'Biochemistry', 'Serum',
  'Venepuncture (fasting ≥12 hr)', 'Fluoride (Grey) or SST', '3 mL', 4,
  'Normal: <1.7 mmol/L; Borderline: 1.7–2.3 mmol/L; High: 2.3–5.6 mmol/L; Very high: >5.6 mmol/L (pancreatitis risk)',
  'Patient must fast ≥12 hours.', 20.00, true),

-- ============================================================
-- ELECTROLYTES
-- ============================================================
('ELT-001', 'Serum Sodium (Na)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '136–146 mmol/L',
  'Part of U&E panel. Avoid prolonged tourniquet.', 15.00, true),

('ELT-002', 'Serum Potassium (K)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '3.5–5.1 mmol/L',
  'Avoid haemolysis – falsely elevates K. Process promptly.', 15.00, true),

('ELT-003', 'Serum Chloride (Cl)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '98–107 mmol/L',
  'Part of U&E panel.', 15.00, true),

('ELT-004', 'Serum Bicarbonate (HCO3 / CO2)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '3 mL', 4,
  '22–29 mmol/L',
  'Process promptly; CO2 is volatile. Part of U&E or venous blood gas.', 15.00, true),

('ELT-005', 'Serum Calcium (Ca)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Total: 2.15–2.55 mmol/L; Ionised: 1.15–1.35 mmol/L',
  'Correct for albumin: adjusted Ca = measured Ca + 0.02 × (40 − albumin). No tourniquet for ionised Ca.', 20.00, true),

('ELT-006', 'Serum Phosphate / Phosphorus (PO4)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Adults: 0.81–1.45 mmol/L; Children: 1.3–2.1 mmol/L',
  'Fasting preferred. Haemolysis raises phosphate.', 20.00, true),

('ELT-007', 'Serum Magnesium (Mg)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  '0.66–1.07 mmol/L',
  'Important in eclampsia monitoring. Avoid haemolysis.', 25.00, true),

-- ============================================================
-- THYROID FUNCTION
-- ============================================================
('THY-001', 'Thyroid Stimulating Hormone (TSH)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'Adults: 0.4–4.0 mIU/L; Pregnancy 1st trimester: 0.1–2.5; 2nd: 0.2–3.0; 3rd: 0.3–3.0 mIU/L',
  'First-line thyroid test. If abnormal, add Free T4 ± Free T3.', 50.00, true),

('THY-002', 'Free Thyroxine (Free T4)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  '12–22 pmol/L',
  'Order with TSH. Reflects true T4 bioavailability.', 50.00, true),

('THY-003', 'Free Triiodothyronine (Free T3)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  '3.1–6.8 pmol/L',
  'Useful when T3 toxicosis suspected (elevated T3, normal T4).', 50.00, true),

('THY-004', 'Thyroid Function Tests (TFTs) – Full Panel', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'TSH: 0.4–4.0 mIU/L; Free T4: 12–22 pmol/L; Free T3: 3.1–6.8 pmol/L',
  'Panel of TSH + Free T4 + Free T3.', 120.00, true),

('THY-005', 'Anti-Thyroid Peroxidase Antibodies (Anti-TPO)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Negative: <34 IU/mL; Elevated suggests Hashimoto''s thyroiditis or Graves'' disease',
  'Useful in autoimmune thyroid disease workup.', 80.00, true),

('THY-006', 'Thyroglobulin (Tg)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  '<55 ng/mL (normal thyroid); Used as tumour marker in differentiated thyroid cancer',
  'Used for monitoring recurrence after thyroidectomy. Order with Anti-Tg antibodies.', 100.00, true),

-- ============================================================
-- CARDIAC MARKERS
-- ============================================================
('CAR-001', 'Troponin I (cTnI)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 2,
  'Normal: <0.04 ng/mL; Elevated (99th percentile URL): ≥0.04 ng/mL (indicates myocardial injury)',
  'Serial measurements at 0, 3, and 6 hours for ACS evaluation. High-sensitivity assays preferred.', 80.00, true),

('CAR-002', 'Troponin T (cTnT)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 2,
  'Normal: <14 ng/L (high-sensitivity assay); Elevated suggests myocardial injury',
  'Serial measurements recommended. Rises within 2–4 hours of myocardial injury.', 80.00, true),

('CAR-003', 'CK-MB (Creatine Kinase-MB)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Mass: 0–7.0 ng/mL; Activity: Males 0–25 U/L; Females 0–15 U/L',
  'Less specific than troponin. Useful for detecting reinfarction.', 50.00, true),

('CAR-004', 'Total Creatine Kinase (CK)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Males: 38–174 U/L; Females: 26–140 U/L',
  'Elevated in MI, myositis, muscular dystrophy. IM injections may raise CK.', 30.00, true),

('CAR-005', 'Lactate Dehydrogenase (LDH)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  '140–280 U/L',
  'Non-specific; elevated in haemolysis, MI, liver disease, malignancy.', 25.00, true),

('CAR-006', 'Brain Natriuretic Peptide (BNP)', 'Biochemistry', 'Plasma',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 4,
  'Normal: <100 pg/mL; Heart failure unlikely: <35 pg/mL; Heart failure likely: >400 pg/mL (BNP) or >125 pg/mL (NT-proBNP)',
  'Elevated in heart failure. Useful to guide diuretic therapy.', 150.00, true),

('CAR-007', 'NT-proBNP', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  '<300 pg/mL (rule out); Age- and weight-adjusted cut-offs for diagnosis',
  'Preferred to BNP when EDTA samples not available. Half-life longer than BNP.', 150.00, true),

-- ============================================================
-- HORMONES & REPRODUCTIVE
-- ============================================================
('HOR-001', 'Beta-hCG (Pregnancy Test) – Serum', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 2,
  'Non-pregnant: <5 IU/L; Pregnancy: rises from ~10 IU/L at implantation; doubles every 48–72 hr in early pregnancy; peaks at 8–10 wks: 25,000–300,000 IU/L',
  'Serum hCG is more sensitive than urine test. Serial levels useful for ectopic/miscarriage.', 40.00, true),

('HOR-002', 'Follicle Stimulating Hormone (FSH)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'Males: 1.5–12.4 mIU/mL; Females follicular: 2.5–10.2; Midcycle: 3.4–33.4; Luteal: 1.5–9.1; Post-menopause: 23–116 mIU/mL',
  'Collect mid-cycle for fertility assessment. Specify day of cycle.', 50.00, true),

('HOR-003', 'Luteinising Hormone (LH)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'Males: 1.7–8.6 mIU/mL; Females follicular: 2.4–12.6; Midcycle: 14–96; Luteal: 1.0–11.4; Post-menopause: 7.7–58.5 mIU/mL',
  'Specify day of menstrual cycle.', 50.00, true),

('HOR-004', 'Prolactin', 'Biochemistry', 'Serum',
  'Venepuncture (30 min after waking)', 'Plain/SST (Gold)', '5 mL', 6,
  'Males: 2–18 ng/mL; Non-pregnant females: 2–29 ng/mL; Pregnant: up to 200+ ng/mL',
  'Collect am, ≥1 hr after waking, patient at rest. Stress elevates prolactin.', 60.00, true),

('HOR-005', 'Total Testosterone', 'Biochemistry', 'Serum',
  'Venepuncture (7–10 am)', 'Plain/SST (Gold)', '5 mL', 6,
  'Males: 10.4–34.7 nmol/L (300–1000 ng/dL); Females: 0.52–2.43 nmol/L',
  'Collect between 7–10 am (peak circadian level).', 70.00, true),

('HOR-006', 'Oestradiol / Estradiol (E2)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'Females follicular: 46–607 pmol/L; Midcycle: 315–1828 pmol/L; Luteal: 161–774 pmol/L; Post-menopause: <157 pmol/L; Males: <106 pmol/L',
  'Specify day of menstrual cycle and current medications.', 70.00, true),

('HOR-007', 'Progesterone', 'Biochemistry', 'Serum',
  'Venepuncture (day 21 of cycle)', 'Plain/SST (Gold)', '5 mL', 6,
  'Follicular: 0.6–3.2 nmol/L; Luteal: 16–95 nmol/L; Ovulation confirmed: >16 nmol/L; 1st Trimester: 35–90 nmol/L',
  'Collect on day 21 of a 28-day cycle. Specify cycle day on request.', 60.00, true),

('HOR-008', 'Cortisol (Morning)', 'Biochemistry', 'Serum',
  'Venepuncture (8–9 am)', 'Plain/SST (Gold)', '5 mL', 4,
  'Morning (8 am): 138–635 nmol/L; Evening (4 pm): 83–359 nmol/L; Midnight: <207 nmol/L',
  'Collect at 8–9 am (peak cortisol). Stress, illness and exogenous steroids affect result.', 80.00, true),

('HOR-009', 'DHEA-Sulphate (DHEAS)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Males 20–49 yr: 4.3–13.3 µmol/L; Females 20–49 yr: 1.9–11.1 µmol/L; Post-menopause: 0.4–3.7 µmol/L',
  'Adrenal androgen. Useful in PCOS workup.', 80.00, true),

('HOR-010', 'Insulin (Fasting)', 'Biochemistry', 'Serum',
  'Venepuncture (fasting ≥8 hr)', 'Plain/SST (Gold)', '5 mL', 8,
  'Fasting: 2–25 µIU/mL; HOMA-IR: <2.0 (normal insulin sensitivity)',
  'Fasting ≥8 hours required. Calculate HOMA-IR = (glucose × insulin) / 22.5.', 80.00, true),

('HOR-011', 'Parathyroid Hormone (PTH)', 'Biochemistry', 'Serum',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 8,
  'Intact PTH: 15–65 pg/mL',
  'Collect on ice, process within 2 hours. Order with ionised calcium.', 100.00, true),

-- ============================================================
-- PROSTATE
-- ============================================================
('PSA-001', 'Prostate Specific Antigen (Total PSA)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  '<40 yr: <2.0 ng/mL; 40–49 yr: <2.5 ng/mL; 50–59 yr: <3.5 ng/mL; 60–69 yr: <4.5 ng/mL; ≥70 yr: <6.5 ng/mL',
  'Avoid DRE or prostate biopsy 48 hr prior. Ejaculation can raise PSA for 24 hr.', 60.00, true),

('PSA-002', 'Free PSA and PSA Ratio (f/t PSA)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 6,
  'Free/Total PSA ratio: >25% – benign more likely; <10% – malignancy more likely',
  'Useful when total PSA is 4–10 ng/mL (grey zone). Reduces unnecessary biopsies.', 80.00, true),

-- ============================================================
-- TUMOUR MARKERS
-- ============================================================
('TUM-001', 'Carcinoembryonic Antigen (CEA)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Non-smoker: <3.0 ng/mL; Smoker: <5.0 ng/mL; Elevated in colorectal, lung, breast, gastric Ca',
  'Not for screening; used for monitoring treatment response in colorectal cancer.', 80.00, true),

('TUM-002', 'Alpha-Fetoprotein (AFP)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Normal: <10 ng/mL; Elevated in hepatocellular carcinoma, germ cell tumours, and pregnancy',
  'Used for monitoring HCC and testicular germ cell tumours.', 80.00, true),

('TUM-003', 'CA-125 (Cancer Antigen 125)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Normal: <35 U/mL; Elevated in ovarian cancer; also raised in endometriosis, PID, pregnancy',
  'Not for screening. Use for monitoring ovarian cancer and endometriosis.', 100.00, true),

('TUM-004', 'CA 19-9 (Cancer Antigen 19-9)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Normal: <37 U/mL; Elevated in pancreatic, biliary, and GI cancers',
  'Used for monitoring pancreatic cancer. May be elevated in benign conditions.', 100.00, true),

('TUM-005', 'CA 15-3 (Cancer Antigen 15-3)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Normal: <25 U/mL; Elevated in breast cancer, also ovarian and lung cancers',
  'Used for monitoring breast cancer treatment response.', 100.00, true),

-- ============================================================
-- INFLAMMATORY MARKERS
-- ============================================================
('INF-001', 'C-Reactive Protein (CRP)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Normal: <5 mg/L; Mild inflammation: 5–40 mg/L; Significant infection/inflammation: >40 mg/L; Sepsis: >200 mg/L',
  'Rises within 6–12 hours of acute inflammation. Useful for monitoring infection.', 25.00, true),

('INF-002', 'High-Sensitivity CRP (hsCRP)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Low CV risk: <1.0 mg/L; Moderate: 1.0–3.0 mg/L; High CV risk: >3.0 mg/L',
  'Used for cardiovascular risk assessment. Different analytic range from standard CRP.', 40.00, true),

('INF-003', 'Procalcitonin (PCT)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Normal: <0.5 ng/mL; Possible infection: 0.5–2 ng/mL; High probability of sepsis: >2 ng/mL; Severe sepsis/septic shock: >10 ng/mL',
  'Best marker for bacterial sepsis. Guide antibiotic de-escalation.', 120.00, true),

('INF-004', 'Ferritin', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Males: 24–336 µg/L; Females (pre-menopausal): 11–307 µg/L; Iron deficiency: <12 µg/L; Elevated in inflammation/infection',
  'Acute-phase reactant – may be falsely elevated in inflammation. Interpret with CRP.', 40.00, true),

-- ============================================================
-- IRON STUDIES
-- ============================================================
('IRN-001', 'Iron Studies (Full Panel)', 'Biochemistry', 'Serum',
  'Venepuncture (fasting)', 'Plain/SST (Gold)', '5 mL', 6,
  'Serum Iron: M 11–30 µmol/L, F 9–27 µmol/L; TIBC: 45–81 µmol/L; Transferrin Sat: M 20–50%, F 15–45%; Ferritin: M 24–336 µg/L, F 11–307 µg/L',
  'Includes: serum iron, TIBC, transferrin saturation, ferritin. Fasting preferred.', 70.00, true),

('IRN-002', 'Serum Iron', 'Biochemistry', 'Serum',
  'Venepuncture (fasting)', 'Plain/SST (Gold)', '5 mL', 4,
  'Males: 11–30 µmol/L; Females: 9–27 µmol/L',
  'Diurnal variation – collect in morning. Avoid haemolysis.', 20.00, true),

('IRN-003', 'Total Iron Binding Capacity (TIBC)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  '45–81 µmol/L',
  'Elevated TIBC with low serum iron indicates iron deficiency.', 25.00, true),

-- ============================================================
-- VITAMINS
-- ============================================================
('VIT-001', 'Vitamin D (25-OH Vitamin D)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Deficiency: <25 nmol/L (<10 ng/mL); Insufficiency: 25–50 nmol/L; Adequate: >50 nmol/L (>20 ng/mL); Optimal: 75–200 nmol/L',
  'Protect from light. Most common vitamin deficiency globally.', 80.00, true),

('VIT-002', 'Vitamin B12 (Cobalamin)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Normal: 145–637 pmol/L; Deficiency: <150 pmol/L; Borderline: 150–220 pmol/L',
  'Low in vegetarians, elderly, and those on metformin/PPIs.', 70.00, true),

('VIT-003', 'Folic Acid / Folate', 'Biochemistry', 'Serum',
  'Venepuncture (fasting)', 'Plain/SST (Gold)', '5 mL', 24,
  'Normal: >7 nmol/L; Deficiency: <7 nmol/L',
  'Protect from light. Fasting preferred. Red cell folate is a better indicator of long-term stores.', 60.00, true),

-- ============================================================
-- BLOOD GASES
-- ============================================================
('ABG-001', 'Arterial Blood Gas (ABG)', 'Biochemistry', 'Arterial Blood',
  'Arterial puncture (radial or femoral)', 'Pre-heparinised syringe', '1–3 mL', 1,
  'pH: 7.35–7.45; PaO2: 80–100 mmHg; PaCO2: 35–45 mmHg; HCO3: 22–26 mmol/L; SpO2: 95–99%; Base excess: -2 to +2',
  'Expel air bubbles immediately. Process within 15 min or keep on ice for up to 1 hr.', 60.00, true),

('ABG-002', 'Venous Blood Gas (VBG)', 'Biochemistry', 'Venous Blood',
  'Venepuncture', 'Pre-heparinised syringe', '1–3 mL', 1,
  'pH: 7.31–7.41; pCO2: 41–51 mmHg; HCO3: 22–29 mmol/L; Lactate: 0.5–1.6 mmol/L',
  'Acceptable substitute for ABG in stable patients. Not valid for O2 assessment.', 50.00, true),

('ABG-003', 'Serum Lactate', 'Biochemistry', 'Whole Blood or Plasma',
  'Venepuncture (no tourniquet)', 'Fluoride (Grey) or heparinised', '2 mL', 2,
  'Normal: 0.5–2.2 mmol/L; Hyperlactataemia: 2–4 mmol/L; Lactic acidosis: >4 mmol/L',
  'Collect without tourniquet. Process immediately. Do not allow patient to clench fist.', 40.00, true),

-- ============================================================
-- MICROBIOLOGY – MALARIA
-- ============================================================
('MAL-001', 'Malaria Rapid Diagnostic Test (RDT)', 'Microbiology', 'Whole Blood',
  'Fingerprick or Venepuncture', 'EDTA (Purple/Lavender)', '2 mL', 1,
  'Negative; Positive for P. falciparum (HRP2) or pan-Plasmodium (pLDH)',
  'Test within 30 min of collection for fingerprick. Most sensitive for P. falciparum. Confirm positives with blood film if possible.',  15.00, true),

('MAL-002', 'Malaria Blood Film (Thick & Thin)', 'Microbiology', 'Whole Blood',
  'Fingerprick or Venepuncture', 'No anticoagulant (direct smear)', 'Smear', 4,
  'Negative; if positive: report species, ring form %, parasitaemia count per µL',
  'Prepare thick film for sensitivity and thin film for speciation. Stain with Giemsa at pH 7.2. Gold standard for diagnosis.', 20.00, true),

('MAL-003', 'Malaria Parasite Count', 'Microbiology', 'Whole Blood',
  'Fingerprick', 'No anticoagulant (direct smear)', 'Smear', 4,
  'Mild: <10,000/µL; Moderate: 10,000–100,000/µL; Severe (WHO): >100,000/µL',
  'Count against 200 WBCs on thick film. Use leukocyte count for absolute calculation.', 25.00, true),

-- ============================================================
-- MICROBIOLOGY – TUBERCULOSIS
-- ============================================================
('TB-001', 'AFB Sputum Smear (Ziehl-Neelsen)', 'Microbiology', 'Sputum',
  'Expectorated sputum (early morning)', 'Wide-mouth sterile container', '3–5 mL', 4,
  'Negative = 0 AFB/300 fields; Scanty = 1–9 AFB/100 fields; 1+ = 10–99/100 fields; 2+ = 1–10/field; 3+ = >10/field',
  'Collect 3 specimens: spot, early morning, spot on day 2. Transport promptly to lab.', 20.00, true),

('TB-002', 'GeneXpert MTB/RIF (Xpert)', 'Microbiology', 'Sputum',
  'Expectorated sputum (early morning, ≥1 mL)', 'GeneXpert cartridge/sterile container', '2–3 mL', 2,
  'MTB Not Detected / MTB Detected (Trace/Low/Medium/High); Rifampicin resistance Detected/Not Detected/Indeterminate',
  'Ghana standard of care for TB diagnosis. Highly sensitive PCR-based test. Use for initial diagnosis and RIF resistance screening.', 60.00, true),

('TB-003', 'Sputum Culture for MTB (MGIT/LJ)', 'Microbiology', 'Sputum',
  'Expectorated early-morning sputum', 'Sterile wide-mouth container', '5 mL', 336,
  'No growth / Growth detected with species identification and drug sensitivity',
  'Gold standard. MGIT (liquid) returns results in 1–3 wks vs 6–8 wks for LJ. Collect 3 specimens.', 120.00, true),

('TB-004', 'Tuberculin Skin Test (Mantoux)', 'Microbiology', 'Intradermal injection',
  'Intradermal injection volar forearm', 'No tube – PPD tuberculin', 'N/A', 72,
  'Induration <5 mm: Negative (immunocompromised); 5–9 mm: Positive (HIV, close contacts); ≥10 mm: Positive (general population); ≥15 mm: Positive (no risk factors)',
  'Read at 48–72 hours by trained health worker. Do not retest within 1 year.', 30.00, true),

-- ============================================================
-- MICROBIOLOGY – CULTURES
-- ============================================================
('CUL-001', 'Blood Culture & Sensitivity (Aerobic/Anaerobic)', 'Microbiology', 'Whole Blood',
  'Venepuncture (strict aseptic)', 'Blood culture bottles (Aerobic + Anaerobic)', '10 mL per bottle', 72,
  'No growth after 5 days = Negative; Growth = organism identified with sensitivity profile',
  'Collect 2 sets from 2 separate sites before antibiotics. Clean skin with 70% alcohol + chlorhexidine. Inoculate aerobic bottle first.', 60.00, true),

('CUL-002', 'Urine Culture & Sensitivity (MC&S)', 'Microbiology', 'Midstream Urine (MSU)',
  'Midstream catch (clean technique)', 'Sterile borate container', '10–20 mL', 48,
  'No significant growth = <10⁵ CFU/mL; Significant = ≥10⁵ CFU/mL single organism (catheter: ≥10³ CFU/mL)',
  'Clean-catch midstream urine. Transport to lab within 2 hours or refrigerate. Label with time of collection.', 40.00, true),

('CUL-003', 'Stool Culture & Sensitivity', 'Microbiology', 'Stool',
  'Freshly voided stool (no toilet water)', 'Sterile stool container', '1–5 g', 72,
  'Pathogens reported: Salmonella, Shigella, E. coli O157, Campylobacter, Vibrio cholerae, Yersinia with sensitivity',
  'Submit within 2 hours. Indicate clinical history (diarrhoea duration, blood in stool).', 50.00, true),

('CUL-004', 'Wound Swab Culture & Sensitivity', 'Microbiology', 'Wound Swab',
  'Swab of wound base (remove surface exudate first)', 'Sterile Amies transport swab', 'Swab', 72,
  'Commensal organisms reported; Pathogenic organisms reported with sensitivity profile',
  'Swab deepest part of wound. Avoid surface exudate and necrotic tissue. Transport in Amies medium.', 40.00, true),

('CUL-005', 'High Vaginal Swab (HVS) Culture & Sensitivity', 'Microbiology', 'HVS',
  'Posterior vaginal fornix swab (per speculum)', 'Sterile Amies transport swab', 'Swab', 72,
  'Commensals (Lactobacillus) normal; Pathogens: BV organisms, Candida, Group B Strep, Trichomonas',
  'Obtain from posterior fornix. Use two swabs: one for culture, one for wet preparation. Transport immediately.', 40.00, true),

('CUL-006', 'Throat Swab Culture & Sensitivity', 'Microbiology', 'Throat Swab',
  'Tonsillar pillars and posterior pharynx (avoid tongue)', 'Sterile Amies transport swab', 'Swab', 48,
  'Normal flora present; Pathogen: Group A Streptococcus most significant finding',
  'Use tongue depressor and good light. Swab tonsils and posterior pharynx vigorously.', 35.00, true),

('CUL-007', 'Ear Swab Culture & Sensitivity', 'Microbiology', 'Ear Swab',
  'Deep EAC swab', 'Sterile Amies transport swab', 'Swab', 48,
  'Pathogens: Pseudomonas aeruginosa (chronic otitis), S. aureus, Aspergillus (otomycosis)',
  'Collect from external auditory canal. Note if tympanic membrane is perforated.', 35.00, true),

('CUL-008', 'Nasal Swab Culture & Sensitivity', 'Microbiology', 'Nasal Swab',
  'Anterior nares swab', 'Sterile Amies swab', 'Swab', 48,
  'Normal: Coagulase-negative Staph, S. aureus; Pathogen: MRSA screen positive/negative',
  'Swab both anterior nares. Required for MRSA decolonisation protocols.', 35.00, true),

('CUL-009', 'CSF Culture & Sensitivity', 'Microbiology', 'Cerebrospinal Fluid (CSF)',
  'Lumbar puncture (LP)', 'Sterile plain tube (3 tubes)', '3–5 mL (3 tubes)', 72,
  'No growth; Pathogens: N. meningitidis, S. pneumoniae, L. monocytogenes, E. coli (neonates), Cryptococcus (HIV+)',
  'URGENT — transport immediately at body temperature (NOT on ice). Send tube 1 for biochemistry, tube 2 for microbiology, tube 3 for haematology.', 80.00, true),

('CUL-010', 'Sputum Culture & Sensitivity (Non-TB)', 'Microbiology', 'Sputum',
  'Expectorated sputum', 'Sterile wide-mouth container', '3–5 mL', 72,
  'Significant pathogens: S. pneumoniae, H. influenzae, K. pneumoniae, P. aeruginosa, S. aureus',
  'Early morning, deep-cough specimen. Poor-quality (saliva only) samples rejected. Transport within 2 hours.', 50.00, true),

-- ============================================================
-- MICROBIOLOGY – PARASITOLOGY & STOOL
-- ============================================================
('PAR-001', 'Stool Microscopy (Ova, Cysts & Parasites)', 'Microbiology', 'Stool',
  'Freshly voided stool', 'Sterile stool container', '5 g', 4,
  'No ova/cysts/parasites seen; or organism identified (Ascaris, hookworm, Giardia, Entamoeba histolytica, etc.)',
  'Submit fresh specimen; no refrigeration for amoebiasis. Formal saline for concentration technique.', 20.00, true),

('PAR-002', 'Stool Occult Blood (FOBT)', 'Microbiology', 'Stool',
  'Random stool sample', 'FOBT kit or sterile container', '5 g', 4,
  'Negative; Positive (haemoglobin detected)',
  'Patient avoids red meat, vitamin C, iron, NSAIDs for 3 days before test. Qualitative guaiac or quantitative immunochemical (FIT).', 25.00, true),

('PAR-003', 'Stool Reducing Substances', 'Microbiology', 'Stool',
  'Fresh liquid stool', 'Sterile container', '5–10 g', 2,
  'Negative (no reducing substances); Positive suggests lactose intolerance or carbohydrate malabsorption',
  'Submit within 30 minutes of collection. Perform Clinitest immediately.', 15.00, true),

('PAR-004', 'Wet Preparation (Vaginal Discharge)', 'Microbiology', 'Vaginal Discharge',
  'HVS or discharge swab', 'Sterile plain swab', 'Swab', 2,
  'Normal: Lactobacilli dominant; Abnormal: clue cells (BV), hyphae/spores (Candida), motile trichomonads',
  'Examine within 30 min of collection for Trichomonas (motility is lost rapidly).', 20.00, true),

('PAR-005', 'Urethral Discharge Microscopy & Culture', 'Microbiology', 'Urethral Discharge',
  'Urethral swab (before urination)', 'Sterile Amies swab + plain swab', 'Swab', 48,
  'N. gonorrhoeae: intracellular Gram-negative diplococci; Non-gonococcal: no diplococci',
  'Gram stain for immediate Gonorrhoea presumption. Culture for confirmation and sensitivity.', 40.00, true),

-- ============================================================
-- SEROLOGY – HIV
-- ============================================================
('HIV-001', 'HIV Antibody/Antigen Test (4th Generation Combo)', 'Serology', 'Serum or Plasma',
  'Venepuncture', 'Plain/SST (Gold) or EDTA', '5 mL', 2,
  'Non-reactive = HIV negative; Reactive = requires confirmatory testing per Ghana National Algorithm',
  'Ghana NACP algorithm: parallel testing with 2 rapid tests (Determine + UniGold). Positive = confirmed if both reactive. Report positive to patient with counselling.', 20.00, true),

('HIV-002', 'HIV Viral Load (PCR)', 'Serology', 'Plasma',
  'Venepuncture', 'EDTA (Purple/Lavender)', '5 mL', 72,
  'Undetectable: <20–50 copies/mL; ART initiated: <1000 copies/mL at 6 months; Virological failure: >1000 copies/mL',
  'For monitoring ART response. Transport to reference lab on ice. Test at 6 months after ART initiation then annually.', 80.00, true),

('HIV-003', 'CD4 Count', 'Serology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '5 mL', 24,
  'Normal: 500–1500 cells/µL; ART initiation threshold: <500 cells/µL (current GHS guideline: treat all regardless); Opportunistic infection risk: <200 cells/µL',
  'Transport within 24–48 hours at room temperature. Avoid extreme temperatures.', 60.00, true),

-- ============================================================
-- SEROLOGY – HEPATITIS
-- ============================================================
('HEP-001', 'Hepatitis B Surface Antigen (HBsAg)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 2,
  'Negative = Non-reactive; Positive = Hepatitis B infection (acute or chronic)',
  'Reactive result must be confirmed by confirmatory assay. Mandatory screening: antenatal, blood donors, health workers.', 20.00, true),

('HEP-002', 'Hepatitis B Surface Antibody (Anti-HBs)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Protected: >10 IU/L; Adequate vaccine response: ≥10–100 IU/L; High: >100 IU/L; Negative: <10 IU/L (not protected)',
  'Checks immunity post-vaccination or recovery. Order 4–8 weeks after completing vaccine course.', 30.00, true),

('HEP-003', 'Hepatitis B e-Antigen (HBeAg)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Negative = Non-reactive; Positive = High viral replication (HBeAg+ve chronic hepatitis)',
  'Indicates high infectivity. Loss of HBeAg and development of Anti-HBe = seroconversion (good prognostic sign).', 40.00, true),

('HEP-004', 'Hepatitis B Core Antibody (Anti-HBc Total)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Negative = No prior HBV infection or vaccination; Positive with HBsAg = Chronic/Acute; Positive without HBsAg = Past infection (immunity)',
  'IgM Anti-HBc = acute infection. IgG Anti-HBc = past/chronic infection.', 40.00, true),

('HEP-005', 'Hepatitis B DNA (HBV Viral Load)', 'Serology', 'Serum or Plasma',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Undetectable = <10–20 IU/mL; Treatment threshold: >2000 IU/mL (with elevated ALT or fibrosis); High replication: >20,000 IU/mL',
  'Use for staging chronic HBV and monitoring antiviral therapy. Send to reference lab.', 150.00, true),

('HEP-006', 'Hepatitis C Antibody (Anti-HCV)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Non-reactive = Negative; Reactive = Past or current HCV infection (confirm with HCV RNA)',
  'Antibody persists after recovery. Reactive result requires HCV RNA PCR to confirm active infection.', 30.00, true),

('HEP-007', 'Hepatitis C RNA (HCV Viral Load)', 'Serology', 'Serum or Plasma',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Undetectable = No active replication; Detectable = Active HCV infection; SVR (cure): undetectable 12 weeks post-DAA treatment',
  'Gold standard for active HCV infection. Required before starting DAA therapy.', 150.00, true),

('HEP-008', 'Hepatitis A Antibody (Anti-HAV)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'IgM Anti-HAV Positive = Acute hepatitis A; IgG Anti-HAV Positive = Past infection or vaccination (immunity)',
  'HAV is self-limiting. IgM indicates acute infection (0–6 months). IgG indicates immunity.', 40.00, true),

-- ============================================================
-- SEROLOGY – SYPHILIS & STIs
-- ============================================================
('STI-001', 'VDRL / RPR (Syphilis Screening)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Non-reactive = Negative; Reactive = Possible syphilis (requires TPHA confirmation)',
  'GHS antenatal standard. Non-specific – reactive results confirmed with TPHA. Titre (1:1, 1:2…) guides treatment.', 15.00, true),

('STI-002', 'TPHA (Treponema pallidum Haemagglutination)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Non-reactive = No treponemal infection; Reactive = Treponemal exposure (remains positive for life)',
  'Confirmatory test. Neither VDRL nor TPHA distinguishes between active and treated disease – use VDRL titre.', 25.00, true),

('STI-003', 'Gonorrhoea NAAT (GC PCR)', 'Serology', 'Urine, Swab or Discharge',
  'First-catch urine or swab', 'Sterile container/NAAT transport swab', '5–10 mL urine or swab', 24,
  'Not Detected / Detected (N. gonorrhoeae DNA)',
  'Higher sensitivity than culture. Use combined GC/CT NAAT where available.', 100.00, true),

('STI-004', 'Chlamydia NAAT (CT PCR)', 'Serology', 'Urine, Swab or Discharge',
  'First-catch urine or swab', 'Sterile container/NAAT transport swab', '5–10 mL urine or swab', 24,
  'Not Detected / Detected (C. trachomatis DNA)',
  'Most sensitive test for chlamydia. GC/CT combined NAAT preferred.', 100.00, true),

-- ============================================================
-- SEROLOGY – OTHER INFECTIONS
-- ============================================================
('SER-001', 'Widal Test (Typhoid antibodies)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Significant titre: O ≥1:80 and/or H ≥1:160 (in endemic areas like Ghana baseline may be higher)',
  'Limited specificity in endemic areas. Paired serology (rising titre) more reliable than single titre. Blood culture preferred for diagnosis.', 20.00, true),

('SER-002', 'Brucella Agglutination Test (RBAT/SAT)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'RBAT (screening): Non-reactive/Reactive; SAT (confirmatory): titre ≥1:160 significant',
  'Order for patients with fever and cattle/animal exposure. Culture is gold standard.', 30.00, true),

('SER-003', 'Dengue NS1 Antigen', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Negative / Positive (DENV NS1 antigen detected – early infection, days 1–5)',
  'Best in first 5 days of illness. Combine with IgM for complete dengue diagnosis.', 50.00, true),

('SER-004', 'Dengue IgM / IgG Antibodies', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'IgM positive (from day 5) = Primary infection; IgM + IgG positive = Secondary infection',
  'Test after day 5 of illness. NS1 antigen preferred in first 5 days.', 50.00, true),

('SER-005', 'Rheumatoid Factor (RF)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Negative: <20 IU/mL; Weakly positive: 20–80 IU/mL; Positive: >80 IU/mL',
  'Not specific for RA – also elevated in SLE, Sjögren''s, chronic infections. Order with anti-CCP for RA diagnosis.', 30.00, true),

('SER-006', 'Anti-CCP Antibodies (Anti-Cyclic Citrullinated Peptide)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'Negative: <20 U/mL; Positive: ≥20 U/mL',
  'Highly specific for RA (95%). Appears early before joint damage. Order with RF.', 80.00, true),

('SER-007', 'ANA (Antinuclear Antibody)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Negative: <1:40; Positive screening: ≥1:80; High titre: ≥1:320 (significant for SLE)',
  'Screening test for autoimmune diseases. Positive ANA requires anti-dsDNA, anti-Sm, complement levels.', 80.00, true),

('SER-008', 'Anti-dsDNA (Anti-Double Stranded DNA)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Negative: <30 IU/mL; Elevated in SLE, correlates with disease activity and lupus nephritis',
  'Highly specific for SLE. Rising levels predict flares and renal involvement.', 100.00, true),

('SER-009', 'ASO Titre (Antistreptolysin-O)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Adults: <200 Todd units; Children: <150 Todd units; Elevated suggests recent Group A Streptococcal infection',
  'Used for diagnosis of acute rheumatic fever and post-streptococcal GN. Serial titres more informative.', 30.00, true),

('SER-010', 'Toxoplasma IgG / IgM', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'IgG negative: <1:8; IgM negative: <1:8; IgM positive = acute/recent infection; IgG positive only = past infection (immunity)',
  'Essential in pregnancy (congenital toxoplasmosis). High risk in immunocompromised (HIV).', 60.00, true),

('SER-011', 'Helicobacter pylori Antibody (Serum)', 'Serology', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 4,
  'Negative: Non-reactive; Positive: Reactive – H. pylori IgG antibodies detected',
  'Cannot distinguish active from past infection. Stool antigen test preferred for diagnosis and test-of-cure.', 40.00, true),

('SER-012', 'H. pylori Stool Antigen Test', 'Serology', 'Stool',
  'Random stool sample', 'Sterile stool container', '5 g', 4,
  'Negative / Positive (H. pylori antigen detected)',
  'Preferred for diagnosis and test-of-cure (4 weeks after completing eradication therapy). Stop PPI 2 weeks and antibiotics 4 weeks before test.', 40.00, true),

('SER-013', 'COVID-19 Antigen Rapid Test', 'Serology', 'Nasopharyngeal/Oropharyngeal Swab',
  'NP swab (trained personnel)', 'Viral transport medium or dry swab', 'Swab', 1,
  'Negative / Positive (SARS-CoV-2 nucleocapsid antigen detected)',
  'Best within 5 days of symptom onset. Lower sensitivity than PCR. Use PCR to confirm negative results in symptomatic patients.', 30.00, true),

('SER-014', 'COVID-19 PCR (RT-PCR)', 'Serology', 'Nasopharyngeal/Oropharyngeal Swab',
  'NP swab (trained personnel)', 'Viral transport medium', 'Swab', 24,
  'Not Detected / Detected (SARS-CoV-2 RNA)',
  'Gold standard. Collect from NP + OP. Submit in viral transport medium at 2–8°C.', 80.00, true),

('SER-015', 'Blood Film for Trypanosomiasis (HAT)', 'Serology', 'Whole Blood',
  'Venepuncture or Fingerprick', 'EDTA (Purple/Lavender)', '3 mL', 4,
  'No trypomastigotes seen; Positive = trypomastigotes observed',
  'Relevant in forest and savannah zones of Ghana. Milky card test (CATT) used for screening; blood/CSF concentration necessary for confirmation.', 30.00, true),

-- ============================================================
-- URINE TESTS
-- ============================================================
('URI-001', 'Urinalysis (Routine / Dipstick)', 'Urinalysis', 'Midstream Urine (MSU)',
  'Midstream clean catch', 'Universal container', '10–20 mL', 1,
  'pH: 4.5–8.0; SG: 1.003–1.030; Protein: Negative; Glucose: Negative; Ketones: Negative; Blood: Negative; Nitrites: Negative; Leukocytes: Negative; Bilirubin: Negative; Urobilinogen: Normal; Colour: Pale-yellow to amber',
  'Ideally first morning void. Examine within 2 hours or refrigerate.', 10.00, true),

('URI-002', 'Urine Microscopy (RBCs, WBCs, Casts)', 'Urinalysis', 'Midstream Urine (MSU)',
  'Midstream clean catch', 'Universal container (plain)', '10–20 mL', 2,
  'RBCs: <3/HPF; WBCs: <5/HPF; Casts: None (occasional hyaline); Epithelial cells: few; No bacteria/yeast',
  'Centrifuge at 400g for 5 min. Examine sediment immediately. Report with dipstick as Urine R&M.', 15.00, true),

('URI-003', 'Urine Pregnancy Test (hCG – Urine)', 'Urinalysis', 'Urine',
  'First-void urine', 'Universal container or test strip', '5 mL', 1,
  'Negative: No line; Positive: 2 lines (hCG ≥20 IU/L detected)',
  'First morning urine preferred (most concentrated). Detects hCG from ~10–14 days post-conception.', 10.00, true),

('URI-004', 'Urine Albumin-Creatinine Ratio (ACR)', 'Urinalysis', 'Spot Urine',
  'First morning spot urine', 'Universal container', '10 mL', 4,
  'Normal: <3 mg/mmol (<30 mg/g); Microalbuminuria: 3–30 mg/mmol; Macroalbuminuria: >30 mg/mmol',
  'Essential for early diabetic nephropathy screening. First morning void preferred.', 40.00, true),

('URI-005', '24-Hour Urine Protein', 'Urinalysis', '24-Hour Urine',
  '24-hour collection', '24-hr urine container (plain)', 'All urine', 4,
  'Normal: <150 mg/24 hr; Microalbuminuria: 30–300 mg/24 hr; Significant proteinuria: >3.5 g/24 hr',
  'Discard first void, collect all subsequent urine for 24 hours. Keep cool. Record total volume.', 40.00, true),

('URI-006', '24-Hour Urine Creatinine', 'Urinalysis', '24-Hour Urine',
  '24-hour collection', '24-hr urine container (plain)', 'All urine', 4,
  'Males: 80–160 µmol/kg/24 hr; Females: 50–130 µmol/kg/24 hr',
  'Sent with 24-hr urine protein to calculate creatinine clearance.', 30.00, true),

-- ============================================================
-- CSF ANALYSIS
-- ============================================================
('CSF-001', 'CSF Full Analysis (Routine)', 'Microbiology', 'Cerebrospinal Fluid',
  'Lumbar puncture', 'Sterile plain tubes (x3)', '3–5 mL (3 tubes)', 4,
  'Appearance: Clear/colourless; Opening pressure: 6–20 cmH2O; WBC: 0–5/µL (all lymphocytes); RBC: 0; Protein: 0.15–0.45 g/L; Glucose: 2.8–4.4 mmol/L (60–70% serum glucose); Gram stain: No organisms',
  'Transport urgently at body temp. Tube 1: biochemistry (protein + glucose). Tube 2: MC&S. Tube 3: cell count. Collect blood glucose simultaneously.', 80.00, true),

('CSF-002', 'CSF Glucose', 'Biochemistry', 'Cerebrospinal Fluid',
  'Lumbar puncture', 'Sterile plain tube', '1–2 mL', 2,
  '2.8–4.4 mmol/L (should be 60–70% of simultaneous plasma glucose)',
  'Always send simultaneous blood glucose. Low in bacterial meningitis, TB meningitis, hypoglycaemia.', 15.00, true),

('CSF-003', 'CSF Protein', 'Biochemistry', 'Cerebrospinal Fluid',
  'Lumbar puncture', 'Sterile plain tube', '1–2 mL', 2,
  'Adults: 0.15–0.45 g/L; Neonates: up to 0.85 g/L; Elevated in infection, Guillain-Barré, malignancy',
  'Transport immediately. Elevated in bacterial meningitis, GBS, tuberculoma.', 15.00, true),

('CSF-004', 'CSF India Ink Preparation (Cryptococcus)', 'Microbiology', 'Cerebrospinal Fluid',
  'Lumbar puncture', 'Sterile plain tube', '1–2 mL', 2,
  'Negative = No encapsulated yeasts; Positive = Encapsulated yeasts (Cryptococcus neoformans)',
  'Essential in HIV+ patients with headache. Transport at room temperature.', 20.00, true),

('CSF-005', 'CSF Cryptococcal Antigen (CrAg)', 'Microbiology', 'Cerebrospinal Fluid or Serum',
  'Lumbar puncture or venepuncture', 'Sterile tube', '2 mL', 2,
  'Negative = Non-reactive; Positive = Cryptococcal antigen detected',
  'Lateral flow assay is rapid and highly sensitive. Test serum AND CSF in HIV+ patients.', 40.00, true),

-- ============================================================
-- HISTOPATHOLOGY & CYTOLOGY
-- ============================================================
('HIS-001', 'Cervical Smear (Pap Smear)', 'Histopathology', 'Cervical Cells',
  'Spatula and endocervical brush or liquid-based collection device', 'SurePath or ThinPrep vial/glass slide', 'Sufficient cells', 72,
  'Bethesda System: NILM (negative for intraepithelial lesion); ASC-US; LSIL; HSIL; Malignant',
  'Avoid menstruation. Refrain from intercourse/douching 48 hr before. Sample ectocervix then endocervix.', 40.00, true),

('HIS-002', 'Biopsy – Histopathology', 'Histopathology', 'Tissue',
  'Surgical excision or core needle biopsy', '10% formalin in container', 'Tissue specimen', 72,
  'Varies by site – report describes architecture, cell type, presence/absence of malignancy, margins',
  'Fix in 10% formalin immediately (1:10 tissue:formalin ratio). Label with site, date, patient details.', 100.00, true),

('HIS-003', 'Fine Needle Aspiration Cytology (FNAC)', 'Histopathology', 'Aspirate/Cells',
  'Fine needle aspiration (21–23G needle)', 'Glass slides (air-dried or wet-fixed) + cytospin', 'Aspirate smear', 48,
  'Categories: Benign/Non-diagnostic/Atypical/Suspicious/Malignant',
  'Prepare at least 4–6 smears. Fix immediately in 95% ethanol for Pap stain; air-dry for Diff-Quik.', 60.00, true),

('HIS-004', 'Frozen Section (Intraoperative)', 'Histopathology', 'Tissue',
  'Intraoperative excision', 'Fresh tissue in saline (NO formalin)', 'Tissue', 1,
  'Benign / Malignant / Further sampling required',
  'URGENT – Submit fresh tissue to lab immediately. Notify histopathologist before procedure.', 200.00, true),

-- ============================================================
-- MICROBIOLOGY – SKIN & FUNGAL
-- ============================================================
('FUN-001', 'Skin Scraping for Fungal Microscopy & Culture (KOH)', 'Microbiology', 'Skin Scrapings/Nail Clippings/Hair',
  'Scraping of skin edge / nail clippings / hair plucked with bulb', 'Sterile container or dark paper', 'Small amount', 48,
  'Negative = No fungal elements; Positive = Hyphae, pseudohyphae, or spores identified; Culture grows Dermatophyte / Candida / Malassezia',
  'Scrape active edge of lesion. Include scrapings from nail bed for onychomycosis. KOH preparation for immediate microscopy.', 30.00, true),

('FUN-002', 'Serum Antifungal Level (e.g. Fluconazole, Voriconazole)', 'Biochemistry', 'Serum',
  'Venepuncture (trough level – before dose)', 'Plain/SST (Gold)', '5 mL', 24,
  'Voriconazole target trough: 1–5.5 mg/L; Fluconazole target (mucosal): 2–8 mg/L',
  'Collect trough sample immediately before next dose. Note dose, time of last dose.', 100.00, true),

-- ============================================================
-- DRUG MONITORING
-- ============================================================
('TDM-001', 'Digoxin Level', 'Biochemistry', 'Serum',
  'Venepuncture (≥6 hrs post-dose)', 'Plain/SST (Gold)', '5 mL', 4,
  'Therapeutic: 0.8–2.0 ng/mL; Toxic: >2.0 ng/mL',
  'Collect ≥6 hours post-dose (distribution phase must be complete).', 60.00, true),

('TDM-002', 'Phenytoin Level', 'Biochemistry', 'Serum',
  'Venepuncture (trough level)', 'Plain/SST (Gold)', '5 mL', 4,
  'Therapeutic: 40–80 µmol/L (10–20 mg/L); Toxic: >80 µmol/L',
  'Trough sample (just before next dose). Hypoalbuminaemia reduces total phenytoin.', 60.00, true),

('TDM-003', 'Carbamazepine Level', 'Biochemistry', 'Serum',
  'Venepuncture (trough level)', 'Plain/SST (Gold)', '5 mL', 4,
  'Therapeutic: 17–42 µmol/L (4–10 mg/L)',
  'Trough sample.', 60.00, true),

('TDM-004', 'Valproic Acid Level', 'Biochemistry', 'Serum',
  'Venepuncture (trough level)', 'Plain/SST (Gold)', '5 mL', 4,
  'Therapeutic: 350–700 µmol/L (50–100 mg/L); Toxic >700 µmol/L',
  'Trough sample. Hepatotoxicity risk.', 60.00, true),

('TDM-005', 'Lithium Level', 'Biochemistry', 'Serum',
  'Venepuncture (12 hrs post-dose)', 'Plain/SST (Gold) – No Gel', '5 mL', 4,
  'Therapeutic: 0.6–1.2 mmol/L; Toxic: >1.5 mmol/L',
  'Collect exactly 12 hours after last dose. Use plain (no gel) SST tube.', 60.00, true),

('TDM-006', 'Gentamicin Level (Peak & Trough)', 'Biochemistry', 'Serum',
  'Venepuncture (peak: 30–60 min post-dose; trough: before next dose)', 'Plain/SST (Gold)', '5 mL', 4,
  'Peak: 5–10 mg/L (conventional dosing); Trough: <2 mg/L; ODA: AUC 70–100 mg·h/L',
  'Note time of dose and sample collection. Nephrotoxicity and ototoxicity risk.', 60.00, true),

('TDM-007', 'Vancomycin Level (AUC / Trough)', 'Biochemistry', 'Serum',
  'Venepuncture (trough: before 4th dose or as directed)', 'Plain/SST (Gold)', '5 mL', 4,
  'AUC₀₋₂₄/MIC ratio: 400–600 mg·h/L; Trough (conventional): 15–20 mg/L',
  'AUC-guided monitoring preferred. Note dose, time given, time collected.', 80.00, true),

-- ============================================================
-- GENETIC & NEWBORN SCREENING
-- ============================================================
('NBS-001', 'Newborn Glucose-6-Phosphate Dehydrogenase (G6PD) Screen', 'Haematology', 'Whole Blood',
  'Heel prick (newborn) or fingerprick', 'Filter paper (Guthrie card)', 'Blood spot', 24,
  'Normal enzyme activity: Result reported as normal/reduced/deficient by method',
  'Mandatory GHS newborn screening in Ghana. Collect at 24–48 hours of age on Guthrie card.', 30.00, true),

('NBS-002', 'Newborn Sickle Cell Screening (HPLC)', 'Haematology', 'Whole Blood',
  'Heel prick (newborn)', 'Filter paper (Guthrie card)', 'Blood spot', 24,
  'HbFA = Normal; HbFS = Sickle Cell Disease (HbSS); HbFAS = Trait; HbFSC = SC Disease',
  'Mandatory GHS newborn screening. Collect at 24–48 hours of life.', 30.00, true),

('NBS-003', 'Neonatal TSH (Congenital Hypothyroidism Screen)', 'Biochemistry', 'Whole Blood',
  'Heel prick (newborn)', 'Filter paper (Guthrie card)', 'Blood spot', 24,
  'TSH <20 mIU/L = Normal; TSH >40 mIU/L = Refer for confirmatory serum TSH/Free T4',
  'Collect at 48–72 hours of age. Earlier collection (< 48 hr) may give falsely elevated TSH.', 30.00, true),

-- ============================================================
-- MISCELLANEOUS
-- ============================================================
('MIS-001', 'Urine Microalbumin', 'Urinalysis', 'Spot or 24-hr Urine',
  'Spot or timed collection', 'Universal container', '10–20 mL', 4,
  'Normal: <20 mg/L; Microalbuminuria: 20–200 mg/L; Macroalbuminuria: >200 mg/L',
  'First morning void preferred.', 30.00, true),

('MIS-002', 'Serum Beta-2 Microglobulin', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  '1.0–2.4 mg/L',
  'Elevated in multiple myeloma, lymphoma, renal failure, HIV.', 80.00, true),

('MIS-003', 'Serum Protein Electrophoresis (SPEP)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 24,
  'Albumin: 55–65%; Alpha-1: 2–4%; Alpha-2: 7–13%; Beta: 8–14%; Gamma: 12–22%; Paraprotein (M-band): None',
  'Used for multiple myeloma, MGUS, hypergammaglobulinaemia detection.', 80.00, true),

('MIS-004', 'Urine Protein Electrophoresis (UPEP)', 'Biochemistry', 'Urine',
  '24-hr urine collection', '24-hr urine container', 'All urine', 24,
  'No paraprotein / Bence-Jones protein; Normal: albumin-predominant',
  'Order with SPEP for multiple myeloma workup.', 80.00, true),

('MIS-005', 'Blood Culture for Typhoid (Culture)', 'Microbiology', 'Whole Blood',
  'Venepuncture (early febrile illness, Week 1)', 'Blood culture bottles', '10 mL per bottle', 72,
  'No growth / Growth: Salmonella Typhi or Paratyphi isolated with sensitivity',
  'Most sensitive in first week of illness. Blood: bile broth ratio 1:10.', 60.00, true),

('MIS-006', 'Nasopharyngeal Swab – Influenza A/B Rapid Test', 'Microbiology', 'Nasopharyngeal Swab',
  'NP swab', 'Sterile dry swab or VTM', 'Swab', 1,
  'Negative / Positive Influenza A or B',
  'Highest sensitivity if collected ≤48 hr after symptom onset.', 40.00, true),

('MIS-007', 'Zinc (Serum)', 'Biochemistry', 'Serum',
  'Venepuncture (fasting)', 'Metal-free tube (Royal blue top) or plain', '5 mL', 24,
  'Adults: 10.7–17.5 µmol/L (70–114 µg/dL)',
  'Use zinc-free trace-element tube. Fasting morning sample recommended.', 60.00, true),

('MIS-008', 'Selenium (Serum)', 'Biochemistry', 'Serum',
  'Venepuncture', 'Metal-free tube (Royal blue top)', '5 mL', 24,
  '0.89–1.65 µmol/L (70–130 µg/L)',
  'Metal-free tube essential. Used in malnutrition and critical illness workup.', 80.00, true),

('MIS-009', 'Haemoglobin A2 (HbA2) Quantification', 'Haematology', 'Whole Blood',
  'Venepuncture', 'EDTA (Purple/Lavender)', '3 mL', 8,
  'Normal: 1.5–3.5%; Elevated (>3.5%) suggests Beta-thalassaemia trait',
  'HPLC method. Order with FBC and blood film when thalassaemia suspected.', 50.00, true),

('MIS-010', 'Complement C3 & C4', 'Biochemistry', 'Serum',
  'Venepuncture', 'Plain/SST (Gold)', '5 mL', 8,
  'C3: 0.75–1.65 g/L; C4: 0.14–0.54 g/L; Decreased in SLE, C4 deficiency',
  'Order with ANA/anti-dsDNA for lupus activity monitoring.', 80.00, true)

ON CONFLICT (test_code) DO NOTHING;


-- Seed standard dental procedures catalog
INSERT INTO dental_procedures (procedure_code, procedure_name, procedure_category, tooth_specific, description, standard_duration, price, is_active)
VALUES
  -- Preventive
  ('PREV-001', 'Oral Examination',           'Preventive',   false, 'Comprehensive oral examination and charting',                  30,  50.00,  true),
  ('PREV-002', 'Scaling & Polishing',        'Preventive',   false, 'Removal of plaque and tartar followed by polishing',          45,  80.00,  true),
  ('PREV-003', 'Fluoride Treatment',         'Preventive',   false, 'Topical fluoride application for caries prevention',          20,  40.00,  true),
  ('PREV-004', 'Pit & Fissure Sealant',      'Preventive',   true,  'Sealant applied to occlusal surfaces to prevent decay',       30,  60.00,  true),
  ('PREV-005', 'Dental X-Ray (Periapical)',  'Preventive',   true,  'Periapical radiograph',                                       10,  30.00,  true),
  ('PREV-006', 'Dental X-Ray (Panoramic)',   'Preventive',   false, 'Full mouth panoramic radiograph',                             15,  80.00,  true),

  -- Restorative
  ('REST-001', 'Amalgam Filling (1 surface)','Restorative',  true,  'Silver amalgam restoration – single surface',                 30,  70.00,  true),
  ('REST-002', 'Amalgam Filling (2 surface)','Restorative',  true,  'Silver amalgam restoration – two surfaces',                  45,  90.00,  true),
  ('REST-003', 'Composite Filling (Ant.)',   'Restorative',  true,  'Tooth-coloured composite resin – anterior tooth',             45,  100.00, true),
  ('REST-004', 'Composite Filling (Post.)',  'Restorative',  true,  'Tooth-coloured composite resin – posterior tooth',            45,  120.00, true),
  ('REST-005', 'Glass Ionomer Filling',      'Restorative',  true,  'Glass ionomer cement restoration',                            30,  80.00,  true),
  ('REST-006', 'Inlay/Onlay',               'Restorative',  true,  'Indirect cast restoration (inlay or onlay)',                  60,  300.00, true),

  -- Endodontic
  ('ENDO-001', 'Root Canal Treatment (Ant.)','Endodontic',   true,  'Root canal therapy – anterior tooth (1 canal)',               60,  250.00, true),
  ('ENDO-002', 'Root Canal Treatment (Pre.)','Endodontic',   true,  'Root canal therapy – premolar (1-2 canals)',                  75,  300.00, true),
  ('ENDO-003', 'Root Canal Treatment (Mol.)','Endodontic',   true,  'Root canal therapy – molar (3-4 canals)',                     90,  400.00, true),
  ('ENDO-004', 'Pulp Capping',              'Endodontic',   true,  'Direct or indirect pulp capping procedure',                   30,  100.00, true),
  ('ENDO-005', 'Pulpectomy',                'Endodontic',   true,  'Complete removal of pulp tissue',                             45,  150.00, true),
  ('ENDO-006', 'Apicoectomy',               'Endodontic',   true,  'Surgical removal of root apex and periapical tissue',         60,  350.00, true),

  -- Prosthodontic
  ('PROS-001', 'Porcelain Crown',            'Prosthodontic',true,  'Full porcelain crown fabrication and fitting',                90,  500.00, true),
  ('PROS-002', 'Metal-Ceramic Crown',        'Prosthodontic',true,  'Porcelain-fused-to-metal crown',                             90,  450.00, true),
  ('PROS-003', 'Temporary Crown',            'Prosthodontic',true,  'Provisional crown placement',                                30,  80.00,  true),
  ('PROS-004', 'Fixed Bridge (per unit)',    'Prosthodontic',true,  'Fixed partial denture – price per unit',                     90,  500.00, true),
  ('PROS-005', 'Complete Denture (Upper)',   'Prosthodontic',false, 'Full upper denture fabrication',                             120, 600.00, true),
  ('PROS-006', 'Complete Denture (Lower)',   'Prosthodontic',false, 'Full lower denture fabrication',                             120, 600.00, true),
  ('PROS-007', 'Partial Denture (Acrylic)',  'Prosthodontic',false, 'Acrylic removable partial denture',                          90,  400.00, true),
  ('PROS-008', 'Dental Implant',             'Prosthodontic',true,  'Titanium implant placement (surgical phase)',                 120, 1500.00,true),
  ('PROS-009', 'Implant Crown',              'Prosthodontic',true,  'Crown placement on dental implant',                          60,  700.00, true),

  -- Surgical / Oral Surgery
  ('SURG-001', 'Simple Extraction',          'Oral Surgery',  true,  'Non-surgical removal of erupted tooth',                      20,  60.00,  true),
  ('SURG-002', 'Surgical Extraction',        'Oral Surgery',  true,  'Surgical removal requiring flap or bone removal',            45,  150.00, true),
  ('SURG-003', 'Wisdom Tooth Removal',       'Oral Surgery',  true,  'Surgical removal of impacted third molar',                   60,  250.00, true),
  ('SURG-004', 'Alveoloplasty',              'Oral Surgery',  false, 'Surgical reshaping of alveolar ridge',                       45,  200.00, true),
  ('SURG-005', 'Frenectomy',                 'Oral Surgery',  false, 'Surgical removal of frenum tissue',                          30,  180.00, true),
  ('SURG-006', 'Biopsy (Soft Tissue)',       'Oral Surgery',  false, 'Excisional or incisional biopsy of oral lesion',             30,  200.00, true),

  -- Orthodontic
  ('ORTH-001', 'Orthodontic Consultation',   'Orthodontic',   false, 'Initial orthodontic assessment and treatment planning',       45,  80.00,  true),
  ('ORTH-002', 'Fixed Braces (Full arch)',   'Orthodontic',   false, 'Metal bracket bonding – per arch',                           90,  800.00, true),
  ('ORTH-003', 'Clear Aligner (per phase)',  'Orthodontic',   false, 'Removable clear aligner therapy – per phase',                60,  1200.00,true),
  ('ORTH-004', 'Retainer (Removable)',       'Orthodontic',   false, 'Removable retention appliance',                              30,  150.00, true),
  ('ORTH-005', 'Retainer (Fixed/Bonded)',    'Orthodontic',   false, 'Bonded lingual retainer wire',                               30,  200.00, true),
  ('ORTH-006', 'Space Maintainer',           'Orthodontic',   true,  'Fixed or removable space maintainer',                        30,  120.00, true),

  -- Periodontic
  ('PERIO-001','Periodontal Assessment',     'Periodontic',   false, 'Full periodontal charting and assessment',                   30,  60.00,  true),
  ('PERIO-002','Deep Scaling (per quadrant)','Periodontic',   false, 'Subgingival scaling and root planing – per quadrant',        45,  120.00, true),
  ('PERIO-003','Gingivectomy',               'Periodontic',   false, 'Surgical removal of excess gingival tissue',                 45,  200.00, true),
  ('PERIO-004','Flap Surgery (per quadrant)','Periodontic',   false, 'Open flap debridement – per quadrant',                       60,  350.00, true),
  ('PERIO-005','Bone Graft',                 'Periodontic',   true,  'Periodontal bone regeneration graft',                        90,  500.00, true),

  -- Aesthetic / Cosmetic
  ('AEST-001', 'Teeth Whitening (In-chair)', 'Aesthetic',     false, 'In-office bleaching procedure',                              60,  250.00, true),
  ('AEST-002', 'Teeth Whitening (Take-home)','Aesthetic',     false, 'Custom take-home bleaching kit',                             30,  150.00, true),
  ('AEST-003', 'Porcelain Veneer',           'Aesthetic',     true,  'Thin porcelain laminate bonded to tooth surface',             90,  600.00, true),
  ('AEST-004', 'Composite Veneer',           'Aesthetic',     true,  'Direct resin composite veneer',                              60,  250.00, true),

  -- Paediatric
  ('PAED-001', 'Stainless Steel Crown',      'Paediatric',    true,  'Preformed metal crown for primary tooth',                    30,  100.00, true),
  ('PAED-002', 'Pulpotomy (Primary)',        'Paediatric',    true,  'Partial pulp removal in primary molar',                      30,  80.00,  true),
  ('PAED-003', 'Space Maintainer (Child)',   'Paediatric',    true,  'Band and loop space maintainer for primary teeth',            30,  100.00, true)

ON CONFLICT (procedure_code) DO NOTHING;

-- ============================================================================
-- DENTAL DRUGS SEED
-- Common medications used in dental practice
-- ============================================================================

INSERT INTO drugs (drug_code, drug_name, generic_name, brand_name, drug_category, drug_class, dosage_form, strength, is_active)
VALUES
  -- Analgesics / Pain relief
  ('DRG-001', 'Ibuprofen 400mg Tablet',             'Ibuprofen',                          'Brufen',          'Analgesic',     'NSAID',                    'Tablet',           '400mg',        true),
  ('DRG-002', 'Ibuprofen 200mg Tablet',             'Ibuprofen',                          'Nurofen',         'Analgesic',     'NSAID',                    'Tablet',           '200mg',        true),
  ('DRG-003', 'Paracetamol 500mg Tablet',           'Paracetamol',                        'Panadol',         'Analgesic',     'Non-opioid analgesic',     'Tablet',           '500mg',        true),
  ('DRG-004', 'Paracetamol 1g Tablet',              'Paracetamol',                        'Panadol Extra',   'Analgesic',     'Non-opioid analgesic',     'Tablet',           '1g',           true),
  ('DRG-005', 'Diclofenac 50mg Tablet',             'Diclofenac Sodium',                  'Voltaren',        'Analgesic',     'NSAID',                    'Tablet',           '50mg',         true),
  ('DRG-006', 'Tramadol 50mg Capsule',              'Tramadol HCl',                       'Tramal',          'Analgesic',     'Opioid analgesic',         'Capsule',          '50mg',         true),
  ('DRG-007', 'Codeine Phosphate 30mg Tablet',      'Codeine Phosphate',                  'Codeine',         'Analgesic',     'Opioid analgesic',         'Tablet',           '30mg',         true),
  ('DRG-008', 'Aspirin 300mg Tablet',               'Aspirin',                            'Disprin',         'Analgesic',     'NSAID',                    'Tablet',           '300mg',        true),
  ('DRG-009', 'Naproxen 250mg Tablet',              'Naproxen',                           'Naprosyn',        'Analgesic',     'NSAID',                    'Tablet',           '250mg',        true),
  ('DRG-010', 'Mefenamic Acid 500mg Capsule',       'Mefenamic Acid',                     'Ponstan',         'Analgesic',     'NSAID',                    'Capsule',          '500mg',        true),
  -- Antibiotics
  ('DRG-020', 'Amoxicillin 500mg Capsule',          'Amoxicillin',                        'Amoxil',          'Antibiotic',    'Penicillin',               'Capsule',          '500mg',        true),
  ('DRG-021', 'Amoxicillin 250mg/5ml Suspension',   'Amoxicillin',                        'Amoxil Syrup',    'Antibiotic',    'Penicillin',               'Suspension',       '250mg/5ml',    true),
  ('DRG-022', 'Amoxicillin + Clavulanate 625mg',    'Amoxicillin + Clavulanic Acid',      'Augmentin',       'Antibiotic',    'Penicillin combination',   'Tablet',           '625mg',        true),
  ('DRG-023', 'Metronidazole 400mg Tablet',         'Metronidazole',                      'Flagyl',          'Antibiotic',    'Nitroimidazole',           'Tablet',           '400mg',        true),
  ('DRG-024', 'Metronidazole 200mg Tablet',         'Metronidazole',                      'Flagyl',          'Antibiotic',    'Nitroimidazole',           'Tablet',           '200mg',        true),
  ('DRG-025', 'Erythromycin 500mg Tablet',          'Erythromycin',                       'Erythrocin',      'Antibiotic',    'Macrolide',                'Tablet',           '500mg',        true),
  ('DRG-026', 'Clindamycin 150mg Capsule',          'Clindamycin HCl',                    'Dalacin C',       'Antibiotic',    'Lincosamide',              'Capsule',          '150mg',        true),
  ('DRG-027', 'Clindamycin 300mg Capsule',          'Clindamycin HCl',                    'Dalacin C',       'Antibiotic',    'Lincosamide',              'Capsule',          '300mg',        true),
  ('DRG-028', 'Tetracycline 250mg Capsule',         'Tetracycline HCl',                   'Tetracycline',    'Antibiotic',    'Tetracycline',             'Capsule',          '250mg',        true),
  ('DRG-029', 'Doxycycline 100mg Capsule',          'Doxycycline Hyclate',                'Doxycap',         'Antibiotic',    'Tetracycline',             'Capsule',          '100mg',        true),
  ('DRG-030', 'Ciprofloxacin 500mg Tablet',         'Ciprofloxacin HCl',                  'Ciprolet',        'Antibiotic',    'Fluoroquinolone',          'Tablet',           '500mg',        true),
  -- Corticosteroids / Anti-inflammatory
  ('DRG-040', 'Dexamethasone 4mg Tablet',           'Dexamethasone',                      'Dexadreson',      'Corticosteroid','Glucocorticoid',           'Tablet',           '4mg',          true),
  ('DRG-041', 'Prednisolone 5mg Tablet',            'Prednisolone',                       'Prednisolone',    'Corticosteroid','Glucocorticoid',           'Tablet',           '5mg',          true),
  ('DRG-042', 'Hydrocortisone 1% Cream',            'Hydrocortisone',                     'HC Cream',        'Corticosteroid','Glucocorticoid',           'Cream',            '1%',           true),
  -- Antifungals
  ('DRG-050', 'Nystatin 100,000 IU/g Ointment',    'Nystatin',                           'Mycostatin',      'Antifungal',    'Polyene',                  'Oral Gel',         '100,000 IU/g', true),
  ('DRG-051', 'Fluconazole 150mg Capsule',          'Fluconazole',                        'Diflucan',        'Antifungal',    'Azole',                    'Capsule',          '150mg',        true),
  ('DRG-052', 'Miconazole 2% Oral Gel',             'Miconazole Nitrate',                 'Daktarin',        'Antifungal',    'Azole',                    'Oral Gel',         '2%',           true),
  -- Antiseptics / Mouthwash
  ('DRG-060', 'Chlorhexidine 0.2% Mouthwash',      'Chlorhexidine Gluconate',            'Corsodyl',        'Antiseptic',    'Bisbiguanide',             'Mouthwash',        '0.2%',         true),
  ('DRG-061', 'Hydrogen Peroxide 3% Solution',      'Hydrogen Peroxide',                  'H2O2',            'Antiseptic',    'Oxidising agent',          'Solution',         '3%',           true),
  -- Anxiolytics / Sedatives
  ('DRG-070', 'Diazepam 5mg Tablet',               'Diazepam',                           'Valium',          'Anxiolytic',    'Benzodiazepine',           'Tablet',           '5mg',          true),
  ('DRG-071', 'Midazolam 5mg/ml Injection',         'Midazolam',                          'Dormicum',        'Sedative',      'Benzodiazepine',           'Injection',        '5mg/ml',       true),
  -- Local Anaesthetics (topical)
  ('DRG-080', 'Benzocaine 20% Gel',                'Benzocaine',                         'Orajel',          'Local Anaesthetic','Ester',                 'Topical Gel',      '20%',          true),
  ('DRG-081', 'Lidocaine 5% Ointment',             'Lidocaine',                          'Xylocaine',       'Local Anaesthetic','Amide',                 'Topical Ointment', '5%',           true),
  -- Vitamins / Supplements
  ('DRG-090', 'Vitamin C 500mg Tablet',            'Ascorbic Acid',                      'Vitamin C',       'Supplement',    'Vitamin',                  'Tablet',           '500mg',        true),
  ('DRG-091', 'Calcium + Vitamin D3 Tablet',       'Calcium Carbonate + Cholecalciferol','Caltrate',        'Supplement',    'Mineral/Vitamin',          'Tablet',           '600mg/400IU',  true),
  -- GI protective
  ('DRG-100', 'Omeprazole 20mg Capsule',           'Omeprazole',                         'Losec',           'Antacid/PPI',   'Proton Pump Inhibitor',    'Capsule',          '20mg',         true),
  ('DRG-101', 'Pantoprazole 40mg Tablet',          'Pantoprazole',                       'Pantoloc',        'Antacid/PPI',   'Proton Pump Inhibitor',    'Tablet',           '40mg',         true)
ON CONFLICT (drug_code) DO NOTHING;

-- ============================================================
-- DEFAULT SYSTEM SETTINGS (idempotent seed)
-- ============================================================
INSERT INTO system_settings (setting_key, setting_value, category, description)
SELECT v.setting_key, v.setting_value, v.category, v.description
FROM (VALUES
    -- General
    ('facility_name',                'My Hospital',    'General',       'Display name of the facility'),
    ('facility_type',                'Hospital',       'General',       'Type of healthcare facility'),
    ('facility_address',             '',               'General',       'Physical address of the facility'),
    ('facility_phone',               '',               'General',       'Main contact phone number'),
    ('facility_email',               '',               'General',       'Main contact email address'),
    ('currency',                     'GHS',            'General',       'Default currency code'),
    ('timezone',                     'Africa/Accra',   'General',       'System timezone'),
    ('date_format',                  'DD/MM/YYYY',     'General',       'Display format for dates'),
    -- Notifications
    ('email_notifications',          'true',           'Notifications', 'Send email notifications to patients and staff'),
    ('sms_notifications',            'false',          'Notifications', 'Send SMS notifications (requires SMS gateway)'),
    ('appointment_reminder_hours',   '24',             'Notifications', 'Hours before appointment to send reminder email'),
    ('lab_result_notification',      'true',           'Notifications', 'Notify patients when lab results are ready'),
    -- Security
    ('session_timeout_minutes',      '60',             'Security',      'Idle session timeout in minutes'),
    ('max_login_attempts',           '5',              'Security',      'Maximum failed login attempts before account lockout'),
    ('password_expiry_days',         '90',             'Security',      'Days before passwords must be changed (0 = never)'),
    ('two_factor_required',          'false',          'Security',      'Require two-factor authentication for all users'),
    -- Appointments
    ('default_appointment_duration', '30',             'Appointments',  'Default appointment slot duration in minutes'),
    ('max_appointments_per_day',     '50',             'Appointments',  'Maximum appointments per doctor per day'),
    ('booking_advance_days',         '30',             'Appointments',  'How many days in advance patients can book'),
    ('allow_walk_in_patients',       'true',           'Appointments',  'Allow unscheduled walk-in patients')
) AS v(setting_key, setting_value, category, description)
WHERE NOT EXISTS (
    SELECT 1 FROM system_settings s
    WHERE s.setting_key = v.setting_key AND s.facility_id IS NULL
);
