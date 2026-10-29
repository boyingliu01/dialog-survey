import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The container deployment has to be safe by default, because every one of
 * these defects was a default that looked fine and failed later:
 *
 *   #214  compose `env_file` interpolation eats the `$` in a bcrypt hash
 *   #215  postgres published on 0.0.0.0:5432 with a weak default password
 *   #216  REPORTS_DIR had no volume, so exported reports died with the container
 *   #217  the CJK font is a Git LFS pointer the build never fetched
 *   #218  the healthcheck read only `r.ok`, so `degraded` looked `healthy`
 *
 * YAML and Dockerfile are parsed as text on purpose: no YAML dependency, and a
 * structural assertion ("this key exists, with this value") is exactly what the
 * regression looks like. `tests/docker-font-asset.test.ts` covers the font
 * COPY rules; `tests/docker-engine-consistency.test.ts` covers the Node
 * version; this file covers the defects that are pure configuration.
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

/** Non-comment, non-empty lines of a file. */
function activeLines(file: string): string[] {
  return read(file)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trimEnd())
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
}

const compose = activeLines('docker-compose.yml').join('\n');
const dockerfile = activeLines('Dockerfile').join('\n');

/** The body of one compose service, as a text block. */
function serviceBlock(name: string): string {
  const lines = activeLines('docker-compose.yml');
  const start = lines.findIndex((line) => line.trim() === `${name}:`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('docker-compose.yml defaults (issues #215, #216, #218)', () => {
  it('drops the obsolete top-level version key', () => {
    // compose v2 warns `the attribute 'version' is obsolete` on every command.
    expect(compose).not.toMatch(/^version:\s*/m);
  });

  it('does not publish the postgres port to the host', () => {
    const postgres = serviceBlock('postgres');

    // The app reaches it as `postgres:5432` on the compose network. A host
    // mapping only collides with a local PostgreSQL and exposes the database.
    expect(postgres).not.toMatch(/^\s*ports:/m);
    expect(postgres).not.toContain('5432:5432');
  });

  it('fails fast when POSTGRES_PASSWORD is unset instead of defaulting to a placeholder', () => {
    // `${VAR:-default}` silently accepts a missing password. `:?` refuses to
    // start, which is the only safe default for a database password.
    expect(compose).not.toContain('change-me-in-env');
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:-/);
    expect(compose).toMatch(/POSTGRES_PASSWORD:\?/);
    // Both the database and the app's DATABASE_URL must use the required form,
    // or the app would start with a password the database never had.
    expect(compose.match(/POSTGRES_PASSWORD:\?/g)?.length).toBe(2);
  });

  it('gives the app a persistent volume for exported reports', () => {
    const app = serviceBlock('app');

    expect(app).toMatch(/reports_data:\/app\/reports/);
    // Declared at the top level, or compose refuses to start.
    expect(compose).toMatch(/^volumes:$/m);
    expect(compose).toMatch(/^\s{2}reports_data:$/m);
  });

  it('states REPORTS_DIR explicitly instead of relying on the code default', () => {
    const app = serviceBlock('app');

    expect(app).toMatch(/REPORTS_DIR:\s*\/app\/reports/);
  });

  it('points the healthcheck at /health/ready and parses the body', () => {
    const app = serviceBlock('app');

    expect(app).toContain('/health/ready');
    // `r.ok` alone is what made a degraded deployment green; the body must be
    // inspected as well so the status-code and body verdicts cannot diverge.
    expect(app).toContain("body.status === 'healthy'");
    expect(app).not.toMatch(/process\.exit\(r\.ok \? 0 : 1\)/);
  });

  it('allows the first readiness probe to finish: start_period covers the 30s LLM timeout', () => {
    const app = serviceBlock('app');

    const startPeriod = /start_period:\s*(\d+)s/.exec(app)?.[1];
    expect(startPeriod).toBeDefined();
    expect(Number(startPeriod)).toBeGreaterThanOrEqual(60);
  });

  it('documents the compose `$` escaping next to the bcrypt hash guidance', () => {
    // Issue #214: this is the trap nobody could find. The note has to live
    // where someone editing .env will see it — and it is a comment in
    // docker-compose.yml, so it must be read from the raw file (activeLines
    // strips comments).
    const rawCompose = read('docker-compose.yml');

    expect(rawCompose).toContain('$$');
    expect(rawCompose).toContain('ADMIN_PASSWORD_HASH');
    expect(read('.env.example')).toContain('$$');
  });
});

describe('Dockerfile deployment defaults (issues #217, #218)', () => {
  it('verifies the CJK font bytes during the build', () => {
    // A 133-byte LFS pointer passes every existence check and silently breaks
    // every exported PDF. The verifier fails the build instead.
    expect(dockerfile).toMatch(/verify-font-asset\.mjs/);
  });

  it('ships the verifier in the runner stage that actually runs it', () => {
    expect(dockerfile).toMatch(/COPY --from=builder \/app\/scripts\/verify-font-asset\.mjs/);
  });

  it('probes /health/ready in HEALTHCHECK and parses the body', () => {
    const healthcheck = /HEALTHCHECK[\s\S]*?CMD node -e "(.*)"/.exec(dockerfile)?.[1];

    expect(healthcheck).toBeDefined();
    expect(healthcheck).toContain('/health/ready');
    expect(healthcheck).toContain("body.status === 'healthy'");
  });

  it('gives the container healthcheck enough time for the first LLM probe', () => {
    const startPeriod = /HEALTHCHECK[^\n]*--start-period=(\d+)s/.exec(dockerfile)?.[1];

    expect(Number(startPeriod)).toBeGreaterThanOrEqual(60);
  });
});

describe('.env.example documents the deployment traps', () => {
  it('explains the compose $ escaping for ADMIN_PASSWORD_HASH', () => {
    const envExample = read('.env.example');

    expect(envExample).toContain('$$');
    expect(envExample.toLowerCase()).toContain('docker compose');
  });

  it('does not ship REPORTS_DIR without a word about the volume', () => {
    // The value itself is fine (`./reports` is right for a direct install); the
    // point is that the compose deployment overrides it with /app/reports.
    expect(read('.env.example')).toContain('REPORTS_DIR=');
  });
});
