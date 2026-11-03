import { randomUUID } from 'node:crypto';
import { Account } from '../models/Account.js';
import * as hybridCrypto from '../crypto/hybridCrypto.js';
import { hashPin } from '../crypto/pin.js';
import { getPublicKey } from '../crypto/serverKey.js';

// Demo PINs (shown on the dashboard). Each account has a DIFFERENT PIN so
// you can demo "wrong PIN" by simply picking another sender.
export const DEMO_ACCOUNTS = [
  { vpa: 'alice@demo', name: 'Alice', paise: 500000, pin: '1234' },
  { vpa: 'bob@demo',   name: 'Bob',   paise: 100000, pin: '2345' },
  { vpa: 'carol@demo', name: 'Carol', paise: 250000, pin: '3456' },
  { vpa: 'dave@demo',  name: 'Dave',  paise: 50000,  pin: '4567' },
];

export async function seedAccounts() {
  for (const a of DEMO_ACCOUNTS) {
    const existing = await Account.findById(a.vpa).lean();
    const pinFields = await hashPin(a.pin);
    if (!existing) {
      await Account.create({ _id: a.vpa, holderName: a.name, balancePaise: a.paise, ...pinFields });
    } else if (!existing.pinHash) {
      // account created by the pre-PIN version of this app -> add a PIN
      await Account.updateOne({ _id: a.vpa }, { $set: { ...pinFields, failedPinAttempts: 0, lockedUntil: null } });
    }
  }
  console.log('[demo] Demo accounts ready');
}

/** Demo helper: clear lockouts so the demo can continue. */
export async function unlockAll() {
  const r = await Account.updateMany({}, { $set: { failedPinAttempts: 0, lockedUntil: null } });
  return r.modifiedCount;
}

/**
 * Simulates the SENDER PHONE: build instruction (fresh nonce + signedAt),
 * encrypt with server public key, wrap in a MeshPacket with TTL.
 *
 * The PIN travels INSIDE the ciphertext (like UPI's encrypted PIN block):
 * mesh phones can't read it, only the server's private key can.
 */
export function createPacket(senderVpa, receiverVpa, amount, pin, ttl = 5) {
  const instruction = {
    senderVpa,
    receiverVpa,
    amount,
    pin: String(pin),
    nonce: randomUUID(),
    signedAt: Date.now(),
  };
  return {
    packetId: randomUUID(),
    ttl,
    createdAt: Date.now(),
    ciphertext: hybridCrypto.encrypt(instruction, getPublicKey()),
  };
}
