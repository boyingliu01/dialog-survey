import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDITS, applyPlan, findPromptHolder, planFor } from '../scripts/sync-template-prompts.mjs';

/** The script as a file, for the cases that spawn it as a program. */
const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'sync-template-prompts.mjs');

/**
 * `scripts/sync-template-prompts.mjs` edits PRODUCTION data, so the failure that
 * matters is not "it threw" but "it reported success on rows it never fixed".
 * These cases are built around that: a row that must change, a row already
 * correct (so a re-run is a no-op), and a row whose prompt cannot be placed
 * (which must not be counted as done).
 */

/** A prompt shaped like the real one: numbered strategies, then examples. */
const PROMPT = [
  '**策略选择**（选择最匹配的一项）：',
  '1. **认真回答** - 用户认真回答了问题',
  '9. **转移话题** - 用户转移话题但不想结束',
  '',
  '**已追问次数**: {{followupCount}}/{{maxFollowups}}',
  '',
  '**示例**: 最多 2 次追问后应结束。',
].join('\n');

describe('findPromptHolder', () => {
  it('finds llmPromptTemplate', () => {
    const holder = findPromptHolder({ llmPromptTemplate: 'x' });
    expect(holder?.get()).toBe('x');
  });

  it('falls back to promptTemplate on older rows', () => {
    const holder = findPromptHolder({ promptTemplate: 'y' });
    expect(holder?.get()).toBe('y');
  });

  it('returns null when neither key is present, so the caller can report it', () => {
    expect(findPromptHolder({ questions: [] })).toBeNull();
  });

  it('writes back through the same key it read', () => {
    const content: Record<string, string> = { promptTemplate: 'old' };
    findPromptHolder(content)?.set('new');
    expect(content).toEqual({ promptTemplate: 'new' });
  });
});

describe('planFor', () => {
  it('flags the hardcoded 2 as a replacement', () => {
    const plan = planFor(PROMPT);
    const step = plan.find((s) => s.edit.id === 'followup-cap');
    expect(step?.state).toBe('replace');
  });

  it('does not flag a prompt that already delegates to the variable', () => {
    const already = PROMPT.replace('最多 2 次追问后应结束。', '最多 {{maxFollowups}} 次。');
    const plan = planFor(already);
    const step = plan.find((s) => s.edit.id === 'followup-cap');
    expect(step?.state).toBe('already-correct');
  });

  it('treats a prompt that keeps the literal AND the variable as not-yet-fixed', () => {
    // The variable being present is not enough if the contradicting literal
    // survives somewhere — that is exactly the #233 shape.
    const both = PROMPT.replace('{{maxFollowups}}', '{{maxFollowups}}');
    const plan = planFor(both);
    const step = plan.find((s) => s.edit.id === 'followup-cap');
    expect(step?.state).toBe('replace');
  });

  it('plans an insert for the missing strategy', () => {
    const plan = planFor(PROMPT);
    const step = plan.find((s) => s.edit.id === 'strategy-10');
    expect(step?.state).toBe('insert');
  });

  it('reports strategy-10 as already correct once it is present', () => {
    const withStrategy = `${PROMPT}\n${EDITS[1]
      .transform(PROMPT)
      ?.split('\n')
      .find((l) => l.includes('前提已锁定'))}`;
    const plan = planFor(withStrategy);
    const step = plan.find((s) => s.edit.id === 'strategy-10');
    expect(step?.state).toBe('already-correct');
  });

  it('marks strategy-10 unplaceable when there is no numbered list', () => {
    const plan = planFor('一个没有编号策略的提示词');
    const step = plan.find((s) => s.edit.id === 'strategy-10');
    expect(step?.state).toBe('cannot-place');
  });
});

describe('applyPlan', () => {
  it('inserts the new strategy directly after strategy 9, not at the end', () => {
    const plan = planFor(PROMPT);
    const result = applyPlan(PROMPT, plan);
    const lines = result.split('\n');
    const strategy9 = lines.findIndex((l) => l.startsWith('9. '));
    const strategy10 = lines.findIndex((l) => l.includes('前提已锁定'));
    expect(strategy10).toBe(strategy9 + 1);
    // The examples must stay below the strategy list.
    expect(lines.findIndex((l) => l.includes('**示例**'))).toBeGreaterThan(strategy10);
  });

  it('replaces every occurrence of the hardcoded cap', () => {
    const result = applyPlan(PROMPT, planFor(PROMPT));
    expect(result).not.toMatch(/最多\s*2\s*次/);
    expect(result).toContain('{{maxFollowups}}');
  });

  it('is idempotent: applying twice equals applying once', () => {
    const once = applyPlan(PROMPT, planFor(PROMPT));
    const twice = applyPlan(once, planFor(once));
    expect(twice).toBe(once);
  });

  it('is a no-op for a prompt that needs nothing', () => {
    const clean =
      '1. **认真回答**\n9. **转移话题**\n10. **已答 / 前提已锁定** - x\n{{maxFollowups}}';
    expect(applyPlan(clean, planFor(clean))).toBe(clean);
  });

  it('leaves the prompt untouched when strategy-10 cannot be placed', () => {
    const noList = '只有 {{followupCount}}/{{maxFollowups}} 和一句 最多 2 次。';
    const result = applyPlan(noList, planFor(noList));
    // followup-cap still applies; strategy-10 must not corrupt the text.
    expect(result).not.toMatch(/最多\s*2\s*次/);
    expect(result).not.toContain('前提已锁定');
  });
});

describe('spawned as a program', () => {
  it('exits 2, never 0, when there is no DATABASE_URL', () => {
    // The failure this guards: the direct-run detection compared a relative
    // argv[1] against an absolute import.meta.url, never matched, so main()
    // never ran and the process exited 0 — "nothing to do" instead of
    // "did nothing". Testing only the pure helpers cannot see that.
    const env = { ...process.env };
    delete env['DATABASE_URL'];
    let code = 0;
    let out = '';
    try {
      execFileSync(process.execPath, [SCRIPT, '--dry-run'], {
        encoding: 'utf8',
        stdio: 'pipe',
        env,
        cwd: join(import.meta.dirname, '..'),
      });
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? -1;
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(code).toBe(2);
    expect(out).toMatch(/exit 2, never 0/);
  });
});
