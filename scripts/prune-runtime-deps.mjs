#!/usr/bin/env node
/**
 * prune-runtime-deps.mjs — drop build-time-only packages from a deployed tree.
 *
 * Issue #210. `npm ci --omit=dev` does NOT produce a runtime-only tree here, and
 * `npm prune --omit=dev` does not fix it either. Both stop at the same wall:
 * `prisma` and `typescript` are devDependencies of the root package AND optional
 * peerDependencies of `@prisma/client`
 * (`peerDependenciesMeta: { prisma: { optional: true } }`). npm records such
 * packages as `devOptional` in the lockfile, and `--omit=dev` deliberately keeps
 * `devOptional` entries because an optional peer *might* be needed at runtime.
 *
 * Here it is not: `@prisma/client` depends only on `@prisma/client-runtime-utils`
 * and its emitted code never imports the CLI. The price of that ambiguity is
 * large — `prisma` drags in `@prisma/dev`, `@prisma/studio-core` (Prisma Studio,
 * a GUI a server never opens), `effect`, an embedded PGlite, and the
 * schema-engine binary: ~180 MB of a ~370 MB tree.
 *
 * Why not a hard-coded deletion list? Because it goes stale silently the moment
 * any of those packages gains a dependency, and the failure mode is a broken
 * deploy. So this script derives the answer from the app itself:
 *
 *   1. Roots = the packages `dist/` actually imports (parsed from the compiled
 *      output), NOT a hand-written list.
 *   2. Dependencies = `dependencies` + non-optional `peerDependencies`
 *      (optional peers are excluded on purpose — that is the edge being cut).
 *   3. Everything installed but unreachable from those roots is removed.
 *   4. Finally every kept package must resolve all of its real dependencies;
 *      otherwise the script fails instead of leaving a landmine.
 *
 * Resolution follows Node's rules (walking up through nested `node_modules`),
 * because npm keeps conflicting versions nested rather than hoisted.
 *
 * Usage:
 *   node scripts/prune-runtime-deps.mjs [--dir <installDir>] [--dry-run] [--verbose]
 *
 * Exit codes: 0 = verified, 1 = a kept package lost a dependency,
 *             2 = usage error / missing dist or node_modules.
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** Specifier prefixes that are never npm packages. */
const NON_PACKAGE_PREFIX = /^(node:|data:|file:|https?:)/;

const USAGE =
  'Usage: node scripts/prune-runtime-deps.mjs [--dir <installDir>] [--dry-run] [--verbose]\n';

/** Flags that take no value and are simply turned on. */
const BOOLEAN_FLAGS = { '--dry-run': 'dryRun', '--verbose': 'verbose' };

/** Read the value following `--dir`, rejecting a missing one. */
function readDirValue(argv, index) {
  const value = argv[index + 1];
  if (!value) throw new Error('--dir requires a value');
  return value;
}

/** Handle a flag that consumes no value; return false when it is not one. */
function applySimpleFlag(arg, flags) {
  if (arg in BOOLEAN_FLAGS) {
    flags[BOOLEAN_FLAGS[arg]] = true;
    return true;
  }
  if (arg !== '-h' && arg !== '--help') return false;
  process.stdout.write(USAGE);
  process.exit(0);
}

function parseArgs(argv) {
  const flags = { dir: process.cwd(), dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      flags.dir = readDirValue(argv, i);
      i += 1;
      continue;
    }
    if (!applySimpleFlag(arg, flags)) throw new Error(`unknown argument: ${arg}`);
  }
  return flags;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** `@scope/pkg/sub/path` -> `@scope/pkg`; `pkg/sub` -> `pkg`. */
function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Keys of a manifest field, or an empty list when it is absent. */
function keysOfField(manifest, field) {
  return Object.keys(manifest[field] ?? {});
}

/** `dependencies` + non-optional `peerDependencies`. */
function runtimeDepsOf(manifest) {
  const deps = new Set(keysOfField(manifest, 'dependencies'));
  const peerMeta = manifest.peerDependenciesMeta ?? {};
  for (const peer of keysOfField(manifest, 'peerDependencies')) {
    if (peerMeta[peer]?.optional !== true) deps.add(peer);
  }
  return [...deps];
}

/** Regex matching an ESM or CJS import specifier. */
const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** Collect package names from one compiled file. */
function packageNamesInFile(file, roots) {
  for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
    const spec = match[1];
    if (spec.startsWith('.') || NON_PACKAGE_PREFIX.test(spec)) continue;
    roots.add(packageNameOf(spec));
  }
}

/** Record every package name imported under `dir`, recursing into subdirectories. */
function collectRootsIn(dir, roots) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRootsIn(full, roots);
      continue;
    }
    if (/\.(js|mjs|cjs)$/.test(entry.name)) packageNamesInFile(full, roots);
  }
}

