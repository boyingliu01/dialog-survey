#!/usr/bin/env node
// delphi-gateway-review.mjs — run a Delphi review round against the whalecloud
// OpenAI-compatible gateway with 3 distinct models (architecture/technical/feasibility).
//
// Usage:
//   node delphi-gateway-review.mjs --input <artifact.md> [--context a.md,b.md] \
//     [--mode design|requirements|code-walkthrough] [--round N] [--prior prior.json] \
//     [--out out.json] [--config <delphi-config.json>] [--env <project .env>]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const key = token.replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    args[key] = true;
  } else {
    args[key] = next;
    i += 1;
  }
}

const mode = args.mode ?? 'design';
const round = Number(args.round ?? 1);
const maxTokens = Number(args['max-tokens'] ?? 16000);
const expertTimeoutMs = Number(args['timeout-ms'] ?? 300_000);
const maxAttempts = Number(args.attempts ?? 3);
const outPath = args.out ?? `.sprint-state/phase-outputs/delphi-round${round}.json`;
const configPath = args.config ?? path.join(os.homedir(), '.agents/skills/delphi-review/.delphi-config.json');
const envPath = args.env ?? '.env';

function fail(msg) {
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(1);
}

if (!args.input && !args['list-models']) fail('--input <artifact.md> is required');
if (args.input && !fs.existsSync(args.input)) fail(`input not found: ${args.input}`);
if (!fs.existsSync(configPath)) fail(`delphi config not found: ${configPath}`);

const artifact = args.input ? fs.readFileSync(args.input, 'utf8') : '';
const contextFiles = args.context ? String(args.context).split(',').filter(Boolean) : [];
const contextParts = contextFiles.map((f) => {
  if (!fs.existsSync(f)) fail(`context not found: ${f}`);
  return `### ${path.basename(f)}\n\n${fs.readFileSync(f, 'utf8')}`;
});
const prior = args.prior && fs.existsSync(args.prior) ? JSON.parse(fs.readFileSync(args.prior, 'utf8')) : null;

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const profile = config.profiles[config.active_profile];
if (!profile) fail(`active profile missing in config: ${config.active_profile}`);
const provider = profile.providers.whalecloud;
if (!provider) fail('whalecloud provider missing in profile');

function resolveKey() {
  const envVar = provider.api_key.match(/^\$\{(.+)\}$/)?.[1];
  if (envVar && process.env[envVar]) return process.env[envVar];
  if (!fs.existsSync(envPath)) fail(`no ${envVar ?? 'API key'} env var and no .env at ${envPath}`);
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('LLM_API_KEY='));
  if (!line) fail(`LLM_API_KEY not found in ${envPath}`);
  return line.slice('LLM_API_KEY='.length).trim();
}

const apiKey = resolveKey();
const baseUrl = provider.base_url.replace(/\/$/, '');

if (args['list-models']) {
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.text();
  process.stdout.write(`HTTP ${res.status}\n`);
  try {
    const parsed = JSON.parse(body);
    const ids = (parsed.data ?? []).map((m) => m.id).sort();
    process.stdout.write(`${ids.join('\n')}\n`);
  } catch {
    process.stdout.write(`${body.slice(0, 2000)}\n`);
  }
  process.exit(0);
}

const ROLE_BRIEF = {
  architecture: 'You are the ARCHITECTURE expert. Focus on: structural soundness of the module boundaries, dependency direction, abstraction seams, migration/rollback strategy, and long-term maintainability. Verify claims against the provided code context where available.',
  technical: 'You are the TECHNICAL/IMPLEMENTATION expert. Focus on: factual accuracy of API/library claims, version compatibility, correctness of the code-level plan (file-by-file changes), test infrastructure mechanics, and concrete failure modes.',
  feasibility: 'You are the FEASIBILITY/RISK expert. Focus on: executability within constraints, effort estimation realism, CI/tooling/environment constraints, operational risk, and whether the acceptance criteria are objectively verifiable.',
};

function buildPrompt(role, expertOpinions) {
  const parts = [];
  parts.push(ROLE_BRIEF[role]);
  parts.push(`\n## Review mode\n${mode}`);
  parts.push(`\n## Artifact under review\n\n${artifact}`);
  if (contextParts.length) parts.push(`\n## Code / supplementary context\n\n${contextParts.join('\n\n')}`);
  if (expertOpinions) {
    parts.push(`\n## Other experts' Round ${round - 1} opinions (anonymous)\n\n${expertOpinions}`);
    parts.push('\nWeigh the other experts\' evidence. State whether you maintain or revise your position, and why.');
  }
  parts.push(`
## Output contract (STRICT)

Respond with ONLY a JSON object, no markdown fences, matching:

{
  "verdict": "APPROVED" | "REQUEST_CHANGES",
  "confidence": <1-10 integer>,
  "critical_issues": ["..."],
  "major_concerns": ["..."],
  "minor_concerns": ["..."],
  "consensus_ratio": <0.0-1.0: your honest estimate of how much the three experts would agree with this assessment>,
  "summary": "<2-4 sentences>"
}

Rules:
- verdict APPROVED requires zero critical issues; list critical issues only if the artifact cannot be executed as written.
- Be specific: cite section/decision IDs (e.g. DD-005, AC#5, spike #6b) and, when context is provided, file:line anchors.
- Do not invent facts not present in the artifact or context.`);
  return parts.join('\n');
}

