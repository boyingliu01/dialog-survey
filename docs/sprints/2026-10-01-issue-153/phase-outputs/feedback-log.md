# Feedback Log — Sprint sprint-2026-10-01-01 (issue #153)

Genuine learnings from BUILD and VERIFY, including the mistakes. Each entry states
what happened, how it was detected, and what prevents recurrence.

---

## FL-001 — A dead hook key produces a silent, successful corruption

**Severity**: critical
**Where**: `.release-it.json` hook key; design §0.4

With `@release-it/conventional-changelog` installed, the key
`after:version:bump` is **never fired**. Measured in an isolated clone: the
release exits 0, commits, and tags, while `VERSION` and `AGENTS.md` are left
stale. The release commit contains 2 files instead of 4.

**Why it is dangerous**: there is no error, no warning, and no non-zero exit. The
only signal is the *absence* of expected content.

**Detection**: only a real release reveals it. A config-shape assertion passes on
the broken key, because the JSON is well-formed. The negative control run in
`release-it-integration-evidence.txt` confirms the bare `after:bump` key is
load-bearing.

**Prevention**: `tests/release-integration.test.ts` performs a real release and
asserts the four-file commit. `tests/release-config.test.ts` asserts the key name
exactly.

---

## FL-002 — A test silently ran against the production repository

**Severity**: critical
**Where**: `scripts/release.sh`, `scripts/write-version.cjs`

Both scripts resolved their root from their own file location
(`dirname($0)/..`). Running them from a fixture therefore operated on the **real
repository** instead of the fixture. The `release.sh` pre-check passed against
production (both versions were 1.10.0) and execution reached a genuine
`release-it` invocation — only the default dry run prevented a tag.

A separate run wrote `1.2.3-rc.1` into the live `VERSION` file.

**Detection**: `git status` showed a modified `VERSION` after a test run that was
supposed to be side-effect free.

**Prevention**: both scripts now resolve their target with
`git rev-parse --show-toplevel`, and three regression tests assert the live
`VERSION` is never mutated by fixture runs.

**Lesson**: destructive tooling must never infer "which repository am I about to
release?" from where a script happens to be checked out.

---

## FL-003 — `git reset --hard` during probing destroyed committed-to-be work

**Severity**: high
**Where**: BUILD, before commit `8251fcb`

A `git reset --hard`/`git stash` probe discarded uncommitted edits. Commit
`8251fcb` consequently claimed to add the `commit-lint` CI job and the
`@commitlint/*` dependencies while neither was present. `504c540` restored the
job; the dependencies were restored in `a37adcb`.

**Why it stayed hidden**: `npx --no-install commitlint` exits 1 when the package is
missing, which is indistinguishable from a correctly rejected commit message. The
round-trip tests therefore stayed green on a missing dependency.

**Prevention**:
- Two guards in `tests/commitlint-ci.test.ts` assert the packages are declared AND
  installed, and that the versions stay on the Node-20-compatible line.
- Process rule adopted: never `git reset --hard` / `git stash` while uncommitted
  work is present; commit or copy files aside first.

---

## FL-004 — Fixtures inherit the machine-global hook chain and hang

**Severity**: medium
**Where**: all git-fixture tests

Fixtures created with `git init` inherit the machine-global
`core.hooksPath` (xp-gate). Every fixture commit then runs the full 12-gate
pre-commit chain: slow in the best case, and fatal when the fixture has no
`tsconfig.json` or architecture config, because Gate 6 blocks the commit.

**Symptom observed**: a multi-minute hang, not a failure — the test suite never
finished and no assertion ever ran.

**Prevention**: fixtures set `git config --local core.hooksPath ""` before their
first commit. Applied in `release-bootstrap.test.ts` and
`release-integration.test.ts`. Note `optin-hooks.test.ts` deliberately does NOT do
this, because that suite's subject *is* `core.hooksPath` semantics.

---

## FL-005 — A tool's own identifier convention is a hard contract

**Severity**: medium
**Where**: `specification.yaml` AC ids

`check-alignment` defines AC coverage as literal set equality and filters
`@covers` with `/^AC-[A-Z0-9]+-\d+-\d+$/`. Flat ids (`AC-1`) can therefore never
score, no matter how thoroughly the behaviour is tested.

**Lesson**: when a gate scores 0 while tests demonstrably pass, read the gate's
implementation before assuming the tests are wrong. Fifteen minutes in
`lib/test-alignment.ts` produced the exact regex and the exact scoring weights.

**Prevention**: AC ids follow the canonical `AC-<spec>-<req>-<nn>` form the tool
prescribes and the rest of this repository already uses.

---

## FL-006 — Missing environment preconditions look like logic failures

**Severity**: low
**Where**: `tests/release-integration.test.ts`

Three separate environment facts each produced a fast, cryptic failure before the
suite ran: release-it resolves plugins via `require()` from the working directory
(so a bare temp fixture cannot find the changelog plugin); the branch must have an
upstream configured; and `--ci` is required to suppress prompts.

**Detection**: the failures took ~12 ms, far too fast to be logic. Capturing raw
tool output to a file turned three opaque failures into precise messages.

**Prevention**: the fixture links `node_modules`, pushes with `-u`, runs `--ci`,
and writes the raw release-it output to disk on failure so a fast failure stays
diagnosable.

---

## FL-007 — Distinguishing a regression from a pre-existing failure

**Severity**: low (process)
**Where**: VERIFY

The full suite reported 11 new-looking E2E failures. Rather than assume they were
flakes or assume they were regressions, a throwaway worktree was created at the
sprint base commit `f37235f` and the same suites were run there. The results were
identical (3 failed / 7 passed for the two suites checked), and `git diff --stat`
confirmed the sprint touched zero files under `src/` or `tests/e2e/`.

**Lesson**: "prove it at the base commit in a separate worktree" is cheap, safe,
and settles the question definitively — without touching the working tree.
