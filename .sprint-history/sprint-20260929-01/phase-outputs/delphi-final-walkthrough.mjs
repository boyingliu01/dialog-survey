// Delphi code-walkthrough driver for sprint #149 final pre-push gate.
// Reads LLM_API_KEY from the project .env (never printed) and calls the
// authorized whalecloud gateway. Writes only round JSONs + the evidence file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, '.sprint-state', 'phase-outputs');
const ARTIFACT = path.join(OUT_DIR, 'walkthrough-final-artifact.md');
const CONTEXT_FILES = [
  'specification.yaml',
  'tests/prisma7-spec-invariants.test.ts',
  'tests/helpers/pglite-template.ts',
  '.sprint-state/phase-outputs/test-alignment-report.json',
];

const EXPERTS = [
  {
    role: 'architecture',
    model: 'g-qwen3.8-flash',
    lens: 'module boundaries, dependency direction, ownership of the facade/factory seam, CI/release architecture, test architecture',
  },
  {
    role: 'technical',
    model: 'g-deepseek-flash',
    lens: 'correctness of the code as written, race conditions, error handling, assertion strength, flakiness, maintainability traps',
  },
  {
    role: 'feasibility',
    model: 'g-glm-5.3-flash',
    lens: 'whether the evidence and claims hold up in reality (CI, release chain, measurement methodology), and whether deferrals are shippable',
  },
];

function readKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^LLM_API_KEY=(.*)$/.exec(line);
    if (m && m[1].trim()) return m[1].trim();
  }
  throw new Error('LLM_API_KEY not found in .env');
}

const KEY = readKey();
const URL = 'https://lab.iwhalecloud.com/gpt-proxy/v1/chat/completions';
const artifactText = fs.readFileSync(ARTIFACT, 'utf-8');
const contextText = CONTEXT_FILES.map((rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return `--- ${rel}: MISSING ---`;
  let body = fs.readFileSync(p, 'utf-8');
  if (rel.endsWith('.json')) body = `${body.slice(0, 4000)}\n<truncated>`;
  return `--- ${rel} ---\n${body}`;
}).join('\n\n');

function systemPrompt(expert) {
  return [
    `You are Expert ${expert.role.toUpperCase()} in an anonymous 3-expert Delphi code walkthrough`,
    `(pre-push gate). Your lens: ${expert.lens}.`,
    'You review the changeset strictly. You may not invent problems, and you may not approve while',
    'Critical issues remain. Judge ONLY what is in this range plus the verification evidence.',
    'Items listed under "Recorded non-blocking items" are already tracked in other issues —',
    'do not re-report them as new findings.',
    '',
    'Output ONLY a JSON object, no prose, no markdown fences, with exactly these keys:',
    '{"result_type":"delphi_expert_result","role":"<role>","verdict":"APPROVED|REQUEST_CHANGES|REJECTED",',
    '"confidence":<1-10>,"critical_issues":[...],"major_concerns":[...],"minor_concerns":[...],',
    '"consensus_ratio":<0..1, your estimate of how much of your assessment the other two experts would share>,',
    '"summary":"<=120 words>"}',
    '',
    'Rules: verdict APPROVED requires critical_issues=[] and major_concerns=[].',
    'A concern is only "major" if shipping without addressing it would damage correctness, the',
    'release chain, or the truthfulness of recorded evidence. Style preferences are minor.',
  ].join(' ');
}

