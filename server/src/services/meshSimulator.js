/**
 * Simulated Bluetooth mesh. Each device is a phone holding packets.
 * gossipOnce(): everyone shares with everyone (TTL-1 per hop).
 */
class VirtualDevice {
  constructor(deviceId, hasInternet) {
    this.deviceId = deviceId;
    this.hasInternet = hasInternet;
    this.held = new Map(); // packetId -> packet
  }
  hold(packet) {
    if (!this.held.has(packet.packetId)) this.held.set(packet.packetId, packet);
  }
  holds(packetId) {
    return this.held.has(packetId);
  }
  get packets() {
    return [...this.held.values()];
  }
  clear() {
    this.held.clear();
  }
}

export function createMeshSimulator() {
  const devices = new Map();
  [
    ['phone-alice', false],
    ['phone-bob', false],
    ['phone-carol', false],
    ['phone-dave', false],
    ['phone-stranger1', false],
    ['phone-stranger2', false],
    ['phone-bridge', true],
  ].forEach(([id, net]) => devices.set(id, new VirtualDevice(id, net)));

  return {
    getDevices: () => [...devices.values()],

    inject(deviceId, packet) {
      const d = devices.get(deviceId);
      if (!d) throw new Error(`Unknown device: ${deviceId}`);
      d.hold(packet);
      console.log(`[mesh] Packet ${packet.packetId.slice(0, 8)} injected at ${deviceId} (TTL=${packet.ttl})`);
    },

    gossipOnce() {
      let transfers = 0;
      const list = [...devices.values()];
      // snapshot so a packet can't hop through 5 devices in a single round
      const snapshot = new Map(list.map((d) => [d.deviceId, d.packets]));

      for (const src of list) {
        for (const pkt of snapshot.get(src.deviceId)) {
          if (pkt.ttl <= 0) continue;
          for (const dst of list) {
            if (dst === src || dst.holds(pkt.packetId)) continue;
            dst.hold({ ...pkt, ttl: pkt.ttl - 1 });
            transfers++;
          }
        }
      }
      console.log(`[mesh] Gossip round complete: ${transfers} transfers`);
      return { transfers, deviceCounts: this.snapshotMap() };
    },

    snapshotMap() {
      return Object.fromEntries([...devices.values()].map((d) => [d.deviceId, d.held.size]));
    },

    collectBridgeUploads() {
      const out = [];
      for (const d of devices.values()) {
        if (!d.hasInternet) continue;
        for (const packet of d.packets) out.push({ bridgeNodeId: d.deviceId, packet });
      }
      return out;
    },

    resetMesh() {
      devices.forEach((d) => d.clear());
    },
  };
}

export const mesh = createMeshSimulator();
