import { config } from '../config.js';

/**
 * In-memory idempotency cache (Redis SETNX equivalent).
 *
 * Node runs JS on a single thread, and claim() has no `await` inside,
 * so check-and-set can never interleave -> exactly one caller gets `true`.
 * (With multiple server instances you'd move this to Redis SET NX EX.)
 */
export function createIdempotencyService(ttlSeconds = config.idempotencyTtlSeconds) {
  const seen = new Map();

  return {
    claim(hash) {
      if (seen.has(hash)) return false;
      seen.set(hash, Date.now());
      return true;
    },
    size: () => seen.size,
    clear: () => seen.clear(),
    evictExpired() {
      const cutoff = Date.now() - ttlSeconds * 1000;
      for (const [k, t] of seen) if (t < cutoff) seen.delete(k);
    },
  };
}

export const idempotency = createIdempotencyService();
