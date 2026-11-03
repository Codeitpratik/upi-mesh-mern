import mongoose from 'mongoose';
import { config } from './config.js';
import { Account } from './models/Account.js';
import { Transaction } from './models/Transaction.js';

let memServer = null;

export async function connectDb() {
  let uri = config.mongoUri;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri('upimesh');
    console.log('[db] MONGO_URI not set -> using in-memory MongoDB');
  }
  await mongoose.connect(uri);
  // make sure the unique index on packetHash exists (DB-level idempotency fallback)
  await Promise.all([Account.init(), Transaction.init()]);
  console.log('[db] connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
}