/**
 * Every package name the compiled app imports. Parsing `dist/` (not `src/`)
 * keeps the truth aligned with what actually ships.
 */
function collectAppRoots(distDir) {
  const roots = new Set();
  collectRootsIn(distDir, roots);
  return roots;
}

/** Package name for a directory directly inside `nodeModulesDir`. */
function nameFromDir(nodeModulesDir, dir) {
  return relative(nodeModulesDir, dir).split(sep).join('/');
}

/**
 * Resolve `dep` from the package at `fromDir`, the way Node does: try
 * `<fromDir>/node_modules/<dep>`, then walk up to each ancestor `node_modules`
 * and try again. npm hoists most packages but keeps conflicting versions nested.
 */
/** Does `dir` hold an installed copy of some package? */
function isInstalledPackage(dir) {
  return existsSync(join(dir, 'package.json'));
}

/** The next ancestor directory to search for a nested `node_modules`, if any. */
function ancestorFor(nodeModulesDir, dir) {
  if (resolve(dir) === resolve(nodeModulesDir)) return undefined;
  const parent = dirname(dir);
  return parent === dir ? undefined : parent;
}

/**
 * Every directory whose `node_modules` Node would consult, from `fromDir` up to
 * the installation root.
 */
function searchPathFor(nodeModulesDir, fromDir) {
  const path_ = [];
  for (let dir = fromDir; dir !== undefined; dir = ancestorFor(nodeModulesDir, dir)) {
    path_.push(dir);
  }
  return path_;
}

function resolveFrom(nodeModulesDir, fromDir, dep) {
  for (const dir of searchPathFor(nodeModulesDir, fromDir)) {
    const candidate = join(dir, 'node_modules', dep);
    if (isInstalledPackage(candidate)) return candidate;
  }
  const top = join(nodeModulesDir, dep);
  return isInstalledPackage(top) ? top : undefined;
}

/**
 * Runtime graph reachable from the app's imports. Nodes are package
 * *directories*, so a hoisted copy and a nested copy are distinct — matching
 * what the runtime actually loads.
 */
function reachableFrom(nodeModulesDir, roots) {
  const seen = new Set();
  const queue = [];
  for (const root of roots) {
    const dir = resolveFrom(nodeModulesDir, nodeModulesDir, root);
    if (dir) queue.push(dir);
  }
  while (queue.length > 0) {
    visitNode(queue.shift(), { nodeModulesDir, seen, queue });
  }
  return seen;
}

/**
 * Mark one package directory as reached and enqueue its dependencies.
 *
 * Takes a `state` bag rather than three positional arguments because the caller
 * is a drain loop that only owns "what is next"; the frontier, the visited set
 * and the installation root all belong together.
 */
function visitNode(dir, state) {
  if (state.seen.has(dir)) return;
  const manifest = readJson(join(dir, 'package.json'));
  if (!manifest) return;
  state.seen.add(dir);
  enqueueDependencies(dir, manifest, state);
}

/** Resolve each real dependency of `dir` and queue the ones not yet visited. */
function enqueueDependencies(dir, manifest, state) {
  for (const dep of runtimeDepsOf(manifest)) {
    const depDir = resolveFrom(state.nodeModulesDir, dir, dep);
    if (depDir && !state.seen.has(depDir)) state.queue.push(depDir);
  }
}

/** Package directories inside a `@scope/` directory. */
function scopedPackageDirs(scopeDir) {
  const dirs = [];
  for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
    if (sub.isDirectory()) dirs.push(join(scopeDir, sub.name));
  }
  return dirs;
}

/** Package directories a single top-level entry contributes. */
function packageDirsFrom(nodeModulesDir, entry) {
  if (entry.name.startsWith('.') || !entry.isDirectory()) return [];
  const full = join(nodeModulesDir, entry.name);
  return entry.name.startsWith('@') ? scopedPackageDirs(full) : [full];
}

/** Every package directory installed in `nodeModulesDir`. */
function listInstalledDirs(nodeModulesDir) {
  if (!existsSync(nodeModulesDir)) return [];
  const dirs = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    dirs.push(...packageDirsFrom(nodeModulesDir, entry));
  }
  return dirs;
}

function dirSize(dir) {
  let total = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          total += readFileSync(full).length;
        } catch {
          /* unreadable file — ignore */
        }
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

/** How many package names to list before summarising the rest. */
const NAME_LIST_LIMIT = 12;

/** Print the removed packages, elapsed verb and freed size. */
function reportRemoved(toRemove, freed, flags, nodeModulesDir) {
  const verb = flags.dryRun ? 'would remove' : 'removed';
  process.stdout.write(
    `[prune] ${verb} ${toRemove.length} package(s), ${(freed / 1048576).toFixed(1)} MB\n`
  );
  listRemovedNames(toRemove, flags, nodeModulesDir);
}

