/**
 * Reset passwords for specified users and optionally fix their role assignments.
 * Usage: node scripts/reset-user-passwords.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ─── Users to reset ──────────────────────────────────────────────────────────
// Add/remove entries as needed. role_code can be null to skip role assignment.
const USERS_TO_RESET = [
  { email: 'nasnickmd@gmail.com',          newPassword: 'Admin@HMS2026!', role_code: 'DOCTOR'   },
  { email: 'akuafoplusmobile@gmail.com',   newPassword: 'Admin@HMS2026!', role_code: 'DENTIST'  },
  { email: 'doctor@hospital.local',        newPassword: 'Admin@HMS2026!', role_code: 'DOCTOR'   },
  { email: 'dentist@hospital.local',       newPassword: 'Admin@HMS2026!', role_code: 'DENTIST'  },
  { email: 'nurse@hospital.local',         newPassword: 'Admin@HMS2026!', role_code: 'NURSE'    },
  { email: 'pharmacist@hospital.local',    newPassword: 'Admin@HMS2026!', role_code: 'PHARMACIST'},
  { email: 'labtech@hospital.local',       newPassword: 'Admin@HMS2026!', role_code: 'LAB_TECH' },
];

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

async function run() {
  const client = await pool.connect();
  try {
    // Get the facility ID
    const { rows: facilities } = await client.query(
      'SELECT id FROM facilities LIMIT 1'
    );
    const facilityId = facilities[0]?.id;
    if (!facilityId) throw new Error('No facility found in the database');

    // Get the sysadmin user id (for assigned_by)
    const { rows: admins } = await client.query(
      "SELECT id FROM users WHERE email = 'sysadmin@hospital.local' LIMIT 1"
    );
    const assignedBy = admins[0]?.id ?? null;

    for (const entry of USERS_TO_RESET) {
      // Check if user exists
      const { rows: existing } = await client.query(
        'SELECT id, email FROM users WHERE email = $1',
        [entry.email]
      );

      let userId;

      if (existing.length === 0) {
        // Create new user with a generated employee_id
        const { rows: empRows } = await client.query(
          "SELECT 'EMP-' || LPAD((COUNT(*) + 1)::text, 4, '0') AS emp_id FROM users"
        );
        const employeeId = empRows[0].emp_id;
        const nameParts = entry.email.split('@')[0].split('.');
        const firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Demo';
        const lastName  = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'User';

        const hash = await bcrypt.hash(entry.newPassword, BCRYPT_ROUNDS);
        const { rows: inserted } = await client.query(
          `INSERT INTO users
             (employee_id, facility_id, first_name, last_name, email,
              password_hash, user_status, joining_date, employment_status, two_factor_enabled)
           VALUES ($1,$2,$3,$4,$5,$6,'Active',CURRENT_DATE,'Permanent',false)
           RETURNING id`,
          [employeeId, facilityId, firstName, lastName, entry.email, hash]
        );
        userId = inserted[0].id;
        console.log(`  ✓ Created  ${entry.email}`);
      } else {
        userId = existing[0].id;
        const hash = await bcrypt.hash(entry.newPassword, BCRYPT_ROUNDS);
        await client.query(
          `UPDATE users
           SET password_hash  = $1,
               account_locked = false,
               login_attempts = 0,
               user_status    = 'Active'
           WHERE id = $2`,
          [hash, userId]
        );
        console.log(`  ✓ Reset    ${entry.email}`);
      }

      // Fix role if specified
      if (entry.role_code) {
        const { rows: roles } = await client.query(
          'SELECT id FROM roles WHERE role_code = $1 LIMIT 1',
          [entry.role_code]
        );
        if (roles.length === 0) {
          console.log(`    ⚠ Role ${entry.role_code} not found – skipped`);
          continue;
        }
        const roleId = roles[0].id;

        // Deactivate all current roles for this user
        await client.query(
          'UPDATE user_roles SET is_active = false WHERE user_id = $1',
          [userId]
        );

        // Upsert the correct role
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, facility_id, assigned_by, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (user_id, role_id, facility_id, department_id)
           DO UPDATE SET is_active = true, assigned_date = NOW()`,
          [userId, roleId, facilityId, assignedBy]
        );
        console.log(`    → Role set to ${entry.role_code}`);
      }
    }

    console.log('\n✅ Done. All users can now log in with: Admin@HMS2026!\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
