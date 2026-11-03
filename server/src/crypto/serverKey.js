import { generateKeyPairSync } from 'node:crypto';

/**
 * Server RSA keypair, generated fresh at startup (demo only).
 * In production the private key belongs in an HSM / KMS, never in code.
 */
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const getPublicKey = () => publicKey;
export const getPrivateKey = () => privateKey;
// SPKI DER, base64 (standard public-key encoding)
export const getPublicKeyBase64 = () =>
  publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

console.log('[crypto] Server RSA keypair generated (2048-bit):', getPublicKeyBase64().slice(0, 32) + '...');
