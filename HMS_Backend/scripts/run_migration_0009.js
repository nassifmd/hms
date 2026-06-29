#!/usr/bin/env node
/**
 * Run migration 0009: Add inventory_batch_id to dispensing_items.
 * Allows the pharmacy dispense flow to deduct stock from the general
 * inventory_batches table in addition to drug_inventory.
 *
 * Usage:
 *   node scripts/run_migration_0009.js
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

if (adminPass === '' || adminPass === undefined) {
  clientConfig.password = 'trust_auth_dummy';
} else {
  clientConfig.password = adminPass;
}

const client = new Client(clientConfig);

async function run() {
  await client.connect();
  console.log(`Connected as: ${adminUser}`);

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '0009_dispensing_items_inventory_batch.sql'),
    'utf8'
  );

  await client.query(sql);
  console.log('✓ inventory_batch_id column added to dispensing_items');
  console.log('✓ index idx_dispensing_items_batch_id created');

  console.log('\nMigration 0009 completed successfully.');
  await client.end();
}

run().catch(err => {
  console.error('\nMigration failed:', err.message);
  if (err.code === '42501') {
    console.error('\nInsufficient privileges. Re-run with DB_ADMIN_USER/DB_ADMIN_PASSWORD env vars pointing to the postgres superuser.');
  }
  process.exit(1);
});
