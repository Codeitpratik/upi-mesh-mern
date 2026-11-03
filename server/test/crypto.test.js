import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, hashCiphertext } from '../src/crypto/hybridCrypto.js';
import { getPublicKey } from '../src/crypto/serverKey.js';

const instr = { senderVpa: 'alice@demo', receiverVpa: 'bob@demo', amount: 100, nonce: 'n1', signedAt: Date.now() };

test('encrypt -> decrypt roundtrip', () => {
  const ct = encrypt(instr, getPublicKey());
  assert.deepEqual(decrypt(ct), instr);
});

test('tampered ciphertext is rejected (GCM auth)', () => {
  const buf = Buffer.from(encrypt(instr, getPublicKey()), 'base64');
  buf[buf.length - 20] ^= 0x01; // flip one bit in the AES ciphertext
  assert.throws(() => decrypt(buf.toString('base64')));
});

test('truncated ciphertext is rejected', () => {
  assert.throws(() => decrypt(Buffer.alloc(10).toString('base64')), /too short/);
});

test('same plaintext encrypts differently, hash is stable per ciphertext', () => {
  const a = encrypt(instr, getPublicKey());
  const b = encrypt(instr, getPublicKey());
  assert.notEqual(hashCiphertext(a), hashCiphertext(b));
  assert.equal(hashCiphertext(a), hashCiphertext(a));
});
