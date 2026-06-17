import crypto from 'node:crypto';
import { sanitizeDebugPayload } from './contract.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function hostedByokEnabled() {
  return process.env.HARNESSAMP_ENABLE_HOSTED_BYOK === '1';
}

export function assertHostedByokEnabled() {
  if (!hostedByokEnabled()) {
    throw new Error('Hosted provider BYOK is disabled. Set HARNESSAMP_ENABLE_HOSTED_BYOK=1 and configure encrypted project secrets.');
  }
}

export function encryptSecretValue(plaintext) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: ALGORITHM,
    keyVersion: process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY_VERSION || 'local-v1',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: tag.toString('base64'),
  };
}

export function decryptSecretValue(envelope) {
  const source = envelope && typeof envelope === 'object' ? envelope : {};
  if (source.algorithm !== ALGORITHM) throw new Error('Unsupported project secret encryption algorithm.');
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(source.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(source.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(source.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSecretValue(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}...${text.slice(-2)}`;
  const prefix = text.startsWith('sk-ant-') ? 'sk-ant-' : text.startsWith('sk-') ? 'sk-' : `${text.slice(0, 3)}-`;
  return `${prefix}...${text.slice(-4)}`;
}

export function redactSecretText(value) {
  return String(sanitizeDebugPayload(String(value ?? '')));
}

function encryptionKey() {
  const configured = process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('Project secret encryption is not configured. Set HARNESSAMP_SECRET_ENCRYPTION_KEY.');
  }
  const decoded = tryDecodeKey(configured);
  return decoded.length === 32 ? decoded : crypto.createHash('sha256').update(configured).digest();
}

function tryDecodeKey(value) {
  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to utf8/hash behavior.
  }
  return Buffer.from(value, 'utf8');
}
