const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const licensePath = path.resolve(__dirname, '../license_generator/license/license_output.lic');
const ENV_KEY = process.env.LICENSE_ENCRYPTION_KEY || 'your-256-bit-license-encryption-key';

function decryptLicenseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const key = crypto.createHash('sha256').update(ENV_KEY).digest();
  const parts = content.split(':');
  if (parts.length !== 2) throw new Error('Invalid format');
  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = Buffer.from(parts[1], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function verifySignature(obj) {
  const { signature, ...payload } = obj;
  const hmac = crypto.createHmac('sha256', ENV_KEY).update(JSON.stringify(payload)).digest('base64');
  return signature === hmac;
}

try {
  const dec = decryptLicenseFile(licensePath);
  console.log('Decrypted JSON:\n', dec);
  const parsed = JSON.parse(dec);
  console.log('Signature valid?', verifySignature(parsed));
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
