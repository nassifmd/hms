/**
 * Encryption utility functions
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const DIGEST = 'sha256';

/**
 * Derive key from password
 */
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
};

/**
 * Encrypt text
 */
const encrypt = (text, password) => {
  try {
    // Generate salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt text
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    // Get auth tag
    const tag = cipher.getAuthTag();
    
    // Combine all parts
    const result = Buffer.concat([salt, iv, tag, encrypted]);
    
    return result.toString('base64');
  } catch (error) {
    throw new Error('Encryption failed: ' + error.message);
  }
};

/**
 * Decrypt text
 */
const decrypt = (encryptedData, password) => {
  try {
    // Decode from base64
    const data = Buffer.from(encryptedData, 'base64');
    
    // Extract parts
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Decryption failed: ' + error.message);
  }
};

/**
 * Hash password (for storage)
 */
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

/**
 * Verify password
 */
const verifyPassword = (password, storedHash) => {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

/**
 * Create hash
 */
const createHash = (data, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(data).digest('hex');
};

/**
 * Create HMAC
 */
const createHmac = (data, secret, algorithm = 'sha256') => {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
};

/**
 * Generate key pair
 */
const generateKeyPair = () => {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
};

/**
 * Sign data with private key
 */
const signData = (data, privateKey, algorithm = 'sha256') => {
  const sign = crypto.createSign(algorithm);
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'base64');
};

/**
 * Verify signature with public key
 */
const verifySignature = (data, signature, publicKey, algorithm = 'sha256') => {
  const verify = crypto.createVerify(algorithm);
  verify.update(data);
  verify.end();
  return verify.verify(publicKey, signature, 'base64');
};

/**
 * Encrypt with public key
 */
const encryptWithPublicKey = (text, publicKey) => {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.publicEncrypt(publicKey, buffer);
  return encrypted.toString('base64');
};

/**
 * Decrypt with private key
 */
const decryptWithPrivateKey = (encryptedData, privateKey) => {
  const buffer = Buffer.from(encryptedData, 'base64');
  const decrypted = crypto.privateDecrypt(privateKey, buffer);
  return decrypted.toString('utf8');
};

/**
 * Generate random bytes
 */
const randomBytes = (size) => {
  return crypto.randomBytes(size).toString('hex');
};

/**
 * Generate secure token
 */
const generateSecureToken = (size = 32) => {
  return crypto.randomBytes(size).toString('hex');
};

/**
 * Constant time comparison (to prevent timing attacks)
 */
const constantTimeCompare = (a, b) => {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Mask sensitive data
 */
const maskSensitiveData = (data, visibleChars = 4) => {
  if (!data || typeof data !== 'string') return data;
  if (data.length <= visibleChars) return '*'.repeat(data.length);
  
  const visible = data.slice(-visibleChars);
  const masked = '*'.repeat(data.length - visibleChars);
  return masked + visible;
};

/**
 * Encrypt object
 */
const encryptObject = (obj, password) => {
  const json = JSON.stringify(obj);
  return encrypt(json, password);
};

/**
 * Decrypt object
 */
const decryptObject = (encryptedData, password) => {
  const json = decrypt(encryptedData, password);
  return JSON.parse(json);
};

/**
 * Create checksum
 */
const createChecksum = (data) => {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
};

/**
 * Verify checksum
 */
const verifyChecksum = (data, checksum) => {
  const calculated = createChecksum(data);
  return calculated === checksum;
};

/**
 * Generate UUID v4
 */
const generateUUID = () => {
  return crypto.randomUUID();
};

/**
 * Encrypt file
 */
const encryptFile = (buffer, password) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, tag, encrypted]);
};

/**
 * Decrypt file
 */
const decryptFile = (encryptedBuffer, password) => {
  const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
  const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  createHash,
  createHmac,
  generateKeyPair,
  signData,
  verifySignature,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  randomBytes,
  generateSecureToken,
  constantTimeCompare,
  maskSensitiveData,
  encryptObject,
  decryptObject,
  createChecksum,
  verifyChecksum,
  generateUUID,
  encryptFile,
  decryptFile
};