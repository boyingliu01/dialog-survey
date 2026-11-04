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

function probe(name) {
  const spec = PROBES[name];
  if (!spec) return { name, status: 'unprobeable' };
  const run = spawnSync(spec.command, spec.args, { encoding: 'utf8' });
  // `spawnSync` sets `error` when the binary is absent; a non-zero exit with
  // output is still worth reading, because some tools warn and proceed.
  if (run.error) return { name, status: 'missing', detail: run.error.message };
  const version = extractVersion(`${run.stdout ?? ''}${run.stderr ?? ''}`);
  if (!version) return { name, status: 'unparseable', detail: (run.stdout ?? '').trim() };
  return { name, status: 'found', version };
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

/** Judge one probe result against its config entry. */
function judge(expected, actual) {
  if (actual.status === 'missing') return { ok: false, reason: 'not installed' };
  if (actual.status === 'unprobeable') return { ok: false, reason: 'no probe defined' };
  if (actual.status === 'unparseable') {
    return { ok: false, reason: `could not parse a version from "${actual.detail}"` };
  }
  if (actual.version === expected.pinned) return { ok: true };
  const shortfall = expected.minimum && compareVersions(actual.version, expected.minimum) < 0;
  return {
    ok: false,
    reason: shortfall
      ? `older than the required minimum ${expected.minimum} — features the gates rely on are missing`
      : `pinned ${expected.pinned}, found ${actual.version}`,
  };
}

function main() {
  const asJson = process.argv.slice(2).includes('--json');

  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  } catch (error) {
    process.stderr.write(`[gate-tools] cannot read ${CONFIG}: ${error.message}\n`);
    return 2;
  }

  const names = Object.keys(config).filter((key) => !key.startsWith('$'));
  if (names.length === 0) {
    process.stderr.write(`[gate-tools] ${CONFIG} declares no tools\n`);
    return 2;
  }

  const results = names.map((name) => {
    const actual = probe(name);
    return { name, expected: config[name].pinned, ...actual, ...judge(config[name], actual) };
  });

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  } else {
    for (const row of results) {
      const seen = row.version ?? '—';
      const mark = row.ok ? 'ok  ' : 'FAIL';
      process.stdout.write(`[gate-tools] ${mark} ${row.name.padEnd(16)} ${seen.padEnd(9)}`);
      if (!row.ok) process.stdout.write(`  ${row.reason}`);
      process.stdout.write('\n');
    }
  }

  const failed = results.filter((row) => !row.ok);
  if (failed.length === 0) return 0;

  if (!asJson) {
    process.stderr.write(`
[gate-tools] ${failed.length} tool(s) drifted from tools/gate-tools.json.
          Raw lizard CCN changes between versions, so a drift makes Gate 3
          incomparable with its own baseline. Either install the pinned
          version or bump tools/gate-tools.json deliberately and record why.
`);
  }
  return 1;
}

process.exit(main());
