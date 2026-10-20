#!/usr/bin/env node
/**
 * Measure cyclomatic complexity per function from brace-balanced source.
 *
 * lizard's TypeScript parser loses track of braces on generic arrow fields and
 * charges neighbouring code to the enclosing function, so its span and CCN for
 * `src/**` are inflated (see xp-gate gate-3.sh note on #544). This script locates
 * each function body by matching braces, then counts decision points inside
 * exactly that span.
 *
 * Usage: node scripts/ccn-report.cjs [--threshold N] [--json] [paths...]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Keywords that must never be mistaken for a function name. */
const RESERVED_WORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'typeof',
  'await',
  'async',
  'new',
  'delete',
  'void',
  'in',
  'of',
  'do',
  'else',
  'try',
  'finally',
]);

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

/**
 * Strip comments and string/template contents so keywords there do not count.
 *
 * Returns the cleaned text plus a `origIndex` table mapping each cleaned
 * offset back to its offset in `source`. Callers turn a match position into a
 * 1-based line number, so the mapping has to survive every rewrite: collapsing
 * a comment shifts every later position, and reported locations would drift.
 */
function stripNoise(source) {
  let out = '';
  const origIndex = [];
  let i = 0;
  const n = source.length;

  /** Append `text` for a range of source that produced no output of its own. */
  const emitVerbatimRange = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (source[k] === '\n') {
        out += '\n';
        origIndex.push(k);
      }
    }
  };

  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const start = i;
      while (i < n && source[i] !== '\n') i++;
      emitVerbatimRange(start, i);
      continue;
    }
    if (two === '/*') {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      emitVerbatimRange(start, Math.min(i, n));
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const start = i;
      const quote = ch;
      i++;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += '""';
      origIndex.push(start, start + 1);
      emitVerbatimRange(start, Math.min(i, n));
      continue;
    }
    out += ch;
    origIndex.push(i);
    i++;
  }
  return { clean: out, origIndex };
}

/** 1-based line number in the ORIGINAL source for a cleaned-text offset. */
function originalLineOf(source, origIndex, cleanOffset) {
  const mapped = origIndex[Math.min(cleanOffset, origIndex.length - 1)];
  if (mapped === undefined) return 1;
  let line = 1;
  for (let k = 0; k < mapped; k++) {
    if (source[k] === '\n') line++;
  }
  return line;
}

