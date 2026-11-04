#!/usr/bin/env node
/**
 * Verify the xp-gate Python toolchain matches tools/gate-tools.json.
 *
 * Why this exists: the gates shell out to lizard, semgrep and detect-secrets,
 * which are pip installs living outside this repo and therefore outside
 * package.json's reach. A `pip install -U` silently changes what Gate 3 reports,
 * and for lizard the upstream CHANGELOG says CCN values may RISE OR FALL between
 * versions — so a drift turns the ratchet baseline into a comparison between two
 * different measurements. Worse, a stale lizard can be missing features the gates
 * would benefit from: 1.21.3 predates `-Ecognitive`, which is why an earlier
 * reading of AGENTS.md wrongly concluded lizard had no cognitive metric.
 *
 * Exit codes: 0 = all match, 1 = a mismatch or missing tool, 2 = unusable config
 * or no tools could be probed. "Could not check" is never reported as a pass.
 *
 * Usage: node scripts/verify-gate-tools.cjs [--json]
 */
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
// Overridable so the tests can point it at a deliberately wrong pin without
// touching the committed file.
const CONFIG = process.env['GATE_TOOLS_CONFIG'] || join(ROOT, 'tools', 'gate-tools.json');

/** The command each config key is probed through. */
const PROBES = {
  lizard: { command: 'lizard', args: ['--version'] },
  semgrep: { command: 'semgrep', args: ['--version'] },
  'detect-secrets': { command: 'detect-secrets-hook', args: ['--version'] },
};

/**
 * `lizard --version` prints "1.25.0"; `semgrep --version` prints "1.183.0";
 * `detect-secrets-hook --version` prints "1.5.52". All three are a bare semver
 * on the last non-empty line, but be tolerant of a leading label such as
 * "lizard 1.25.0" rather than assuming the first token is the number.
 */
function extractVersion(text) {
  const match = String(text).match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

/** Both output streams joined: some tools print versions to stderr. */
function outputOf(run) {
  return `${run.stdout ?? ''}${run.stderr ?? ''}`;
}

function probe(name) {
  const spec = PROBES[name];
  if (!spec) return { name, status: 'unprobeable' };
  const run = spawnSync(spec.command, spec.args, { encoding: 'utf8' });
  // `spawnSync` sets `error` when the binary is absent; a non-zero exit with
  // output is still worth reading, because some tools warn and proceed.
  if (run.error) return { name, status: 'missing', detail: run.error.message };
  const version = extractVersion(outputOf(run));
  if (version) return { name, status: 'found', version };
  return { name, status: 'unparseable', detail: (run.stdout ?? '').trim() };
}

/** Compare dotted numeric versions, so 1.9.0 sorts below 1.10.0. */
function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Why a probe that did not report a usable version cannot be judged.
 *
 * A table rather than an `if` chain: these are the only statuses that make a
 * version comparison meaningless, and each has a distinct message the user needs
 * (install it / fix the config / the tool printed something unexpected).
 */
const UNUSABLE_STATUSES = {
  missing: () => 'not installed',
  unprobeable: () => 'no probe defined',
  unparseable: (actual) => `could not parse a version from "${actual.detail}"`,
};

/** Judge one probe result against its config entry. */
function judge(expected, actual) {
  const unusable = UNUSABLE_STATUSES[actual.status];
  if (unusable) return { ok: false, reason: unusable(actual) };
  if (actual.version === expected.pinned) return { ok: true };
  return { ok: false, reason: driftReason(expected, actual.version) };
}

/**
 * Explain a version mismatch.
 *
 * "Older than the minimum" and "simply not the pinned version" are different
 * problems: the first means features the gates rely on are absent, which a pin
 * bump alone will not fix for the user reading the message.
 */
function driftReason(expected, version) {
  const shortfall = expected.minimum && compareVersions(version, expected.minimum) < 0;
  if (shortfall)
    return `older than the required minimum ${expected.minimum} — features the gates rely on are missing`;
  return `pinned ${expected.pinned}, found ${version}`;
}

/** The tool names the config declares, excluding `$`-prefixed metadata keys. */
function toolNamesOf(config) {
  return Object.keys(config).filter((key) => !key.startsWith('$'));
}

/** Print one result row in the human-readable report. */
function writeRow(row) {
  process.stdout.write(
    `[gate-tools] ${row.ok ? 'ok  ' : 'FAIL'} ${row.name.padEnd(16)} ${(row.version ?? '—').padEnd(9)}`
  );
  if (!row.ok) process.stdout.write(`  ${row.reason}`);
  process.stdout.write('\n');
}

/** Write the drift explanation, which only makes sense in text mode. */
function writeDriftAdvice(failedCount) {
  process.stderr.write(`
[gate-tools] ${failedCount} tool(s) drifted from tools/gate-tools.json.
          Raw lizard CCN changes between versions, so a drift makes Gate 3
          incomparable with its own baseline. Either install the pinned
          version or bump tools/gate-tools.json deliberately and record why.
`);
}

/** Read the pin file, or null after reporting why it is unusable. */
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG, 'utf8'));
  } catch (error) {
    process.stderr.write(`[gate-tools] cannot read ${CONFIG}: ${error.message}\n`);
    return null;
  }
}

/** Probe and judge every declared tool. */
function judgeAll(config, names) {
  return names.map((name) => {
    const actual = probe(name);
    return { name, expected: config[name].pinned, ...actual, ...judge(config[name], actual) };
  });
}

/** Print the results in the chosen format. */
function writeResults(results, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
    return;
  }
  for (const row of results) writeRow(row);
}

/**
 * Read the pin file and return the tool names it declares.
 *
 * Both failures here are exit code 2 ("could not check"), never 1: an unreadable
 * or empty pin file says nothing about the installed tools, and reporting it as
 * drift would send the reader looking at the wrong thing.
 */
function requireDeclaredTools() {
  const config = loadConfig();
  if (!config) return null;
  const names = toolNamesOf(config);
  if (names.length > 0) return { config, names };
  process.stderr.write(`[gate-tools] ${CONFIG} declares no tools\n`);
  return null;
}

function main() {
  const asJson = process.argv.slice(2).includes('--json');
  const declared = requireDeclaredTools();
  if (!declared) return 2;

  const results = judgeAll(declared.config, declared.names);
  writeResults(results, asJson);

  const failedCount = results.filter((row) => !row.ok).length;
  if (failedCount === 0) return 0;
  if (!asJson) writeDriftAdvice(failedCount);
  return 1;
}

process.exit(main());
