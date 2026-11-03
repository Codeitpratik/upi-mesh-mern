# MeshPay — UPI Offline Mesh (MERN)

A MERN-stack (MongoDB + Express + React + Node) simulator of **offline UPI payments**.
An encrypted payment hops phone-to-phone over a (simulated) Bluetooth mesh until a phone
with internet uploads it; the backend decrypts, de-duplicates and settles it exactly once.

## Run

Prerequisites: **Node 18+** (Node 20+ recommended). MongoDB is optional.

```bash
npm run install:all      # installs root + server + client deps
npm run dev              # API on :5000, React dashboard on :5173
```

Open **http://localhost:5173**. It looks like a mobile payment app (it also works in a phone-sized browser window).

## The app

| Screen | What it does |
|---|---|
| **Home** | Hidden balance (tap *Check balance*, auto-hides), Online/Offline switch, people, recent activity |
| **Send money** (centre button) | Pick person → amount → UPI PIN keypad → result screen |
| **History** | Sent / received / pending / failed payments; tap one for details (route, hops, reference) |
| **Mesh** | Nearby phones, *Spread to nearby phones*, *Internet phone syncs with bank*, activity log, and a demo-admin bank view |
| **Profile** | Switch between Alice / Bob / Carol / Dave (demo PINs are shown here) |

- **Online:** the payment goes straight to the backend (`POST /api/pay`) and settles instantly.
- **Offline:** tap the green *Online* chip to go offline. The payment is encrypted, put in your phone's mesh queue and shows as **Pending**. Go to **Mesh** → *Spread* → *Sync* to simulate a nearby phone getting internet; the payment then settles (or is rejected: wrong PIN, locked account, insufficient balance).
- Because the PIN is checked by the bank, a wrong PIN on an **offline** payment is only discovered when it syncs.

### Database
- `server/.env` not set / `MONGO_URI` empty → **in-memory MongoDB** (`mongodb-memory-server`, downloads a
  mongod binary on first run; data resets on restart).
- Real DB: `cp server/.env.example server/.env` and set `MONGO_URI` (local or Atlas).

### Tests
```bash
npm test
```
23 tests: crypto roundtrip/tamper, concurrent duplicate delivery (3 and 100 bridges → settles once),
forged `packetId`, stale packet, mesh gossip, PIN hashing, and PIN / lockout / balance logic in settlement.

### Production-style single server
```bash
npm run build && npm start     # Express serves client/dist on :5000
```

## Project structure

| Part | File |
|---|---|
| Hybrid encryption (RSA-OAEP + AES-256-GCM) | `server/src/crypto/hybridCrypto.js` |
| Server keypair | `server/src/crypto/serverKey.js` |
| PIN hashing (scrypt) | `server/src/crypto/pin.js` |
| Duplicate-payment protection (idempotency) | `server/src/services/idempotency.js` (`Map`, atomic because Node is single-threaded) |
| Packet pipeline (hash → dedupe → decrypt → settle) | `server/src/services/bridgeIngestion.js` |
| Settlement (PIN check, lockout, atomic debit, compensating refund) | `server/src/services/settlement.js` |
| Bluetooth mesh simulator | `server/src/services/meshSimulator.js` |
| Demo accounts and packet builder | `server/src/services/demo.js` |
| REST API | `server/src/routes/api.js` |
| Mongoose models | `server/src/models/` |
| React app (Home, Pay, History, Mesh) | `client/src/` |

## API

`GET /api/server-key` · `POST /api/pay` (online payment) · `POST /api/demo/send` (offline payment into mesh) · `GET /api/mesh/state` · `POST /api/mesh/gossip` ·
`POST /api/mesh/flush` · `POST /api/mesh/reset` · `POST /api/bridge/ingest` · `GET /api/accounts` · `GET /api/transactions?vpa=alice@demo`

New: `POST /api/demo/unlock` (demo helper, clears PIN lockouts).

## Notes on what changed
- **Money is stored as integer paise** in MongoDB (no float errors); API still returns rupees.
- **No replica set needed.** Mongo multi-document transactions require one, so settlement uses an atomic
  `findOneAndUpdate({balance >= amount}, {$inc})` for the debit (can't overdraw) and refunds if a later step fails.
  If you run a replica set/Atlas you can swap this for `session.withTransaction()`.
- `packetHash` has a **unique index** in `transactions` as a DB-level safety net behind the in-memory cache.
- Idempotency cache is in-process. For multiple server instances, use Redis `SET key NX EX`.
- Still a demo: server key is regenerated on every start, no auth on `/bridge/ingest`.

## PIN verification

- Each account stores only a **salted scrypt hash** of its PIN (`pinHash`, `pinSalt`) — never the PIN.
- The sender's PIN travels **inside the encrypted payload** (like UPI's encrypted PIN block). Mesh phones can't read it; only the server's private key can.
- Settlement order: account locked? → PIN correct? → balance enough? → debit/credit. PIN is checked *before* balance so a wrong-PIN caller can't probe balances.
- **Lockout:** 3 wrong PINs lock the sender account for 15 min (`MAX_PIN_ATTEMPTS`, `PIN_LOCK_MINUTES` in `.env`). A correct PIN resets the counter. This is the real defence — a 4-digit PIN only has 10,000 combinations, so hashing alone can't protect it if the DB leaks.
- Rejected payments are stored in the ledger with a `reason`: `INVALID_PIN`, `ACCOUNT_LOCKED`, `INSUFFICIENT_BALANCE`, and `/api/bridge/ingest` returns outcome `REJECTED` (it used to say `SETTLED` for these).
- A rejected packet is *consumed* (its hash stays in the idempotency cache), so re-delivering the same packet can't be used to guess PINs; the user must create a new payment.
- **Demo PINs:** alice `1234`, bob `2345`, carol `3456`, dave `4567`. Use a different sender's PIN to see a rejection; the dashboard's “🔓 Unlock Accounts” clears lockouts.
- Existing accounts in a persistent `MONGO_URI` database that were created before this change get a demo PIN automatically on startup.
