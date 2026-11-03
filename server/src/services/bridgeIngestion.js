import * as hybridCrypto from '../crypto/hybridCrypto.js';
import { idempotency as defaultIdempotency } from './idempotency.js';
import { settle as defaultSettle } from './settlement.js';
import { config } from '../config.js';

/**
 * Full server pipeline for one packet arriving from a bridge node:
 *   1. hash ciphertext
 *   2. claim hash in idempotency cache  (duplicate -> drop)
 *   3. decrypt                           (fail -> reject)
 *   4. freshness check                   (replay protection)
 *   5. settle
 *
 * Dependencies are injectable so tests can stub the DB layer.
 */
export function createBridgeIngestion({
  crypto = hybridCrypto,
  idempotency = defaultIdempotency,
  settle = defaultSettle,
  maxAgeSeconds = config.packetMaxAgeSeconds,
} = {}) {
  const result = (outcome, packetHash, reason = null, transactionId = null) => ({
    outcome,
    packetHash,
    reason,
    transactionId,
  });

  return async function ingest(packet, bridgeNodeId, hopCount) {
    try {
      const packetHash = crypto.hashCiphertext(packet.ciphertext);

      if (!idempotency.claim(packetHash)) {
        console.log(`[ingest] DUPLICATE ${packetHash.slice(0, 12)}... from ${bridgeNodeId} - dropped`);
        return result('DUPLICATE_DROPPED', packetHash);
      }

      let instruction;
      try {
        instruction = crypto.decrypt(packet.ciphertext);
      } catch (e) {
        console.warn(`[ingest] decryption failed for ${packetHash.slice(0, 12)}...: ${e.message}`);
        return result('INVALID', packetHash, 'decryption_failed');
      }

      const ageSeconds = (Date.now() - instruction.signedAt) / 1000;
      if (ageSeconds > maxAgeSeconds) return result('INVALID', packetHash, 'stale_packet');
      if (ageSeconds < -300) return result('INVALID', packetHash, 'future_dated');

      const tx = await settle(instruction, packetHash, bridgeNodeId, hopCount);
      if (tx.status === 'REJECTED') {
        return result('REJECTED', packetHash, tx.reason, tx._id.toString());
      }
      return result('SETTLED', packetHash, null, tx._id.toString());
    } catch (e) {
      console.error('[ingest] error:', e.message);
      return result('INVALID', '?', `internal_error: ${e.message}`);
    }
  };
}

export const ingest = createBridgeIngestion();
