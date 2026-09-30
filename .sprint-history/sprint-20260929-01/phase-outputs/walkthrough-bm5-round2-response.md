# Walkthrough BM5 — Round 2 response (R1 → R2 disposition)

> 2026-09-29 · Sprint #149 · Phase 4 VERIFY
> Prior: `walkthrough-bm5-round1.json` (3/3 APPROVED, mean 0.8267 → REQUEST_CHANGES)
> Input: `walkthrough-bm5-artifact-r2.md` (sha256 `f5f38f1204ed63078bc28b6d39e953438084e1382029ccf70a73b8126a69341a`, 80,375 bytes, range `eb707f9..cdffb69`)
> Fix commit: `cdffb69`

## Disposition (full text in artifact-r2 header, "R1 → R2 response")

### Fixed in `cdffb69`
| R1 concern | Fix |
|---|---|
| technical-M1 poisoned `templatePromise` fallback | `templateDisabled` latch — process skips memoized bad blob after first failure |
| feasibility-min2 `existsSync`/`readFileSync` race | guarded read, falls through to rebuild |
| technical-M3 divergent helper lifecycles | documented in `createTestPrisma` docstring |
| technical-min5 / feasibility-min1 DEPLOY.md `ENCRYPTION_KEY` | moved to Optional as deprecated (matches setup-guide + .env.example) |
| technical-M2 stale-cleanup comment | corrected ("deferred to next successful write") |
| feasibility-min1 / technical-M5 "each of 7 jobs" claim | corrected to 6 consuming jobs (security-scan static-only) |

### Evidence added (R1 gaps)
| R1 concern | Evidence |
|---|---|
| feasibility-M2 AC-003-02 timing SLA | cold **3654 ms** (incl. DDL spawn 1893 ms) ≤ 5 s; warm p95 **230/232 ms** ≤ 2 s (n=20×2) — `ac003-timing-and-memory-evidence.md` |
| technical-M4 e2e memory peak | full e2e peak **4441.8 MB** (node 2368.5 / chrome 2073.3), 11/11 files 78 tests EXIT=0, no OOM |
| technical-M5 / feasibility-min1 branch protection | job names ARE pinned (`gh api … branches/master/protection`, strict=true) → rename deferred, coordinated change |

### Responded without code change (evidence-based)
technical-M8/feasibility-min5 (`prisma:generate` + `prisma.config.ts` in `files` exist at HEAD) ·
architecture-min3 (cli `prisma@7.10.0` pin == package.json devDep `7.10.0`) ·
architecture-min2/technical-M7 (healthcheck timeouts predate sprint #57; M4 only swapped curl→fetch; `/health` probe costs documented) ·
technical-min4 (biome 2 errors were build/generated artifacts) ·
feasibility-min4 (archlint +11 reconciled in m5-archlint-evidence §3) ·
technical-min7 (spike EXPECTED_FAILS nuance) ·
architecture-min1 (cold parallel build: one per worker worst case, measured single-build cold path) ·
feasibility-M1 (no-PG CI spec-sanctioned; nightly real-PG job tracked) ·
feasibility-M3 (CI green run inherently post-push; tracked with M1-CI backfill).

## Non-blocking items recorded for CLOSE/SHIP
spike `c11_freshInstall` complexity · `ecosystem.config.cjs` path · README badge → #153 ·
pre-commit biome `--staged` quirk · branch-protection rename escalation · nightly real-PG follow-up ·
post-push CI verification (PR run + CI memory confirmation).
