import { Router } from 'express';
import { getPublicKeyBase64 } from '../crypto/serverKey.js';
import { createPacket, unlockAll } from '../services/demo.js';
import { isValidPinFormat } from '../crypto/pin.js';
import { mesh } from '../services/meshSimulator.js';
import { ingest } from '../services/bridgeIngestion.js';
import { idempotency } from '../services/idempotency.js';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { config } from '../config.js';

export const api = Router();

// async handler wrapper so thrown errors reach the error middleware
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- server public key
api.get('/server-key', (_req, res) =>
  res.json({
    publicKey: getPublicKeyBase64(),
    algorithm: 'RSA-2048 / OAEP-SHA256',
    hybridScheme: 'RSA-OAEP encrypts an AES-256-GCM session key',
  })
);

// returns an error string, or null if the payment form is valid
function validatePayment({ senderVpa, receiverVpa, amount, pin } = {}) {
  const amt = Number(amount);
  if (!senderVpa || !receiverVpa || !Number.isFinite(amt) || amt <= 0) {
    return 'senderVpa, receiverVpa and amount (>0) are required';
  }
  if (!isValidPinFormat(String(pin ?? ''))) return 'PIN must be 4-6 digits';
  return null;
}

// ---- ONLINE payment: phone has internet, so it talks to the backend directly
// (no mesh). Same pipeline: encrypt -> idempotency -> decrypt -> PIN check -> settle.
api.post(
  '/pay',
  h(async (req, res) => {
    const err = validatePayment(req.body);
    if (err) return res.status(400).json({ error: err });
    const { senderVpa, receiverVpa, amount, pin } = req.body;
    const packet = createPacket(senderVpa, receiverVpa, Number(amount), pin, 5);
    const r = await ingest(packet, 'direct-online', 0);
    res.json({ packetId: packet.packetId.slice(0, 8), ...r });
  })
);

// ---- OFFLINE payment: act as sender phone and inject into mesh
api.post('/demo/send', (req, res) => {
  const err = validatePayment(req.body);
  if (err) return res.status(400).json({ error: err });
  const { senderVpa, receiverVpa, amount, pin, ttl, startDevice } = req.body;
  const amt = Number(amount);
  const packet = createPacket(senderVpa, receiverVpa, amt, pin, ttl ?? 5);
  const device = startDevice || 'phone-alice';
  try {
    mesh.inject(device, packet);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({
    packetId: packet.packetId,
    ciphertextPreview: packet.ciphertext.slice(0, 64) + '...',
    ttl: packet.ttl,
    injectedAt: device,
  });
});

// ---- demo: clear PIN lockouts
api.post(
  '/demo/unlock',
  h(async (_req, res) => res.json({ unlocked: await unlockAll() }))
);

// ---- mesh simulator
api.get('/mesh/state', (_req, res) =>
  res.json({
    devices: mesh.getDevices().map((d) => ({
      deviceId: d.deviceId,
      hasInternet: d.hasInternet,
      packetCount: d.held.size,
      packetIds: d.packets.map((p) => p.packetId.slice(0, 8)),
    })),
    idempotencyCacheSize: idempotency.size(),
  })
);

api.post('/mesh/gossip', (_req, res) => res.json(mesh.gossipOnce()));

// All bridges upload at the same time -> concurrent duplicate test
api.post(
  '/mesh/flush',
  h(async (_req, res) => {
    const uploads = mesh.collectBridgeUploads();
    const results = await Promise.all(
      uploads.map(async ({ bridgeNodeId, packet }) => {
        const r = await ingest(packet, bridgeNodeId, 5 - packet.ttl);
        return {
          bridgeNode: bridgeNodeId,
          packetId: packet.packetId.slice(0, 8),
          outcome: r.outcome,
          reason: r.reason ?? '',
          transactionId: r.transactionId ?? -1,
        };
      })
    );
    res.json({ uploadsAttempted: uploads.length, results });
  })
);

api.post('/mesh/reset', (_req, res) => {
  mesh.resetMesh();
  idempotency.clear();
  res.json({ status: 'mesh and idempotency cache cleared' });
});

// ---- THE production endpoint a real bridge node would call
api.post(
  '/bridge/ingest',
  h(async (req, res) => {
    const p = req.body ?? {};
    if (
      typeof p.packetId !== 'string' || !p.packetId ||
      !Number.isInteger(p.ttl) || p.ttl < 0 ||
      typeof p.createdAt !== 'number' ||
      typeof p.ciphertext !== 'string' || !p.ciphertext
    ) {
      return res.status(400).json({ error: 'Invalid packet' });
    }
    const bridgeNodeId = req.get('X-Bridge-Node-Id') || 'unknown';
    const hopCount = parseInt(req.get('X-Hop-Count') || '0', 10) || 0;
    res.json(await ingest(p, bridgeNodeId, hopCount));
  })
);

// ---- dashboard data
api.get(
  '/accounts',
  h(async (_req, res) => {
    const accounts = await Account.find().sort({ _id: 1 });
    res.json(
      accounts.map((a) => {
        const api = a.toApi();
        return { ...api, pinAttemptsLeft: Math.max(0, config.maxPinAttempts - api.failedPinAttempts) };
      })
    );
  })
);

api.get(
  '/transactions',
  h(async (req, res) => {
    // ?vpa=alice@demo -> only that user's payments (sent or received)
    const vpa = typeof req.query.vpa === 'string' ? req.query.vpa : null;
    const filter = vpa ? { $or: [{ senderVpa: vpa }, { receiverVpa: vpa }] } : {};
    const txs = await Transaction.find(filter).sort({ _id: -1 }).limit(vpa ? 50 : 20);
    res.json(txs.map((t) => t.toApi()));
  })
);
