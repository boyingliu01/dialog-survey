# Bug report: xp-gate v0.19.3 pre-commit Gate 1 blocks docs-only commits

**Environment**: xp-gate v0.19.3, `core.hooksPath = C:/Users/think/.config/xp-gate/hooks`, Windows + Git Bash

## Summary

`pre-commit` line 1008 blocks **every commit whose staged set contains no Biome-lintable file**,
including docs-only and config-only commits. Large parts of this repo cannot be committed at all.

## Root cause

```bash
# pre-commit:1008
if ! npx biome check --staged . 2>/dev/null; then
```

Biome exits **1** with `internalError/io — No files were processed in the specified paths.`
when the staged set yields zero files to check. Nothing is wrong with the change; Biome is
reporting "I had nothing to do", and the hook reads that as failure.

The hook itself already shows the correct fallback at line 1009 (`npx biome check .`, which
passes on the whole repo), but it is only reached *after* the `if !` has already decided to block.

## Reproduction

```bash
# In dialog-survey, with only non-lintable files staged:
$ git add docs/some-design.md
$ git diff --cached --name-only
docs/some-design.md

$ npx biome check --staged .
Checked 0 files in 2ms. No fixes applied.
internalError/io ━━━━━━━━━━━━━━━━━━━━━━━

  × No files were processed in the specified paths.

$ echo $?          # hook treats non-zero as BLOCK
1

$ npx biome check .        # whole repo is clean
Checked 201 files in 691ms. No fixes applied.
$ echo $?
0
```

For contrast, the whole-repo check (line 1009's intent) **passes**; only the `--staged`
invocation fails. Same result whether the stage is empty, `.md`-only, or
`.md` + `.gitignore` + a Biome-ignored `.json`.

## Why it is not a project problem

The staged files are *correctly* outside Biome's scope — `biome.json` `files.ignore` lists
`.architecture-baseline.json`, and Biome does not lint `.md`/`.gitignore`. So "0 files" is the
right answer; failing on it is not.

This is consistent with the hook's own stated design principle in its header:

> DESIGN PRINCIPLE: Tool unavailable = SKIP (graceful degradation), tool available + check
> fails = BLOCK. Block fires only when the tool exists AND the check fails.

Here the tool exists and the check **succeeded with nothing to do**, yet it blocks.

## Suggested fix

Biome provides the flag for exactly this case:

```bash
# pre-commit:1008
if ! npx biome check --staged --no-errors-on-unmatched . 2>/dev/null; then
```

Verified in this repo:

```bash
$ npx biome check --staged --no-errors-on-unmatched .
Checked 0 files in 2ms. No fixes applied.
$ echo $?
0
```

Real lint/format failures still produce diagnostics and a non-zero exit, so the gate keeps its
teeth; only the "nothing staged to lint" case stops being treated as a violation.

## Impact

- Blocks docs-only PRs, config-only PRs, and any commit touching solely ignored paths
- No documented escape valve exists for the Biome check (only `SKIP_GATE_5A_BLOCK` and
  `SKIP_VERSION_CHECK` are provided), so the only workarounds are `--no-verify` (which
  disables all 12 gates) or editing the global hook — both worse than the fix above

## Note

Found while running Sprint Flow on dialog-survey issue #153. Not worked around with
`--no-verify`; reported here instead so the gate is not silently weakened.
