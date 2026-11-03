import { dingTalkCredentialsFromEnv } from '../integrations/dingtalk/client.js';
import { error, info, warn } from './logger.js';

/**
 * Startup summary of the configuration a deployment needs in order to work.
 *
 * Issue #218: a deployment without an LLM key, or with the installer's `xxx`
 * DingTalk placeholders still in `.env`, booted cleanly, logged nothing about
 * it, and reported the problem only inside a `/health` JSON body nobody reads.
 * The container then showed `healthy` because a failing LLM is "degraded", and
 * "degraded" was a 200. The expensive failure for this product is precisely
 * "looks healthy, cannot hold an interview", so the missing pieces are printed
 * once at startup, at `error` level, in one line each.
 *
 * This deliberately does NOT throw: a credential-free instance is a supported
 * mode (issue #171 — read-only admin, no Stream client), and refusing to boot
 * would break it. Making the problem loud and machine-visible
 * (`/health/ready` → 503) is the right strength of enforcement here.
 */

/** Placeholder values the installer and `.env.example` ship. */
const PLACEHOLDER_MARKERS = ['xxx', 'your-', 'changeme', 'change-me'];

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export interface StartupConfigProblem {
  /** Environment variable names to fix. */
  variables: string[];
  /** What breaks, in the operator's terms. */
  message: string;
}

/** First non-empty value among `names`, or `''` when none is set. */
function firstSet(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const name of names) {
    const value = env[name];
    if (value) return value;
  }
  return '';
}

/**
 * The LLM key, under any of the names this project has shipped with.
 *
 * Checked as three outcomes rather than two so the message can say what is
 * wrong: a key that is present but still the installer's placeholder is a
 * different operator mistake from a key that was never filled in.
 */
function checkLlmKey(env: NodeJS.ProcessEnv): StartupConfigProblem[] {
  const key = firstSet(env, ['LLM_API_KEY', 'VOLCENGINE_API_KEY', 'ANTHROPIC_AUTH_TOKEN']);
  if (!key) {
    return [
      {
        variables: ['LLM_API_KEY'],
        message: 'no LLM API key configured — every interview turn will fail',
      },
    ];
  }
  if (looksLikePlaceholder(key)) {
    return [
      {
        variables: ['LLM_API_KEY'],
        message: 'LLM API key is still a placeholder value — every interview turn will fail',
      },
    ];
  }
  return [];
}

/** Which DingTalk Stream variables are required, paired with how to read them. */
const DINGTALK_REQUIRED: ReadonlyArray<{
  variable: string;
  read: (env: NodeJS.ProcessEnv) => string;
}> = [
  {
    variable: 'DINGTALK_CLIENT_ID',
    read: (env) => dingTalkCredentialsFromEnv(env).appKey,
  },
  {
    variable: 'DINGTALK_CLIENT_SECRET',
    read: (env) => dingTalkCredentialsFromEnv(env).appSecret,
  },
  { variable: 'DINGTALK_AGENT_ID', read: (env) => env['DINGTALK_AGENT_ID'] ?? '' },
];

/**
 * DingTalk Stream credentials, in one of two states: incomplete, or complete but
 * still carrying placeholders.
 *
 * Built from `DINGTALK_REQUIRED` rather than three hand-written `if`s, so adding
 * a required variable is a table row instead of another branch. That is what
 * brought this module's highest cyclomatic complexity under the threshold.
 */
function checkDingTalk(env: NodeJS.ProcessEnv): StartupConfigProblem[] {
  const missing = DINGTALK_REQUIRED.filter(({ read }) => !read(env)).map(
    ({ variable }) => variable
  );
  if (missing.length > 0) {
    return [
      {
        variables: missing,
        message: 'DingTalk Stream credentials incomplete — no messages will be received',
      },
    ];
  }

  const { appKey, appSecret } = dingTalkCredentialsFromEnv(env);
  const hasPlaceholder = looksLikePlaceholder(appKey) || looksLikePlaceholder(appSecret);
  if (!hasPlaceholder) return [];
  return [
    {
      variables: ['DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET'],
      message: 'DingTalk credentials are still placeholder values — no messages will be received',
    },
  ];
}

/** The admin login. A missing hash makes the whole admin UI unusable. */
function checkAdminLogin(env: NodeJS.ProcessEnv): StartupConfigProblem[] {
  if (env['ADMIN_PASSWORD_HASH']) return [];
  return [
    {
      variables: ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH'],
      message: 'admin login is not configured — the admin UI cannot be used',
    },
  ];
}

/**
 * Every independent area of configuration, in the order an operator should read
 * them. Each entry reports zero or more problems; the aggregator only flattens.
 */
const CHECKS: ReadonlyArray<(env: NodeJS.ProcessEnv) => StartupConfigProblem[]> = [
  checkLlmKey,
  checkDingTalk,
  checkAdminLogin,
];

/**
 * Everything that would make the running process unable to do its job.
 *
 * Kept pure (env in, findings out) so the checks are unit-testable without
 * booting a server, and so `/health/ready` and the startup log cannot drift
 * apart — they answer the same question.
 *
 * The function itself is only the fold: per-area logic lives in the `CHECKS`
 * above so that no single function carries all of the branching.
 */
export function collectStartupConfigProblems(
  env: NodeJS.ProcessEnv = process.env
): StartupConfigProblem[] {
  return CHECKS.flatMap((check) => check(env));
}

/**
 * Log the summary. One aggregated `error` line naming every missing piece, plus
 * one line per variable, so the operator does not have to open `/health` to
 * discover that the deployment is incomplete.
 */
export function logStartupConfigSummary(env: NodeJS.ProcessEnv = process.env): void {
  const problems = collectStartupConfigProblems(env);
  if (problems.length === 0) {
    info('Startup configuration complete: LLM, DingTalk Stream and admin login are configured');
    return;
  }

  const variables = [...new Set(problems.flatMap((problem) => problem.variables))];
  error(
    `Incomplete deployment configuration (${problems.length} issue(s)): ${problems
      .map((problem) => problem.message)
      .join('; ')} — the container will report not-ready on /health/ready until fixed`,
    { variables }
  );
  for (const problem of problems) {
    warn(`Config: ${problem.message}`, { variables: problem.variables });
  }
}
