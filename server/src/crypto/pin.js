import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/** Salted scrypt hash of a PIN (what the "bank" stores). */
export async function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  const buf = await scryptAsync(String(pin), salt, 32);
  return { pinSalt: salt, pinHash: buf.toString('hex') };
}

/** Constant-time check. Returns false (never throws) on any bad input. */
export async function verifyPin(pin, salt, hash) {
  if (typeof pin !== 'string' || !salt || !hash) return false;
  const actual = await scryptAsync(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const isValidPinFormat = (pin) => typeof pin === 'string' && /^\d{4,6}$/.test(pin);
