#!/usr/bin/env node
/**
 * Sync production Template prompts with the fixes shipped in v1.19.0 (#229, #233).
 *
 * WHY THIS EXISTS
 * ---------------
 * `Template.content.llmPromptTemplate` is stored per-row and OVERRIDES the
 * defaults in `src/services/prompt.service.ts`. So the code fixes for #229
 * (strategy 10: stop re-asking an already-answered question) and #233 (the
 * `最多 2 次` followup cap that contradicted the code's 5) do nothing in a
 * deployment until the rows themselves are updated.
 *
 * This is a DATA migration, not a schema migration, which is why it is not in
 * `prisma/migrations/` — Prisma only tracks DDL, and each deployment's prompt was
 * tuned by hand. It edits only what it can recognise, reports everything it
 * cannot, and never invents a prompt.
 *
 * USAGE
 * -----
 *   node scripts/sync-template-prompts.mjs --dry-run   # default: report only
 *   node scripts/sync-template-prompts.mjs --apply     # write the changes
 *
 * Connect with the usual DATABASE_URL, or pass --url. Back up first:
 *   pg_dump --data-only --table='"Template"' "$DATABASE_URL" > templates-backup.sql
 *
 * EXIT CODES
 *  0 = nothing to do, or --apply completed
 *  1 = at least one template could not be handled automatically (see report)
 *  2 = no evidence: could not connect, or the Template table is empty
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

/** The prompt lives under different keys across template versions. */
export function findPromptHolder(content) {
  if (typeof content?.llmPromptTemplate === 'string') {
    return {
      get: () => content.llmPromptTemplate,
      set: (value) => {
        content.llmPromptTemplate = value;
      },
    };
  }
  if (typeof content?.promptTemplate === 'string') {
    return {
      get: () => content.promptTemplate,
      set: (value) => {
        content.promptTemplate = value;
      },
    };
  }
  return null;
}

const STRATEGY_10 =
  '10. **已答 / 前提已锁定** - 本题要问的信息、或本题的计数与范围前提（"只能挑两个""哪几位""您团队"），已经由更早的回答给出 → **不要重复提问**。只问本题里尚未被覆盖的那一半；若整题都已被覆盖，用一句陈述式确认代替提问，然后直接进入下一题。绝不能把受访者已经回答过的答案当成新问题再问一遍。';

/**
 * The two edits, as (satisfied, detect, transform) triples rather than as
 * "replace the whole prompt". A template hand-tuned in ways this script does not
 * know about keeps its wording; only the contradicted sentence or the missing
 * strategy is touched.
 */
export const EDITS = [
  {
    id: 'followup-cap',
    issue: '#233',
    describe: 'followup cap stated as a fixed 2 while the code enforces 5',
    // Already correct when it delegates to the variable instead of a literal.
    satisfied: (text) => /\{\{\s*maxFollowups\s*\}\}/.test(text) && !/最多\s*2\s*次/.test(text),
    detect: (text) => /最多\s*2\s*次/.test(text),
    transform: (text) =>
      text.replace(
        /最多\s*2\s*次/g,
        '最多 {{maxFollowups}} 次（以系统提供的值为准，不可自行假设上限）'
      ),
  },
  {
    id: 'strategy-10',
    issue: '#229',
    describe: 'no "already answered / premise locked" strategy',
    satisfied: (text) => /已答\s*\/\s*前提已锁定/.test(text),
    // There is no reliable "absent" anchor to detect, so this edit is offered
    // whenever satisfied() is false. Such a row is reported as 'insert' rather
    // than silently counted as changed.
    detect: () => true,
    transform: (text) => {
      const lines = text.split('\n');
      // Append after the last numbered strategy line, so it lands inside the
      // strategy list rather than after the examples that follow it.
      let lastStrategy = -1;
      for (let index = 0; index < lines.length; index += 1) {
        if (/^\s*9\.\s/.test(lines[index])) lastStrategy = index;
      }
      if (lastStrategy === -1) return null; // could not place it
      lines.splice(lastStrategy + 1, 0, STRATEGY_10);
      return lines.join('\n');
    },
  },
];

/** Decide, per edit, what this row needs. Pure: no I/O. */
export function planFor(text) {
  return EDITS.map((edit) => {
    if (edit.satisfied(text)) return { edit, state: 'already-correct' };
    const next = edit.transform(text);
    // transform returning text identical to its input means nothing to do.
    if (next === null) return { edit, state: 'cannot-place' };
    if (next === text) return { edit, state: 'already-correct' };
    return { edit, state: edit.id === 'strategy-10' ? 'insert' : 'replace', next };
  });
}

