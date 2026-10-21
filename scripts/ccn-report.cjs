#!/usr/bin/env node
/**
 * Measure cyclomatic complexity per function using the TypeScript compiler AST.
 *
 * Measurement engine: TypeScript's own parser (already a direct dependency).
 * Earlier releases re-implemented TS parsing with regular expressions and brace
 * balancing; that approach silently mis-measured large parts of this tree, and
 * the specific failures are documented above the measurement core below.
 *
 * lizard is NOT used as the source of truth. The gate still runs it as a
 * cross-check via --csv-verified, where the AST numbers overwrite lizard's
 * before the ratchet grades them.
 *
 * Usage: node scripts/ccn-report.cjs [--threshold N] [--json] [--report-only]
 *                                 [--write-baseline] [--csv-verified] [--root DIR]
 *                                 [paths...]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Recursively collect .ts files, skipping build output and generated code. */
function collectFiles(root, acc = []) {
  const skip = new Set(['node_modules', 'dist', 'coverage', 'generated', '.stryker-tmp']);
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}
// ---------------------------------------------------------------------------
// Measurement core — TypeScript compiler AST.
//
// Earlier versions re-implemented TS parsing with regular expressions and brace
// matching. That approach is structurally unable to get this right, and its
// failures were not theoretical:
//
//   * `for (...) {` and `catch (e) {` matched the method-shorthand branch, so
//     their bodies were blanked before counting — every `if`, `&&` and nested
//     `catch` inside a loop vanished from the CCN.
//   * `function f(): { a: string } { … }` had its return-type literal taken for
//     the body, so a CCN-8 function measured 1 and its real body was never
//     inspected.
//   * Class methods (`async getAccessToken(): Promise<string> {`) matched
//     neither recognised form. 170 methods — 99 of them at CCN >= 2 and 8 above
//     the threshold — were simply never measured, and could never appear in the
//     baseline the ratchet compares against.
//
// The TypeScript compiler is already a direct dependency and knows the real
// syntax tree, so it decides every boundary here. lizard still runs in the gate
// as a cross-check, but its numbers never win a disagreement.
// ---------------------------------------------------------------------------

/** Kinds that add a decision point, matching the classic McCabe total. */
function decisionKinds(ts) {
  return new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.CaseClause,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.ConditionalExpression,
  ]);
}

/**
 * CCN of a function body, counting only decisions the function itself owns.
 *
 * A registration function like `interviewPlanRoutes(app)` declares every
 * handler inline; charging their branches to it would report a number no one can
 * act on, so nested function bodies are skipped. Short-circuit and nullish
 * operators count, because they are real branch points.
 */
function countOwnedCcn(ts, kinds, body) {
  let ccn = 1;
  const visit = (node) => {
    if (!node) return;
    // Stop at a nested function: its decisions belong to the child. The body of
    // the function being measured is reached through its children, so comparing
    // against `body` keeps that function's own decisions.
    if (ts.isFunctionLike(node) && node.body && node.body !== body && node !== body) return;
    if (kinds.has(node.kind)) ccn++;
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        ccn++;
      }
    }
    ts.forEachChild(node, visit);
  };
  // A concise arrow body (`x => a && b ? c : d`) is an expression, not a block.
  // Its tests are real decisions, so it is measured rather than skipped — these
  // callbacks are everywhere in this codebase and were previously invisible.
  if (!ts.isBlock(body)) {
    visit(body);
    return ccn;
  }
  for (const child of body.statements) visit(child);
  return ccn;
}

/** The name a function is known by: declaration, variable, or property key. */
function nameOfFunction(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (parent && ts.isPropertyAssignment(parent)) {
    const n = parent.name;
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isStringLiteral(n)) return n.text;
  }
  if (parent && ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '(anonymous)';
}

/** Load the TypeScript compiler, or null when it is not installed. */
function loadTypeScript() {
  try {
    return require('typescript');
  } catch {
    return null;
  }
}

/**
 * Measure every function in one file.
 *
 * Returns `{ rows }` on success and throws when the file has syntax errors — a
 * caller that cannot measure a file must say so rather than report it clean.
 *
 * `createSourceFile` does not throw on bad syntax; it returns a tree containing
 * error nodes. Grading that tree would silently under-measure the file, so
 * `parseDiagnostics` is checked explicitly.
 */
