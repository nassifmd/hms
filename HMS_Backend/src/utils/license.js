'use strict';

/**
 * Backend license verification utility.
 *
 * Reads the signing secret from process.env.LICENSE_SECRET.
 * Same algorithm as the license_generator CLI — they must share the same secret.
 */

const crypto = require('crypto');

const VALID_MODULES = ['CLINICAL', 'DENTAL', 'EYE', 'LAB', 'INSURANCE'];

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function parseB64url(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

function hmacHex(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify and decode a HMS license key.
 *
 * @param {string} licenseKey
 * @returns {{ lid: string, fid: string, mod: string, iss: number, exp: number }}
 * @throws if invalid, tampered, or expired
 */
function verifyLicenseKey(licenseKey) {
  const secret = process.env.LICENSE_SECRET;
  if (!secret) {
    throw new Error('LICENSE_SECRET is not configured on the server');
  }

  if (!licenseKey || typeof licenseKey !== 'string') {
    throw new Error('License key must be a non-empty string');
  }

  // Format: HMS-{MODULE}-{base64url_payload}.{sig32}
  const parts = licenseKey.split('-');
  if (parts.length < 3 || parts[0] !== 'HMS') {
    throw new Error('Invalid key format');
  }

  const mod = parts[1].toUpperCase();
  if (!VALID_MODULES.includes(mod)) {
    throw new Error(`Unknown module "${mod}" in license key`);
  }

  const body = parts.slice(2).join('-');
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx === -1) {
    throw new Error('Invalid key format: missing signature');
  }

  const encoded = body.slice(0, dotIdx);
  const providedSig = body.slice(dotIdx + 1);

  const expectedSig = hmacHex(encoded, secret).slice(0, 32);
  if (
    providedSig.length !== 32 ||
    !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
  ) {
    throw new Error('License key signature is invalid');
  }

  let payload;
  try {
    payload = parseB64url(encoded);
  } catch {
    throw new Error('License key payload is malformed');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('License key payload is corrupted');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    const expDate = payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown';
    throw new Error(`License key expired on ${expDate}`);
  }

  if (payload.mod !== mod) {
    throw new Error('Module mismatch in license key');
  }

  return payload;
}

module.exports = { verifyLicenseKey, VALID_MODULES };
