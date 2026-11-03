import {
  createCipheriv,
  createDecipheriv,
  createHash,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  constants,
} from 'node:crypto';
import { getPrivateKey } from './serverKey.js';

/**
 * Hybrid encryption (same idea as TLS / PGP / Signal):
 *   - fresh AES-256-GCM key per packet encrypts the JSON payload
 *   - that AES key is encrypted with the server's RSA public key (OAEP-SHA256)
 *
 * Wire format (base64):
 *   [256 bytes RSA-encrypted AES key][12 bytes GCM IV][ciphertext][16 bytes GCM tag]
 */
const RSA_ENCRYPTED_KEY_BYTES = 256;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export function encrypt(instruction, serverPublicKey) {
  const plaintext = Buffer.from(JSON.stringify(instruction), 'utf8');

  const aesKey = randomBytes(32);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const aesCiphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encryptedAesKey = publicEncrypt(
    { key: serverPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );

  return Buffer.concat([encryptedAesKey, iv, aesCiphertext, tag]).toString('base64');
}

/** Throws on ANY tampering / wrong key / truncation. */
export function decrypt(base64Ciphertext) {
  const all = Buffer.from(base64Ciphertext, 'base64');
  if (all.length < RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('Ciphertext too short');
  }

  const encryptedAesKey = all.subarray(0, RSA_ENCRYPTED_KEY_BYTES);
  const iv = all.subarray(RSA_ENCRYPTED_KEY_BYTES, RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);
  const rest = all.subarray(RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);
  const aesCiphertext = rest.subarray(0, rest.length - GCM_TAG_BYTES);
  const tag = rest.subarray(rest.length - GCM_TAG_BYTES);

  const aesKey = privateDecrypt(
    { key: getPrivateKey(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    encryptedAesKey
  );

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(aesCiphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * SHA-256 of the ciphertext = idempotency key.
 * Intermediates can rewrite packetId but cannot forge a ciphertext,
 * so identical payload copies always hash identically.
 */
export const hashCiphertext = (base64Ciphertext) =>
  createHash('sha256').update(base64Ciphertext, 'utf8').digest('hex');
