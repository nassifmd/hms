#!/usr/bin/env node
/**
 * Run migration 0007: Add branch support columns.
 * Uses the app's own DB config so no extra credentials are needed.
 * Must be run as the DB owner (postgres) or a user with ALTER TABLE rights.
 *
 * Usage:
 *   node scripts/run_migration_0007.js
 */

'use strict';

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const adminUser = process.env.DB_ADMIN_USER || process.env.DB_USER;
const adminPass = process.env.DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD;

const clientConfig = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'ghana_hms',
  user:     adminUser,
  ssl: false
};

// With trust auth, postgres still initiates SCRAM; provide a dummy string so
// the pg client doesn't error before the server can accept the connection.
if (adminPass === '' || adminPass === undefined) {
  clientConfig.password = 'trust_auth_dummy';
} else {
  clientConfig.password = adminPass;
}

const client = new Client(clientConfig);

async function run() {
  await client.connect();
  console.log(`Connected as: ${process.env.DB_ADMIN_USER || process.env.DB_USER}`);

  // ── Step 1: branch_status_type ──────────────────────────────────────────────
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE branch_status_type AS ENUM (
        'Active', 'Inactive', 'Under Construction', 'Suspended'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;
  `);
  console.log('✓ branch_status_type enum');

  // ── Step 2: facility_branches table ─────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS facility_branches (
        id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        facility_id               UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
        parent_branch_id          UUID REFERENCES facility_branches(id) ON DELETE SET NULL,
        branch_code               VARCHAR(50)  NOT NULL,
        branch_name               VARCHAR(255) NOT NULL,
        branch_type               VARCHAR(100) NOT NULL,
        registration_number       VARCHAR(100),
        ghis_code                 VARCHAR(100),
        nhis_accreditation_number VARCHAR(100),
        address                   TEXT,
        city                      VARCHAR(100),
        region                    VARCHAR(100),
        country                   VARCHAR(100) DEFAULT 'Ghana',
        postal_code               VARCHAR(20),
        phone_primary             VARCHAR(20),
        phone_secondary           VARCHAR(20),
        email                     VARCHAR(255),
        branch_head_id            UUID,
        operational_hours         JSONB,
        services_offered          TEXT[],
        bed_capacity              INTEGER DEFAULT 0,
        is_active                 BOOLEAN DEFAULT true,
        status                    branch_status_type DEFAULT 'Active',
        notes                     TEXT,
        created_by                UUID,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(facility_id, branch_code)
    );
  `);
  console.log('✓ facility_branches table');

  // ── Step 3: indexes ──────────────────────────────────────────────────────────
  await client.query(`CREATE INDEX IF NOT EXISTS idx_facility_branches_facility_id ON facility_branches(facility_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_facility_branches_status ON facility_branches(status);`);
  console.log('✓ indexes');

  // ── Step 4: trigger ──────────────────────────────────────────────────────────
  await client.query(`
    DO $$ BEGIN
      CREATE TRIGGER update_facility_branches_updated_at
        BEFORE UPDATE ON facility_branches
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;
  `);
  console.log('✓ trigger');

  // ── Step 5: ADD COLUMN IF NOT EXISTS on all core tables ─────────────────────
  const alterStmts = [
    `ALTER TABLE users        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL`,
    `ALTER TABLE departments  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL`,
    `ALTER TABLE patients     ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL`,
    `ALTER TABLE visits       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES facility_branches(id) ON DELETE SET NULL`,
  ];
  for (const sql of alterStmts) {
    const tbl = sql.match(/TABLE (\w+)/)[1];
    await client.query(sql);
    console.log(`✓ branch_id added to ${tbl}`);
  }

  // ── Step 6: SUPER_ADMIN role ─────────────────────────────────────────────────
  await client.query(`
    INSERT INTO roles (role_code, role_name, description, role_category, is_system_role)
    SELECT 'SUPER_ADMIN','Super Administrator','Facility-level super admin; manages all branches and staff','Administrative',true
    WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'SUPER_ADMIN');
  `);
  console.log('✓ SUPER_ADMIN role');

  // ── Step 7: branch permissions ───────────────────────────────────────────────
  await client.query(`
    INSERT INTO permissions (permission_code, permission_name, module, description)
    SELECT v.permission_code, v.permission_name, v.module, v.description
    FROM (VALUES
      ('MANAGE_BRANCHES',    'Manage Branches',        'Administrative','Create, update, deactivate or remove facility branches'),
      ('VIEW_ALL_BRANCHES',  'View All Branches',      'Administrative','View data across all branches in the facility'),
      ('ASSIGN_BRANCH_USERS','Assign Users to Branches','Administrative','Assign or transfer staff to branches')
    ) AS v(permission_code, permission_name, module, description)
    WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);
  `);
  console.log('✓ branch permissions');

  // ── Step 8: grant permissions to roles ───────────────────────────────────────
  await client.query(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM   roles r CROSS JOIN permissions p
    WHERE  r.role_code IN ('SUPER_ADMIN','SYS_ADMIN')
      AND  p.permission_code IN ('MANAGE_BRANCHES','VIEW_ALL_BRANCHES','ASSIGN_BRANCH_USERS')
      AND  NOT EXISTS (
             SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
           );
  `);
  console.log('✓ role_permissions granted');

  console.log('\nMigration 0007 completed successfully.');
  await client.end();
}

run().catch(err => {
  console.error('\nMigration failed:', err.message);
  if (err.code === '42501') {
    console.error('\nInsufficient privileges. Re-run with DB_ADMIN_USER/DB_ADMIN_PASSWORD env vars pointing to the postgres superuser.');
    console.error('Example:');
    console.error('  DB_ADMIN_USER=postgres DB_ADMIN_PASSWORD=<password> node scripts/run_migration_0007.js');
  }
  client.end().catch(() => {});
  process.exit(1);
});