/** Print the removed package names, truncated unless --verbose. */
function listRemovedNames(toRemove, flags, nodeModulesDir) {
  const names = toRemove.map((d) => nameFromDir(nodeModulesDir, d));
  const shown = flags.verbose ? names : names.slice(0, NAME_LIST_LIMIT);
  for (const name of shown) process.stdout.write(`  - ${name}\n`);
  const hidden = names.length - NAME_LIST_LIMIT;
  if (!flags.verbose && hidden > 0) {
    process.stdout.write(`  … and ${hidden} more (--verbose for all)\n`);
  }
}

/** Report what would be (or was) removed, and answer whether anything was. */
function reportRemoval(installed, keep, flags, nodeModulesDir) {
  // `installed` holds only top-level (hoisted) packages. A nested copy
  // (`pkg/node_modules/dep`) vanishes together with its parent, so it needs no
  // separate handling. Remove what the runtime graph does not reach.
  const toRemove = installed.filter((dir) => !keep.has(dir));

  if (toRemove.length === 0) {
    process.stdout.write('[prune] nothing to remove — tree is already runtime-only\n');
    return;
  }

  let freed = 0;
  for (const dir of toRemove) freed += dirSize(dir);

  if (!flags.dryRun) {
    for (const dir of toRemove) rmSync(dir, { recursive: true, force: true });
  }

  reportRemoved(toRemove, freed, flags, nodeModulesDir);
}

/** Report the dependencies of one kept package that no longer resolve. */
function danglingDepsOf(dir, nodeModulesDir) {
  const manifest = readJson(join(dir, 'package.json'));
  if (!manifest) return [`${nameFromDir(nodeModulesDir, dir)} (manifest unreadable)`];
  return runtimeDepsOf(manifest)
    .filter((dep) => !resolveFrom(nodeModulesDir, dir, dep))
    .map((dep) => `${manifest.name} -> ${dep}`);
}

/** Every dependency of every kept package must still resolve, or the tree is broken. */
function assertKeptPackagesResolve(keep, nodeModulesDir) {
  const dangling = [...keep].flatMap((dir) => danglingDepsOf(dir, nodeModulesDir));

  if (dangling.length > 0) {
    process.stderr.write('[prune] FAILED — kept packages lost dependencies:\n');
    for (const entry of dangling) process.stderr.write(`  x ${entry}\n`);
    process.exit(1);
  }
}

/**
 * Fail with exit code 2 unless the install tree is complete enough to reason
 * about.
 *
 * A table because each row is the same shape — a condition, and the message that
 * explains why the script refuses to continue without it. The messages matter:
 * "no dist/" is the common failure (someone ran the script before building) and
 * silently pruning against an unknown import set would delete live packages.
 */
const PRECONDITIONS = [
  {
    ok: (dirs) => existsSync(dirs.nodeModulesDir),
    message: (dirs) => `[prune] no node_modules at ${dirs.nodeModulesDir}\n`,
  },
  {
    ok: (dirs) => existsSync(dirs.distDir),
    message: (dirs) =>
      `[prune] no dist/ at ${dirs.distDir} — build first, otherwise the app's real imports are unknowable\n`,
  },
];

/** Fail with exit code 2 when the install tree is not usable. */
function requireUsableTree(dirs) {
  for (const check of PRECONDITIONS) {
    if (check.ok(dirs)) continue;
    process.stderr.write(check.message(dirs));
    process.exit(2);
  }
}

/** In verbose mode, list the package roots parsed out of `dist/`. */
function reportAppRoots(appRoots) {
  process.stdout.write(`[prune] app imports ${appRoots.size} package(s) from dist/\n`);
  for (const root of [...appRoots].sort()) process.stdout.write(`  + ${root}\n`);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const installDir = resolve(flags.dir);
  const dirs = {
    nodeModulesDir: join(installDir, 'node_modules'),
    distDir: join(installDir, 'dist'),
  };
  requireUsableTree(dirs);

  const appRoots = collectAppRoots(dirs.distDir);
  if (appRoots.size === 0) {
    process.stderr.write(`[prune] parsed 0 imports from ${dirs.distDir} — refusing to guess\n`);
    process.exit(2);
  }

  const keep = reachableFrom(dirs.nodeModulesDir, appRoots);
  const installed = listInstalledDirs(dirs.nodeModulesDir);

  reportRemoval(installed, keep, flags, dirs.nodeModulesDir);
  if (flags.verbose) reportAppRoots(appRoots);

  assertKeptPackagesResolve(keep, dirs.nodeModulesDir);

  process.stdout.write(
    `[prune] verified: ${keep.size} kept package(s), all dependencies resolve\n`
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[prune] error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
