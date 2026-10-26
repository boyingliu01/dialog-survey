#!/usr/bin/env node
/**
 * migrate-deploy.mjs — apply prisma/migrations/ without the Prisma CLI.
 *
 * Issue #210. The Docker image prunes build-time tooling (scripts/prune-runtime-deps.mjs),
 * which removes the `prisma` package — ~40 MB of CLI plus @prisma/dev, Prisma Studio and
 * the schema-engine binary, none of which a running server loads. That left the image
 * with no way to run `migrate deploy`, which it must do before boot so the app never
 * starts against a stale schema.
 *
 * Rather than keeping the whole CLI for one command, this applies the SQL directly with
 * `pg`, which the app already depends on. The hard part is not the SQL — it is the
 * bookkeeping. `migration.sql` files are NOT idempotent (init has 16 CREATE TABLE /
 * CREATE TYPE statements; the second migration is a bare `ALTER TABLE ... DROP COLUMN`),
 * so re-running one fails. Execution state therefore has to be recorded.
 *
 * That state lives in `_prisma_migrations`, in the format the Prisma CLI writes, so the
 * two stay interchangeable in both directions: a database migrated by `prisma migrate
 * deploy` (deploy.sh, a developer machine) is recognised here, and a database migrated
 * here is recognised by `prisma migrate deploy` later. A private table would silently
 * desynchronise the two paths — the failure mode being migrations applied twice.
 *
 * Checksums match Prisma's: SHA-256 over the raw migration.sql bytes.
 *
 * Usage:  node scripts/migrate-deploy.mjs [--dir <projectDir>] [--dry-run]
 * Env:    DATABASE_URL (required)
 *
 * Exit codes: 0 = schema up to date, 1 = a migration failed, 2 = usage/config error.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/** Resolve the project root and migration directory from argv. */
function parseArgs(argv) {
  const flags = { dir: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--dir') {
      flags.dir = argv[i + 1];
      i += 1;
      if (!flags.dir) throw new Error('--dir requires a value');
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(
        'Usage: node scripts/migrate-deploy.mjs [--dir <projectDir>] [--dry-run]\n'
      );
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return flags;
}

/** Every migration on disk, oldest first, with its checksum. */
function listMigrations(migrationsDir) {
  if (!existsSync(migrationsDir)) {
    throw new Error(`migrations directory not found: ${migrationsDir}`);
  }
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sqlPath = join(migrationsDir, name, 'migration.sql');
      if (!existsSync(sqlPath)) return null;
      const sql = readFileSync(sqlPath);
      return {
        name,
        sql: sql.toString('utf8'),
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    })
    .filter((migration) => migration !== null);
}

/**
 * Create `_prisma_migrations` if absent.
 *
 * The column layout is copied from the Prisma CLI rather than invented, because the two
 * tools must read and write the same table. `applied_steps_count` was added in Prisma 4
 * and is NOT NULL with no default there, so it is given one here — rows written by this
 * script would otherwise violate the constraint the CLI's own DDL carries.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

/** Migration names already applied successfully, mapped to their recorded checksum. */
async function loadApplied(client) {
  const { rows } = await client.query(
    `SELECT "migration_name", "checksum" FROM "_prisma_migrations"
     WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`
  );
  return new Map(rows.map((row) => [row.migration_name, row.checksum]));
}

/**
 * Apply one migration inside its own transaction.
 *
 * Per-migration transactions (not one for the whole run) match `migrate deploy`: a failure
 * leaves earlier migrations applied and recorded, so a retry resumes rather than replays.
 * PostgreSQL DDL is transactional, so a mid-migration failure rolls back cleanly and the
 * row is recorded as failed rather than as applied.
 */
async function applyMigration(client, migration) {
  const id = crypto.randomUUID();
  await client.query('BEGIN');
  try {
    // Record the attempt first, so a crash mid-SQL leaves evidence behind.
    await client.query(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "logs")
       VALUES ($1, $2, $3, NULL)`,
      [id, migration.checksum, migration.name]
    );
    await client.query(migration.sql);
    await client.query(
      `UPDATE "_prisma_migrations"
       SET "finished_at" = now(), "applied_steps_count" = 1
       WHERE "id" = $1`,
      [id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // Re-record the failure outside the rolled-back transaction, so it is visible.
    await client.query(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "logs", "finished_at")
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT ("id") DO NOTHING`,
      [id, migration.checksum, migration.name, String(error?.message ?? error)]
    );
    throw error;
  }
}

/**
 * Refuse to run when history and disk disagree.
 *
 * A checksum mismatch means migration.sql was edited after being applied — the database no
 * longer reflects what the file says. Silently skipping it (or worse, re-applying it) would
 * build on an unknown schema, so this stops instead. `prisma migrate resolve` is the
 * documented escape hatch, and it is unchanged by this script.
 */
function assertChecksums(applied, migrations) {
  for (const migration of migrations) {
    const recorded = applied.get(migration.name);
    if (recorded && recorded !== migration.checksum) {
      throw new Error(
        `migration ${migration.name} was modified after being applied (recorded ${recorded}, on disk ${migration.checksum}). Restore the file, or use \`prisma migrate resolve\` to record the new state.`
      );
    }
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const migrations = listMigrations(join(flags.dir, 'prisma', 'migrations'));
  if (migrations.length === 0) {
    process.stdout.write('[migrate] no migrations found; nothing to do\n');
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (flags.dryRun) {
      // Read-only: report the plan without creating the history table.
      const { rows } = await client.query(
        `SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present`
      );
      const applied = rows[0]?.present ? await loadApplied(client) : new Map();
      assertChecksums(applied, migrations);
      const pending = migrations.filter((m) => !applied.has(m.name));
      const pendingNames = pending.length ? `: ${pending.map((m) => m.name).join(', ')}` : '';
      process.stdout.write(
        `[migrate] ${applied.size} applied, ${pending.length} pending${pendingNames}\n`
      );
      return;
    }

    await ensureMigrationsTable(client);
    const applied = await loadApplied(client);
    assertChecksums(applied, migrations);

    const pending = migrations.filter((m) => !applied.has(m.name));
    if (pending.length === 0) {
      process.stdout.write(`[migrate] up to date (${applied.size} migration(s))\n`);
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`[migrate] applying ${migration.name} ... `);
      await applyMigration(client, migration);
      process.stdout.write('ok\n');
    }
    process.stdout.write(`[migrate] applied ${pending.length} migration(s)\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`[migrate] FAILED: ${error?.message ?? error}\n`);
  // Exit 1 for a migration failure, 2 for a usage/config problem.
  process.exit(error?.code === 'ERR_USAGE' ? 2 : 1);
});
