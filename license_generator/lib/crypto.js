'use strict';
const crypto = require('crypto');

const VALID_MODULES = ['CLINICAL', 'DENTAL', 'EYE', 'LAB', 'INSURANCE'];

/**
 * Base64url-encode a plain JS object.
 */
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/**
 * Decode a base64url string back to a plain JS object.
 */
function parseB64url(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

/**
 * HMAC-SHA256 of `data` with `secret`, returned as hex.
 */
function hmacHex(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generate a license key.
 *
 * @param {object} opts
 * @param {string}  opts.module      - One of VALID_MODULES
 * @param {string}  [opts.facilityId] - UUID of the target facility, or '*' for wildcard
 * @param {number}  opts.months      - License duration in months
 * @param {string}  opts.secret      - Signing secret (must match backend LICENSE_SECRET)
 * @param {string}  [opts.licenseId] - Optional short ID; auto-generated if omitted
 * @returns {{ key: string, payload: object, expiresAt: string }}
 */
function generate({ module: mod, facilityId, months, secret, licenseId }) {
  mod = (mod || '').toUpperCase();
  if (!VALID_MODULES.includes(mod)) {
    throw new Error(`Invalid module "${mod}". Must be one of: ${VALID_MODULES.join(', ')}`);
  }
  if (!secret || secret.trim().length < 8) {
    throw new Error('License secret must be at least 8 characters');
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new Error('Duration must be a positive integer (months)');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + months * 30 * 24 * 3600; // approximate months

  const payload = {
    lid: licenseId || crypto.randomBytes(4).toString('hex'), // 8-char hex ID
    fid: facilityId && facilityId.trim() ? facilityId.trim() : '*',
    mod,
    iss: now,
    exp,
  };

  const encoded  = b64url(payload);
  // Use first 32 hex chars (128 bits) of HMAC — plenty of security
  const sig = hmacHex(encoded, secret).slice(0, 32);

  return {
    key: `HMS-${mod}-${encoded}.${sig}`,
    payload,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Verify and decode a license key.
 *
 * @param {string} licenseKey - The full key string
 * @param {string} secret     - Signing secret
 * @returns {object} Decoded payload
 * @throws {Error} if invalid, tampered, or expired
 */
function verify(licenseKey, secret) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    throw new Error('License key must be a non-empty string');
  }
  if (!secret) {
    throw new Error('Secret is required for verification');
  }

  // Format: HMS-{MODULE}-{base64url_payload}.{sig32}
  const parts = licenseKey.split('-');
  if (parts.length < 3 || parts[0] !== 'HMS') {
    throw new Error('Invalid key format: must start with HMS-{MODULE}-');
  }

  const mod = parts[1].toUpperCase();
  if (!VALID_MODULES.includes(mod)) {
    throw new Error(`Unknown module code "${mod}" in license key`);
  }

  // Everything after "HMS-{MODULE}-" is "{encoded}.{sig}"
  const body = parts.slice(2).join('-');
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx === -1) {
    throw new Error('Invalid key format: missing signature separator');
  }

  const encoded = body.slice(0, dotIdx);
  const providedSig = body.slice(dotIdx + 1);

  // Constant-time comparison to prevent timing attacks
  const expectedSig = hmacHex(encoded, secret).slice(0, 32);
  if (
    providedSig.length !== 32 ||
    !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
  ) {
    throw new Error('Invalid license key: signature does not match');
  }

  let payload;
  try {
    payload = parseB64url(encoded);
  } catch {
    throw new Error('Invalid license key: malformed payload');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid license key: payload is not an object');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    const expDate = payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown';
    throw new Error(`License key expired on ${expDate}`);
  }

  if (payload.mod !== mod) {
    throw new Error(`Module mismatch: key claims "${payload.mod}" but header says "${mod}"`);
  }

  return payload;
}

module.exports = { generate, verify, VALID_MODULES };