function measureFileAst(ts, file, rootDir) {
  const source = fs.readFileSync(file, 'utf8');
  const kinds = decisionKinds(ts);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

  const diagnostics = sf.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const at =
      typeof first.start === 'number'
        ? `:${sf.getLineAndCharacterOfPosition(first.start).line + 1}`
        : '';
    throw new Error(
      `${relPath}${at}: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')} ` +
        `(${diagnostics.length} syntax error(s))`
    );
  }

  const rows = [];

  const walk = (node) => {
    const isFunction =
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node);

    // Every function with a body is measured, whether the body is a block or a
    // concise expression. Skipping expression-bodied arrows left real callbacks
    // (`.filter((r) => a && b)`) entirely outside the gate.
    if (isFunction && node.body) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      rows.push({
        file: relPath,
        name: ts.isConstructorDeclaration(node) ? 'constructor' : nameOfFunction(ts, node),
        line: line + 1,
        column: character + 1,
        ccn: countOwnedCcn(ts, kinds, node.body),
        bucket: bucketFor(relPath),
      });
      // Keep walking: methods and callbacks nested inside this function are
      // measured in their own right.
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return { rows };
}

/** Measure every function in every given file, tolerating unparsable files. */
function measureFilesAst(ts, files, rootDir) {
  const rows = [];
  const failures = [];
  for (const f of files) {
    try {
      const res = measureFileAst(ts, f, rootDir);
      for (const row of res.rows) rows.push(row);
    } catch (e) {
      failures.push({ file: path.relative(rootDir, f).replace(/\\/g, '/'), error: e.message });
    }
  }
  return { rows, failures };
}

/** Resolve the roots argument list to a flat file list. */
function resolveFiles(roots) {
  const files = [];
  for (const r of roots) {
    let stat;
    try {
      stat = fs.statSync(r);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const f of collectFiles(r)) files.push(f);
    } else {
      files.push(r);
    }
  }
  return files;
}

/**
 * Names that occur more than once within the same file, so the baseline can key
 * them by line instead of colliding on one entry.
 */
