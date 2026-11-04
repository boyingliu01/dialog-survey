#!/usr/bin/env node

/**
 * dialog-survey CLI — npx-based install and lifecycle management
 *
 * Commands: install, uninstall, start, stop, status, help
 * Uses only Node.js builtins plus bcryptjs (pure JS, already a runtime dependency)
 * for admin password hashing.
 */

import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

// ─── Constants ───────────────────────────────────────────────────────────────

const INSTALL_DIR = join(homedir(), '.dialog-survey');
const PM2_APP_NAME = 'dialog-survey';
const HEALTH_URL = 'http://localhost:3001/health';
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;
const MIN_NODE_VERSION = '20.19.0';

/**
 * Files/directories copied from the package root into the install directory
 * (Step 5). Must stay in sync with the `files` field in package.json:
 * - `scripts/` holds the `bin` target (`scripts/cli.mjs`), so lifecycle
 *   commands resolve inside the install dir (issue #195);
 * - `VERSION` is the primary source for getAppVersion() (issue #191).
 * `package-lock.json` is listed for source-tree installs; npm strips it from
 * published tarballs, so existsSync() simply skips it there (issue #188).
 */
export const filesToCopy = [
  'package.json',
  'package-lock.json',
  'dist',
  'prisma',
  'src/views',
  'public',
  'prisma.config.ts',
  'ecosystem.config.cjs',
  'scripts',
  'VERSION',
];

/**
 * Single source of truth for secret-bearing environment keys (issue #193).
 * Everything else is derived from this list so the two consumers can never
 * drift apart again (review finding on #195):
 *   - `isSecretEnvKey()` → the scrub filter for the service-manager child env
 *   - `secretEnvLineRegex` → the .env line scan behind checkPm2DumpSecurity
 */
const SECRET_ENV_KEY_NAMES = [
  'DATABASE_URL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
  'ENCRYPTION_KEY',
  'SESSION_SECRET',
  'SESSION_SALT',
  'ADMIN_API_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_HASH',
];

/**
 * Operator exports that carry no app prefix but are secrets all the same —
 * scrubbed defensively even though the app itself never reads them
 * (PGPASSWORD, AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN, …).
 */
const SECRET_ENV_KEY_HEURISTIC =
  /(PASSWORD|PASSWD|SECRET|TOKEN|CREDENTIAL|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)/i;

/**
 * True when an environment variable name must never reach a service-manager
 * child process (issue #193). DIALOG_SURVEY_*-prefixed keys are always
 * secret-bearing, well-known app keys are matched exactly, and anything whose
 * name looks like a credential is scrubbed as well.
 *
 * @param {string | undefined} key
 * @returns {boolean}
 */
export function isSecretEnvKey(key) {
  if (!key) return false;
  if (key.startsWith('DIALOG_SURVEY_')) return true;
  if (SECRET_ENV_KEY_NAMES.includes(key)) return true;
  return SECRET_ENV_KEY_HEURISTIC.test(key);
}

/** .env KEY=VALUE line matcher derived from the same name list (dump scan). */
const secretEnvLineRegex = new RegExp(`^(?:${SECRET_ENV_KEY_NAMES.join('|')})=(.+)$`, 'gm');

/**
 * Subset of SECRET_ENV_KEY_NAMES whose *names* are scanned in dump.pm2 —
 * true secrets only: LLM_MODEL / LLM_BASE_URL / DINGTALK_AGENT_ID /
 * ADMIN_USERNAME are not secret and would only add false-positive noise.
 * @type {string[]}
 */
