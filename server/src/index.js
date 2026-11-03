import { config } from './config.js';
import { connectDb } from './db.js';
import { seedAccounts } from './services/demo.js';
import { idempotency } from './services/idempotency.js';
import { createApp } from './app.js';

await connectDb();
await seedAccounts();

setInterval(() => idempotency.evictExpired(), 60_000).unref();

createApp().listen(config.port, () =>
  console.log(`API running -> http://localhost:${config.port}  (dashboard: http://localhost:5173 in dev)`)
);