function duplicateNames(rows) {
  const tally = new Map();
  for (const r of rows) {
    const k = `${r.file}::${r.name}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return new Set([...tally].filter(([, n]) => n > 1).map(([k]) => k));
}

/**
 * Stable baseline key. Anonymous functions and repeated names are line-keyed;
 * everything else is keyed by name so unrelated edits above a function do not
 * invalidate its record.
 */
function baselineKey(relPath, name, line, duplicateNamesSet) {
  const p = relPath.replace(/\\/g, '/');
  if (name === '(anonymous)' || name === 'constructor') return `${p}::${name}@${line}`;
  if (duplicateNamesSet.has(`${p}::${name}`)) return `${p}::${name}@${line}`;
  return `${p}::${name}`;
}

/** Which population a file belongs to; only `production` enters the baseline. */
function bucketFor(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (/(^|\/)__tests__?\//.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p)) return 'test';
  if (p.startsWith('src/npm-package/') || /^plugins\/[^/]+\/src\//.test(p)) return 'mirror';
  // Machine-generated code (Prisma client, and anything else emitted into
  // src/generated) is not hand-written and is gitignored: grading it would hold
  // us to a formatter's output, and its dense type-level helpers are exactly what
  // lizard reports phantom functions for.
  if (p.startsWith('src/generated/')) return 'generated';
  return 'production';
}

/**
 * Split one CSV line, honouring the double-quote escaping lizard emits.
 *
 * Written as a small state machine: a `""` inside a quoted field is one literal
 * quote (and consumes both characters), a bare `"` toggles quoting, and a comma
 * outside quotes ends the field. Tracking the consumed length keeps the nested
 * quote handling out of the loop body.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cur += '"';
      i += 2;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      i += 1;
      continue;
    }
    if (!quoted && ch === ',') {
      out.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  out.push(cur);
  return out;
}

/** Quote a CSV field when it contains a delimiter, quote, or newline. */
function csvEscape(field) {
  const s = String(field ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Write a line to stdout without `console` (biome noConsole). */
function write(line) {
  process.stdout.write(`${line}\n`);
}

/**
 * Decide whether lizard's row at `startLine` claims something we should resolve.
 *
 * lizard attributes CCN to constructs it mistakes for functions: interface
 * members typed `readonly disconnect: () => Promise<void>;`, a property annotated
 * `let release: (() => void) | undefined;`, a stray `...` or `,` in a type literal,
 * or a row named after the `if` it was scanning. Those rows describe no function,
 * so dropping them is correct. A brace-based parser cannot tell a function *type*
 * from a function *implementation* — the AST can, which is why the decision is
 * asked of the AST rather than of the text.
 *
 * When the line really does implement a function we failed to measure, that is a
 * hole in our own coverage and the gate must fail rather than grade around it.
 * Returning true means "insist on resolving this row".
 */
function lizardRowIsRealFunction(ts, absPath, startLine, name) {
  // lizard names rows after the statement being scanned, an interface member, or
  // a punctuation fragment. No function is called any of those.
  if (!name || /^(if|else|for|while|do|switch|catch|try|return|case)$/.test(name)) return false;
  if (!/^[\w$.#[\]()]+$/.test(name)) return false;

  let source;
  try {
    source = fs.readFileSync(absPath, 'utf8');
  } catch {
    return true; // cannot inspect the file, so do not excuse the row
  }
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const want = Number.parseInt(startLine, 10);
  let found = false;
  const visit = (node) => {
    if (found) return;
    // Only nodes that carry an implementation count; a FunctionTypeNode or a
    // CallSignatureDeclaration is a type, and has no body.
    const implementsBody =
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)) &&
      node.body !== undefined;
    if (implementsBody) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (line === want) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Parse one lizard CSV row into the coordinates we need to find its function.
 *
 * lizard's `fn@start-end@path` field packs three facts into one string, and the
 * middle one is a RANGE, so the start line is its head rather than the field
 * itself. Older lizard versions omit it and put the line in a later column.
 */
function parseLizardRow(cols, rootDir) {
  const parts = (cols[5] ?? '').split('@');
  const name = parts[0] ?? '';
  const rawPath = parts.length >= 3 ? parts.slice(2).join('@') : (cols[6] ?? '');
  const lineField = parts.length >= 3 ? parts[1] : (cols[9] ?? '0');
  const startLine = String(Number.parseInt(lineField.split('-')[0], 10));
  const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);
  const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
  return { name, absPath, relPath, startLine };
}

/**
 * Find the AST function a lizard row refers to.
 *
 * Rows are matched by name; the line breaks ties between same-named functions.
 * Every anonymous arrow is called `(anonymous)`, so those are matched by line
 * alone.
 */
function findMeasuredFunction(measured, name, startLine) {
  const sameName = measured.filter((m) => m.name === name);
  const onLine = (m) => String(m.line) === startLine;
  if (name === '(anonymous)') return sameName.find(onLine);
  return sameName.length === 1 ? sameName[0] : sameName.find(onLine);
}

/**
 * Decide what to do with a row the AST could not resolve.
 *
 * Two very different situations live here, and conflating them was the original
 * bug:
 *
 *   - lizard invented the row. Its parser reports type-level signatures it
 *     believes are functions (`readonly disconnect: () => Promise<void>;`, a
 *     stray `...` in a type literal). There is no function to measure, so the row
 *     is DROPPED: keeping it at lizard's CCN is what let a wrong number through,
 *     and failing on it would block every commit for a non-function.
 *   - lizard names a real function we cannot see. That is a hole in our own
 *     measurement, and the gate must not grade around it — fail closed.
 *
 * A row is also excused when the AST already measured something starting on that
 * exact line: lizard splits one construct into several rows (`fastify.post(path,
 * {...}, async (req) => {` is one function, but it reports the comma too), and
 * the measured function is what the ratchet grades.
 *
 * Returns 'dropped' or 'unresolved'.
 */
function classifyUnresolvedRow(ts, measured, row) {
  const alreadyMeasured = measured.some((m) => String(m.line) === row.startLine);
  if (alreadyMeasured) return 'dropped';
  if (!lizardRowIsRealFunction(ts, row.absPath, row.startLine, row.name)) return 'dropped';
  return 'unresolved';
}

/**
 * Rewrite one lizard CSV line so its CCN column carries the AST measurement.
 *
 * Returns the rewritten line, or null when the row contributes nothing (it was
 * dropped). `unresolved` and `disagreements` are collected for the caller to
 * report.
 */
function verifyCsvRow(ts, cols, rootDir, cache, acc) {
  const row = parseLizardRow(cols, rootDir);
  // Generated code is never graded, so it is never resolved either.
  if (bucketFor(row.relPath) === 'generated') {
    acc.dropped.push(`${row.relPath}::${row.name}@${row.startLine}`);
    return null;
  }
  if (!cache.has(row.absPath)) {
    try {
      cache.set(row.absPath, measureFileAst(ts, row.absPath, rootDir).rows);
    } catch {
      // Unreadable file: the gate must not proceed on an unmeasured number.
      cache.set(row.absPath, null);
    }
  }
  const measured = cache.get(row.absPath);
  if (!measured) {
    acc.unresolved.push(`${row.relPath}:${row.name}@${row.startLine}`);
    return null;
  }
  const hit = findMeasuredFunction(measured, row.name, row.startLine);
  if (!hit) {
    const verdict = classifyUnresolvedRow(ts, measured, row);
    const label = `${row.relPath}::${row.name}@${row.startLine}`;
    acc[verdict].push(label);
    return null;
  }
  // Report only when both engines claim a measurement; a type-level row lizard
  // invents has no AST counterpart and was rejected above.
  const lizardCcn = Number(cols[1]);
  if (Number.isFinite(lizardCcn) && lizardCcn !== hit.ccn) {
    acc.disagreements.push(
      `${row.relPath}::${row.name}@${row.startLine} lizard=${lizardCcn} ast=${hit.ccn}`
    );
  }
  cols[1] = String(hit.ccn);
  return cols.map(csvEscape).join(',');
}

/** Write one explanatory line, showing the first few items of a long list. */
function reportBatch(label, items) {
  if (items.length === 0) return;
  const shown = items.slice(0, 5).join(', ');
  const more = items.length > 5 ? ', …' : '';
  process.stderr.write(`ccn-report: ${items.length} ${label}: ${shown}${more}\n`);
}

/**
 * Handle `--csv-verified batch`: read lizard's CSV, replace every CCN with the
 * AST's, and report disagreements and unmeasurable rows.
 */
function runCsvVerified(ts, input, rootDir) {
  const cache = new Map();
  const acc = { unresolved: [], dropped: [], disagreements: [] };
  const out = [];
  for (const line of input.split('\n')) {
    if (!line.trim()) continue;
    const rewritten = verifyCsvRow(ts, parseCsvLine(line), rootDir, cache, acc);
    if (rewritten !== null) out.push(rewritten);
  }

  write(out.join('\n'));
  // Informational: the AST value already replaced lizard's, so the gate grades
  // the correct number either way.
  reportBatch('row(s) where lizard disagreed (AST used)', acc.disagreements);
  // Informational: these rows describe no function, so nothing was measured.
  reportBatch('lizard row(s) that describe no function', acc.dropped);
  if (acc.unresolved.length > 0) {
    reportBatch('row(s) could not be measured by the AST', acc.unresolved);
    process.exitCode = 1;
  }
}

/**
 * Parse the command line into a plain options object.
 *
 * Positional arguments are treated as roots to measure, so `ccn-report.cjs src
 * scripts` works without a flag.
 */
function parseArgs(argv) {
  const options = {
    threshold: 10,
    asJson: false,
    writeBaseline: false,
    csvVerified: false,
    reportOnly: false,
    rootDir: process.cwd(),
    paths: [],
  };
  const flags = {
    '--threshold': (v) => {
      options.threshold = Number(v);
    },
    '--json': () => {
      options.asJson = true;
    },
    '--write-baseline': () => {
      options.writeBaseline = true;
    },
    '--csv-verified': () => {
      options.csvVerified = true;
    },
    '--root': (v) => {
      options.rootDir = v;
    },
    '--report-only': () => {
      options.reportOnly = true;
    },
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = flags[argv[i]];
    if (!flag) {
      options.paths.push(argv[i]);
      continue;
    }
    // Value-taking flags consume the next argument; boolean flags ignore it.
    const takesValue = argv[i] === '--threshold' || argv[i] === '--root';
    flag(takesValue ? argv[++i] : undefined);
  }
  return options;
}

/** Write `.ccn-baseline.json` from the measured rows. */
function writeBaselineFile(allRows, dups, rootDir) {
  const baseline = {};
  const kept = allRows
    .filter((r) => r.bucket === 'production')
    .sort((a, b) => (a.file + a.name).localeCompare(b.file + b.name));
  for (const r of kept) {
    baseline[baselineKey(r.file, r.name, r.line, dups)] = r.ccn;
  }
  fs.writeFileSync(
    path.join(rootDir, '.ccn-baseline.json'),
    `${JSON.stringify(baseline, null, 2)}\n`
  );
  write(`Wrote ${kept.length} function(s) to .ccn-baseline.json`);
}

/** Print the threshold report and return the exit code it implies. */
function reportThreshold(allRows, threshold, options) {
  const results = allRows.filter((r) => r.ccn > threshold).sort((a, b) => b.ccn - a.ccn);
  if (options.asJson) {
    write(JSON.stringify({ threshold, count: results.length, results }, null, 2));
  } else {
    write(`CCN threshold: ${threshold} (TypeScript AST measurement)`);
    write('');
    if (results.length === 0) {
      write('No functions exceed the threshold.');
    } else {
      for (const r of results) {
        write(`  CCN ${String(r.ccn).padStart(3)}  ${r.name.padEnd(32)} ${r.file}:${r.line}`);
      }
      write('');
      write(`${results.length} function(s) exceed CCN ${threshold}.`);
    }
  }
  // --report-only prints the table without failing. `npm run complexity` uses
  // it for visibility; the gate itself converges via .ccn-baseline.json.
  return options.reportOnly || results.length === 0 ? 0 : 1;
}

/** Buffer stdin to a string and hand it to `onDone`. */
function readStdin(onDone) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => onDone(input));
}

/**
 * Entry point: parse arguments, then dispatch to the baseline writer, the
 * threshold report, or the `--csv-verified` batch.
 */
function main() {
  const options = parseArgs(process.argv.slice(2));

  // The AST is the only measurement engine. Without it there is no honest
  // number to report, so fail loudly instead of degrading to a regex guess.
  const ts = loadTypeScript();
  if (!ts) {
    process.stderr.write(
      'ccn-report: the typescript package is required to measure complexity (npm install).\n'
    );
    process.exitCode = 1;
    return;
  }

  // --csv-verified batch: xp-gate pipes `lizard --csv` in on stdin and expects a
  // CSV back whose CCN column carries OUR measurement. Gate 3 fails closed when
  // this exits non-zero.
  //
  // The AST decides. lizard is a regex/line parser whose TS spans were measured
  // wrong on this tree 28% of the time (it merged `scheduleAnalysis` into
  // `mergeState` and dropped it entirely), so its row is used only as the
  // carrier: the CCN column is overwritten from the AST measurement, and a
  // disagreement is reported so the two engines can be compared over time.
  //
  // A row we cannot attribute to an AST function fails the batch on purpose.
  // The previous version passed it through at lizard's number, which is exactly
  // how `mergeState` kept a wrong CCN through every gate run.
  if (options.csvVerified) {
    readStdin((input) => runCsvVerified(ts, input, options.rootDir));
    return;
  }

  const roots = options.paths.length > 0 ? options.paths : ['src'];
  // Collect every function; `--write-baseline` and the threshold filter both
  // apply afterwards. Passing a huge threshold here would keep nothing.
  const { rows: allRows, failures } = measureFilesAst(ts, resolveFiles(roots), options.rootDir);
  // A file we could not parse is not a clean file. Silently skipping it is how a
  // whole module can stay unmeasured while the gate reports success.
  if (failures.length > 0) {
    for (const f of failures) {
      process.stderr.write(`ccn-report: failed to parse ${f.file}: ${f.error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const dups = duplicateNames(allRows);
  if (options.writeBaseline) {
    writeBaselineFile(allRows, dups, options.rootDir);
    return;
  }
  process.exitCode = reportThreshold(allRows, options.threshold, options);
}

main();
