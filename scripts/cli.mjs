#!/usr/bin/env node

/**
 * dialog-survey CLI — npx-based install and lifecycle management
 *
 * Commands: install, uninstall, start, stop, status, help
 * Uses only Node.js builtins plus bcryptjs (pure JS, already a runtime dependency)
 * for admin password hashing.
 */

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
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
async function startViaServiceManager() {
  const platformCheck = checkPlatformDeps();
  if (platformCheck.serviceManager === 'pm2') {
    // Fail loudly if the published entry point is missing, instead of letting
    // PM2 report a cryptic "Script not found" after npm install / migrations
    // have already run (issue #186).
    const entry = join(INSTALL_DIR, 'dist/src/server-entry.js');
    if (!existsSync(entry)) {
      logError(`Expected entry point not found in package: ${entry}`);
      logError('The installed package is inconsistent — aborting PM2 start.');
      process.exitCode = 1;
      return;
    }
    try {
      exec(`pm2 start ecosystem.config.cjs --name ${PM2_APP_NAME} --env production`, {
        cwd: INSTALL_DIR,
      });
      log('PM2 process started ✓');
    } catch (err) {
      logError(`PM2 start failed: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    log('Starting service directly (PM2 is unstable on Windows, using direct node)...');
    try {
      startViaNode(INSTALL_DIR);
      log('Direct process started ✓');
    } catch (err) {
      logError(`Direct start failed: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

/**
 * Parse CLI arguments into a command name and a flags object.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ command: string, flags: Record<string, string>, positional: string[] }}
 */
export function parseArgs(argv) {
  const command = argv[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

// ─── Config Generation ───────────────────────────────────────────────────────

/**
 * Generate config object from CLI flags.
 *
 * @param {Record<string, string>} flags
 * @returns {Record<string, string>}
 */
export function generateConfigFromFlags(flags) {
  return {
    DATABASE_URL: flags['db-url'] || '',
    LLM_API_KEY: flags['llm-api-key'] || '',
    LLM_BASE_URL: flags['llm-base-url'] || '',
    LLM_MODEL: flags['llm-model'] || '',
    DINGTALK_CLIENT_ID: flags['dingtalk-client-id'] || '',
    DINGTALK_CLIENT_SECRET: flags['dingtalk-client-secret'] || '',
    DINGTALK_AGENT_ID: flags['dingtalk-agent-id'] || '',
    ADMIN_USERNAME: flags['admin-username'] || '',
    ADMIN_PASSWORD: flags['admin-password'] || '',
  };
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
 */
export function generateConfigFromEnv() {
  return {
    DATABASE_URL: process.env['DIALOG_SURVEY_DATABASE_URL'] || '',
    LLM_API_KEY: process.env['DIALOG_SURVEY_LLM_API_KEY'] || '',
    LLM_BASE_URL: process.env['DIALOG_SURVEY_LLM_BASE_URL'] || '',
    LLM_MODEL: process.env['DIALOG_SURVEY_LLM_MODEL'] || '',
    DINGTALK_CLIENT_ID: process.env['DIALOG_SURVEY_DINGTALK_CLIENT_ID'] || '',
    DINGTALK_CLIENT_SECRET: process.env['DIALOG_SURVEY_DINGTALK_CLIENT_SECRET'] || '',
    DINGTALK_AGENT_ID: process.env['DIALOG_SURVEY_DINGTALK_AGENT_ID'] || '',
    ADMIN_USERNAME: process.env['DIALOG_SURVEY_ADMIN_USERNAME'] || '',
    ADMIN_PASSWORD: process.env['DIALOG_SURVEY_ADMIN_PASSWORD'] || '',
  };
}

/**
 * Parse a KEY=VALUE config file (the format produced by --config). Both plain
 * names (DATABASE_URL=...) and DIALOG_SURVEY_-prefixed names are accepted and
 * mapped to the canonical config key. Comments (#) and blank lines are ignored;
 * surrounding quotes are stripped.
 */
export function parseConfigFile(content) {
  const config = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const canonical = key.startsWith('DIALOG_SURVEY_')
      ? key.slice('DIALOG_SURVEY_'.length)
      : key;
    if (CONFIG_KEYS.includes(canonical)) {
      config[canonical] = value;
    }
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
      if (src && src[key] && !out[key]) out[key] = src[key];
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
 * Prefers `npm ci` when a lockfile ships with the package (it now does — see the
 * `files` field), giving a deterministic tree that sidesteps the arborist
 * `edgesOut` crash that bare `npm install --omit=dev` hit on 1.11.0 (issue
 * #188). Falls back to `npm install --omit=dev --legacy-peer-deps` when there is
 * no lockfile or `npm ci` fails. Returns the command that succeeded.
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
export function checkNodeVersion(version = process.versions.node) {
  const current = version.split('.').map((part) => Number.parseInt(part, 10));
  const minimum = MIN_NODE_VERSION.split('.').map((part) => Number.parseInt(part, 10));
  let meetsMinimum = true;
  for (let i = 0; i < minimum.length; i += 1) {
    const cur = current[i] ?? 0;
    const min = minimum[i] ?? 0;
    if (cur !== min) {
      meetsMinimum = cur > min;
      break;
    }
  }
  if (!meetsMinimum) {
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
  ];

  const missing = [];
  for (const file of requiredFiles) {
    if (!existsSync(join(installDir, file))) {
      missing.push(file);
    }
  }

  return { ok: missing.length === 0, missing };
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
 * Start service directly via node (no PM2, used on Windows).
 * @param {string} cwd
 */
export function startViaNode(cwd) {
  exec('node dist/src/server-entry.js &', { cwd });
}

/**
 * Stop service started directly (no PM2).
 * @returns {boolean}
 */
export function stopDirectService() {
  try {
    exec('pkill -f "node dist/src/server"');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a direct node service is running.
 * @returns {boolean}
 */
export function isDirectServiceRunning() {
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
    `LLM_API_KEY=${config.LLM_API_KEY || ''}`,
  ];
  if (config.LLM_BASE_URL) {
    lines.push(`LLM_BASE_URL=${config.LLM_BASE_URL}`);
  }
  if (config.LLM_MODEL) {
    lines.push(`LLM_MODEL=${config.LLM_MODEL}`);
  }
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
    `ADMIN_USERNAME=${config.ADMIN_USERNAME || 'admin'}`,
    `ADMIN_PASSWORD_HASH=${config.ADMIN_PASSWORD_HASH || ''}`,
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
 * Install command — interactive or non-interactive installation.
 * @param {Record<string, string>} flags
 */
export async function installCommand(flags) {
  log('🚀 dialog-survey installer\n');

  // Step 1: Collect config
  let config;
  const fromFlags = generateConfigFromFlags(flags);
  const flagValidation = validateConfig(fromFlags);

  // Non-interactive when explicitly requested, when stdin is not a TTY (piped /
  // CI / SSH), or when there is nothing to fall back to interactively.
  const nonInteractive =
    flags['non-interactive'] === 'true' ||
    flags['non-interactive'] === true ||
    !process.stdin.isTTY;

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
  const anyFlagProvided = PROVIDED_FLAGS.some((f) => flags[f] !== undefined);

  if (flagValidation.valid && anyFlagProvided) {
    config = fromFlags;
    log('Using configuration from CLI flags.\n');
  } else if (flags.help) {
    printInstallHelp();
    return;
  } else if (nonInteractive) {
    // Non-interactive: merge CLI flags, an optional --config file, and
    // DIALOG_SURVEY_* environment variables. Secrets travel via the environment
    // or a file, never argv, so they stay out of `ps` and the npm debug logs
    // (issue #190).
    let fileConfig = {};
    if (flags.config) {
      const content =
        flags.config === '-' ? await readStdin() : readFileSync(flags.config, 'utf-8');
      fileConfig = parseConfigFile(content);
    }
    const envConfig = generateConfigFromEnv();
    config = mergeConfig(fromFlags, fileConfig, envConfig);
    const mergedValidation = validateConfig(config);
    if (!mergedValidation.valid) {
      logError(
        `Non-interactive install incomplete. Missing: ${mergedValidation.missing.join(', ')}`
      );
      log(
        'Provide them via DIALOG_SURVEY_* environment variables, --config <file>, or CLI flags.'
      );
      process.exitCode = 1;
      return;
    }
    log('Using configuration from environment / --config / flags (non-interactive).\n');
  } else if (anyFlagProvided) {
    logError(
      `Non-interactive install requires all flags. Missing: ${flagValidation.missing.join(', ')}`
    );
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
    return;
  } else {
    log('No flags provided. Starting interactive mode...\n');
    config = await collectConfigInteractive();
    const interactiveValidation = validateConfig(config);
    if (!interactiveValidation.valid) {
      logError(`Missing required config: ${interactiveValidation.missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }

  // Step 2: Check prerequisites
  log('Checking prerequisites...');
  const credentials = await resolveAdminCredentials(config);
  config = {
    ...config,
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
    return;
  }

  // Step 3: Check platform-specific deps
  const platformCheck = checkPlatformDeps();
  log(`  ${platformCheck.message}`);
  if (!platformCheck.ok) {
    logError(platformCheck.message);
    process.exitCode = 1;
    return;
  }

  // Step 4: Create install directory
  log('\nSetting up installation directory...');
  const sourceDir = join(__dirname, '..');
  await mkdir(INSTALL_DIR, { recursive: true });
  log(`  Created ${INSTALL_DIR}`);

  // Step 5: Copy package files
  log('Copying package files...');
  const filesToCopy = [
    'package.json',
    'package-lock.json',
    'dist',
    'prisma',
    'src/views',
    'public',
    'prisma.config.ts',
    'ecosystem.config.cjs',
  ];
  for (const file of filesToCopy) {
    const src = join(sourceDir, file);
    const dest = join(INSTALL_DIR, file);
    if (existsSync(src)) {
      await cp(src, dest, { recursive: true });
      log(`  Copied ${file}`);
    }
  }

  // Step 6: Generate .env
  log('Generating .env file...');
  const envContent = generateEnvContent(config);
  // The .env holds DB credentials, LLM keys, DingTalk secret and session
  // secrets — write it readable only by the owner (issue #190).
  await writeFile(join(INSTALL_DIR, '.env'), envContent, { encoding: 'utf-8', mode: 0o600 });
  chmodSync(join(INSTALL_DIR, '.env'), 0o600);
  log(`  Created ${INSTALL_DIR}/.env (mode 0600)`);

  // Step 7: npm install
  // The package now ships package-lock.json (added to the `files` field), so we
  // prefer `npm ci` for a deterministic, reproducible tree that avoids the
  // arborist `edgesOut` crash that bare `npm install --omit=dev` hit on 1.11.0
  // (issue #188). Fall back to `npm install --omit=dev --legacy-peer-deps` when
  // no lockfile is present or `npm ci` fails.
  log('Installing dependencies...');
  try {
    const which = installDependencies(INSTALL_DIR);
    log(`  Dependencies installed ✓ (${which})`);
  } catch (err) {
    logError(`npm install failed: ${err.message}`);
    const npmLog = process.env['npm_config_logfile'];
    if (npmLog) {
      logError(`npm debug log: ${npmLog}`);
    }
    logError('If the error mentions "edgesOut" or peer dependencies, retry with legacy-peer-deps:');
    logError('  echo "legacy-peer-deps=true" >> ~/.dialog-survey/.npmrc');
    process.exitCode = 1;
    return;
  }

  // Step 7.5: Install Playwright browser for PDF export
  // This is non-fatal — PDF export is an optional feature.
  log('Installing Playwright browser for PDF export...');
  try {
    exec('npx playwright install chromium', { cwd: INSTALL_DIR });
    log('  Playwright browser installed ✓');
  } catch {
    log('  ⚠ Playwright browser installation failed (PDF export unavailable)');
    log("    Run 'npx playwright install chromium' manually if PDF export is needed.");
  }

  // Step 9: prisma migrate deploy (issue #152)
  // No generate step here: the package ships the compiled client
  // (dist/src/generated/prisma) and devDeps are absent in the install.
  // PRISMA_SKIP_GENERATE keeps the installed tree read-only — --no-generate
  // does not exist in prisma@7.10.0 (spike #11 verified the env flag).
  // Migrations ship inside prisma/ (filesToCopy); deploy replays them in
  // order, which `db push` never did (no history, no rollback).
  log('Applying database migrations...');
  try {
    exec('npx --yes prisma@7.10.0 migrate deploy', {
      cwd: INSTALL_DIR,
      env: { ...process.env, PRISMA_SKIP_GENERATE: '1' },
    });
    log('  Migrations applied ✓');
  } catch (err) {
    logError(`prisma migrate deploy failed: ${err.message}`);
    // Most common cause on upgrades from <=v1.9: the DB schema already exists
    // (created by the old `prisma db push`) but has no migration history, so
    // deploying the init migration collides with existing tables. Tell the
    // operator how to baseline it instead of leaving a raw P3005/P3018 dump.
    if (
      /already exists|P3005|P3018|migration.*conflict/i.test(
        String(err.stdout ?? '') + String(err.stderr ?? '') + err.message
      )
    ) {
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
    process.exitCode = 1;
    return;
  }

  // Step 10: Start service (platform-aware)
  // Note: No build step needed — dist/ is pre-compiled in the npm package.
  await startViaServiceManager();

  // Step 12: Wait for health
  log('Waiting for health check...');
  const healthy = await waitForHealth();
  if (healthy) {
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
    if (platformCheck.serviceManager === 'pm2') {
      log(`   Logs:        pm2 logs ${PM2_APP_NAME}`);
    }
    log('   Stop:        npx dialog-survey stop');
    log('   Status:      npx dialog-survey status');
  } else {
    logError('Health check timed out after 30s. Service may still be starting.');
    if (platformCheck.serviceManager === 'pm2') {
      log(`   Check logs: pm2 logs ${PM2_APP_NAME}`);
    }
    process.exitCode = 1;
  }

  // Security notice when secrets were passed on the command line. npm records the
  // full argv (including flag values) in ~/.npm/_logs/*.debug-0.log, so prefer
  // DIALOG_SURVEY_* environment variables or --config <file> next time (issue #190).
  const usedSecretFlags = [
    'db-url',
    'llm-api-key',
    'dingtalk-client-secret',
    'admin-password',
  ].some((f) => flags[f] !== undefined);
  if (usedSecretFlags) {
    log('\n⚠ Security notice: secrets were passed via CLI flags.');
    log('  npm records the full command (including flag values) in ~/.npm/_logs/*.debug-0.log.');
    log('  Prefer DIALOG_SURVEY_* environment variables or --config <file> next time.');
    log('  Consider removing those log files and rotating the exposed secrets.');
  }
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
export async function startCommand() {
  log('▶️  Starting dialog-survey...\n');

  if (!existsSync(join(INSTALL_DIR, 'ecosystem.config.cjs'))) {
    logError(`No installation found at ${INSTALL_DIR}. Run 'npx dialog-survey install' first.`);
    process.exitCode = 1;
    return;
  }

  const verification = verifyInstallation(INSTALL_DIR);
  if (!verification.ok) {
    logError(`Installation is incomplete. Missing: ${verification.missing.join(', ')}`);
    logError("Run 'npx dialog-survey install' to repair the installation.");
    process.exitCode = 1;
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
export async function statusCommand() {
  log('📊 dialog-survey status\n');

  const platformCheck = checkPlatformDeps();

  if (platformCheck.serviceManager === 'pm2') {
    try {
      const pm2Status = exec('pm2 jlist');
      const processes = JSON.parse(pm2Status);
      const app = processes.find((p) => p.name === PM2_APP_NAME);

      if (!app) {
        log('  PM2 process: not found');
        log('  Status: stopped\n');
        log("  Run 'npx dialog-survey start' to start the service.");
        return;
      }

      const pm2StatusText = app.pm2_env?.status || 'unknown';
      log(`  PM2 process: ${pm2StatusText}`);
      log(`  PID: ${app.pid || 'N/A'}`);
      log(
        `  Uptime: ${app.pm2_env?.pm_uptime ? new Date(app.pm2_env.pm_uptime).toISOString() : 'N/A'}`
      );
      log(`  Restarts: ${app.pm2_env?.restart_time ?? 'N/A'}`);
      log(
        `  Memory: ${app.monit?.memory ? `${Math.round(app.monit.memory / 1024 / 1024)}MB` : 'N/A'}`
      );
    } catch (err) {
      logError(`PM2 status check failed: ${err.message}`);
    }
  } else {
    const running = isDirectServiceRunning();
    if (running) {
      log('  Direct process: running');
    } else {
      log('  Direct process: not found');
      log('  Status: stopped\n');
      log("  Run 'npx dialog-survey start' to start the service.");
      return;
    }
  }

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

export async function main(argv) {
  const { command, flags } = parseArgs(argv);

  switch (command) {
    case 'install':
      await installCommand(flags);
      break;
    case 'uninstall':
      await uninstallCommand(flags);
      break;
    case 'start':
      await startCommand();
      break;
    case 'stop':
      await stopCommand();
      break;
    case 'status':
      await statusCommand();
      break;
    default:
      printHelp();
      break;
  }
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
