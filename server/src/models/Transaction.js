import mongoose from 'mongoose';

/**
 * Permanent record of every processed packet.
 * packetHash is UNIQUE at DB level: defense in depth if the in-memory
 * idempotency cache ever fails (e.g. server restart).
 */
const transactionSchema = new mongoose.Schema(
  {
    packetHash: { type: String, required: true, unique: true },
    senderVpa: { type: String, required: true },
    receiverVpa: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    signedAt: { type: Date, required: true },
    settledAt: { type: Date, required: true },
    bridgeNodeId: { type: String, required: true },
    hopCount: { type: Number, required: true },
    status: { type: String, enum: ['SETTLED', 'REJECTED'], required: true },
    // why a REJECTED row was rejected: INVALID_PIN | ACCOUNT_LOCKED | INSUFFICIENT_BALANCE
    reason: { type: String, default: null },
  },
  { versionKey: false }
);

transactionSchema.methods.toApi = function () {
  return {
    id: this._id.toString(),
    packetHash: this.packetHash,
    senderVpa: this.senderVpa,
    receiverVpa: this.receiverVpa,
    amount: this.amountPaise / 100,
    signedAt: this.signedAt,
    settledAt: this.settledAt,
    bridgeNodeId: this.bridgeNodeId,
    hopCount: this.hopCount,
    status: this.status,
    reason: this.reason ?? null,
  };
};

export const Transaction =
  mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