async function callExpert(role, model, expertOpinions) {
  const prompt = buildPrompt(role, expertOpinions);
  const body = {
    model,
    messages: [
      { role: 'system', content: `You are an anonymous ${role} reviewer in a Delphi consensus panel. You never see the other experts' identities.` },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  };
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  const started = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(expertTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) {
      const diag = JSON.stringify({ finish_reason: choice?.finish_reason, usage: data.usage, error: data.error, content_len: content.length, raw: JSON.stringify(data).slice(0, 400) });
      throw new Error(`unparseable model output: ${cleaned.slice(0, 200)} | diag: ${diag}`);
    }
    parsed = JSON.parse(m[0]);
  }
  if (!parsed.verdict) throw new Error(`missing verdict in output: ${cleaned.slice(0, 200)}`);
  return {
    role,
    model,
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    critical_issues: parsed.critical_issues ?? [],
    major_concerns: parsed.major_concerns ?? [],
    minor_concerns: parsed.minor_concerns ?? [],
    consensus_ratio: parsed.consensus_ratio,
    summary: parsed.summary,
    prompt_bytes: promptBytes,
    duration_ms: Date.now() - started,
  };
}

async function callExpertWithRetry(role, model, expertOpinions, attempts = maxAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await callExpert(role, model, expertOpinions);
      if (attempt > 1) result.retried_attempts = attempt;
      return result;
    } catch (error) {
      lastError = error;
      process.stdout.write(`  ${role} (${model}) attempt ${attempt}/${attempts} failed: ${error.message}\n`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
  throw lastError;
}

const experts = Object.entries(profile.experts).filter(([role]) => !args.only || role === args.only);
if (experts.length !== (args.only ? 1 : 3)) fail(`expected ${args.only ? 1 : 3} experts, got ${experts.length}`);
const models = new Set(experts.map(([, e]) => e.model.trim()));
if (!args.only && models.size !== 3) fail(`expert models must be distinct, got: ${[...models].join(', ')}`);

let expertOpinions = null;
if (prior) {
  expertOpinions = (prior.experts ?? [])
    .map((e) => `### Anonymized expert ${e.role}\nverdict=${e.verdict} confidence=${e.confidence}\ncritical: ${(e.critical_issues ?? []).join(' | ') || 'none'}\nmajor: ${(e.major_concerns ?? []).join(' | ') || 'none'}\nsummary: ${e.summary ?? ''}`)
    .join('\n\n');
}

process.stdout.write(`Delphi ${mode} review — round ${round}: ${experts.map(([r, e]) => `${r}=${e.model}`).join(', ')}\n`);

const settled = await Promise.allSettled(experts.map(([role, e]) => callExpertWithRetry(role, e.model.trim(), expertOpinions)));

const results = [];
const failures = [];
for (let i = 0; i < settled.length; i += 1) {
  const [role, e] = experts[i];
  const s = settled[i];
  if (s.status === 'fulfilled') {
    results.push(s.value);
    process.stdout.write(`  ${role} (${e.model}): ${s.value.verdict} conf=${s.value.confidence} ${s.value.duration_ms}ms\n`);
  } else {
    failures.push({ role, model: e.model, error: String(s.reason?.message ?? s.reason) });
    process.stdout.write(`  ${role} (${e.model}): FAILED — ${s.reason?.message ?? s.reason}\n`);
  }
}

const verdicts = results.map((r) => r.verdict);
const ratios = results.map((r) => Number(r.consensus_ratio)).filter((n) => Number.isFinite(n));
const meanRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
const allApproved = results.length === 3 && verdicts.every((v) => v === 'APPROVED');
const aggregateVerdict = failures.length > 0 ? 'PROCESS_BLOCK' : allApproved && meanRatio >= 0.9 ? 'APPROVED' : 'REQUEST_CHANGES';

const output = {
  mode,
  round,
  timestamp: new Date().toISOString(),
  artifact: args.input,
  artifact_hash: crypto.createHash('sha256').update(artifact, 'utf8').digest('hex'),
  artifact_bytes: Buffer.byteLength(artifact, 'utf8'),
  max_tokens: maxTokens,
  context_files: contextFiles.map((f) => ({ path: f, bytes: Buffer.byteLength(fs.readFileSync(f, 'utf8'), 'utf8') })),
  models: experts.map(([role, e]) => ({ role, model: e.model.trim() })),
  experts: results,
  failures,
  aggregate: {
    verdict: aggregateVerdict,
    consensus_ratio: Number(meanRatio.toFixed(4)),
    all_approved: allApproved,
    expert_count: results.length,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
process.stdout.write(`aggregate: ${aggregateVerdict} (consensus=${output.aggregate.consensus_ratio}, experts=${results.length}/3) → ${outPath}\n`);
