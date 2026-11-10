/**
 * Type surface for `scripts/sync-template-prompts.mjs`.
 *
 * The script is plain `.mjs` (it has to run under `node` with no build step, and
 * it edits production data, so keeping it dependency-free matters more than
 * keeping it typed). `tsconfig.json` does not enable `allowJs`, so without this
 * file `import ... from '...mjs'` is a hard error and the tests that exercise
 * the edit logic cannot be type-checked at all.
 *
 * Only the pure helpers are declared: `main()` is exercised by spawning the file
 * as a program, which needs no type.
 */

export interface PromptHolder {
  get: () => string;
  set: (value: string) => void;
}

export interface Edit {
  id: string;
  issue: string;
  describe: string;
  satisfied: (text: string) => boolean;
  detect: (text: string) => boolean;
  transform: (text: string) => string | null;
}

export type PlanState = 'already-correct' | 'cannot-place' | 'insert' | 'replace';

export interface PlanStep {
  edit: Edit;
  state: PlanState;
  next?: string;
}

export declare const EDITS: Edit[];
export declare function findPromptHolder(content: unknown): PromptHolder | null;
export declare function planFor(text: string): PlanStep[];
export declare function applyPlan(text: string, plan: PlanStep[]): string;
