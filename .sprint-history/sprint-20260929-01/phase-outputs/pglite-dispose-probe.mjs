// One-off probe (Stage B design): verify that PrismaClient.$disconnect() reaches the
// pglite-prisma-adapter adapter.dispose() seam, and that pglite.close() is idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import * as adapterPkg from 'pglite-prisma-adapter';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey', 'test-schema.sql');
if (!fs.existsSync(CACHE)) throw new Error('DDL cache missing — run the spike first');
const { ddl } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

const Ctor = adapterPkg.PrismaPGlite ?? adapterPkg.default;
const { PrismaClient } = await import(
  new URL('../../src/utils/prisma-client.js', import.meta.url).href
);

// --- 1. wrap factory.connect -> adapter.dispose instrumentation
const pglite = new PGlite();
await pglite.exec(ddl);
const factory = new Ctor(pglite);
let disposeFired = 0;
let connectCalls = 0;
const origConnect = factory.connect.bind(factory);
factory.connect = async () => {
  connectCalls += 1;
  const adapter = await origConnect();
  const origDispose = adapter.dispose.bind(adapter);
  adapter.dispose = async () => {
    disposeFired += 1;
    await origDispose();
  };
  return adapter;
};

const client = new PrismaClient({ adapter: factory });
const ok = await client.$queryRaw`SELECT 1 AS ok`;
console.log('query ok:', JSON.stringify(ok));
console.log('connectCalls after query:', connectCalls);
await client.$disconnect();
console.log('after $disconnect -> disposeFired:', disposeFired);

// --- 2. reconnect after $disconnect (informational)
try {
  const again = await client.$queryRaw`SELECT 2 AS ok`;
  console.log('post-disconnect query OK:', JSON.stringify(again), '| connectCalls:', connectCalls, '| disposeFired:', disposeFired);
} catch (e) {
  console.log('post-disconnect query FAILED:', e.constructor.name, String(e.message).slice(0, 160));
}
await client.$disconnect().catch(() => {});
console.log('after second $disconnect -> disposeFired:', disposeFired);

// --- 3. close() idempotency
await pglite.close();
try {
  await pglite.close();
  console.log('second close(): OK (idempotent)');
} catch (e) {
  console.log('second close() THREW:', e.constructor.name, String(e.message).slice(0, 160));
}

// --- 4. waitReady rejects on bad loadDataDir? (fallback detectability)
const badBlob = new Blob([Buffer.from('not a tarball')]);
const broken = new PGlite({ loadDataDir: badBlob });
try {
  await broken.waitReady;
  console.log('bad loadDataDir: waitReady RESOLVED (no fast-fail)');
} catch (e) {
  console.log('bad loadDataDir: waitReady REJECTED:', e.constructor.name, String(e.message).slice(0, 160));
}
await broken.close().catch(() => {});

// --- 5. factory has own dispose? (seam shape)
console.log('factory has dispose prop:', typeof factory.dispose);
