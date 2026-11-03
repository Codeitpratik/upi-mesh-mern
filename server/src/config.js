import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || '',
  idempotencyTtlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS) || 86400,
  packetMaxAgeSeconds: Number(process.env.PACKET_MAX_AGE_SECONDS) || 86400,
  maxPinAttempts: Number(process.env.MAX_PIN_ATTEMPTS) || 3,
  pinLockMinutes: Number(process.env.PIN_LOCK_MINUTES) || 15,
};
