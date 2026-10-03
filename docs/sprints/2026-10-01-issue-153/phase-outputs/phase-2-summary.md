# Phase 2/6: DESIGN — Sprint Summary

Sprint: sprint-2026-10-01-01 (issue #153 — enforce Conventional Commits, automated
CHANGELOG, automated version release)
Status: completed

## What happened

The design was produced and iterated across five Delphi rounds, producing
`docs/plans/2026-10-01-conventional-commits-design.md` (v8, 1224 lines), which is
the authoritative design for this sprint.

## Verdict (recorded honestly)

R2 design review returned **PASS_WITH_CAVEATS** with consensus **0.00** against a
0.90 threshold: 5/5 rounds produced 3/3 REQUEST_CHANGES. The design was NOT
rubber-stamped and no expert was dropped to manufacture consensus.

The R2 verdict and the user's decision to proceed anyway are recorded in
`.sprint-state/phase-outputs/delphi-reviewed.json` and `.sprint-state/decisions.md`.
The transition past the DELPHI-GATE used the audited
`--skip-evidence` path with an explicit reason, not a fabricated APPROVED.

## Key design decisions that shaped BUILD

| Decision | Rationale |
|----------|-----------|
| Bare `after:bump` hook key, never `after:version:bump` | Measured: with @release-it/conventional-changelog installed, `after:version:bump` NEVER fires. The release still exits 0 and tags, leaving VERSION and AGENTS.md stale — a silent corruption. Recorded as §0.4 of the design. |
| Hook commands as an array, never `&&`-chained | `&&` chaining silently fails inside release-it hooks. |
| Optional opt-in local hook, default NOT installed | The generated hook replaces `core.hooksPath`, which disables the entire global xp-gate gate chain for this repo. User decision R2: keep it opt-in and document the cost. |
| No husky | husky@9.1.7 index.js:14 unconditionally sets `core.hooksPath`, silently voiding all 12 global gates. DD-001. |
| `.architecture-baseline.json` committed | Without it, Gate 6 blocks every commit including docs-only ones; the baseline pins pre-existing debt so only NEW violations fail. |
| `sync-version.cjs` as sole feature target; `.sh` frozen | Cross-platform without bash/WSL (WSL `bash` exits 127). AC-13. |

## Artifacts

- `docs/plans/2026-10-01-conventional-commits-design.md` (v8)
- `.sprint-state/phase-outputs/specification.yaml` (SPEC-153-001: 7 REQs, 16 ACs)
- `.sprint-state/phase-outputs/slices-manifest.json` (5 slices)
- `.sprint-state/phase-outputs/delphi-reviewed.json` (PASS_WITH_CAVEATS)
- `.sprint-state/phase-outputs/requirements-reviewed.json`
- `.architecture-baseline.json` (142 pinned smells)

## next_phase_context

BUILD must treat §0.4 (bare `after:bump`) as load-bearing and must prove the hook
actually fires with the changelog plugin present — a config-only assertion passes
on the broken key.
