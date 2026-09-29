import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * PGlite test-database bootstrapping — schema DDL + data-dir template caches.
 *
 * Both caches live under `node_modules/.cache/dialog-survey/` keyed by content
 * hashes, so a `prisma/schema.prisma` change invalidates them automatically.
 * Everything is lazy and per-process memoized: test files that never touch the
 * database pay zero cost, and pure unit/smoke runs never spawn the Prisma CLI
 * (design DD-006).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey');
const DDL_CACHE_PATH = path.join(CACHE_DIR, 'test-schema.sql');
const TEMPLATE_FILE_PREFIX = 'pglite-template-';
const TEMPLATE_FILE_SUFFIX = '.tar';

let ddlPromise: Promise<string> | undefined;
let templatePromise: Promise<Blob> | undefined;
let activeTemplatePath: string | undefined;
let templateDisabled = false;

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function writeFileAtomic(filePath: string, content: string | Buffer): void {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

/**
 * Test schema DDL via `prisma migrate diff --from-empty --to-schema`.
 * Cache key = SHA-256 of `prisma/schema.prisma`; a key mismatch (or missing /
 * corrupt cache) regenerates and overwrites — only a failed spawn throws, and
 * the message points at the `npm run prisma:generate` precheck.
 */
export async function getTestSchemaDdl(): Promise<string> {
  ddlPromise ??= loadOrBuildDdl();
  return ddlPromise;
}

async function loadOrBuildDdl(): Promise<string> {
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const hash = sha256(schema);
  const cached = readDdlCache();
  if (cached?.hash === hash && cached.ddl) return cached.ddl;

  const ddl = generateDdl();
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    writeFileAtomic(
      DDL_CACHE_PATH,
      JSON.stringify({ hash, ddl, generatedAt: new Date().toISOString() })
    );
  } catch {
    // Best effort: the fresh DDL is returned even when persisting fails.
  }
  return ddl;
}

function readDdlCache(): { hash?: string; ddl?: string } | undefined {
  try {
    return JSON.parse(fs.readFileSync(DDL_CACHE_PATH, 'utf8')) as { hash?: string; ddl?: string };
  } catch {
    return undefined;
  }
}

function generateDdl(): string {
  const result = spawnSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 180_000,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0) {
    const cause = (result.error?.message ?? result.stderr ?? result.stdout ?? '').trim();
    throw new Error(
      `Failed to generate the test schema DDL (\`prisma migrate diff\`). Run \`npm run prisma:generate\` (or \`npm ci\`) first, then re-run the tests. Cause: ${cause || `exit code ${String(result.status)}`}`
    );
  }
  return result.stdout;
}

/** Applies the test schema to a fresh PGlite instance (#152 swaps the DDL source here). */
export async function applyTestSchema(pglite: PGlite): Promise<void> {
  await pglite.exec(await getTestSchemaDdl());
}

/**
 * Data-dir template with the schema applied and zero rows — the fast path
 * booted by every `createTestPglite()`. Memoized per process and persisted
 * under a name keyed by the DDL hash, so schema changes rebuild it.
 */
export async function getTemplateDataDir(): Promise<Blob> {
  templatePromise ??= loadOrBuildTemplate();
  return templatePromise;
}

async function loadOrBuildTemplate(): Promise<Blob> {
  const ddl = await getTestSchemaDdl();
  const templatePath = path.join(
    CACHE_DIR,
    `${TEMPLATE_FILE_PREFIX}${sha256(ddl)}${TEMPLATE_FILE_SUFFIX}`
  );
  activeTemplatePath = templatePath;
  if (fs.existsSync(templatePath)) {
    try {
      return new Blob([fs.readFileSync(templatePath)]);
    } catch {
      // A racing worker removed the template between the check and the read —
      // fall through and rebuild.
    }
  }

  const builder = new PGlite();
  try {
    await builder.waitReady;
    await builder.exec(ddl);
    const dump = await builder.dumpDataDir('none');
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      writeFileAtomic(templatePath, Buffer.from(await dump.arrayBuffer()));
      removeStaleTemplates(path.basename(templatePath));
    } catch {
      // Best effort: a racing worker may hold the path; the in-memory dump
      // still serves this process, and stale-template cleanup is deferred
      // to the next successful write.
    }
    return dump;
  } finally {
    await builder.close();
  }
}

/**
 * Boots a fresh in-memory test database. Fast path loads the data-dir
 * template; a template that fails to initialize is discarded (forcing a
 * rebuild by the next process) and this instance falls back to a fresh PGlite
 * with the DDL replayed. After a failure the rest of this process skips the
 * template entirely, so later instances go straight to the replay path instead
 * of re-failing on the memoized bad template.
 */
export async function createTestPglite(): Promise<PGlite> {
  if (!templateDisabled) {
    const template = await getTemplateDataDir();
    const preloaded = new PGlite({ loadDataDir: template });
    try {
      await preloaded.waitReady;
      return preloaded;
    } catch {
      await closeQuietly(preloaded);
      discardTemplate();
      templateDisabled = true;
    }
  }

  const pglite = new PGlite();
  await pglite.waitReady;
  await applyTestSchema(pglite);
  return pglite;
}

async function closeQuietly(pglite: PGlite): Promise<void> {
  try {
    await pglite.close();
  } catch {
    // A PGlite whose initialization failed also fails to close; there is
    // nothing left to release.
  }
}

function discardTemplate(): void {
  if (!activeTemplatePath) return;
  try {
    fs.rmSync(activeTemplatePath, { force: true });
  } catch {
    // Best effort — a later process rebuilds it anyway.
  }
}

function removeStaleTemplates(currentFileName: string): void {
  for (const entry of fs.readdirSync(CACHE_DIR)) {
    if (!entry.startsWith(TEMPLATE_FILE_PREFIX) || entry === currentFileName) continue;
    try {
      fs.rmSync(path.join(CACHE_DIR, entry), { force: true });
    } catch {
      // In use by a concurrent worker; cleaned up by a later run.
    }
  }
}
