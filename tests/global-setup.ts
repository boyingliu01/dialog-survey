// @no-test-required: Vitest globalSetup bootstrap; its guard runs on every test invocation, so the whole suite exercises it
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_CLIENT = path.join(ROOT, 'src', 'generated', 'prisma', 'client.ts');

/**
 * Generated-artifact guard only (design DD-006): `src/generated/prisma` is
 * gitignored, so tsc/vitest on a fresh checkout fail without a generate step.
 * One automatic fallback generate on the failure path; the DDL/template caches
 * are NOT touched here — they stay lazy in the first TestDatabase.setup(), so
 * pure unit/smoke runs never spawn the Prisma CLI.
 */
export default function globalSetup(): void {
  if (fs.existsSync(GENERATED_CLIENT)) return;

  const result = spawnSync('npm', ['run', 'prisma:generate'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180_000,
  });
  if (result.error || result.status !== 0 || !fs.existsSync(GENERATED_CLIENT)) {
    const cause = (result.error?.message ?? result.stderr ?? result.stdout ?? '').trim();
    throw new Error(
      `Generated Prisma client is missing (${GENERATED_CLIENT}). Run \`npm run prisma:generate\` first. Cause: ${cause || `exit code ${String(result.status)}`}`
    );
  }
}
