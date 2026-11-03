import { Account as RealAccount } from '../models/Account.js';
import { Transaction as RealTransaction } from '../models/Transaction.js';
import { verifyPin as realVerifyPin } from '../crypto/pin.js';
import { config } from '../config.js';

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/**
 * Debit sender / credit receiver / write ledger row, after verifying the PIN.
 *
 * Order of checks (cheapest/safest first):
 *   1. input sanity + both accounts exist  (throws -> INVALID upstream)
 *   2. sender account locked?              -> REJECTED / ACCOUNT_LOCKED
 *   3. PIN correct?                        -> else count the failure, lock after N
 *   4. atomic debit only if balance >= amt -> else REJECTED / INSUFFICIENT_BALANCE
 *   5. credit receiver, write ledger, refund on any failure
 *
 * PIN is checked BEFORE balance so a wrong-PIN caller can't probe balances.
 * Works on a standalone MongoDB (no replica set / multi-doc transaction needed).
 *
 * Models are injectable so the logic can be unit-tested without a database.
 */
export function createSettlement({
  Account = RealAccount,
  Transaction = RealTransaction,
  verifyPin = realVerifyPin,
  maxPinAttempts = config.maxPinAttempts,
  pinLockMinutes = config.pinLockMinutes,
  now = () => Date.now(),
} = {}) {
  const record = (instruction, packetHash, bridgeNodeId, hopCount, amountPaise, status, reason = null) =>
    Transaction.create({
      packetHash,
      senderVpa: instruction.senderVpa,
      receiverVpa: instruction.receiverVpa,
      amountPaise,
      signedAt: new Date(instruction.signedAt),
      settledAt: new Date(now()),
      bridgeNodeId,
      hopCount,
      status,
      reason,
    });

  return async function settle(instruction, packetHash, bridgeNodeId, hopCount) {
    const amountPaise = toPaise(instruction.amount);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) throw new Error('Amount must be positive');
    if (instruction.senderVpa === instruction.receiverVpa) throw new Error('Sender and receiver must be different');

    const sender = await Account.findById(instruction.senderVpa).lean();
    if (!sender) throw new Error(`Unknown sender VPA: ${instruction.senderVpa}`);
    if (!(await Account.exists({ _id: instruction.receiverVpa }))) {
      throw new Error(`Unknown receiver VPA: ${instruction.receiverVpa}`);
    }

    const reject = (reason) => {
      console.warn(`[settle] REJECTED (${reason}) ${instruction.senderVpa} -> ${instruction.receiverVpa} ₹${amountPaise / 100}`);
      return record(instruction, packetHash, bridgeNodeId, hopCount, amountPaise, 'REJECTED', reason);
    };

    // ---- 2. lockout
    if (sender.lockedUntil && new Date(sender.lockedUntil).getTime() > now()) {
      return reject('ACCOUNT_LOCKED');
    }

    // ---- 3. PIN
    const pinOk = await verifyPin(instruction.pin, sender.pinSalt, sender.pinHash);
    if (!pinOk) {
      const updated = await Account.findOneAndUpdate(
        { _id: instruction.senderVpa },
        { $inc: { failedPinAttempts: 1 } },
        { new: true }
      );
      if (updated && updated.failedPinAttempts >= maxPinAttempts) {
        await Account.updateOne(
          { _id: instruction.senderVpa },
          { $set: { lockedUntil: new Date(now() + pinLockMinutes * 60_000), failedPinAttempts: 0 } }
        );
        console.warn(`[settle] ${instruction.senderVpa} LOCKED for ${pinLockMinutes} min after ${maxPinAttempts} wrong PINs`);
      }
      return reject('INVALID_PIN');
    }

    // ---- 4. atomic debit (PIN ok -> also clears the failure counter)
    const debited = await Account.findOneAndUpdate(
      { _id: instruction.senderVpa, balancePaise: { $gte: amountPaise } },
      { $inc: { balancePaise: -amountPaise }, $set: { failedPinAttempts: 0 } }
    );
    if (!debited) return reject('INSUFFICIENT_BALANCE');

    // ---- 5. credit + ledger, compensate on failure
    let credited = false;
    try {
      await Account.updateOne({ _id: instruction.receiverVpa }, { $inc: { balancePaise: amountPaise } });
      credited = true;
      const tx = await record(instruction, packetHash, bridgeNodeId, hopCount, amountPaise, 'SETTLED');
      console.log(
        `[settle] SETTLED ₹${amountPaise / 100} ${instruction.senderVpa} -> ${instruction.receiverVpa} ` +
          `(hash=${packetHash.slice(0, 12)}..., bridge=${bridgeNodeId}, hops=${hopCount})`
      );
      return tx;
    } catch (err) {
      await Account.updateOne({ _id: instruction.senderVpa }, { $inc: { balancePaise: amountPaise } });
      if (credited) {
        await Account.updateOne({ _id: instruction.receiverVpa }, { $inc: { balancePaise: -amountPaise } });
      }
      throw err;
    }
  };
}

export const settle = createSettlement();
