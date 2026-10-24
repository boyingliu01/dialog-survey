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

function parseArgs(argv) {
  const flags = { dir: process.cwd(), dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg === '--dir') {
      flags.dir = argv[i + 1];
      i += 1;
      if (!flags.dir) throw new Error('--dir requires a value');
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(
        'Usage: node scripts/prune-runtime-deps.mjs [--dir <installDir>] [--dry-run] [--verbose]\n'
      );
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
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

/** `dependencies` + non-optional `peerDependencies`. */
function runtimeDepsOf(manifest) {
  const deps = new Set(Object.keys(manifest.dependencies ?? {}));
  const peerMeta = manifest.peerDependenciesMeta ?? {};
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    if (peerMeta[peer]?.optional === true) continue;
    deps.add(peer);
  }
  return [...deps];
}

/**
 * Every package name the compiled app imports. Parsing `dist/` (not `src/`)
 * keeps the truth aligned with what actually ships.
 */
function collectAppRoots(distDir) {
  const roots = new Set();
  const importPattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      for (const match of readFileSync(full, 'utf8').matchAll(importPattern)) {
        const spec = match[1];
        if (spec.startsWith('.')) continue;
        if (NON_PACKAGE_PREFIX.test(spec)) continue;
        roots.add(packageNameOf(spec));
      }
    }
  };
  walk(distDir);
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
function resolveFrom(nodeModulesDir, fromDir, dep) {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, 'node_modules', dep);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (resolve(dir) === resolve(nodeModulesDir)) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const top = join(nodeModulesDir, dep);
  return existsSync(join(top, 'package.json')) ? top : undefined;
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
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    const manifest = readJson(join(dir, 'package.json'));
    if (!manifest) continue;
    seen.add(dir);
    for (const dep of runtimeDepsOf(manifest)) {
      const depDir = resolveFrom(nodeModulesDir, dir, dep);
      if (depDir && !seen.has(depDir)) queue.push(depDir);
    }
  }
  return seen;
}

/** Every package directory installed in `nodeModulesDir`. */
function listInstalledDirs(nodeModulesDir) {
  const dirs = [];
  if (!existsSync(nodeModulesDir)) return dirs;
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
    const scopeDir = join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory()) dirs.push(join(scopeDir, sub.name));
      }
    } else {
      dirs.push(scopeDir);
    }
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

  const verb = flags.dryRun ? 'would remove' : 'removed';
  process.stdout.write(
    `[prune] ${verb} ${toRemove.length} package(s), ${(freed / 1048576).toFixed(1)} MB\n`
  );

  const names = toRemove.map((d) => nameFromDir(nodeModulesDir, d));
  const shown = flags.verbose ? names : names.slice(0, 12);
  for (const name of shown) process.stdout.write(`  - ${name}\n`);
  if (!flags.verbose && names.length > 12) {
    process.stdout.write(`  … and ${names.length - 12} more (--verbose for all)\n`);
  }
}

/** Every dependency of every kept package must still resolve, or the tree is broken. */
function assertKeptPackagesResolve(keep, nodeModulesDir) {
  const dangling = [];
  for (const dir of keep) {
    const manifest = readJson(join(dir, 'package.json'));
    if (!manifest) {
      dangling.push(`${nameFromDir(nodeModulesDir, dir)} (manifest unreadable)`);
      continue;
    }
    for (const dep of runtimeDepsOf(manifest)) {
      if (!resolveFrom(nodeModulesDir, dir, dep)) {
        dangling.push(`${manifest.name} -> ${dep}`);
      }
    }
  }

  if (dangling.length > 0) {
    process.stderr.write('[prune] FAILED — kept packages lost dependencies:\n');
    for (const entry of dangling) process.stderr.write(`  x ${entry}\n`);
    process.exit(1);
  }
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const installDir = resolve(flags.dir);
  const nodeModulesDir = join(installDir, 'node_modules');
  const distDir = join(installDir, 'dist');

  if (!existsSync(nodeModulesDir)) {
    process.stderr.write(`[prune] no node_modules at ${nodeModulesDir}\n`);
    process.exit(2);
  }
  if (!existsSync(distDir)) {
    process.stderr.write(
      `[prune] no dist/ at ${distDir} — build first, otherwise the app's real imports are unknowable\n`
    );
    process.exit(2);
  }

  const appRoots = collectAppRoots(distDir);
  if (appRoots.size === 0) {
    process.stderr.write(`[prune] parsed 0 imports from ${distDir} — refusing to guess\n`);
    process.exit(2);
  }

  const keep = reachableFrom(nodeModulesDir, appRoots);
  const installed = listInstalledDirs(nodeModulesDir);

  reportRemoval(installed, keep, flags, nodeModulesDir);

  if (flags.verbose) {
    process.stdout.write(`[prune] app imports ${appRoots.size} package(s) from dist/\n`);
    for (const root of [...appRoots].sort()) process.stdout.write(`  + ${root}\n`);
  }

  assertKeptPackagesResolve(keep, nodeModulesDir);

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
