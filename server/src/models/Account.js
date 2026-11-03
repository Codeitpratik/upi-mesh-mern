import mongoose from 'mongoose';

/**
 * Simulated bank account. Money is stored in PAISE (integer).
 * _id is the VPA, e.g. "alice@demo".
 *
 * PIN: only a salted scrypt hash is stored. failedPinAttempts / lockedUntil
 * implement the lockout that makes a 4-digit PIN safe against brute force.
 */
const accountSchema = new mongoose.Schema(
  {
    _id: { type: String },
    holderName: { type: String, required: true },
    balancePaise: { type: Number, required: true, min: 0 },
    pinHash: { type: String, required: true },
    pinSalt: { type: String, required: true },
    failedPinAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { versionKey: false }
);

// never expose pin material through the API
accountSchema.methods.toApi = function () {
  return {
    vpa: this._id,
    holderName: this.holderName,
    balance: this.balancePaise / 100,
    failedPinAttempts: this.failedPinAttempts ?? 0,
    locked: !!this.lockedUntil && this.lockedUntil.getTime() > Date.now(),
    lockedUntil: this.lockedUntil,
  };
};

export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
