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
    if (ts.isFunctionLike(node) && node.body && node.body !== body) return;
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

    if (isFunction && node.body && ts.isBlock(node.body)) {
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
  return 'production';
}

/** Split one CSV line, honouring the double-quote escaping lizard emits. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
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

function main() {
  const args = process.argv.slice(2);
  let threshold = 10;
  let asJson = false;
  let writeBaseline = false;
  let csvVerified = false;
  let reportOnly = false;
  let rootDir = process.cwd();
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--threshold') threshold = Number(args[++i]);
    else if (a === '--json') asJson = true;
    else if (a === '--write-baseline') writeBaseline = true;
    else if (a === '--csv-verified') csvVerified = true;
    else if (a === '--root') rootDir = args[++i];
    else if (a === '--report-only') reportOnly = true;
    else paths.push(a);
  }

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
  if (csvVerified) {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      const out = [];
      const unresolved = [];
      const disagreements = [];
      const cache = new Map();
      for (const line of input.split('\n')) {
        if (!line.trim()) continue;
        const cols = parseCsvLine(line);
        // Columns: 1 NLOC, 2 CCN, 3 token_len, 4 param_count, 5 location size,
        //          6 fn@start-end@path, 7 path, 8 name, 9 signature, 10 start, 11 end
        const identity = cols[5] ?? '';
        const parts = identity.split('@');
        const name = parts[0] ?? '';
        // `fn@start-end@path`: the middle field is a RANGE ("86-119"), so the
        // start line is its head — not the field itself.
        const rawPath = parts.length >= 3 ? parts.slice(2).join('@') : (cols[6] ?? '');
        const startLine = String(
          Number.parseInt((parts.length >= 3 ? parts[1] : (cols[9] ?? '0')).split('-')[0], 10)
        );
        const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);
        const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
        if (!cache.has(absPath)) {
          try {
            cache.set(absPath, measureFileAst(ts, absPath, rootDir).rows);
          } catch {
            cache.set(absPath, null);
          }
        }
        const measured = cache.get(absPath);
        if (!measured) {
          // Unreadable file: the gate must not proceed on an unmeasured number.
          unresolved.push(`${relPath}:${name}`);
          continue;
        }
        // Match by name, using line only to break ties between same-named
        // functions. Anonymous arrow rows are matched by line because every one
        // of them is called "(anonymous)".
        const sameName = measured.filter((m) => m.name === name);
        const hit =
          name === '(anonymous)'
            ? sameName.find((m) => String(m.line) === startLine)
            : sameName.length === 1
              ? sameName[0]
              : sameName.find((m) => String(m.line) === startLine);
        if (!hit) {
          unresolved.push(`${relPath}::${name}@${startLine}`);
          continue;
        }
        // Report only when both engines claim a measurement; a type-level row
        // lizard invents has no AST counterpart and was already rejected above.
        const lizardCcn = Number(cols[1]);
        if (Number.isFinite(lizardCcn) && lizardCcn !== hit.ccn) {
          disagreements.push(`${relPath}::${name}@${startLine} lizard=${lizardCcn} ast=${hit.ccn}`);
        }
        cols[1] = String(hit.ccn);
        out.push(cols.map(csvEscape).join(','));
      }
      write(out.join('\n'));
      if (disagreements.length > 0) {
        // Informational: the AST value already replaced lizard's, so the gate
        // grades the correct number either way.
        process.stderr.write(
          `ccn-report: ${disagreements.length} row(s) where lizard disagreed (AST used): ${disagreements
            .slice(0, 5)
            .join(', ')}${disagreements.length > 5 ? ', …' : ''}\n`
        );
      }
      if (unresolved.length > 0) {
        process.stderr.write(
          `ccn-report: ${unresolved.length} row(s) could not be measured by the AST: ${unresolved
            .slice(0, 5)
            .join(', ')}${unresolved.length > 5 ? ', …' : ''}\n`
        );
        process.exitCode = 1;
      }
    });
    return;
  }

  const roots = paths.length > 0 ? paths : ['src'];
  // Collect every function; `--write-baseline` and the threshold filter both
  // apply afterwards. Passing a huge threshold here would keep nothing.
  const files = resolveFiles(roots);
  const { rows: allRows, failures } = measureFilesAst(ts, files, rootDir);
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

  if (writeBaseline) {
    const baseline = {};
    const kept = allRows
      .filter((r) => r.bucket === 'production')
      .sort((a, b) => (a.file + a.name).localeCompare(b.file + b.name));
    for (const r of kept) {
      baseline[baselineKey(r.file, r.name, r.line, dups)] = r.ccn;
    }
    const target = path.join(rootDir, '.ccn-baseline.json');
    fs.writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`);
    write(`Wrote ${kept.length} function(s) to .ccn-baseline.json`);
    return;
  }

  const results = allRows.filter((r) => r.ccn > threshold).sort((a, b) => b.ccn - a.ccn);

  if (asJson) {
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
  process.exitCode = reportOnly || results.length === 0 ? 0 : 1;
}

main();
