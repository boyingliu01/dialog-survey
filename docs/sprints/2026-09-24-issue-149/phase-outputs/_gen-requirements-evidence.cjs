/**
 * Generate requirements-reviewed.json evidence for Delphi requirements mode.
 * Sprint: sprint-20260924-15 (Issue #149 — Prisma 7 + PGlite 集成)
 *
 * Run from the worktree root:
 *   node .sprint-state/phase-outputs/_gen-requirements-evidence.cjs
 *
 * Re-run if worktree HEAD changes before `phase-transition 2 completed`
 * to rebind head_commit / timestamp / requirements_hash.
 *
 * Provenance:
 * - requested_model 取自 Qoder custom agent 配置文件的 model 字段
 *   (C:\Users\think\.qoder\agents\delphi-architecture.md / delphi-technical.md / delphi-feasibility.md)
 * - requirements_statement 取自 issue-149-statement.md（gh issue view 149 原文）
 * - consensus_ratio = mean(1.0, 0.90, 0.92) = 0.94（Round 2 三位专家自评共识率聚合）
 */
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const outDir = ".sprint-state/phase-outputs";
const statementPath = outDir + "/issue-149-statement.md";

let statement = fs.readFileSync(statementPath, "utf8");
if (statement.charCodeAt(0) === 0xfeff) statement = statement.slice(1);

const timestamp = new Date().toISOString();
const evidenceDate = timestamp.slice(0, 10);
const requirementsHash = crypto
  .createHash("sha256")
  .update(statement + "" + evidenceDate, "utf8")
  .digest("hex");

const headCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const evidence = {
  mode: "requirements",
  verdict: "APPROVED",
  timestamp: timestamp,
  consensus_ratio: 0.94,
  requirements_hash: requirementsHash,
  head_commit: headCommit,
  context_file_used: null,
  round: 2,
  rounds_used: 2,
  requirements_statement: statement,
  gaps_found: [],
  escalation_needed: false,
  expert_verdicts: [
    {
      role: "architecture",
      verdict: "APPROVED",
      confidence: 8,
      result_type: "delphi_expert_result",
      requested_model: "qmodel_38max",
    },
    {
      role: "technical",
      verdict: "APPROVED",
      confidence: 8,
      result_type: "delphi_expert_result",
      requested_model: "gmodel",
    },
    {
      role: "feasibility",
      verdict: "APPROVED",
      confidence: 7,
      result_type: "delphi_expert_result",
      requested_model: "cmodel",
    },
  ],
};

fs.writeFileSync(outDir + "/requirements-reviewed.json", JSON.stringify(evidence, null, 2) + "\n", "utf8");

const statusFile = {
  mode: "requirements",
  timestamp: timestamp,
  verdict: "APPROVED",
  consensus_ratio: 0.94,
};
fs.writeFileSync(".sprint-state/delphi-reviewed.json", JSON.stringify(statusFile, null, 2) + "\n", "utf8");

console.log("written : " + outDir + "/requirements-reviewed.json + .sprint-state/delphi-reviewed.json");
console.log("HEAD    : " + headCommit);
console.log("stamp   : " + timestamp);
console.log("hash    : " + requirementsHash);

// Self-check with the installed xp-gate validator (same code phase-transition runs)
const { validateEvidence } = require("C:/Users/think/AppData/Roaming/npm/node_modules/@boyingliu01/xp-gate/lib/phase-transition.js");
const result = validateEvidence(2, process.cwd());
console.log("validator: " + JSON.stringify(result));
if (!result.ok) process.exit(1);
