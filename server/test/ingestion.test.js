import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeIngestion } from '../src/services/bridgeIngestion.js';
import { createIdempotencyService } from '../src/services/idempotency.js';
import { createPacket } from '../src/services/demo.js';
import { encrypt } from '../src/crypto/hybridCrypto.js';
import { getPublicKey } from '../src/crypto/serverKey.js';
import { createMeshSimulator } from '../src/services/meshSimulator.js';

// stub settlement (no DB needed) - counts how many times money would move
function setup() {
  const calls = [];
  const settle = async (instruction, hash) => {
    await new Promise((r) => setTimeout(r, 10)); // simulate DB latency so calls interleave
    calls.push(hash);
    return { _id: 'tx' + calls.length };
  };
  const ingest = createBridgeIngestion({ idempotency: createIdempotencyService(), settle });
  return { ingest, calls };
}

test('same packet delivered by 3 bridges at once settles exactly once', async () => {
  const { ingest, calls } = setup();
  const packet = createPacket('alice@demo', 'bob@demo', 500, '1234');

  const results = await Promise.all([
    ingest(packet, 'bridge-1', 1),
    ingest(packet, 'bridge-2', 2),
    ingest(packet, 'bridge-3', 3),
  ]);

  const outcomes = results.map((r) => r.outcome).sort();
  assert.deepEqual(outcomes, ['DUPLICATE_DROPPED', 'DUPLICATE_DROPPED', 'SETTLED']);
  assert.equal(calls.length, 1);
});

test('100 concurrent deliveries still settle once', async () => {
  const { ingest, calls } = setup();
  const packet = createPacket('alice@demo', 'bob@demo', 10, '1234');
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) => ingest(packet, 'b' + i, 1)));
  assert.equal(results.filter((r) => r.outcome === 'SETTLED').length, 1);
  assert.equal(calls.length, 1);
});

test('packet with rewritten packetId is still deduped (hash is on ciphertext)', async () => {
  const { ingest, calls } = setup();
  const p = createPacket('alice@demo', 'bob@demo', 50, '1234');
  const forged = { ...p, packetId: 'something-else' };
  const [a, b] = await Promise.all([ingest(p, 'x', 1), ingest(forged, 'y', 1)]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ['DUPLICATE_DROPPED', 'SETTLED']);
  assert.equal(calls.length, 1);
});

test('tampered ciphertext -> INVALID decryption_failed', async () => {
  const { ingest, calls } = setup();
  const p = createPacket('alice@demo', 'bob@demo', 50, '1234');
  const buf = Buffer.from(p.ciphertext, 'base64');
  buf[buf.length - 20] ^= 1;
  const r = await ingest({ ...p, ciphertext: buf.toString('base64') }, 'x', 1);
  assert.equal(r.outcome, 'INVALID');
  assert.equal(r.reason, 'decryption_failed');
  assert.equal(calls.length, 0);
});

test('stale packet (>24h) is rejected', async () => {
  const { ingest, calls } = setup();
  const old = encrypt(
    { senderVpa: 'alice@demo', receiverVpa: 'bob@demo', amount: 5, nonce: 'z', signedAt: Date.now() - 25 * 3600 * 1000 },
    getPublicKey()
  );
  const r = await ingest({ packetId: 'p', ttl: 3, createdAt: Date.now(), ciphertext: old }, 'x', 1);
  assert.equal(r.reason, 'stale_packet');
  assert.equal(calls.length, 0);
});

test('mesh gossip spreads packet to every device with TTL-1', () => {
  const mesh = createMeshSimulator();
  mesh.inject('phone-alice', createPacket('alice@demo', 'bob@demo', 1, '1234', 5));
  const { transfers } = mesh.gossipOnce();
  assert.equal(transfers, mesh.getDevices().length - 1);
  assert.ok(mesh.getDevices().every((d) => d.held.size === 1));
  const bridgeUploads = mesh.collectBridgeUploads();
  assert.equal(bridgeUploads.length, 1);
  assert.equal(bridgeUploads[0].packet.ttl, 4);
});

test('settlement REJECTED result is surfaced as REJECTED (not SETTLED)', async () => {
  const ingest = createBridgeIngestion({
    idempotency: createIdempotencyService(),
    settle: async () => ({ _id: 'tx9', status: 'REJECTED', reason: 'INVALID_PIN' }),
  });
  const r = await ingest(createPacket('alice@demo', 'bob@demo', 5, '0000'), 'x', 1);
  assert.equal(r.outcome, 'REJECTED');
  assert.equal(r.reason, 'INVALID_PIN');
});
