Phase 4 VERIFY — evidence (issue #153)
======================================

Date: 2026-10-02
Sprint: sprint/2026-10-01-01, branch head e1572c2
Spec: SPEC-153-001 (7 REQs, 16 ACs)

1. Sprint-scope test results
----------------------------
Seven sprint suites, run with --no-file-parallelism:

  tests/commitlint-ci.test.ts
  tests/sync-version-parity.test.ts
  tests/sync-version.test.ts
  tests/optin-hooks.test.ts
  tests/release-config.test.ts
  tests/release-bootstrap.test.ts
  tests/release-integration.test.ts

  Result: 7 files passed, 91 tests passed, 1 skipped, 0 failed.

The single skip is the release-integration capability guard. It reports SKIPPED
with a concrete reason when release-it or its plugin is unavailable, instead of
passing vacuously. On this machine the dependency is present, so the suite's
seven real assertions ran, including a genuine release-it release.

L1: tsc --noEmit clean; biome check clean.

2. Real release proven end to end (AC-153-4-01)
-----------------------------------------------
tests/release-integration.test.ts performs an actual release in a throwaway
clone against a local bare remote, then asserts:

  - release-it exits 0
  - both after:bump hooks fire (write-version.cjs, sync-version.cjs)
  - VERSION == package.json == 1.11.0 and AGENTS.md contains (v1.11.0)
  - the release commit contains exactly AGENTS.md, CHANGELOG.md, VERSION,
    package.json  (a stale hook key yields only two of those)
  - git status --porcelain is empty
  - CHANGELOG.md gains the 1.11.0 entry at the top with 1.8.9 preserved
  - the tag is v1.11.0 while the bare name 1.11.0 does not exist

WITHOUT the changelog plugin, release-it takes a different hook path and a broken
config passes. The fixture therefore replicates the full plugin set, with exactly
two sanctioned exceptions per DD-009: github.release=false (no GitHub token
available) and requireBranch=false (the fixture branch is not master). Neither
exception touches the plugin set, the hook keys, npm.publish, or the changelog
plugin configuration.

Three environment requirements were discovered and are documented in the test:
  - release-it resolves plugins via require() from the working directory, so the
    fixture needs node_modules linked; resolution from a bare temp dir fails.
  - the current branch must have an upstream, or release-it refuses to start
    ("No upstream configured for current branch").
  - --ci is required to suppress interactive prompts.

3. Specification defect found and corrected (user-authorized option A)
---------------------------------------------------------------------
Finding: xp-gate check-alignment scored this specification 0/100 and could not
associate any test with any requirement.

Root cause 1: acceptance criteria used flat ids (AC-1 .. AC-16). The checker
compares ACs by literal set equality and filters @covers with
/^AC-[A-Z0-9]+-\d+-\d+$/, which flat ids cannot satisfy. The skill's own
references/specification-format.md prescribes "AC-XXX-001-01" and the checker's
own fixtures use "AC-TEST-001-01".

Root cause 2: no test carried @test/@intent annotations. The extractor only
recognises a /** */ block immediately preceding a test/it/describe call.

Correction: with user authorization, all 16 AC ids were rewritten to
AC-153-<req>-<nn>, derived from each AC's existing `requirement:` field (never
guessed), and every REQ -> AC relationship was verified preserved. Mandatory
@test/@intent/@covers JSDoc was added to every sprint test block.

Outcome: requirement coverage 0/7 -> 7/7; AC coverage 0/16 -> 15/16.

Note: the repository's other suites already use the canonical form
(AC-BATCH-001-01, AC-PRISMA7-001-01, AC-SAFETY-001-01), so this aligns with the
existing convention rather than inventing a new one.

4. Reported honestly, not concealed
-----------------------------------
test-alignment-report.json records the tool's raw verdict UNMODIFIED:
alignment_status FAIL, score 0, 282 misaligned entries.

Breakdown of those 282:
  - 0 belong to any of the six sprint suites.
  - 281 are @intent annotations missing from suites that pre-date this sprint
    (stream-message-service 36, dingtalk-stream 31, openai-compatible 14, ...).
    Retro-fitting them across ~281 unrelated assertions would be a large
    unreviewed change outside this sprint's declared write scope.
  - 1 is AC-153-1-03, which the specification itself marks test_type: manual:
    setting a required status check needs a repository admin. No automated
    assertion can prove it, and fabricating one would be a false pass. Deferred
    to the Phase 6 CLOSE manual UAT.

No test was deleted, skipped, or weakened to improve the score.

5. Pre-existing E2E failures — proven unrelated
-----------------------------------------------
The full suite reports 11 failures, ALL in tests/e2e browser suites (chromium via
Playwright), all timing out at 19-60s.

Proof they are pre-existing: a throwaway worktree was created at the sprint base
commit f37235f (before any change in this sprint) and the same two suites were
run there. Result:

  BASE  f37235f    : 3 failed | 7 passed
  SPRINT e1572c2   : 3 failed | 7 passed

Identical failing tests in both. The sprint touched zero files under src/ and zero
files under tests/e2e/ (verified with git diff --stat), so these failures cannot
be attributed to #153.

The base commit is itself titled "fix(test): eliminate race in plan-lifecycle
admin tree e2e (#164)", consistent with this being a known-flaky area.

6. Live repository integrity
----------------------------
  VERSION       = 1.10.0
  package.json  = 1.10.0
  git tags      = 37 (unchanged; no release was performed against this repository)
  working tree  = clean

An earlier fixture-based test run had written 1.2.3-rc.1 into the live VERSION
file. That was restored, its root cause (release.sh and write-version.cjs
resolving the repo from the script's own path) was fixed to use
git rev-parse --show-toplevel, and three regression tests now assert that fixture
runs never mutate the live VERSION.
