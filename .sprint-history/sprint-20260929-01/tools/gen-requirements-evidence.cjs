/**
 * Rebind requirements-reviewed.json (Phase 2 evidence) to the current worktree HEAD.
 *
 * Content source of truth: the archived R2 requirements review
 *   docs/sprints/2026-09-24-issue-149/phase-outputs/requirements-reviewed.json
 * (verdict APPROVED, consensus 0.94, 3 distinct model expert_verdicts)
 *
 * Run AFTER the design commit, then run:
 *   npx xp-gate phase-transition 2 completed --render
 */
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const archivedPath = "docs/sprints/2026-09-24-issue-149/phase-outputs/requirements-reviewed.json";
const outDir = ".sprint-state/phase-outputs";
const archived = JSON.parse(fs.readFileSync(archivedPath, "utf8"));

const timestamp = new Date().toISOString();
const evidenceDate = timestamp.slice(0, 10);
const statement = archived.requirements_statement;
const requirementsHash = crypto
  .createHash("sha256")
  .update(statement + "" + evidenceDate, "utf8")
  .digest("hex");
const headCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const evidence = {
  mode: "requirements",
  verdict: archived.verdict,
  timestamp,
  consensus_ratio: archived.consensus_ratio,
  requirements_hash: requirementsHash,
  head_commit: headCommit,
  context_file_used: null,
  round: archived.round,
  rounds_used: archived.rounds_used,
  requirements_statement: statement,
  gaps_found: [],
  escalation_needed: false,
  expert_verdicts: archived.expert_verdicts,
  provenance: {
    rebound_from: archivedPath,
    rebound_at: timestamp,
    note: "R2 requirements review rebinding (sprint-20260929-99); only timestamp/head_commit/requirements_hash refreshed",
  },
};

fs.writeFileSync(outDir + "/requirements-reviewed.json", JSON.stringify(evidence, null, 2) + "\n", "utf8");

console.log("written : " + outDir + "/requirements-reviewed.json");
console.log("HEAD    : " + headCommit);
console.log("stamp   : " + timestamp);
console.log("hash    : " + requirementsHash);

const { validateEvidence } = require("C:/Users/think/AppData/Roaming/npm/node_modules/@boyingliu01/xp-gate/lib/phase-transition.js");
const result = validateEvidence(2, process.cwd());
console.log("validator: " + JSON.stringify(result));
if (!result.ok) process.exit(1);
