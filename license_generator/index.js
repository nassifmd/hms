#!/usr/bin/env node
'use strict';

/**
 * HMS License Generator CLI
 *
 * Usage:
 *   node index.js generate
 *   node index.js verify <key>
 *
 * Requires environment variable:
 *   LICENSE_SECRET  — shared signing secret (must match the backend)
 *
 * Example:
 *   LICENSE_SECRET=supersecret node index.js generate
 */

const readline = require('readline');
const { generate, verify, VALID_MODULES } = require('./lib/crypto');

const secret = process.env.LICENSE_SECRET;
const [, , command, ...args] = process.argv;

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printKey(result) {
  console.log('\n' + '='.repeat(72));
  console.log('  LICENSE KEY');
  console.log('='.repeat(72));
  console.log('  ' + result.key);
  console.log('='.repeat(72));
  console.log('  Module     :', result.payload.mod);
  console.log('  License ID :', result.payload.lid);
  console.log('  Facility   :', result.payload.fid === '*' ? '* (any facility)' : result.payload.fid);
  console.log('  Issued     :', new Date(result.payload.iss * 1000).toISOString());
  console.log('  Expires    :', result.expiresAt);
  console.log('='.repeat(72) + '\n');
}

async function runGenerate() {
  if (!secret) {
    console.error('\n[ERROR] LICENSE_SECRET environment variable is not set.');
    console.error('  Export it before running:  export LICENSE_SECRET=<your-secret>\n');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nHMS License Generator');
  console.log('─'.repeat(40));
  console.log('Available modules:', VALID_MODULES.join(', '));

  const mod = (await ask(rl, '\nModule code (e.g. DENTAL): ')).trim().toUpperCase();
  const facilityInput = (await ask(rl, 'Facility UUID  (leave blank for wildcard *): ')).trim();
  const monthsInput = (await ask(rl, 'Duration in months (e.g. 12): ')).trim();
  const licenseIdInput = (await ask(rl, 'Custom license ID (leave blank to auto-generate): ')).trim();

  rl.close();

  const months = parseInt(monthsInput, 10);
  if (isNaN(months) || months < 1) {
    console.error('[ERROR] Duration must be a positive integer.\n');
    process.exit(1);
  }

  try {
    const result = generate({
      module: mod,
      facilityId: facilityInput || '*',
      months,
      secret,
      licenseId: licenseIdInput || undefined,
    });
    printKey(result);
  } catch (err) {
    console.error('\n[ERROR]', err.message, '\n');
    process.exit(1);
  }
}

async function runVerify() {
  if (!secret) {
    console.error('\n[ERROR] LICENSE_SECRET environment variable is not set.\n');
    process.exit(1);
  }

  let key = args[0];

  if (!key) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    key = (await ask(rl, '\nPaste license key: ')).trim();
    rl.close();
  }

  try {
    const payload = verify(key, secret);
    console.log('\n' + '='.repeat(72));
    console.log('  VALID LICENSE KEY');
    console.log('='.repeat(72));
    console.log('  Module     :', payload.mod);
    console.log('  License ID :', payload.lid);
    console.log('  Facility   :', payload.fid === '*' ? '* (any facility)' : payload.fid);
    console.log('  Issued     :', new Date(payload.iss * 1000).toISOString());
    console.log('  Expires    :', new Date(payload.exp * 1000).toISOString());
    const daysLeft = Math.ceil((payload.exp - Math.floor(Date.now() / 1000)) / 86400);
    console.log('  Days left  :', daysLeft);
    console.log('='.repeat(72) + '\n');
  } catch (err) {
    console.error('\n[INVALID]', err.message, '\n');
    process.exit(1);
  }
}

function printUsage() {
  console.log('\nUsage:');
  console.log('  node index.js generate          — interactive key generation wizard');
  console.log('  node index.js verify [<key>]    — verify a license key\n');
  console.log('Environment:');
  console.log('  LICENSE_SECRET   (required) shared signing secret\n');
}

switch (command) {
  case 'generate':
    runGenerate().catch((err) => { console.error(err); process.exit(1); });
    break;
  case 'verify':
    runVerify().catch((err) => { console.error(err); process.exit(1); });
    break;
  default:
    printUsage();
    process.exit(command ? 1 : 0);
}
