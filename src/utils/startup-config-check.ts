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

/**
 * Everything that would make the running process unable to do its job.
 *
 * Kept pure (env in, findings out) so the checks are unit-testable without
 * booting a server, and so `/health/ready` and the startup log cannot drift
 * apart — they answer the same question.
 */
export function collectStartupConfigProblems(
  env: NodeJS.ProcessEnv = process.env
): StartupConfigProblem[] {
  const problems: StartupConfigProblem[] = [];

  const llmKey =
    env['LLM_API_KEY'] || env['VOLCENGINE_API_KEY'] || env['ANTHROPIC_AUTH_TOKEN'] || '';
  if (!llmKey) {
    problems.push({
      variables: ['LLM_API_KEY'],
      message: 'no LLM API key configured — every interview turn will fail',
    });
  } else if (looksLikePlaceholder(llmKey)) {
    problems.push({
      variables: ['LLM_API_KEY'],
      message: 'LLM API key is still a placeholder value — every interview turn will fail',
    });
  }

  const dingTalk = dingTalkCredentialsFromEnv(env);
  const agentId = env['DINGTALK_AGENT_ID'] || '';
  const missingDingTalk: string[] = [];
  if (!dingTalk.appKey) missingDingTalk.push('DINGTALK_CLIENT_ID');
  if (!dingTalk.appSecret) missingDingTalk.push('DINGTALK_CLIENT_SECRET');
  if (!agentId) missingDingTalk.push('DINGTALK_AGENT_ID');
  if (missingDingTalk.length > 0) {
    problems.push({
      variables: missingDingTalk,
      message: 'DingTalk Stream credentials incomplete — no messages will be received',
    });
  } else if (looksLikePlaceholder(dingTalk.appKey) || looksLikePlaceholder(dingTalk.appSecret)) {
    problems.push({
      variables: ['DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET'],
      message: 'DingTalk credentials are still placeholder values — no messages will be received',
    });
  }

  const adminHash = env['ADMIN_PASSWORD_HASH'] || '';
  if (!adminHash) {
    problems.push({
      variables: ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH'],
      message: 'admin login is not configured — the admin UI cannot be used',
    });
  }

  return problems;
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
