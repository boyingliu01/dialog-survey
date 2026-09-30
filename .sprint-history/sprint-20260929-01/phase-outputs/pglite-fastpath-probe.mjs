// One-off measurement: PGlite setup fast paths for the Stage B TestDatabase helper.
// Lives in .sprint-state (gitignored) — results are folded into criterion #12 evidence.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import * as pgliteAdapter from 'pglite-prisma-adapter';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey', 'test-schema.sql');

const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const hash = crypto.createHash('sha256').update(schema).digest('hex');
if (!fs.existsSync(CACHE)) throw new Error('DDL cache miss — run the spike first');
const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
if (cached.hash !== hash) throw new Error('DDL cache stale — rerun the spike');
const ddl = cached.ddl;

const Ctor = pgliteAdapter.PrismaPGlite ?? pgliteAdapter.default;
const rss = () => Math.round(process.memoryUsage().rss / 1048576);

async function timed(label, fn) {
  const t = Date.now();
  const value = await fn();
  return { label, ms: Date.now() - t, rssMb: rss(), value };
}

async function withPrisma(pglite) {
  const prisma = new PrismaClient({ adapter: new Ctor(pglite) });
  const n = await prisma.template.count();
  await prisma.$disconnect();
  return n;
}

const rows = [];

// A — current assumption: replay DDL into a fresh instance
for (let i = 0; i < 3; i++) {
  rows.push(
    await timed(`A${i} exec-ddl + prisma`, async () => {
      const p = new PGlite();
      await p.exec(ddl);
      const n = await withPrisma(p);
      await p.close();
      return n;
    })
  );
}

// build the template dump once (represents `globalSetup` work)
const template = await timed('template: exec-ddl + dumpDataDir', async () => {
  const p = new PGlite();
  await p.exec(ddl);
  const dump = await p.dumpDataDir('none');
  await p.close();
  return dump;
});
const dumpBytes = template.value instanceof Blob ? template.value.size : 0;

// B — fast path: load the pre-baked data dir instead of replaying DDL
for (let i = 0; i < 3; i++) {
  rows.push(
    await timed(`B${i} loadDataDir + prisma`, async () => {
      const p = new PGlite({ loadDataDir: template.value });
      const n = await withPrisma(p);
      await p.close();
      return n;
    })
  );
}

// C — same as B but without per-instance prisma round trip (pure PGlite boot cost)
for (let i = 0; i < 2; i++) {
  rows.push(
    await timed(`C${i} loadDataDir only`, async () => {
      const p = new PGlite({ loadDataDir: template.value });
      const r = await p.query('SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1', ['public']);
      await p.close();
      return r.rows[0].n;
    })
  );
}

console.log('rows:', JSON.stringify(rows, null, 1));
console.log('dump bytes:', dumpBytes, '| template build ms:', template.ms, '| final rss', rss());