async function ask(expert, round, prior) {
  const user = [
    `Round ${round} of an anonymous Delphi code walkthrough.`,
    prior ? `Other experts\' positions from earlier rounds (identities hidden) and the orchestrator\'s written responses:\n${prior}` : '',
    '',
    '=== CHANGESET ARTIFACT (scope + verification evidence + full diff) ===',
    artifactText,
    '=== CONTEXT FILES ===',
    contextText,
  ].join('\n');

  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: expert.model,
      temperature: 0.2,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: systemPrompt(expert) },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(600000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${expert.model}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') throw new Error(`empty completion for ${expert.model}`);
  const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON object in completion for ${expert.model}`);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (parsed.result_type !== 'delphi_expert_result') throw new Error(`bad result_type for ${expert.model}`);
  return {
    role: expert.role,
    requested_model: `whalecloud/${expert.model}`,
    resolved_model: json.model ? String(json.model) : `whalecloud/${expert.model}`,
    verdict: parsed.verdict,
    confidence: Number(parsed.confidence) || 0,
    critical_issues: parsed.critical_issues ?? [],
    major_concerns: parsed.major_concerns ?? [],
    minor_concerns: parsed.minor_concerns ?? [],
    consensus_ratio: Number(parsed.consensus_ratio),
    summary: parsed.summary ?? '',
  };
}

function renderPrior(responses) {
  return responses
    .map(
      (r) =>
        `--- Expert (${r.role}) round ${r.round} verdict=${r.verdict} ---\nCritical: ${JSON.stringify(r.critical_issues)}\nMajor: ${JSON.stringify(r.major_concerns)}\nOrchestrator response: ${r.response ?? '(pending)'}`,
    )
    .join('\n\n');
}

const historyFile = path.join(OUT_DIR, 'walkthrough-final-history.json');
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf-8')) : [];

let round = history.length + 1;
const maxRound = Number(process.argv[2] ?? 3);
let lastResponses = [];

while (round <= maxRound) {
  console.log(`[DelphiReview Round ${round}] ${round === 1 ? 'Anonymous Independent Review' : 'Exchange Opinions'}`);
  const responses = [];
  const failures = [];
  for (const expert of EXPERTS) {
    try {
      const prior = round === 1 ? '' : renderPrior(history.flatMap((h) => h.responses));
      const r = { round, ...(await ask(expert, round, prior)) };
      responses.push(r);
      console.log(`  ${expert.role} (${expert.requested_model}) -> ${r.verdict} crit=${r.critical_issues.length} major=${r.major_concerns.length} ratio=${r.consensus_ratio}`);
    } catch (e) {
      failures.push({ role: expert.role, model: `whalecloud/${expert.model}`, error: String(e.message).slice(0, 300) });
      console.log(`  ${expert.role} FAILED: ${String(e.message).slice(0, 200)}`);
    }
  }

  const ratios = responses.map((r) => r.consensus_ratio).filter((n) => Number.isFinite(n));
  const consensus = ratios.length === EXPERTS.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  const allApproved = failures.length === 0 && responses.length === EXPERTS.length && responses.every((r) => r.verdict === 'APPROVED');
  const verdict = failures.length ? 'PROCESS_BLOCK' : allApproved && consensus >= 0.9 ? 'APPROVED' : 'REQUEST_CHANGES';
  console.log(`consensus_ratio=${consensus.toFixed(4)} (${responses.length}/${EXPERTS.length} experts) verdict_status: ${verdict}`);

  fs.writeFileSync(
    path.join(OUT_DIR, `walkthrough-final-round${round}.json`),
    `${JSON.stringify(
      {
        mode: 'code-walkthrough',
        round,
        timestamp: new Date().toISOString(),
        artifact: '.sprint-state/phase-outputs/walkthrough-final-artifact.md',
        artifact_hash: crypto.createHash('sha256').update(fs.readFileSync(ARTIFACT)).digest('hex'),
        artifact_bytes: fs.statSync(ARTIFACT).size,
        context_files: CONTEXT_FILES,
        models: EXPERTS.map((e) => ({ role: e.role, model: e.model })),
        responses,
        failures,
        aggregate: { verdict, consensus_ratio: Number(consensus.toFixed(4)), all_approved: allApproved, expert_count: responses.length },
      },
      null,
      2,
    )}\n`,
  );

  history.push({ round, responses, aggregate: { verdict, consensus_ratio: consensus } });
  fs.writeFileSync(historyFile, `${JSON.stringify(history, null, 2)}\n`);
  lastResponses = responses;

  if (verdict === 'APPROVED') {
    const now = new Date();
    const exp = new Date(now.getTime() + 3600 * 1000);
    const trunc = (d) => `${d.toISOString().replace(/\.\d{3}Z$/, '')}Z`;
    const evidence = {
      mode: 'code-walkthrough',
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
      branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim(),
      timestamp: trunc(now),
      expires: trunc(exp),
      verdict: 'APPROVED',
      confidence: Math.min(...lastResponses.map((r) => r.confidence)),
      consensus_ratio: Number(consensus.toFixed(4)),
      round,
      artifact: '.sprint-state/phase-outputs/walkthrough-final-artifact.md',
      artifact_sha256: crypto.createHash('sha256').update(fs.readFileSync(ARTIFACT)).digest('hex'),
      experts: lastResponses.map((r, i) => ({
        id: `Expert ${'ABC'[i]}`,
        role: r.role,
        verdict: 'APPROVED',
        confidence: r.confidence,
        result_type: 'delphi_expert_result',
        requested_model: r.requested_model,
        resolved_model: r.resolved_model,
        consensus_ratio: r.consensus_ratio,
      })),
      minor_concerns: lastResponses.flatMap((r) => r.minor_concerns ?? []),
    };
    fs.writeFileSync(path.join(ROOT, '.code-walkthrough-result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`WROTE .code-walkthrough-result.json commit=${evidence.commit.slice(0, 7)} ratio=${evidence.consensus_ratio} round=${round}`);
    break;
  }
  round += 1;
}
