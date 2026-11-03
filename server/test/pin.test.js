import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin, isValidPinFormat } from '../src/crypto/pin.js';

test('correct PIN verifies, wrong PIN does not', async () => {
  const { pinSalt, pinHash } = await hashPin('1234');
  assert.equal(await verifyPin('1234', pinSalt, pinHash), true);
  assert.equal(await verifyPin('1235', pinSalt, pinHash), false);
});

test('same PIN gets different salt/hash each time', async () => {
  const a = await hashPin('1234');
  const b = await hashPin('1234');
  assert.notEqual(a.pinSalt, b.pinSalt);
  assert.notEqual(a.pinHash, b.pinHash);
});

test('missing / non-string / malformed inputs return false instead of throwing', async () => {
  const { pinSalt, pinHash } = await hashPin('1234');
  assert.equal(await verifyPin(undefined, pinSalt, pinHash), false);
  assert.equal(await verifyPin(1234, pinSalt, pinHash), false);
  assert.equal(await verifyPin('1234', undefined, undefined), false);
  assert.equal(await verifyPin('1234', pinSalt, 'zz'), false);
});

test('PIN format validation', () => {
  assert.equal(isValidPinFormat('1234'), true);
  assert.equal(isValidPinFormat('123456'), true);
  for (const bad of ['123', '1234567', 'abcd', '12 4', '', undefined, 1234]) {
    assert.equal(isValidPinFormat(bad), false, String(bad));
  }
});