const SCAN_SECRET_NAMES = SECRET_ENV_KEY_NAMES.filter((name) =>
  /PASSWORD|SECRET|TOKEN|CREDENTIAL|API_?KEY|DATABASE_URL|^ENCRYPTION_KEY$/.test(name)
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Execute a shell command synchronously, returning stdout.
 * Throws with stderr on failure.
 */
export function exec(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

/**
 * Copy of the current environment with every secret-bearing key removed —
 * the env handed to the service-manager child process (issue #193).
 * Non-secret entries (PATH, HOME, proxy settings, …) are preserved so pm2 /
 * node still resolve normally.
 *
 * @param {Record<string, string | undefined>} [base=process.env]
 * @returns {Record<string, string>}
 */
export function scrubbedProcessEnv(base = process.env) {
  return Object.fromEntries(Object.entries(base).filter(([key]) => !isSecretEnvKey(key)));
}

/**
 * Print a message to stdout.
 */
function log(msg) {
  process.stdout.write(`${msg}\n`);
}

/**
 * Print an error message to stderr.
 */
function logError(msg) {
  process.stderr.write(`Error: ${msg}\n`);
}

/**
 * Start the dialog-survey service via the appropriate process manager.
 * Uses PM2 on Linux/macOS, falls back to direct node on Windows.
 * Shared between installCommand and startCommand.
 */
/**
 * Start under PM2. Fails loudly when the published entry point is missing,
 * instead of letting PM2 report a cryptic "Script not found" after npm install
 * and migrations have already run (issue #186).
 */
function startViaPm2() {
  const entry = join(INSTALL_DIR, 'dist/src/server-entry.js');
  if (!existsSync(entry)) {
    logError(`Expected entry point not found in package: ${entry}`);
    logError('The installed package is inconsistent — aborting PM2 start.');
    process.exitCode = 1;
    return;
  }
  try {
    // Scrub secrets from the child env: PM2 persists the full env of every
    // started process into ~/.pm2/dump.pm2 on `pm2 save` (0644 by default),
    // which would leak keys the operator exported for the install (issue #193).
    // The app reads its secrets from the 0600 .env file.
    // --update-env matters on upgrades: when the app is already registered,
    // `pm2 start` is a restart that silently keeps the OLD environment unless
    // --update-env is given — stale secrets from a pre-#193 install would
    // survive every re-install otherwise (review finding on #195).
    exec(`pm2 start ecosystem.config.cjs --name ${PM2_APP_NAME} --env production --update-env`, {
      cwd: INSTALL_DIR,
      env: scrubbedProcessEnv(),
    });
    log('PM2 process started ✓');
  } catch (err) {
    logError(`PM2 start failed: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * Start the node process directly. PM2 is unstable on Windows, so this is the
 * default there.
 */
function startDirectly() {
  log('Starting service directly (PM2 is unstable on Windows, using direct node)...');
  if (isDirectServiceRunning()) {
    // Double-start guard: a second instance would die on the busy port and
    // overwrite the pidfile with its own (dead) PID, corrupting stop/status.
    log('  Direct process already running (pidfile) — keeping it. Run stop first for a restart.');
    return;
  }
  try {
    startViaNode(INSTALL_DIR);
    log('Direct process started ✓');
  } catch (err) {
    logError(`Direct start failed: ${err.message}`);
    process.exitCode = 1;
  }
}

async function startViaServiceManager() {
  const platformCheck = checkPlatformDeps();
  if (platformCheck.serviceManager === 'pm2') {
    startViaPm2();
    return;
  }
  startDirectly();
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

/**
 * Parse CLI arguments into a command name and a flags object.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ command: string, flags: Record<string, string>, positional: string[] }}
 */
/**
 * Read the value for a `--flag`, or 'true' when it takes none.
 *
 * Returns the index the caller should resume from, so the caller never has to
 * reason about consuming the value itself.
 */
function readFlagValue(argv, index) {
  const next = argv[index + 1];
  if (next && !next.startsWith('--')) {
    return { value: next, nextIndex: index + 1 };
  }
  return { value: 'true', nextIndex: index };
}

export function parseArgs(argv) {
  const command = argv[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const consumed = readFlagValue(argv, i);
    flags[arg.slice(2)] = consumed.value;
    i = consumed.nextIndex;
  }

  return { command, flags, positional };
}

// ─── Config Generation ───────────────────────────────────────────────────────

/**
 * Which CLI flag fills each canonical config key.
 *
 * A table rather than nine `||` expressions: the mapping is data, and writing it
 * as data means adding a key is one row instead of a parallel edit in three
 * functions (this file used to list the nine keys in CONFIG_KEYS, here, and
 * again in the env reader, with nothing tying them together).
 */
const FLAG_FOR_KEY = {
  DATABASE_URL: 'db-url',
  LLM_API_KEY: 'llm-api-key',
  LLM_BASE_URL: 'llm-base-url',
  LLM_MODEL: 'llm-model',
  DINGTALK_CLIENT_ID: 'dingtalk-client-id',
  DINGTALK_CLIENT_SECRET: 'dingtalk-client-secret',
  DINGTALK_AGENT_ID: 'dingtalk-agent-id',
  ADMIN_USERNAME: 'admin-username',
  ADMIN_PASSWORD: 'admin-password',
};

/**
 * Generate config object from CLI flags.
 *
 * @param {Record<string, string>} flags
 * @returns {Record<string, string>}
 */
export function generateConfigFromFlags(flags) {
  const config = {};
  for (const key of CONFIG_KEYS) {
    const flag = FLAG_FOR_KEY[key];
    config[key] = (flag && flags[flag]) || '';
  }
  return config;
}

/**
 * Check if all required config values are present.
 *
 * @param {Record<string, string>} config
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateConfig(config) {
  const required = [
    'DATABASE_URL',
    'DINGTALK_CLIENT_ID',
    'DINGTALK_CLIENT_SECRET',
    'DINGTALK_AGENT_ID',
  ];
  const missing = required.filter((key) => !config[key]);
  return { valid: missing.length === 0, missing };
}

// Canonical config keys shared by every non-interactive input channel.
export const CONFIG_KEYS = [
  'DATABASE_URL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
];

/**
 * Build a config object from DIALOG_SURVEY_* environment variables. Reading
 * secrets from the environment (not argv) keeps them out of `ps` and the npm
 * debug logs under ~/.npm/_logs (issue #190).
 *
 * Driven off CONFIG_KEYS rather than a hand-written object, so the env reader
 * cannot fall behind a key added to the flag reader.
 */
export function generateConfigFromEnv() {
  const config = {};
  for (const key of CONFIG_KEYS) {
    config[key] = process.env[`DIALOG_SURVEY_${key}`] || '';
  }
  return config;
}

/**
 * Parse a KEY=VALUE config file (the format produced by --config). Both plain
 * names (DATABASE_URL=...) and DIALOG_SURVEY_-prefixed names are accepted and
 * mapped to the canonical config key. Comments (#) and blank lines are ignored;
 * surrounding quotes are stripped.
 */
/**
 * Strip one layer of matching quotes from a config value.
 *
 * `.env` files commonly quote values containing spaces; leaving the quotes on
 * makes a credential subtly wrong in a way nothing reports.
 */
function unquote(value) {
  const quote = value[0];
  const quoted = quote === '"' || quote === "'";
  return quoted && value.length >= 2 && value.endsWith(quote) ? value.slice(1, -1) : value;
}

/** Map a `DIALOG_SURVEY_FOO` key to `FOO`, leaving any other key alone. */
function canonicalKey(key) {
  const prefix = 'DIALOG_SURVEY_';
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/** Parse one `KEY=value` line, or null when it assigns no config key. */
function parseConfigLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;
  const eq = line.indexOf('=');
  if (eq === -1) return null;
  const key = canonicalKey(line.slice(0, eq).trim());
  if (!CONFIG_KEYS.includes(key)) return null;
  return { key, value: unquote(line.slice(eq + 1).trim()) };
}

export function parseConfigFile(content) {
  const config = {};
  for (const rawLine of content.split('\n')) {
    const entry = parseConfigLine(rawLine);
    if (entry) config[entry.key] = entry.value;
  }
  return config;
}

/**
 * Merge several partial config sources. Later sources only fill keys that are
 * still empty, so precedence is: CLI flags > --config file > DIALOG_SURVEY_*
 * environment variables.
 */
export function mergeConfig(...sources) {
  const out = {};
  for (const src of sources) {
    for (const key of CONFIG_KEYS) {
      // First non-empty source wins, so precedence is: CLI flags > --config
      // file > DIALOG_SURVEY_* environment variables. The environment is the
      // last-resort fallback channel (issue #190), never an override.
      if (src?.[key] && !out[key]) out[key] = src[key];
    }
  }
  return out;
}

/** Read all of stdin as a UTF-8 string (used for --config -). */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Install production dependencies in the install directory.
 *
 * Prefers `npm ci` when a lockfile is present (only possible when the
 * installer runs from a source checkout — npm strips package-lock.json from
 * published tarballs even when `files` lists it), giving a deterministic tree
 * that sidesteps the arborist `edgesOut` crash that bare `npm install
 * --omit=dev` hit on 1.11.0 (issue #188). Falls back to `npm install
 * --omit=dev --legacy-peer-deps` when there is no lockfile or `npm ci` fails.
 * Returns the command that succeeded.
 *
 * @param {string} installDir
 * @returns {string}
 */
export function installDependencies(installDir) {
  if (existsSync(join(installDir, 'package-lock.json'))) {
    try {
      exec('npm ci --omit=dev --ignore-scripts', { cwd: installDir });
      return 'npm ci';
    } catch (err) {
      logError(`npm ci failed (${err.message}); falling back to npm install --legacy-peer-deps`);
    }
  }
  exec('npm install --omit=dev --ignore-scripts --legacy-peer-deps', { cwd: installDir });
  return 'npm install --legacy-peer-deps';
}

// ─── Interactive Prompts ─────────────────────────────────────────────────────

/**
 * Prompt user for a single value via readline.
 *
 * @param {string} question
 * @param {import("node:readline").Interface} rl
 * @returns {Promise<string>}
 */
function prompt(question, rl) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Collect config interactively via readline prompts.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function collectConfigInteractive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    log('\n📋 dialog-survey configuration\n');

    const config = {
      DATABASE_URL: await prompt('Database URL (PostgreSQL connection string): ', rl),
      LLM_API_KEY: await prompt('LLM API Key (leave empty for local LLM): ', rl),
      LLM_BASE_URL: await prompt('LLM Base URL (optional, e.g. http://localhost:11434/v1): ', rl),
      LLM_MODEL: await prompt('LLM Model (optional, e.g. qwen2.5): ', rl),
      DINGTALK_CLIENT_ID: await prompt('DingTalk Client ID: ', rl),
      DINGTALK_CLIENT_SECRET: await prompt('DingTalk Client Secret: ', rl),
      DINGTALK_AGENT_ID: await prompt('DingTalk Agent ID: ', rl),
      ADMIN_USERNAME: (await prompt('Admin username (press Enter for "admin"): ', rl)) || 'admin',
      ADMIN_PASSWORD: await prompt('Admin password (press Enter to auto-generate): ', rl),
    };

    return config;
  } finally {
    rl.close();
  }
}

/**
 * Resolve admin credentials for .env generation.
 * Username defaults to "admin"; password defaults to a random generated value.
 * The plaintext password is never written to disk — only the bcrypt hash.
 *
 * @param {Record<string, string>} config
 * @returns {Promise<{ username: string, password: string, generated: boolean, hash: string }>}
 */
export async function resolveAdminCredentials(config = {}) {
  const username = config.ADMIN_USERNAME || 'admin';
  const generated = !config.ADMIN_PASSWORD;
  const password = config.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  return { username, password, generated, hash };
}

// ─── Prerequisites ───────────────────────────────────────────────────────────

/**
 * Check Node.js version >= MIN_NODE_VERSION (semver compare, not major-only).
 * @returns {{ ok: boolean, message: string }}
 */
/** Compare two dotted numeric versions: negative, zero, or positive. */
function compareDotted(a, b) {
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkNodeVersion(version = process.versions.node) {
  if (compareDotted(version, MIN_NODE_VERSION) < 0) {
    return {
      ok: false,
      message: `Node.js >= ${MIN_NODE_VERSION} required (current: ${process.versions.node})`,
    };
  }
  return { ok: true, message: `Node.js ${process.versions.node} ✓` };
}

/**
 * Check if PostgreSQL is reachable using the given DATABASE_URL.
 * Uses a TCP socket connect instead of pg_isready for cross-platform
 * support (pg_isready is unavailable on Windows by default).
 * @param {string} databaseUrl
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkPostgres(databaseUrl, timeoutMs = 3000) {
  if (!databaseUrl) {
    return { ok: false, message: 'DATABASE_URL not provided' };
  }
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';

    await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const cleanup = () => {
        socket.destroy();
      };
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => {
        cleanup();
        resolve();
      });
      socket.on('error', (err) => {
        cleanup();
        reject(err);
      });
      socket.on('timeout', () => {
        cleanup();
        reject(new Error('timeout'));
      });
      socket.connect(Number(port), host);
    });

    return { ok: true, message: `PostgreSQL ${host}:${port} ✓` };
  } catch {
    return {
      ok: false,
      message:
        'PostgreSQL not reachable. Ensure PostgreSQL is running and DATABASE_URL is correct.',
    };
  }
}

/**
 * Check if port 3001 is available.
 * @returns {{ ok: boolean, message: string }}
 */
export function checkPort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          ok: false,
          message: 'Port 3001 is already in use. Stop the existing service first.',
        });
      } else {
        resolve({ ok: false, message: `Port check failed: ${err.message}` });
      }
    });
    server.once('listening', () => {
      server.close(() => {
        resolve({ ok: true, message: 'Port 3001 available ✓' });
      });
    });
    server.listen(3001, '0.0.0.0');
  });
}

/**
 * Run all prerequisite checks.
 * @param {string} databaseUrl
 * @returns {Promise<{ ok: boolean, messages: string[] }>}
 */
export async function checkPrerequisites(databaseUrl, options = {}) {
  const messages = [];
  let allOk = true;

  const nodeCheck = checkNodeVersion();
  messages.push(nodeCheck.message);
  if (!nodeCheck.ok) allOk = false;

  const pgCheck = await checkPostgres(databaseUrl);
  messages.push(pgCheck.message);
  if (!pgCheck.ok) allOk = false;

  if (!options.skipPortCheck) {
    const portCheck = await checkPort();
    messages.push(portCheck.message);
    if (!portCheck.ok) allOk = false;
  }

  return { ok: allOk, messages };
}

/**
 * Verify installation integrity by checking required files exist.
 * `scripts/cli.mjs` and `VERSION` are part of the shipped package and are
 * required for the install dir to be self-consistent (issues #191 / #195).
 * @param {string} installDir
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function verifyInstallation(installDir) {
  const requiredFiles = [
    'ecosystem.config.cjs',
    'dist/src/server-entry.js',
    'dist/src/server.js',
    '.env',
    'node_modules',
    'prisma.config.ts',
    'scripts/cli.mjs',
    'VERSION',
  ];

  const missing = [];
  for (const file of requiredFiles) {
    if (!existsSync(join(installDir, file))) {
      missing.push(file);
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Verify the install directory is self-consistent with its own package.json:
 * every `bin` target must have been copied, and VERSION must be present so
 * getAppVersion() takes its primary path instead of the package.json fallback
 * (issues #191 / #195).
 *
 * @param {string} installDir
 * @returns {string[]} problems found (empty array = healthy)
 */
/**
 * Normalise package.json's `bin` field to name/path pairs.
 *
 * Accepts both documented shapes: a single string (which npm records under the
 * package name) and a name-to-path map.
 */
function binEntriesOf(manifest) {
  if (typeof manifest.bin === 'string') {
    return [[manifest.name ?? 'app', manifest.bin]];
  }
  return Object.entries(manifest.bin ?? {});
}

/** Problems with `bin` targets that do not exist in the install dir. */
function binProblems(installDir, manifest) {
  const problems = [];
  for (const [name, rel] of binEntriesOf(manifest)) {
    if (typeof rel !== 'string') continue;
    if (existsSync(join(installDir, rel))) continue;
    problems.push(
      `bin "${name}" points at ${rel}, which is missing from the install dir — CLI commands will not resolve there`
    );
  }
  return problems;
}

/** Problem when the install dir has no VERSION file, or an empty list. */
function versionProblems(installDir) {
  if (existsSync(join(installDir, 'VERSION'))) return [];
  return [
    'VERSION is missing from the install dir — /health would fall back to package.json for the version (issue #191)',
  ];
}

export function verifyPackageManifest(installDir) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8'));
  } catch {
    return [`package.json is missing or unreadable in ${installDir}`];
  }

  return [...binProblems(installDir, manifest), ...versionProblems(installDir)];
}

// ─── PM2 dump security (issue #193) ───────────────────────────────────────────

/** Values shorter than this are treated as non-secrets for the dump scan. */
const MIN_SECRET_VALUE_LENGTH = 8;

/**
 * Warning for a dump.pm2 whose mode lets group or other read it, or null.
 *
 * 0400 and 0600 are both acceptable — only the group/other bits matter, because
 * the file holds the whole process environment after `pm2 save`.
 */
function pm2DumpModeWarning(dumpPath) {
  let mode = 0;
  try {
    mode = statSync(dumpPath).mode & 0o777;
  } catch {
    return null;
  }
  if ((mode & 0o077) === 0) return null;
  return `~/.pm2/dump.pm2 has mode 0${mode.toString(8)} (group/other-readable). PM2 persists the process environment there on \`pm2 save\` — tighten it with: chmod 700 ~/.pm2 && chmod 600 ~/.pm2/dump.pm2`;
}

/** The secret values declared in the install dir's .env, quotes stripped. */
function secretValuesFrom(envPath) {
  return [...readFileSync(envPath, 'utf-8').matchAll(secretEnvLineRegex)]
    .map((m) => m[1].trim().replace(/^["'](.*)["']$/, '$1'))
    .filter((v) => v.length >= MIN_SECRET_VALUE_LENGTH);
}

/**
 * Warning when the dump still carries secrets from the service environment, or
 * null.
 *
 * Two independent signals, because they answer different questions: a matching
 * *value* proves the secret itself is in the file, while a matching *key name*
 * proves the operator's shell env reached a PM2 daemon that dumps every app —
 * and so may belong to a different app entirely.
 */
function pm2DumpLeakWarning(dump, envPath) {
  const secretValues = secretValuesFrom(envPath);
  const leakedValues = secretValues.filter((v) => dump.includes(v));
  const leakedKeys = SCAN_SECRET_NAMES.filter((k) => dump.includes(k));
  if (leakedValues.length === 0 && leakedKeys.length === 0) return null;
  return `~/.pm2/dump.pm2 contains ${leakedValues.length} plaintext secret value(s) and ${leakedKeys.length} secret key name(s) from the service environment. Restart with \`pm2 restart ${PM2_APP_NAME} --update-env\` from a shell WITHOUT the secrets exported, re-run \`pm2 save\`, then rotate those secrets (issue #193; a shared PM2 daemon dumps every app, so key names may also belong to other PM2 apps).`;
}

/**
 * Inspect ~/.pm2/dump.pm2 (or $PM2_HOME/dump.pm2) — the file `pm2 save` writes
 * — for leak signals:
 *   1. permissions wider than owner-only (umask 022 leaves it 0644);
 *   2. plaintext values from the install dir's .env (secrets that reached the
 *      PM2 child env before issue #193 was fixed, e.g. from an older install
 *      or a manual `pm2 start` with exported secrets);
 *   3. known secret key *names* in the dump — even when the stored value
 *      differs, their presence proves the operator's shell env reached PM2.
 * Returns human-readable warnings (empty array = nothing to report).
 *
 * @param {string} [installDir=INSTALL_DIR]
 * @param {string} [home=homedir()]
 * @returns {string[]}
 */
/**
 * The two files the dump scan reads, or null when either is absent.
 *
 * Both are optional: an operator who has not run `pm2 save` or written a .env
 * has nothing to leak, and a missing file is not a warning.
 */
function pm2ScanPaths(installDir, home) {
  const pm2Home = process.env['PM2_HOME'] || join(home, '.pm2');
  const dumpPath = join(pm2Home, 'dump.pm2');
  const envPath = join(installDir, '.env');
  return existsSync(dumpPath) && existsSync(envPath) ? { dumpPath, envPath } : null;
}

export function checkPm2DumpSecurity(installDir = INSTALL_DIR, home = homedir()) {
  // Mode bits are meaningless on Windows and the PM2 path is not used there.
  if (isWindows()) return [];

  const paths = pm2ScanPaths(installDir, home);
  if (!paths) return [];

  const warnings = [pm2DumpModeWarning(paths.dumpPath)];
  try {
    warnings.push(pm2DumpLeakWarning(readFileSync(paths.dumpPath, 'utf-8'), paths.envPath));
  } catch {
    // An unreadable dump is not a leak signal; keep whatever the mode check found.
  }
  return warnings.filter(Boolean);
}

// ─── PM2 Helpers ─────────────────────────────────────────────────────────────

/**
 * Check if PM2 is installed and accessible.
 * @returns {{ ok: boolean, message: string }}
 */
export function checkPm2() {
  try {
    exec('pm2 --version');
    return { ok: true, message: 'PM2 found ✓' };
  } catch {
    return {
      ok: false,
      message: 'PM2 is not installed. Install it with: npm install -g pm2',
    };
  }
}

// ─── Cross-platform helpers ──────────────────────────────────────────────────

/**
 * Check if current platform is Windows.
 * @returns {boolean}
 */
export function isWindows() {
  return platform() === 'win32';
}

/**
 * Platform-aware dependency check.
 * - Linux: check PM2
 * - Windows: check tsc (TypeScript compiler)
 * @returns {{ ok: boolean, message: string, serviceManager: 'pm2' | 'direct' }}
 */
export function checkPlatformDeps() {
  if (isWindows()) {
    try {
      exec('npx -y tsc --version');
      return {
        ok: true,
        message: 'tsc found ✓ (Windows: will start via direct node)',
        serviceManager: 'direct',
      };
    } catch {
      return {
        ok: false,
        message: 'tsc not found. Ensure TypeScript is installed: npm install',
        serviceManager: 'direct',
      };
    }
  } else {
    const pm2Check = checkPm2();
    return {
      ok: pm2Check.ok,
      message: pm2Check.message,
      serviceManager: pm2Check.ok ? 'pm2' : 'direct',
    };
  }
}

/**
 * Start service directly via node (no PM2 — used on Windows and as fallback).
 * Spawns a detached child that survives this CLI process on every platform:
 * a shell background job (`node … &`) cannot be used here because on Windows
 * cmd.exe `&` is a *sequential* separator, so execSync would block until the
 * server exits and the installer would hang (review finding on #195). Output
 * is appended to logs/server.log, and the PID is recorded in logs/server.pid
 * so stopDirectService() / isDirectServiceRunning() work without POSIX pgrep.
 *
 * @param {string} cwd
 * @param {Record<string, string>} [env=scrubbedProcessEnv()] child environment —
 *   secrets are stripped so they cannot leak via process listings (issue #193)
 * @returns {number} the spawned server PID
 */
export function startViaNode(cwd, env = scrubbedProcessEnv()) {
  const logDir = join(cwd, 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(join(logDir, 'server.log'), 'a');
  let pid;
  try {
    const child = spawn(process.execPath, ['dist/src/server-entry.js'], {
      cwd,
      env,
      detached: true,
      // windowsHide: detached children get their own console window on Windows
      // otherwise — a permanent black window popping up during install.
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    pid = child.pid;
  } finally {
    closeSync(logFd);
  }
  writeFileSync(join(logDir, 'server.pid'), `${pid}\n`);
  return pid;
}

/**
 * Read the PID recorded by startViaNode (null when absent/corrupt).
 * @param {string} [cwd=INSTALL_DIR]
 * @returns {number | null}
 */
function readServerPid(cwd = INSTALL_DIR) {
  try {
    const pid = Number.parseInt(readFileSync(join(cwd, 'logs', 'server.pid'), 'utf-8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * True when the process is alive (signal 0 probes existence on every platform).
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop service started directly (no PM2). Prefers the pidfile written by
 * startViaNode (works on Windows too); falls back to pkill on POSIX for
 * processes started before the pidfile existed.
 * @returns {boolean}
 */
/** Terminate one pid, using the platform's tree-kill on Windows. */
function killPid(pid) {
  if (isWindows()) {
    exec(`taskkill /PID ${pid} /T /F`);
    return;
  }
  process.kill(pid, 'SIGTERM');
}

/**
 * Stop whichever node server is running: the pid from the pidfile when it is
 * still alive, otherwise a pattern kill on POSIX. Windows has no portable
 * pattern kill without a pidfile, so it stops there.
 */
function stopRunningServer(pid) {
  if (pid !== null && isPidAlive(pid)) {
    killPid(pid);
    return;
  }
  if (!isWindows()) {
    exec('pkill -f "node dist/src/server"');
  }
}

/** Remove the pidfile; a stale one is harmless, so failure is ignored. */
function removePidFile() {
  try {
    rmSync(join(INSTALL_DIR, 'logs', 'server.pid'), { force: true });
  } catch {
    // best effort — a stale pidfile is harmless
  }
}

export function stopDirectService() {
  const pid = readServerPid();
  try {
    stopRunningServer(pid);
    return true;
  } catch {
    return false;
  } finally {
    if (pid !== null) removePidFile();
  }
}

/**
 * Check if a direct node service is running. Prefers the pidfile; falls back
 * to pgrep on POSIX (no portable equivalent on Windows without a pidfile).
 * @returns {boolean}
 */
export function isDirectServiceRunning() {
  const pid = readServerPid();
  if (pid !== null) return isPidAlive(pid);
  if (isWindows()) return false;
  try {
    const result = exec('pgrep -f "node dist/src/server"');
    return result.length > 0;
  } catch {
    return false;
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────

/**
 * Poll the health endpoint until it responds or timeout.
 * @param {string} url
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<boolean>}
 */
export function waitForHealth(
  url = HEALTH_URL,
  timeoutMs = HEALTH_TIMEOUT_MS,
  intervalMs = HEALTH_POLL_INTERVAL_MS
) {
  return new Promise((resolve) => {
    const start = Date.now();

    const poll = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }

      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve(true);
        } else {
          res.resume();
          setTimeout(poll, intervalMs);
        }
      });

      req.on('error', () => {
        setTimeout(poll, intervalMs);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, intervalMs);
      });
    };

    poll();
  });
}

// ─── .env Generation ─────────────────────────────────────────────────────────

/**
 * Generate .env file content from config.
 * @param {Record<string, string>} config
 * @returns {string}
 */
/**
 * Env keys written only when the operator supplied a value.
 *
 * A list rather than two `if`s: the set of optional keys is data, and the
 * template below is about layout, not about which keys exist.
 */
const OPTIONAL_ENV_KEYS = ['LLM_BASE_URL', 'LLM_MODEL'];

export function generateEnvContent(config) {
  const lines = [
    '# Generated by dialog-survey CLI',
    'NODE_ENV=production',
    'PORT=3001',
    'HOST=0.0.0.0',
    '',
    `DATABASE_URL="${config.DATABASE_URL}"`,
    '',
    '# LLM Configuration (OpenAI-compatible — local or cloud)',
    `LLM_API_KEY=${config.LLM_API_KEY ?? ''}`,
  ];
  // Optional keys are emitted only when set, so an unconfigured install does not
  // get empty assignments that look like configuration.
  lines.push(
    ...OPTIONAL_ENV_KEYS.filter((key) => config[key]).map((key) => `${key}=${config[key]}`)
  );
  lines.push(
    '',
    `DINGTALK_CLIENT_ID=${config.DINGTALK_CLIENT_ID}`,
    `DINGTALK_CLIENT_SECRET=${config.DINGTALK_CLIENT_SECRET}`,
    `DINGTALK_AGENT_ID=${config.DINGTALK_AGENT_ID}`,
    '',
    '# Security',
    `ENCRYPTION_KEY=${crypto.randomBytes(16).toString('hex')}`,
    '# Optional: header-based admin automation via X-Admin-Key (browser login works without it)',
    `ADMIN_API_KEY=${crypto.randomBytes(16).toString('hex')}`,
    '',
    '# Admin authentication (browser login at /admin/login)',
    `ADMIN_USERNAME=${config.ADMIN_USERNAME ?? 'admin'}`,
    `ADMIN_PASSWORD_HASH=${config.ADMIN_PASSWORD_HASH ?? ''}`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    `SESSION_SALT=${crypto.randomBytes(16).toString('hex')}`,
    'SESSION_MAX_AGE=28800',
    '',
    '# Logging',
    'LOG_LEVEL=info',
    ''
  );
  return lines.join('\n');
}

// ─── Commands ────────────────────────────────────────────────────────────────

/**
 * Write the install dir's .env from config. When a .env already exists (an
 * in-place upgrade), it is kept untouched: regenerating would re-randomize
 * ENCRYPTION_KEY / SESSION_SECRET / ADMIN_API_KEY and destroy every stored
 * encryption payload and live session (review finding on #195). New flag
 * values are intentionally NOT merged into an existing file.
 *
 * @param {string} installDir
 * @param {Record<string, string>} config
 * @returns {Promise<{ preserved: boolean, path: string }>}
 */
export async function writeEnvFile(installDir, config) {
  const envPath = join(installDir, '.env');
  if (existsSync(envPath)) {
    return { preserved: true, path: envPath };
  }
  // The .env holds DB credentials, LLM keys, DingTalk secret and session
  // secrets — write it readable only by the owner (issue #190).
  await writeFile(envPath, generateEnvContent(config), { encoding: 'utf-8', mode: 0o600 });
  chmodSync(envPath, 0o600);
  return { preserved: false, path: envPath };
}

/**
 * Resolve the install configuration, or return `null` when the run should stop.
 *
 * Returning `null` rather than throwing is deliberate: every failure here is an
 * operator mistake whose actionable message has already been printed, so the
 * caller's only remaining job is to set the exit code.
 *
 * Extracted from `installCommand` so its five input modes (complete flags,
 * --help, non-interactive merge, partial flags, interactive) read as one table
 * rather than as the first of four sequential steps inside a 313-line function
 * whose cognitive complexity had reached 56.
 */
const PROVIDED_FLAGS = [
  'db-url',
  'llm-api-key',
  'llm-base-url',
  'llm-model',
  'dingtalk-client-id',
  'dingtalk-client-secret',
  'dingtalk-agent-id',
  'admin-username',
  'admin-password',
];

/**
 * Merge CLI flags, an optional --config file, and DIALOG_SURVEY_* environment
 * variables. Returns `null` after printing what is missing.
 *
 * Secrets travel via the environment or a file, never argv, so they stay out of
 * `ps` and the npm debug logs (issue #190).
 */
async function resolveNonInteractiveConfig(flags, fromFlags) {
  let fileConfig = {};
  if (flags.config) {
    const content = flags.config === '-' ? await readStdin() : readFileSync(flags.config, 'utf-8');
    fileConfig = parseConfigFile(content);
  }
  const config = mergeConfig(fromFlags, fileConfig, generateConfigFromEnv());
  const validation = validateConfig(config);
  if (!validation.valid) {
    logError(`Non-interactive install incomplete. Missing: ${validation.missing.join(', ')}`);
    log('Provide them via DIALOG_SURVEY_* environment variables, --config <file>, or CLI flags.');
    process.exitCode = 1;
    return null;
  }
  log('Using configuration from environment / --config / flags (non-interactive).\n');
  return config;
}

/**
 * Walk the operator through interactive prompts. Returns `null` when required
 * values are still missing at the end.
 */
async function resolveInteractiveConfig() {
  log('No flags provided. Starting interactive mode...\n');
  const config = await collectConfigInteractive();
  const validation = validateConfig(config);
  if (!validation.valid) {
    logError(`Missing required config: ${validation.missing.join(', ')}`);
    process.exitCode = 1;
    return null;
  }
  return config;
}

/**
 * Print the usage block shown when a partial set of flags cannot be completed.
 * Returns `null` so the caller can hand it straight back.
 */
function rejectPartialFlags(missing) {
  logError(`Non-interactive install requires all flags. Missing: ${missing.join(', ')}`);
  log('Usage: npx dialog-survey install \\');
  log('  --db-url "postgresql://..." \\');
  log('  --dingtalk-client-id "xxx" \\');
  log('  --dingtalk-client-secret "xxx" \\');
  log('  --dingtalk-agent-id "xxx"');
  log('  [--llm-api-key "xxx"]');
  log('  [--llm-base-url "http://localhost:11434/v1/chat/completions"]');
  log('  [--llm-model "qwen2.5"]');
  log('  [--skip-port-check]');
  process.exitCode = 1;
  return null;
}

/**
 * Resolve the install configuration, or return `null` when the run should stop.
 *
 * Returning `null` rather than throwing is deliberate: every failure here is an
 * operator mistake whose actionable message has already been printed, so the
 * caller's only remaining job is to set the exit code.
 *
 * The five input modes are dispatched in order of specificity — complete flags,
 * --help, an explicitly non-interactive run, partial flags, then the interactive
 * fallback. Only the dispatch lives here; the branches themselves do not, which
 * is what keeps this function readable as a table.
 */
/**
 * Should the installer skip its prompts?
 *
 * True when explicitly requested, when stdin is not a TTY (piped / CI / SSH),
 * or when the caller asked for it by flag.
 */
function wantsNonInteractive(flags) {
  if (flags['non-interactive'] === 'true' || flags['non-interactive'] === true) return true;
  return !process.stdin.isTTY;
}

/** Did the caller supply a complete, non-empty config purely through flags? */
function flagsFullyConfigure(flags, fromFlags) {
  return validateConfig(fromFlags).valid && PROVIDED_FLAGS.some((f) => flags[f] !== undefined);
}

/**
 * Pick the configuration source, in precedence order:
 * explicit `--help`, complete flags, non-interactive fallbacks, partial flags
 * (an error, since silently prompting would hide a typo'd flag), then prompts.
 */
async function resolveInstallConfig(flags) {
  const fromFlags = generateConfigFromFlags(flags);

  if (flags.help) {
    printInstallHelp();
    return null;
  }
  if (flagsFullyConfigure(flags, fromFlags)) {
    log('Using configuration from CLI flags.\n');
    return fromFlags;
  }
  if (wantsNonInteractive(flags)) return resolveNonInteractiveConfig(flags, fromFlags);
  if (PROVIDED_FLAGS.some((f) => flags[f] !== undefined)) {
    return rejectPartialFlags(validateConfig(fromFlags).missing);
  }
  return resolveInteractiveConfig();
}

/**
 * Steps 4-5: create the install directory, copy the package into it, and verify
 * the result is self-consistent before any dependency is installed.
 *
 * Returns `false` when the manifest check failed and the caller must stop.
 *
 * The cleanup policy on failure is the subtle part, which is why it lives here
 * with the check that triggers it: a FRESH directory is removed so a failed
 * install leaves nothing behind, but an EXISTING one is only reported — deleting
 * an operator's working install to punish a corrupt package would destroy data
 * the package did not create. A fresh directory that already holds a `.env` is
 * the one exception in the other direction: that is operator data predating any
 * package.json, so it is kept and the operator is told to inspect it.
 */
/** Copy the package files into the install dir, logging each one. */
async function copyPackageFiles(sourceDir) {
  log('Copying package files...');
  for (const file of filesToCopy) {
    const src = join(sourceDir, file);
    if (!existsSync(src)) continue;
    await cp(src, join(INSTALL_DIR, file), { recursive: true });
    log(`  Copied ${file}`);
  }
  // The published package excludes scripts/loadtest (see `files` in
  // package.json); drop it if the installer ran from a source checkout that
  // still has it, so the install dir matches the published layout.
  await rm(join(INSTALL_DIR, 'scripts', 'loadtest'), { recursive: true, force: true });
}

/**
 * React to an inconsistent install dir, then flag the failure.
 *
 * The cleanup policy is the subtle part: a FRESH directory is removed so a
 * failed install leaves nothing behind, but an EXISTING one is only reported —
 * deleting an operator's working install to punish a corrupt package would
 * destroy data the package did not create. A fresh directory that already holds
 * a `.env` is the one exception in the other direction: that is operator data
 * predating any package.json, so it is kept and the operator is told to look.
 */
async function abortInconsistentInstall(installDirExisted) {
  if (installDirExisted) {
    log('  Existing installation was partially updated — fix the package and re-run install.');
    process.exitCode = 1;
    return;
  }
  if (existsSync(join(INSTALL_DIR, '.env'))) {
    log('  Fresh install directory kept — it contains a pre-existing .env; inspect manually.');
  } else {
    await rm(INSTALL_DIR, { recursive: true, force: true });
    log('  Fresh install directory cleaned up.');
  }
  process.exitCode = 1;
}

async function prepareInstallDirectory(sourceDir) {
  log('\nSetting up installation directory...');
  // An existing package.json marks a pre-existing installation (upgrade);
  // a truly fresh install dir may be removed again when a later gate fails.
  const installDirExisted = existsSync(join(INSTALL_DIR, 'package.json'));
  await mkdir(INSTALL_DIR, { recursive: true });
  log(`  Created ${INSTALL_DIR}`);

  await copyPackageFiles(sourceDir);

  // Integrity gate: the install dir must be self-consistent with its own
  // package.json — every `bin` target present and VERSION shipped — otherwise
  // the printed lifecycle hints would fail inside the install dir and
  // getAppVersion() would silently fall back (issues #191 / #195).
  const manifestProblems = verifyPackageManifest(INSTALL_DIR);
  if (manifestProblems.length > 0) {
    for (const problem of manifestProblems) {
      logError(`Installed package is inconsistent: ${problem}`);
    }
    logError('Aborting before dependency installation — the published package may be corrupt.');
    await abortInconsistentInstall(installDirExisted);
    return null;
  }
  log('  Install manifest verified ✓ (bin target + VERSION present)');
  return true;
}

/**
 * Steps 2-3: fill in the admin credentials, then verify the environment can
 * actually host the app (prerequisites + platform-specific dependencies).
 *
 * Returns the config with the credentials merged in plus the credentials
 * themselves, or `null` when a check failed and the caller must stop.
 *
 * The credential resolution happens BEFORE the prerequisite check on purpose:
 * `checkPrerequisites` reads DATABASE_URL from the config, and resolving the
 * credentials also normalises it, so checking first would probe a different
 * connection string than the one finally written to `.env`.
 */
async function checkEnvironment(initialConfig, flags) {
  log('Checking prerequisites...');
  const credentials = await resolveAdminCredentials(initialConfig);
  const config = {
    ...initialConfig,
    ADMIN_USERNAME: credentials.username,
    ADMIN_PASSWORD_HASH: credentials.hash,
  };
  const prereqs = await checkPrerequisites(config.DATABASE_URL, {
    skipPortCheck: flags['skip-port-check'] === 'true',
  });
  for (const msg of prereqs.messages) {
    log(`  ${msg}`);
  }
  if (!prereqs.ok) {
    logError('Prerequisites check failed. Fix the issues above and retry.');
    process.exitCode = 1;
    return null;
  }

  const platformCheck = checkPlatformDeps();
  log(`  ${platformCheck.message}`);
  if (!platformCheck.ok) {
    logError(platformCheck.message);
    process.exitCode = 1;
    return null;
  }
  // The credentials travel with the config: the success banner reports the
  // generated password, and re-resolving here would mint a fresh one that no
  // longer matches the hash written to .env.
  return { config, credentials };
}

/**
 * Steps 6-9: write `.env`, install dependencies, fetch the Playwright browser,
 * and apply database migrations.
 *
 * Returns `false` when a FATAL step failed (npm install, migrations) and the
 * caller must stop. The Playwright browser is deliberately NOT fatal: it only
 * powers PDF export, so a headless-CI or air-gapped install should still end up
 * with a working interview bot and a warning rather than a rolled-back install.
 *
 * The migration error handler translates the P3005/P3018 shape into the actual
 * upgrade recipe, because the raw Prisma message names a table collision and not
 * the `migrate resolve --applied` command that fixes it.
 */
/** Step 6: generate .env, keeping an existing one intact (see writeEnvFile). */
async function stepWriteEnv(config) {
  log('Generating .env file...');
  const result = await writeEnvFile(INSTALL_DIR, config);
  if (result.preserved) {
    log(`  Existing ${result.path} kept — ENCRYPTION_KEY / SESSION_SECRET /`);
    log('  ADMIN_API_KEY and all configuration values are preserved on upgrade.');
    log('  Edit the file directly to change configuration values.');
  } else {
    log(`  Created ${result.path} (mode 0600)`);
  }
}

/**
 * Step 7: npm install. Returns false when it failed and the caller must stop.
 *
 * npm strips package-lock.json from published tarballs even when it is listed in
 * `files`, so an npx-based install never has a lockfile and always takes the
 * `npm install --omit=dev --legacy-peer-deps` path; `npm ci` only runs when the
 * installer is executed from a source checkout that has one (issue #188). The
 * fallback avoids the arborist `edgesOut` crash that bare `npm install
 * --omit=dev` hit on 1.11.0.
 */
function stepInstallDependencies() {
  log('Installing dependencies...');
  try {
    log(`  Dependencies installed ✓ (${installDependencies(INSTALL_DIR)})`);
    return true;
  } catch (err) {
    logError(`npm install failed: ${err.message}`);
    const npmLog = process.env['npm_config_logfile'];
    if (npmLog) {
      logError(`npm debug log: ${npmLog}`);
    }
    logError('If the error mentions "edgesOut" or peer dependencies, retry with legacy-peer-deps:');
    logError('  echo "legacy-peer-deps=true" >> ~/.dialog-survey/.npmrc');
    process.exitCode = 1;
    return false;
  }
}

/**
 * Step 7.5: install the Playwright browser for PDF export.
 *
 * Deliberately non-fatal: the browser only powers PDF export, so a headless-CI
 * or air-gapped install should still end up with a working interview bot.
 */
function stepInstallPlaywright() {
  log('Installing Playwright browser for PDF export...');
  try {
    exec('npx playwright install chromium', { cwd: INSTALL_DIR });
    log('  Playwright browser installed ✓');
  } catch {
    log('  ⚠ Playwright browser installation failed (PDF export unavailable)');
    log("    Run 'npx playwright install chromium' manually if PDF export is needed.");
  }
}

/**
 * The upgrade recipe for a database created by the old `prisma db push`.
 *
 * On upgrades from <=v1.9 the schema already exists but has no migration
 * history, so deploying the init migration collides with existing tables.
 * Prisma's raw P3005/P3018 message names the collision and not the command that
 * fixes it, so the operator gets the actual recipe instead.
 */
function logMigrationConflictRecipe() {
  logError(
    [
      'This database looks like it was created by the old `prisma db push`',
      '(tables exist, but there is no migration history). To upgrade without',
      'losing data, mark the initial migration as already applied once:',
      '',
      '  npx --yes prisma@7.10.0 migrate resolve --applied 20261004000000_init',
      '',
      'then re-run this installer. See DEPLOY.md "Database Rollback" for details.',
    ].join('\n')
  );
}

/** Does a Prisma failure look like the missing-migration-history collision? */
function isMigrationConflict(err) {
  const haystack = String(err.stdout ?? '') + String(err.stderr ?? '') + err.message;
  return /already exists|P3005|P3018|migration.*conflict/i.test(haystack);
}

/**
 * Step 9: prisma migrate deploy (issue #152). Returns false when it failed.
 *
 * No generate step here: the package ships the compiled client
 * (dist/src/generated/prisma) and devDeps are absent in the install.
 * PRISMA_SKIP_GENERATE keeps the installed tree read-only — --no-generate does
 * not exist in prisma@7.10.0 (spike #11 verified the env flag). Migrations ship
 * inside prisma/ (filesToCopy); deploy replays them in order, which `db push`
 * never did (no history, no rollback).
 */
function stepMigrateDatabase() {
  log('Applying database migrations...');
  try {
    exec('npx --yes prisma@7.10.0 migrate deploy', {
      cwd: INSTALL_DIR,
      env: { ...process.env, PRISMA_SKIP_GENERATE: '1' },
    });
    log('  Migrations applied ✓');
    return true;
  } catch (err) {
    logError(`prisma migrate deploy failed: ${err.message}`);
    if (isMigrationConflict(err)) {
      logMigrationConflictRecipe();
    }
    process.exitCode = 1;
    return false;
  }
}

async function installDependenciesAndMigrate(config) {
  await stepWriteEnv(config);
  if (!stepInstallDependencies()) return false;
  stepInstallPlaywright();
  return stepMigrateDatabase();
}

/**
 * Steps 10-12: start the service, wait for it to become healthy, and report the
 * outcome. Returns whether the deployment came up healthy.
 *
 * Split out of `installCommand` because the success banner is its single widest
 * branch: an operator reading only the last screen gets the install dir, the
 * admin password (shown once, never written to disk) and the platform-correct
 * lifecycle hints — exactly the block that was hardest to find inside a
 * 300-line function.
 *
 * `credentials` and `platformCheck` are parameters rather than re-derived
 * values: re-probing the platform could disagree with the check that actually
 * gated the install, and re-resolving the credentials would generate a NEW
 * password after the hash had already been written to `.env`.
 */
/**
 * The success banner.
 *
 * Lifecycle hints must work INSIDE the install dir they print: `npx
 * dialog-survey …` re-fetches the package from the registry instead of using
 * the install dir (npm exec never resolves a root package's own bin), so the
 * local equivalents are printed instead (issue #195).
 */
function logInstallSuccess(credentials, serviceManager) {
  log('  Health check passed ✓');
  log('\n✅ dialog-survey installed and running successfully!');
  log(`   Install dir: ${INSTALL_DIR}`);
  log(`   Health:      ${HEALTH_URL}`);
  log('   Admin UI:    http://localhost:3001/admin');
  log(`   Admin user:  ${credentials.username}`);
  if (credentials.generated) {
    log(`   Admin pass:  ${credentials.password}`);
    log('                Store it now — it is shown only once and never written to disk.');
  }
  if (serviceManager === 'pm2') {
    log(`   Logs:        pm2 logs ${PM2_APP_NAME}`);
    log(`   Stop:        pm2 stop ${PM2_APP_NAME}`);
    log(`   Status:      pm2 status ${PM2_APP_NAME}`);
    return;
  }
  log('   Stop:        node scripts/cli.mjs stop');
  log('   Status:      node scripts/cli.mjs status');
}

/** The "started but never became healthy" report. */
function logInstallUnhealthy(serviceManager) {
  logError('Health check timed out after 30s. Service may still be starting.');
  if (serviceManager === 'pm2') {
    log(`   Check logs: pm2 logs ${PM2_APP_NAME}`);
  }
  process.exitCode = 1;
}

async function startAndReport(credentials, platformCheck) {
  // Step 10: Start service (platform-aware)
  // Note: No build step needed — dist/ is pre-compiled in the npm package.
  await startViaServiceManager();

  // Step 12: Wait for health
  log('Waiting for health check...');
  const healthy = await waitForHealth();
  if (healthy) {
    logInstallSuccess(credentials, platformCheck.serviceManager);
    log('   Upgrade:     npx dialog-survey@latest install   (run from any directory)');
  } else {
    logInstallUnhealthy(platformCheck.serviceManager);
  }

  // Warn when the PM2 dump file would persist secrets / is world-readable
  // (issue #193). Runs on both paths: pm2 save may have been run before by an
  // earlier install or manually by the operator.
  if (platformCheck.serviceManager === 'pm2') {
    for (const warning of checkPm2DumpSecurity(INSTALL_DIR)) {
      log(`\n⚠ ${warning}`);
    }
  }
  return healthy;
}

/**
 * Install command — interactive or non-interactive installation.
 * @param {Record<string, string>} flags
 */
export async function installCommand(flags) {
  log('🚀 dialog-survey installer\n');

  // Step 1: Collect config
  let config = await resolveInstallConfig(flags);
  if (config === null) return;

  // Steps 2-3: prerequisites + platform deps
  const environment = await checkEnvironment(config, flags);
  if (environment === null) return;
  const { config: checkedConfig, credentials } = environment;
  config = checkedConfig;

  // Steps 4-5: create the install directory, copy files, verify the manifest
  const sourceDir = join(__dirname, '..');
  if (!(await prepareInstallDirectory(sourceDir))) {
    process.exitCode = 1;
    return;
  }

  // Steps 6-9: .env, dependencies, Playwright browser, migrations
  if (!(await installDependenciesAndMigrate(config))) {
    process.exitCode = 1;
    return;
  }

  // Steps 10-12: start the service, wait for health, report the outcome
  const platformCheck = checkPlatformDeps();
  await startAndReport(credentials, platformCheck);
  warnAboutSecretFlags(flags);
}

/**
 * Warn when secrets were passed on the command line.
 *
 * npm records the full argv (including flag values) in
 * ~/.npm/_logs/*.debug-0.log, so the honest advice is to use DIALOG_SURVEY_*
 * environment variables or `--config <file>` and to rotate what leaked (issue
 * #190).
 */
function warnAboutSecretFlags(flags) {
  const secretFlags = ['db-url', 'llm-api-key', 'dingtalk-client-secret', 'admin-password'];
  if (!secretFlags.some((f) => flags[f] !== undefined)) return;
  log('\n⚠ Security notice: secrets were passed via CLI flags.');
  log('  npm records the full command (including flag values) in ~/.npm/_logs/*.debug-0.log.');
  log('  Prefer DIALOG_SURVEY_* environment variables or --config <file> next time.');
  log('  Consider removing those log files and rotating the exposed secrets.');
}

/**
 * Uninstall command — remove installation.
 * @param {Record<string, string>} flags
 */
export async function uninstallCommand(flags) {
  log('🗑️  dialog-survey uninstaller\n');

  // Step 1: Stop PM2 process
  const pm2Check = checkPm2();
  if (pm2Check.ok) {
    log('Stopping PM2 process...');
    try {
      exec(`pm2 delete ${PM2_APP_NAME}`);
      log('  PM2 process removed ✓');
    } catch {
      log('  No PM2 process found (may already be removed)');
    }
  }

  // Step 2: Optional DB removal
  if (flags['remove-db'] === 'true') {
    log('\n⚠️  Database removal requested.');
    log('To drop the database, run:');
    log('  psql -c "DROP DATABASE IF EXISTS dialog_survey;"');
    log('  (adjust connection parameters as needed)\n');
  }

  // Step 3: Remove install directory
  if (existsSync(INSTALL_DIR)) {
    log(`Removing ${INSTALL_DIR}...`);
    await rm(INSTALL_DIR, { recursive: true, force: true });
    log('  Installation directory removed ✓');
  } else {
    log('  No installation directory found.');
  }

  log('\n✅ dialog-survey uninstalled successfully.');
}

/**
 * Start command — start service via PM2.
 */
/** Is this a broken install that predates the #195 packaging fix? */
function predatesPackagingFix(missing) {
  return missing.includes('scripts/cli.mjs') || missing.includes('VERSION');
}

/**
 * Report an incomplete installation and flag the failure.
 *
 * The two messages differ because the remedy does: a pre-#195 install is
 * missing exactly the files that fix introduced, so re-running install repairs
 * it in place and keeps the existing .env, whereas anything else is a generic
 * repair prompt.
 */
function reportIncompleteInstall(missing) {
  logError(`Installation is incomplete. Missing: ${missing.join(', ')}`);
  if (predatesPackagingFix(missing)) {
    logError(
      '  This install predates the #195 packaging fix. Re-run `npx dialog-survey install` to repair — the existing .env is preserved.'
    );
  } else {
    logError("Run 'npx dialog-survey install' to repair the installation.");
  }
  process.exitCode = 1;
}

export async function startCommand() {
  log('▶️  Starting dialog-survey...\n');

  if (!existsSync(join(INSTALL_DIR, 'ecosystem.config.cjs'))) {
    logError(`No installation found at ${INSTALL_DIR}. Run 'npx dialog-survey install' first.`);
    process.exitCode = 1;
    return;
  }

  const verification = verifyInstallation(INSTALL_DIR);
  if (!verification.ok) {
    reportIncompleteInstall(verification.missing);
    return;
  }

  await startViaServiceManager();
  log('Waiting for health check...');
  const healthy = await waitForHealth();
  if (healthy) {
    log('✅ dialog-survey is running.');
    log(`   Health: ${HEALTH_URL}`);
  } else {
    logError('Health check timed out. Check logs for details.');
    process.exitCode = 1;
  }
}

/**
 * Stop command — stop service via PM2.
 */
export async function stopCommand() {
  log('⏹  Stopping dialog-survey...\n');

  const platformCheck = checkPlatformDeps();

  if (platformCheck.serviceManager === 'pm2') {
    try {
      exec(`pm2 stop ${PM2_APP_NAME}`);
      log('✅ dialog-survey stopped.');
    } catch (err) {
      logError(`PM2 stop failed: ${err.message}`);
      process.exitCode = 1;
    }
  } else {
    const stopped = stopDirectService();
    if (stopped) {
      log('✅ dialog-survey stopped.');
    } else {
      log('No running dialog-survey process found.');
    }
  }
}

/**
 * Status command — show service status.
 */
/** Uptime as an ISO string, or the placeholder PM2 uses before first start. */
function pm2Uptime(app) {
  const started = app.pm2_env?.pm_uptime;
  return started ? new Date(started).toISOString() : 'N/A';
}

/** Resident memory in whole megabytes, or the placeholder. */
function pm2Memory(app) {
  const bytes = app.monit?.memory;
  return bytes ? `${Math.round(bytes / 1024 / 1024)}MB` : 'N/A';
}

/**
 * Log every PM2 dump security problem.
 *
 * Called on both the running and the stopped path: `dump.pm2` persists on disk
 * even while the app is stopped, so a world-readable dump is still a finding
 * (issue #193).
 */
function logPm2DumpWarnings() {
  for (const warning of checkPm2DumpSecurity()) {
    log(`  ⚠️ ${warning}`);
  }
}

/** Log one PM2 process's live metrics. */
function logPm2Metrics(app) {
  log(`  PM2 process: ${app.pm2_env?.status || 'unknown'}`);
  log(`  PID: ${app.pid || 'N/A'}`);
  log(`  Uptime: ${pm2Uptime(app)}`);
  log(`  Restarts: ${app.pm2_env?.restart_time ?? 'N/A'}`);
  log(`  Memory: ${pm2Memory(app)}`);
}

/** Log the "nothing is running" report for the PM2 path. */
function logPm2NotRunning() {
  log('  PM2 process: not found');
  log('  Status: stopped\n');
  log("  Run 'npx dialog-survey start' to start the service.");
  logPm2DumpWarnings();
}

/**
 * Report the PM2-managed process. Returns `false` when nothing is installed, so
 * the caller can stop instead of printing a health line for a service it has no
 * reason to believe exists.
 *
 * `dump.pm2` persists on disk even while the app is stopped, so the dump
 * security check runs on this path too — a stopped app whose dump is
 * world-readable is still a leaked-secret finding (issue #193).
 */
function reportPm2Status() {
  let processes;
  try {
    processes = JSON.parse(exec('pm2 jlist'));
  } catch (err) {
    logError(`PM2 status check failed: ${err.message}`);
    return false;
  }

  const app = processes.find((p) => p.name === PM2_APP_NAME);
  if (!app) {
    logPm2NotRunning();
    return false;
  }

  logPm2Metrics(app);
  // Surface PM2 dump security problems on every status check (issue #193).
  logPm2DumpWarnings();
  return true;
}

/**
 * Report the direct (non-PM2) process. Returns `false` when it is not running.
 *
 * Kept separate from the PM2 path rather than merged behind one flag: the two
 * managers expose entirely different state, so a shared function would spend
 * most of its branches deciding which platform it is on.
 */
function reportDirectStatus() {
  if (isDirectServiceRunning()) {
    log('  Direct process: running');
    return true;
  }
  log('  Direct process: not found');
  log('  Status: stopped\n');
  log("  Run 'npx dialog-survey start' to start the service.");
  return false;
}

export async function statusCommand() {
  log('📊 dialog-survey status\n');

  const platformCheck = checkPlatformDeps();
  const installed =
    platformCheck.serviceManager === 'pm2' ? reportPm2Status() : reportDirectStatus();
  if (!installed) return;

  // Check health endpoint (shared by both platforms)
  const healthy = await waitForHealth(HEALTH_URL, 5000, 500);
  if (healthy) {
    log(`  Health: ${HEALTH_URL} ✓`);
    log('\n  Status: running ✅');
  } else {
    log(`  Health: ${HEALTH_URL} ✗`);
    log('\n  Status: degraded ⚠️');
  }
}

// ─── Help ────────────────────────────────────────────────────────────────────

function printHelp() {
  log(`
dialog-survey CLI — npx-based install and lifecycle management

Usage:
  npx dialog-survey <command> [options]

Commands:
  install     Install dialog-survey (interactive or non-interactive)
  uninstall   Remove dialog-survey installation
  start       Start the dialog-survey service
  stop        Stop the dialog-survey service
  status      Show service status
  help        Show this help message

Install Options:
  --db-url <url>                  PostgreSQL connection string (required)
  --llm-api-key <key>             LLM API key (optional for local LLM)
  --llm-base-url <url>            LLM base URL (optional, e.g. http://localhost:11434/v1/chat/completions)
  --llm-model <name>              LLM model name (optional, e.g. qwen2.5)
  --dingtalk-client-id <id>       DingTalk client ID (required)
  --dingtalk-client-secret <sec>  DingTalk client secret (required)
  --dingtalk-agent-id <id>        DingTalk agent ID (required)
  --admin-username <name>         Admin UI username (default: admin)
  --admin-password <pass>         Admin UI password (default: auto-generated, shown once)
  --non-interactive               Read config from DIALOG_SURVEY_* env vars / --config (no prompts)
  --config <path>                 Read KEY=VALUE config from a file ("-" for stdin)
  --skip-port-check               Skip port availability check

  Secrets are safest via environment variables, NOT flags:
    DIALOG_SURVEY_DATABASE_URL=... DIALOG_SURVEY_LLM_API_KEY=... npx dialog-survey install --non-interactive
  (flags are written verbatim into ~/.npm/_logs — avoid passing real secrets there.)

Uninstall Options:
  --remove-db                     Also print instructions to drop the database

Examples:
  # Interactive install
  npx dialog-survey install

  # Non-interactive install — secrets via env vars (recommended, keeps them out of npm logs)
  DIALOG_SURVEY_DATABASE_URL="postgresql://user:pass@localhost:5432/db" \\
  DIALOG_SURVEY_DINGTALK_CLIENT_ID="xxx" DIALOG_SURVEY_DINGTALK_CLIENT_SECRET="xxx" \\
  DIALOG_SURVEY_DINGTALK_AGENT_ID="xxx" \\
    npx dialog-survey install --non-interactive

  # Non-interactive install — all values via flags (secrets will land in npm logs)
  npx dialog-survey install \\
    --db-url "postgresql://user:pass@localhost:5432/db" \\
    --llm-api-key "sk-xxx" \\
    --dingtalk-client-id "xxx" \\
    --dingtalk-client-secret "xxx" \\
    --dingtalk-agent-id "xxx"

  # Lifecycle management
  npx dialog-survey start
  npx dialog-survey stop
  npx dialog-survey status
  npx dialog-survey uninstall

  # Lifecycle management from inside the install dir (no registry fetch):
  #   cd ~/.dialog-survey && node scripts/cli.mjs status
`);
}

function printInstallHelp() {
  log(`
dialog-survey install — Install dialog-survey

Usage:
  npx dialog-survey install [options]

Options:
  --db-url <url>                  PostgreSQL connection string (required)
  --llm-api-key <key>             LLM API key (optional for local LLM)
  --llm-base-url <url>            LLM base URL (optional, e.g. http://localhost:11434/v1/chat/completions)
  --llm-model <name>              LLM model name (optional, e.g. qwen2.5)
  --dingtalk-client-id <id>       DingTalk client ID (required)
  --dingtalk-client-secret <sec>  DingTalk client secret (required)
  --dingtalk-agent-id <id>        DingTalk agent ID (required)
  --admin-username <name>         Admin UI username (default: admin)
  --admin-password <pass>         Admin UI password (default: auto-generated, shown once)
  --non-interactive               Read config from DIALOG_SURVEY_* env vars / --config (no prompts)
  --config <path>                 Read KEY=VALUE config from a file ("-" for stdin)
  --skip-port-check               Skip port availability check
  --help                          Show this help message

Non-interactive installs read config from DIALOG_SURVEY_* environment variables,
an optional --config <file>, and CLI flags (precedence: flags > file > env).
Prefer env vars over flags so secrets are NOT written into ~/.npm/_logs.

Examples:
  # Interactive — prompts for each value
  npx dialog-survey install

  # Non-interactive — secrets via env vars (recommended)
  DIALOG_SURVEY_DATABASE_URL="postgresql://user:pass@localhost:5432/db" \\
  DIALOG_SURVEY_DINGTALK_CLIENT_ID="xxx" DIALOG_SURVEY_DINGTALK_CLIENT_SECRET="xxx" \\
  DIALOG_SURVEY_DINGTALK_AGENT_ID="xxx" \\
    npx dialog-survey install --non-interactive

  # Non-interactive — all values via flags
  npx dialog-survey install \\
    --db-url "postgresql://user:pass@localhost:5432/db" \\
    --llm-api-key "sk-xxx" \\
    --dingtalk-client-id "xxx" \\
    --dingtalk-client-secret "xxx" \\
    --dingtalk-agent-id "xxx"
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Command dispatch table.
 *
 * A table rather than a `switch`: the set of commands is data, and a lookup
 * makes "what commands exist" answerable in one place instead of by reading
 * branch bodies. Every entry takes the same argument, so adding one is a row.
 */
const COMMANDS = {
  install: (flags) => installCommand(flags),
  uninstall: (flags) => uninstallCommand(flags),
  start: () => startCommand(),
  stop: () => stopCommand(),
  status: () => statusCommand(),
};

export async function main(argv) {
  const { command, flags } = parseArgs(argv);
  const run = COMMANDS[command];
  if (!run) {
    printHelp();
    return;
  }
  await run(flags);
}

// Run if invoked directly
// Use path-based check instead of import.meta.resolve() which may return
// non-file URLs on Node.js >= 26, causing ERR_INVALID_URL_SCHEME.
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('cli.mjs') ||
    process.argv[1].endsWith('dialog-survey') ||
    process.argv[1].endsWith(`dialog-survey${process.platform === 'win32' ? '.cmd' : ''}`));

if (isMain) {
  main(process.argv.slice(2));
}
