# M2 gate evidence — push + CI (commit eb707f9)

| Field | Value |
|---|---|
| Commit | `eb707f98c6ff3e4f97da079bf9b0c24a6cc9df42` |
| Branch | sprint/2026-09-29-01 → `origin/sprint/2026-09-29-01` (new branch, upstream set) |
| Push result | success — pre-push gates all PASS |
| GATE MW | ✅ CODE WALKTHROUGH VERIFIED (commit eb707f9, verdict APPROVED, consensus 0.9233) |
| Pushed totals | 115 files changed, +4683/−452 (whole branch vs origin/master; walkthrough range 90 files +658/−320 vs 0820555^) |

## workflow_dispatch run (F-M4 / m5 close-out)

- Dispatched: 2026-09-29T16:45:51Z, `gh workflow run "PR Quality Gates" --ref sprint/2026-09-29-01`
- Run ID: `36600088594`（headSha=eb707f9, event=workflow_dispatch）
- URL: https://github.com/boyingliu01/dialog-survey/actions/runs/36600088594
- Purpose: exercise the newly added `workflow_dispatch` trigger once on the pushed branch
  (clean-checkout verification), per feasibility F-M4 and m5.
- Result: **7/7 jobs success** (Static Analysis / Unit Tests / Integration Tests / Security Scan /
  Coverage Check / Smoke Test / E2E Tests)。Security job 内 semgrep 与 gitleaks 步均
  `success`（非 continue-on-error 掩盖）。注意：此 run 为 Stage A 时代形态——
  当时各 job 仍带 postgres service 与 DB env；Stage B 推送后需以「无 service/无 env」形态复验。

### 同 push 触发的 spike workflow（run 36600066391, failure）

- eb707f9 push 命中 `tools/spike/**` paths 过滤 → ubuntu spike 复跑失败（#11 argv bug + #6b 预期失败 →
  旧 exit 语义）。根因、修复与 exit 语义收窄见 `m1-addendum.md`；修复在 Stage B 变更集内，推送后自动复跑。

## Local verification at the same commit (reference)

- Full suite: 116/116 files, 1261 passed | 1 skipped, 0 unhandled errors
  (`stageA2-full-suite-coverage.log`)
- Coverage All files: 87.13 / 73.07 / 93.5 / 87.7
- tsc 0 errors; `npx biome check src/` clean (`walkthrough-eb707f9-verify.log`)
