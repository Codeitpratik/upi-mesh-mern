import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettlement } from '../src/services/settlement.js';
import { hashPin } from '../src/crypto/pin.js';

/**
 * Tiny in-memory stand-in for the two Mongoose models. It implements ONLY the
 * operations settlement.js uses ($gte filter, $inc / $set update) so the PIN /
 * lockout / balance logic can be tested without a MongoDB server.
 */
function fakeModels(accounts) {
  const db = new Map(accounts.map((a) => [a._id, { ...a }]));
  const txs = [];
  const matches = (doc, f) =>
    Object.entries(f).every(([k, v]) =>
      v && typeof v === 'object' && '$gte' in v ? doc[k] >= v.$gte : doc[k] === v
    );
  const find = (f) => [...db.values()].find((d) => matches(d, f));
  const apply = (doc, u) => {
    for (const [k, v] of Object.entries(u.$inc ?? {})) doc[k] = (doc[k] ?? 0) + v;
    Object.assign(doc, u.$set ?? {});
  };
  const Account = {
    findById: (id) => ({ lean: async () => (db.has(id) ? { ...db.get(id) } : null) }),
    exists: async (f) => (find(f) ? { _id: f._id } : null),
    findOneAndUpdate: async (f, u, o = {}) => {
      const d = find(f);
      if (!d) return null;
      const before = { ...d };
      apply(d, u);
      return o.new ? { ...d } : before; // mongoose default = document BEFORE update
    },
    updateOne: async (f, u) => { const d = find(f); if (d) apply(d, u); },
  };
  const Transaction = {
    create: async (o) => { const t = { _id: 't' + (txs.length + 1), ...o }; txs.push(t); return t; },
  };
  return { Account, Transaction, db, txs };
}

async function setup({ aliceBalance = 500000 } = {}) {
  const m = fakeModels([
    { _id: 'alice@demo', balancePaise: aliceBalance, failedPinAttempts: 0, lockedUntil: null, ...(await hashPin('1234')) },
    { _id: 'bob@demo', balancePaise: 100000, failedPinAttempts: 0, lockedUntil: null, ...(await hashPin('2345')) },
  ]);
  let clock = Date.now();
  const settle = createSettlement({ Account: m.Account, Transaction: m.Transaction, now: () => clock, maxPinAttempts: 3, pinLockMinutes: 15 });
  let n = 0;
  const pay = (pin, amount = 500) =>
    settle(
      { senderVpa: 'alice@demo', receiverVpa: 'bob@demo', amount, pin, nonce: 'n' + n, signedAt: clock },
      'hash' + n++, 'bridge', 1
    );
  return { ...m, pay, advance: (ms) => (clock += ms) };
}

test('correct PIN settles and moves money', async () => {
  const s = await setup();
  const tx = await s.pay('1234', 500);
  assert.equal(tx.status, 'SETTLED');
  assert.equal(s.db.get('alice@demo').balancePaise, 450000);
  assert.equal(s.db.get('bob@demo').balancePaise, 150000);
});

test('wrong PIN is REJECTED / INVALID_PIN and no money moves', async () => {
  const s = await setup();
  const tx = await s.pay('0000');
  assert.equal(tx.status, 'REJECTED');
  assert.equal(tx.reason, 'INVALID_PIN');
  assert.equal(s.db.get('alice@demo').balancePaise, 500000);
  assert.equal(s.db.get('bob@demo').balancePaise, 100000);
  assert.equal(s.db.get('alice@demo').failedPinAttempts, 1);
});

test('missing PIN in payload is rejected', async () => {
  const s = await setup();
  const tx = await s.pay(undefined);
  assert.equal(tx.reason, 'INVALID_PIN');
  assert.equal(s.db.get('alice@demo').balancePaise, 500000);
});

test('3 wrong PINs lock the account; correct PIN is then refused', async () => {
  const s = await setup();
  for (let i = 0; i < 3; i++) assert.equal((await s.pay('0000')).reason, 'INVALID_PIN');
  assert.ok(s.db.get('alice@demo').lockedUntil > s.advance(0));

  const tx = await s.pay('1234');
  assert.equal(tx.status, 'REJECTED');
  assert.equal(tx.reason, 'ACCOUNT_LOCKED');
  assert.equal(s.db.get('alice@demo').balancePaise, 500000);
});

test('lock expires after the lock window', async () => {
  const s = await setup();
  for (let i = 0; i < 3; i++) await s.pay('0000');
  s.advance(15 * 60_000 + 1000);
  assert.equal((await s.pay('1234')).status, 'SETTLED');
});

test('a correct PIN resets the failure counter (2 wrong, 1 right, 2 wrong != locked)', async () => {
  const s = await setup();
  await s.pay('0000'); await s.pay('0000');
  assert.equal((await s.pay('1234')).status, 'SETTLED');
  assert.equal(s.db.get('alice@demo').failedPinAttempts, 0);
  await s.pay('0000'); await s.pay('0000');
  assert.equal(s.db.get('alice@demo').lockedUntil, null);
});

test('insufficient balance is REJECTED with its own reason (PIN was fine)', async () => {
  const s = await setup({ aliceBalance: 10000 });
  const tx = await s.pay('1234', 500);
  assert.equal(tx.status, 'REJECTED');
  assert.equal(tx.reason, 'INSUFFICIENT_BALANCE');
  assert.equal(s.db.get('alice@demo').balancePaise, 10000);
});

test('wrong PIN is reported as INVALID_PIN even when balance is also too low (no balance probing)', async () => {
  const s = await setup({ aliceBalance: 10000 });
  assert.equal((await s.pay('0000', 500)).reason, 'INVALID_PIN');
});