/** Find index of the brace that closes the one at `open`. */
function matchBrace(clean, open) {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Locate function definitions, including anonymous arrow callbacks. */
function findFunctions(clean) {
  const fns = [];

  // 1. `[export] [async] function NAME(` — explicit declarations.
  const declRe = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m = declRe.exec(clean);
  while (m !== null) {
    // `m[0]` ends with the name plus `(`; find the real paren because `\s*`
    // may have consumed space before it.
    const parenOpen = m.index + m[0].lastIndexOf('(');
    const fn = extractBody(clean, parenOpen, m[1], m.index);
    if (fn) {
      fns.push(fn);
      // Resume after the signature, not after the body: sibling declarations
      // inside the same enclosing scope must still be discovered.
      const afterParen = matchParen(clean, parenOpen);
      declRe.lastIndex = afterParen === -1 ? m.index + m[0].length : afterParen + 1;
    }
    m = declRe.exec(clean);
  }

  // 2. `const NAME = (…) => {`, `NAME = async (...) => {`.
  const assignRe =
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*(?::[^=;\n]*)?=\s*(?:async\s+)?\(/g;
  m = assignRe.exec(clean);
  while (m !== null) {
    if (!RESERVED_WORDS.has(m[1])) {
      const parenOpen = m.index + m[0].lastIndexOf('(');
      const fn = extractBody(clean, parenOpen, m[1], m.index);
      if (fn) {
        fns.push(fn);
        const afterParen = matchParen(clean, parenOpen);
        assignRe.lastIndex = afterParen === -1 ? m.index + m[0].length : afterParen + 1;
      }
    }
    m = assignRe.exec(clean);
  }

  // 3. Anonymous arrow callbacks: `async (a, b) => {` or `(a, b): T => {`.
  const anonRe = /\(/g;
  m = anonRe.exec(clean);
  while (m !== null) {
    const closeParen = matchParen(clean, m.index);
    if (closeParen === -1) {
      m = anonRe.exec(clean);
      continue;
    }
    const tail = clean.slice(closeParen + 1, closeParen + 120);
    const arrow = tail.match(/^\s*(?::[^{=;]*)?=>\s*\{/);
    if (!arrow) {
      m = anonRe.exec(clean);
      continue;
    }
    const braceOpen = closeParen + 1 + arrow[0].length - 1;
    const bodyEnd = matchBrace(clean, braceOpen);
    if (bodyEnd === -1) {
      m = anonRe.exec(clean);
      continue;
    }
    fns.push({ name: '(anonymous)', start: m.index, bodyStart: braceOpen, bodyEnd });
    anonRe.lastIndex = bodyEnd + 1;
    m = anonRe.exec(clean);
  }

  return fns;
}

/** Write a line to stdout without `console` (biome noConsole). */
function write(line) {
  process.stdout.write(`${line}\n`);
}

/** Find the paren closing the one at `open`. */
function matchParen(clean, open) {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '(') depth++;
    else if (clean[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Resolve a candidate function's body braces starting at an opening paren.
 * Returns null when that paren does not open a function signature — e.g. the
 * parens of `fastify.post(` or `if (`, which would otherwise merge neighbouring
 * code into one bogus "function".
 */
/**
 * Resolve a candidate function's body braces starting at an opening paren.
 * Returns null when that paren does not open a function signature — e.g. the
 * parens of `fastify.post(` or `if (`, which would otherwise merge neighbouring
 * code into one bogus "function".
 *
 * Return-type annotations may themselves contain braces (`): Promise<{ a: 1 }>`).
 * Those are told apart from the body by what follows: a type literal's `{` is
 * balanced within the annotation, so we skip to its matching `}` and keep
 * scanning; the actual body `{` is the one reached last.
 */
function extractBody(clean, parenOpen, name, start) {
  const parenClose = matchParen(clean, parenOpen);
  if (parenClose === -1) return null;

  // Walk to the last top-level `{` before any `;` — for a signature there is
  // exactly one such brace: the body. Any type-literal braces are matched and
  // skipped. For a call (`fastify.post(`) a `,` or `)` intervenes first, which
  // rejects the candidate.
  let sawArrow = false;
  let inAnnotation = false;
  for (let j = parenClose + 1; j < clean.length; j++) {
    const c = clean[j];
    if (c === ' ' || c === '\n') continue;
    if (c === '=' && clean[j + 1] === '>') {
      sawArrow = true;
      inAnnotation = false;
      continue;
    }
    if (c === ':' && !inAnnotation) {
      inAnnotation = true;
      continue;
    }
    if (c === ';') return null;
    if (c === '{') {
      const typeEnd = matchBrace(clean, j);
      if (typeEnd === -1) return null;
      const after = clean.slice(typeEnd + 1, typeEnd + 200);
      // If the annotation continues past this brace (`>`, `|`, `&`, `[`, `,`),
      // it was a type literal: skip it and keep looking for the body.
      if (inAnnotation && /^\s*[>|&[,)]/.test(after)) {
        j = typeEnd;
        continue;
      }
      return { name, start, bodyStart: j, bodyEnd: typeEnd };
    }
    if (!sawArrow && !inAnnotation) return null;
    if (!/[<>\w$.[\]|?&,]/.test(c)) return null;
  }
  return null;
}

/**
 * Count decision points in a function body, excluding spans that belong to
 * nested functions. A registration function like `registerRoutes(app)` contains
 * every handler inline; charging their branches to it would report a number no
 * one can act on, so nested bodies are masked out first.
 */
function countCcn(body, clean, bodyAbsStart) {
  // Mark characters that belong to nested function bodies, then blank them.
  // A boolean mask avoids index drift from repeated slice/replace passes over
  // overlapping spans (which silently un-masked earlier helpers).
  const keep = new Array(body.length).fill(true);
  const nested = findNestedBodies(clean, bodyAbsStart, bodyAbsStart + body.length);
  for (const span of nested) {
    const from = span.bodyStart - bodyAbsStart;
    const to = span.bodyEnd - bodyAbsStart + 1;
    if (from < 0 || to > keep.length) continue;
    for (let k = from; k < to; k++) keep[k] = false;
  }
  let masked = '';
  for (let k = 0; k < body.length; k++) {
    masked += keep[k] ? body[k] : ' ';
  }

  let ccn = 1;
  const patterns = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
  ];
  for (const re of patterns) {
    const matches = masked.match(re);
    if (matches) ccn += matches.length;
  }
  // A ternary `?` that is not `??` or `?.`
  const ternaries = masked.match(/(?<![?])\?(?![\?.])/g);
  if (ternaries) ccn += ternaries.length;
  return ccn;
}

/** Nested arrow/function bodies strictly inside [start, end). */
function findNestedBodies(clean, start, end) {
  const spans = [];
  const seen = new Set();
  const add = (bodyStart) => {
    const close = matchBrace(clean, bodyStart);
    if (close === -1 || close >= end) return;
    if (seen.has(bodyStart)) return;
    seen.add(bodyStart);
    spans.push({ bodyStart, bodyEnd: close });
  };

  for (let i = start; i < end; i++) {
    // Arrow body: `=> {` after optional whitespace.
    if (clean[i] === '=' && clean[i + 1] === '>') {
      let j = i + 2;
      while (j < end && (clean[j] === ' ' || clean[j] === '\n')) j++;
      if (clean[j] === '{') add(j);
    }

    // Function declaration/expression: `function name(...) {`,
    // `async function (…) {`, and `name(...) {` method shorthand.
    const braceOpen = matchFunctionStart(clean, i, end);
    if (braceOpen !== null) add(braceOpen);
  }

  // Nested spans are masked by union; overlapping/contained spans are harmless
  // because masking is a boolean OR, so no pruning is needed here.
  return spans;
}

/**
 * If a function declaration starts at `i`, return the index of its body brace.
 * Covers `function f(`, `async function (`, and identifier-led signatures so
 * that nested named functions are masked like anonymous arrows are.
 */
function matchFunctionStart(clean, i, end) {
  // `function` keyword, optionally preceded by `async`.
  const before = clean[i - 1] || '';
  if (/[\w$]/.test(before)) return null;

  let cursor = i;
  if (clean.startsWith('async', cursor) && !/[\w$]/.test(clean[cursor + 5] || '')) {
    cursor += 5;
    while (clean[cursor] === ' ' || clean[cursor] === '\n') cursor++;
  }
  if (clean.startsWith('function', cursor) && !/[\w$]/.test(clean[cursor + 8] || '')) {
    const brace = findBodyBrace(clean, cursor + 8, end);
    return brace !== -1 && brace < end ? brace : null;
  }

  // Method/function shorthand: `name(...) {` at an identifier boundary.
  if (!/[A-Za-z_$]/.test(clean[i]) || /[\w$]/.test(before)) return null;
  let j = i;
  while (j < end && /[\w$]/.test(clean[j])) j++;
  while (clean[j] === ' ' || clean[j] === '\n') j++;
  if (clean[j] !== '(') return null;
  const closeParen = matchParen(clean, j);
  if (closeParen === -1 || closeParen >= end) return null;
  let k = closeParen + 1;
  while (clean[k] === ' ' || clean[k] === '\n') k++;
  if (clean[k] === ':') {
    // Return type annotation — skip to the brace, bailing on a statement end.
    while (k < end && clean[k] !== '{' && clean[k] !== ';') k++;
  }
  return clean[k] === '{' && k < end ? k : null;
}

/**
 * From just after `function`, find the opening brace of its body.
 *
 * The return-type annotation can itself contain braces — `Promise<{ rows: CsvRow[] }>`
 * and `{ a: string } | null` are common — so a bare "first `{`" search starts the
 * body inside the annotation and the real body then never gets masked. Skip the
 * parameter list first, then walk the annotation, treating a `{…}` as part of it
 * whenever the closing brace is followed by more type syntax.
 */
function findBodyBrace(clean, from, end) {
  let i = from;
  // Skip whitespace, then the optional name of a named declaration.
  while (i < end && (clean[i] === ' ' || clean[i] === '\n')) i++;
  while (i < end && /[\w$]/.test(clean[i])) i++;
  while (i < end && (clean[i] === ' ' || clean[i] === '\n')) i++;
  if (clean[i] !== '(') return -1;
  const paramsClose = matchParen(clean, i);
  if (paramsClose === -1 || paramsClose >= end) return -1;
  i = paramsClose + 1;

  // Return type annotation, ending at the body brace or a statement terminator.
  while (i < end) {
    const ch = clean[i];
    if (ch === ';') return -1;
    if (ch !== '{') {
      i++;
      continue;
    }
    const close = matchBrace(clean, i);
    if (close === -1 || close >= end) return -1;
    let after = close + 1;
    while (after < end && (clean[after] === ' ' || clean[after] === '\n')) after++;
    const next = clean[after] || '';
    // `>` / `|` / `&` / `[` / `,` / `)` / `.` / `?` continue the annotation;
    // anything else (or nothing) means this brace opens the body.
    if (!['>', '|', '&', '[', ',', ')', '.', '?'].includes(next)) return i;
    i = close + 1;
  }
  return -1;
}

/** Measure every function in a file (no threshold filter), for CSV re-writing. */
function measureAll(absPath, relPath) {
  const source = fs.readFileSync(absPath, 'utf8');
  const { clean, origIndex } = stripNoise(source);
  const seen = new Set();
  const rows = [];
  for (const fn of findFunctions(clean)) {
    if (seen.has(fn.bodyStart)) continue;
    seen.add(fn.bodyStart);
    const body = clean.slice(fn.bodyStart, fn.bodyEnd + 1);
    rows.push({
      name: fn.name,
      line: originalLineOf(source, origIndex, fn.start),
      ccn: countCcn(body, clean, fn.bodyStart),
      bucket: bucketFor(relPath),
    });
  }
  return rows;
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

/** Quote a CSV field when it contains a comma, quote, or newline. */
function csvEscape(field) {
  const s = String(field ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Classify a path into the buckets the xp-gate ratchet distinguishes.
 * Only `production` rows are recorded in .ccn-baseline.json: `mirror` paths are
 * regenerated by prepack from a canonical source that IS graded, and `test`
 * paths are never part of the complexity budget.
 */
function bucketFor(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (/(^|\/)__tests__?\//.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p)) return 'test';
  if (p.startsWith('src/npm-package/') || /^plugins\/[^/]+\/src\//.test(p)) return 'mirror';
  return 'production';
}

/** Baseline key for a measured function, matching githooks/lib/ccn-ratchet.sh. */
function baselineKey(relPath, name, line, duplicateNames) {
  const p = relPath.replace(/\\/g, '/');
  if (name === '(anonymous)') return `${p}::(anonymous)@${line}`;
  if (duplicateNames.has(`${p}::${name}`)) return `${p}::${name}@${line}`;
  return `${p}::${name}`;
}

/** Measure every function in one file, returning above-threshold rows. */
function measureFile(file, rootDir, threshold) {
  const source = fs.readFileSync(file, 'utf8');
  const { clean, origIndex } = stripNoise(source);
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const seen = new Set();
  const rows = [];
  for (const fn of findFunctions(clean)) {
    if (seen.has(fn.bodyStart)) continue;
    seen.add(fn.bodyStart);
    const body = clean.slice(fn.bodyStart, fn.bodyEnd + 1);
    const ccn = countCcn(body, clean, fn.bodyStart);
    if (ccn <= threshold) continue;
    rows.push({
      file: relPath,
      name: fn.name,
      line: originalLineOf(source, origIndex, fn.start),
      ccn,
      bucket: bucketFor(relPath),
    });
  }
  return rows;
}

/** Names that occur more than once within the same file (need line-keying). */
function duplicateNames(rows) {
  const tally = new Map();
  for (const r of rows) {
    const k = `${r.file}::${r.name}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return new Set([...tally].filter(([, n]) => n > 1).map(([k]) => k));
}

function collectAll(roots, rootDir, threshold) {
  const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? collectFiles(r) : [r]));
  const rows = [];
  for (const f of files) {
    for (const row of measureFile(f, rootDir, threshold)) rows.push(row);
  }
  return rows;
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

  // --csv-verified batch: xp-gate pipes `lizard --csv` in on stdin and expects a
  // CSV back whose CCN column carries OUR brace-balanced measurement. Gate 3
  // fails closed when this exits non-zero, so any unverifiable row must fail.
  if (csvVerified) {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      const out = [];
      const unresolved = [];
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
            cache.set(absPath, measureAll(absPath, relPath));
          } catch {
            cache.set(absPath, null);
          }
        }
        const measured = cache.get(absPath);
        if (!measured) {
          unresolved.push(`${relPath}:${name}`);
          out.push(cols.map(csvEscape).join(','));
          continue;
        }
        // Match on name first: lizard's line numbers come from its own parser
        // and drift from the source (it skips comments), so line equality is
        // not a reliable join key. Fall back to the reported line only to break
        // ties between same-named functions in one file.
        const candidates = measured.filter((m) => m.name === name);
        const hit =
          candidates.length === 1
            ? candidates[0]
            : candidates.find((m) => String(m.line) === startLine);
        if (!hit) {
          // lizard also reports TypeScript type-level signatures
          // (`readonly disconnect: () => Promise<void>;`) as functions. Those
          // rows carry CCN 1, which is accurate, so pass them through instead of
          // failing the gate — they cannot inflate anything.
          unresolved.push(`${relPath}::${name}@${startLine}`);
          out.push(cols.map(csvEscape).join(','));
          continue;
        }
        cols[1] = String(hit.ccn);
        out.push(cols.map(csvEscape).join(','));
      }
      write(out.join('\n'));
      if (unresolved.length > 0) {
        // Not fatal: unmatched rows are kept at lizard's own CCN. That number is
        // only trustworthy for type-level signatures (always CCN 1); a genuine
        // function we failed to parse would stay inflated, so surface the count
        // for a human instead of hiding it.
        process.stderr.write(
          `ccn-report: ${unresolved.length} row(s) kept at lizard's CCN (not span-verified): ${unresolved
            .slice(0, 5)
            .join(', ')}${unresolved.length > 5 ? ', …' : ''}\n`
        );
      }
    });
    return;
  }

  const roots = paths.length > 0 ? paths : ['src'];
  // Collect every function; `--write-baseline` and the threshold filter both
  // apply afterwards. Passing a huge threshold here would keep nothing.
  const allRows = collectAll(roots, rootDir, 0);
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
    write(`CCN threshold: ${threshold} (brace-balanced measurement)`);
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