/**
 * Apply the pending edits, in order, to a prompt string. Pure: returns a string.
 *
 * Each step's `next` was computed from the ORIGINAL text, so assigning those
 * values in sequence drops every edit but the last. Re-run each transform
 * against the accumulated result instead — that is what makes two edits compose
 * and what makes a second pass a no-op.
 */
export function applyPlan(text, plan) {
  let current = text;
  for (const step of plan) {
    if (step.state === 'already-correct' || step.state === 'cannot-place') continue;
    const next = step.edit.transform(current);
    if (next !== null) current = next;
  }
  return current;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const urlFlag = process.argv.indexOf('--url');
  const connection = urlFlag !== -1 ? process.argv[urlFlag + 1] : process.env.DATABASE_URL;

  if (!connection) {
    console.error('[sync] No DATABASE_URL and no --url given. Nothing to connect to.');
    console.error('[sync] "Could not connect" is exit 2, never 0 — no evidence is not a pass.');
    process.exit(2);
  }

  const client = new Client({ connectionString: connection });
  try {
    await client.connect();
  } catch (error) {
    console.error(`[sync] Could not connect: ${error.message}`);
    process.exit(2);
  }

  let rows;
  try {
    ({ rows } = await client.query('SELECT id, name, content FROM "Template" ORDER BY name'));
  } catch (error) {
    console.error(`[sync] Could not read the Template table: ${error.message}`);
    await client.end();
    process.exit(2);
  }

  if (rows.length === 0) {
    console.error('[sync] The Template table is empty. Refusing to report success on nothing.');
    await client.end();
    process.exit(2);
  }

  console.log(`[sync] ${rows.length} template(s); mode = ${apply ? 'APPLY' : 'DRY RUN'}\n`);

  let changed = 0;
  let unhandled = 0;

  for (const row of rows) {
    let content;
    try {
      content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    } catch {
      console.log(`  ! ${row.name} — content is not JSON; skipped, needs a human`);
      unhandled += 1;
      continue;
    }

    const holder = findPromptHolder(content);
    if (!holder) {
      console.log(`  ! ${row.name} — no prompt key found (llmPromptTemplate/promptTemplate)`);
      unhandled += 1;
      continue;
    }

    const text = holder.get();
    const plan = planFor(text);
    const pending = plan.filter(
      (step) => step.state !== 'already-correct' && step.state !== 'cannot-place'
    );
    const blocked = plan.filter((step) => step.state === 'cannot-place');

    if (pending.length === 0 && blocked.length === 0) {
      console.log(`  = ${row.name} — already up to date`);
      continue;
    }

    for (const step of pending) {
      const verb = step.state === 'insert' ? 'insert' : 'replace';
      console.log(`  ~ ${row.name} — will ${verb} ${step.edit.issue} ${step.edit.id}`);
    }
    for (const step of blocked) {
      console.log(`  ? ${row.name} — cannot place ${step.edit.issue} ${step.edit.id}`);
      unhandled += 1;
    }

    if (!apply || pending.length === 0) continue;
    holder.set(applyPlan(text, plan));
    await client.query('UPDATE "Template" SET content = $1 WHERE id = $2', [
      JSON.stringify(content),
      row.id,
    ]);
    changed += 1;
    console.log('    written.');
  }

  console.log('');
  console.log(
    apply
      ? `[sync] Updated ${changed} template(s).`
      : '[sync] Dry run complete. Re-run with --apply to write.'
  );
  if (unhandled > 0) {
    console.log(`[sync] ${unhandled} item(s) need a human; see the '?' and '!' lines above.`);
  }

  await client.end();
  process.exit(unhandled > 0 ? 1 : 0);
}

// Only run when invoked directly, so the pure helpers above are importable.
//
// `process.argv[1]` may be a RELATIVE path (`node scripts/x.mjs`) while
// `import.meta.url` is always an absolute `file://` URL, so comparing them as
// strings silently never matches on Windows — and a script that never runs its
// main() exits 0, which reads as "nothing to do" instead of "did nothing".
// pathToFileURL(resolve(...)) puts both sides in the same form.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[sync] Unexpected failure: ${error.stack ?? error.message}`);
    process.exit(2);
  });
}
