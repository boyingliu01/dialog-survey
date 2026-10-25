# xp-gate defects found while bringing dialog-survey to green

Environment: xp-gate 0.31.1, Windows 11 + WSL2 (Ubuntu), git 2.43, Node 24.19.

`/etc/wsl.conf` on this machine sets `[interop] appendWindowsPath = false`, which
is what exposes most of these. Each entry says whether the defect is "the hook
assumes MSYS/Git-Bash" (environmental) or a plain bug that fires everywhere.

Reproduce any of them with `powershell -File scripts/run-xp-gate-native.ps1 pre-commit`
(or `bash scripts/run-xp-gate-native.sh pre-commit`) in this repo after reverting
the corresponding local patch. The gates run natively in Git Bash; the WSL
wrapper that used to be needed here (`scripts/run-xp-gate.sh`) has been deleted,
because the machine PATH now puts Git Bash ahead of the WSL launcher.

---

## 1. Stray backtick makes `pre-commit` a syntax error — the whole gate engine dies

**Severity: critical. Fires on every platform and every project.**

`hooks/pre-commit`, the Gate 5 per-new-file coverage block (around line 3199 in
the 0.31.1 hook, written at 2026-10-24 16:18):

```bash
echo "     ⚠️  $new_file — no coverage data (file may be excluded or not exercised)"
```

The word `new_file` is wrapped in backticks. Bash reads the closing backtick as
the start of a command substitution and the remainder of the file fails to parse:

```
.../pre-commit: line 3208: syntax error near unexpected token `('
.../pre-commit: line 3208: `          echo "     ⚠️  $new_file — no coverage data (file may be excluded or not exercised)"'
```

Consequences:
- The hook aborts **mid-run**, after Gates 0–5 have printed PASS. Gates 6–12 and
  the quality report never execute, and the exit status is whatever the last
  successful command returned.
- `bash -n hooks/pre-commit` fails, so this is detectable statically — there is
  no such check in the hook itself or in the test suite. `hooks/__tests__/`
  contains bats suites for individual gates but nothing that parses the hook.

This exact file is also the one that the *documented* protection against
xp-gate updates (issue #209: "run `scripts/verify-xp-gate-patches.cjs`") does
not cover: the verify script checks the mutation runner and the pre-push
timeout, not hook parseability.

Suggested fix: `${new_file}` (or no quoting at all), plus `bash -n` over
`hooks/*` and `adapters/*.sh` in CI.

## 2. Gate 1 type-checks test files twice, then fails on its own temp file

**Severity: high. Fires on every TypeScript project whose `tsconfig.json`
already includes its tests.**

`hooks/lib/typecheck.sh`, `run_test_file_pass()`:

```bash
if npx tsc --noEmit --skipLibCheck --listFiles 2>/dev/null | grep -qE '__tests__/|\.test\.ts|\.spec\.ts'; then
  has_tests_in_tsc=true
fi
[ "$has_tests_in_tsc" = false ] || return 0
```

`tsc --listFiles` prints absolute paths using **forward slashes on Windows**
(`D:/projects/x/tests/a.test.ts`). The guard greps for `__tests__/` / `.test.ts`
with a forward slash, which *does* match — so on a project whose tsconfig
already covers tests the guard correctly returns early.

The failure is on the other side: `resolve_typecheck_command()` runs the
project's own `npm run type-check`. This repo's `type-check` is
`tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit`, i.e. it already checks
`src/**` **and** `tests/**` (tsconfig.json `include` lists both). Because a
project checker was found, `run_typescript_typecheck()` returns 0 at the end of
the project-typecheck branch — it never calls `run_test_file_pass`. So where
does `.tsconfig.withtests.json` come from?

It does not, on the current hook. But the block is reachable for any project
**without** a `typecheck`/`type-check` script, and there the fallback temp
config is built with `include.push('src/**/__tests__/**','src/**/*.test.ts',
'src/**/*.spec.ts')` — top-level `tests/` is never added, so a repo that keeps
tests outside `src/` gets a config that matches nothing, and `tsc` exits non-zero
with `TS5058`:

```
error TS5058: The specified path does not exist: '.tsconfig.withtests.json'.
```

and Gate 1 reports **"TYPE ERRORS in test files"** — a false BLOCK whose message
points at a missing file the user did not write.

Suggested fix: treat TS5058 (and "no inputs") as "nothing to check" rather than
as a finding, and add `tests/**` to the temp config's `include`.

## 3. `appendWindowsPath = false` turns every JS gate into a silent SKIP or a false BLOCK

**Severity: high on Windows/WSL without interop; not a bug on Linux/macOS.**

The hooks shell out to `npx`, `node`, `npm` by bare name. With no Windows path
on PATH:

| Gate | Observed |
|------|----------|
| 1 | `ℹ️ SKIP - npx not available (no TypeScript checker)` — Gate 1 does not run |
| 1 | `hooks/pre-commit: line 1440: npx: command not found` → `❌ BLOCKED - Biome check failed` |
| 5 | runs, but coverage is measured on whatever ran |
| 8 | `❌ BLOCKED - gitleaks not installed (fail-closed, #499)` |

Two different failure modes for the same root cause, one of which (SKIP) reads
as "nothing to check". `docs/` suggests Git Bash; the hook makes no attempt to
locate node itself, and `pre-commit` is also started by Windows git whose
`#!/bin/bash` shebang lands in WSL.

Suggested fix: a `resolve_node()` helper mirroring `resolve_typecheck_command()`
(env override → `command -v` → `%ProgramFiles%\nodejs\node.exe` via
`wslpath`/`cygpath`), and use it everywhere `npx` is invoked.

## 4. `command -v` cannot see `.exe`, so native tools look uninstalled

**Severity: medium. Windows/WSL.**

`adapters/gate-8.sh` decides availability with `command -v gitleaks`. Under
bash-on-WSL, a directory containing only `gitleaks.exe` is **not** on the
`command -v` path (bash does not consider the `.exe` suffix unless the Windows
mount provides the extension-less name too), so Gate 8 fail-closes with
"gitleaks not installed" while `gitleaks.exe` is on PATH and `gitleaks version`
would work if invoked by full path.

Scoop's own `shims/gitleaks` is not a workaround either: it is a launcher that
opens a sidecar `.shim` file by *Windows* path, so exec'ing it through `/mnt`
fails with `Cannot open shim file for read`.

Suggested fix: probe `command -v X || command -v X.exe || [ -x "$path/X.exe" ]`

## 5. `$HOME` is a WSL path but is handed to `node.exe` — Gate 9 reports a build failure

**Severity: high. Windows/WSL, any repo.**

`hooks/pre-commit` builds module paths as `"$HOME/.config/xp-gate/modules/..."`
and passes them to `node`/`tsx`. Under WSL `$HOME` is `/home/<user>`, which
`node.exe` resolves to `<cwd-drive>:\home\<user>\...` — a path that does not
exist:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  'D:\home\boyingliu01\.config\xp-gate\modules\build-integrity\gate-10.ts'
```

Gate 9 then prints `❌ BLOCKED - Gate 9: Build integrity check failed` /
`Fix type errors, broken imports, or package manifest issues` — describing a
code defect in the user's repo for a path-translation problem in the tool.

Same class: `PROJECT_ROOT` is `/mnt/d/...` and is passed as
`run_tsx "$PROJECT_ROOT/node_modules/tsx/dist/cli.mjs"` and as
`--project-root "$PROJECT_ROOT"`. Every such call fails with MODULE_NOT_FOUND
even after `$HOME` is fixed, because bash has no notion of `/mnt/d` as a drive
and node.exe has no notion of `/mnt`:

```
Error: Cannot find module 'D:\mnt\d\projects\dialog-survey\node_modules\tsx\dist\cli.mjs'
```

Suggested fix: translate with `wslpath -w`/`cygpath -w` whenever a POSIX path
is handed to a native binary, or route everything through a single helper.

## 6. Gate 8 passes a POSIX config path to native gitleaks → "Secrets detected"

**Severity: high (false positive that blocks the commit). Windows/WSL.**

`adapters/gate-8.sh`:

```bash
if command -v cygpath >/dev/null 2>&1; then
  GITLEAKS_CONFIG="--config=$(cygpath -w "$(pwd)/.gitleaks.toml")"
else
  GITLEAKS_CONFIG="--config=$(pwd)/.gitleaks.toml"
fi
```

`cygpath` is a Git-for-Windows/MSYS tool; in WSL there is no `cygpath` (there is
`wslpath`), so the fallback passes `/mnt/d/.../.gitleaks.toml` to native
gitleaks:

```
FTL unable to load gitleaks config, err: open /mnt/d/.../.gitleaks.toml:
  The system cannot find the path specified.
```

gitleaks exits 1, and the gate's exit-1 branch is *"Secrets found"*, so the
commit is blocked with:

```
❌ BLOCKED - Secrets detected in staged files.
Remediation options: 1. Remove the secret ...
```

There is no secret. Two defects here: the missing `wslpath` branch, and treating
"scanner could not start" (exit 1 with a config-load error) as "secret found"
(the same fail-open/fail-closed confusion #499 fixed for the missing-binary
case — it is now wrong in the opposite direction).

Suggested fix: also probe `wslpath`; distinguish a gitleaks *tool* error from
findings by checking the report file was produced.

## 7. Gate 12 / Gate 8 / Gate 5 count `git add`-visible files, but the hook also auto-stages

**Severity: low, but it makes gate results non-reproducible.**

Gate 0 runs `scripts/sync-version.cjs` and then `git add`s the files it
rewrote (`hooks/pre-commit` around line 642). Every gate after that reads
`git diff --cached`, so the gate corpus depends on whether the version bump
happened to change `package.json`/`AGENTS.md`. Re-running the same hook twice
can produce different corpus sizes (`1 file changed` vs `3 files changed`), and
`--help`-style reselection is not possible because the intermediate state is not
reported.

Suggested fix: capture the staged list once, before any auto-staging, and use
that snapshot for the whole run.

## 8. Gate 8 reports a *clean* scan as SKIP, because gitleaks 8.30.1 writes no report when it finds nothing

**Severity: high (permanently removes Gate 8 from the verdict). Filed as xp-gate
#592.**

The gate decides "did the scan actually happen?" from the report artifact rather
than from the exit code — the right instinct, from #449. But the assumption
behind it is false: **gitleaks 8.30.1 does not create the `--report-path` file
when it finds nothing.**

```bash
$ gitleaks git --staged --redact --no-banner --report-format=json --report-path=/tmp/gl.json
5:31PM INF scanned ~159459 bytes (159.46 KB) in 1.18s
5:31PM INF no leaks found
$ echo $?
0
$ ls /tmp/gl.json
ls: cannot access '/tmp/gl.json': No such file or directory
```

So on every clean machine the gate prints:

```
⚠️  gitleaks exited 0 but produced no readable report
⏭️  SKIPPED - secret scanning produced no evidence (not a pass)
```

A *successful* scan is reported as "no evidence." The report file's existence
means "there was a problem", not "a scan ran" — the opposite of what the gate
assumes. This is why Gate 8 sits at SKIP here and why a reader cannot tell
"never scanned" from "scanned, clean".

Suggested fix: three-way decision — `FTL`/config errors in stderr are an
environment failure; a readable report is authoritative; exit 0 with no report
should fall back to gitleaks' stable stdout (`INF no leaks found` together with
`INF scanned ~N bytes`), or to an injected canary that proves the scan path
works.

---

## 9. Gate 5 judges a `NaN` coverage figure as PASS

**Severity: high (silently disables the local coverage gate). Filed as xp-gate
#594 — and worked around in `vitest.config.ts`.**

Gate 5's TypeScript coverage branch read the figure with
`Math.round(data.total.lines.pct)` and compared it with `[ "$pct" -lt 80 ]`.
When istanbul has no coverage to report it writes `"pct": "Unknown"`, and then:

- `Math.round("Unknown")` is `NaN` — no exception, so the `parse_error` guard
  never fires;
- `[ "NaN" -lt 80 ]` makes bash print `integer expression expected` and return
  **2**, and `if` treats any non-zero as "condition false", so it took the PASS
  branch.

Observed output:

```
TypeScript coverage: NaN% ✅ (≥ 80%)
✅ PASSED - Coverage check completed.
...: line 3041: [: NaN: integer expression expected
```

Reached whenever the gate runs a subset of tests (`vitest run --coverage
<changed files>`) and none of them imports a src module. The verdict happened to
be correct here — real coverage is ~94% — but the gate was not enforcing it.

**Workaround:** `coverage.include: ['src/**/*.ts']` + `cleanOnRerun: false`.
`@vitest/coverage-v8` merges untested files into the report only when
`options.include != null && (allTestsRun || !cleanOnRerun)`; a subset run sets
`allTestsRun=false`, so both halves are needed. The total is then a real number
and the NaN path is unreachable. The gate now prints `⚠️ Partial coverage 0%
(subset test run, not full suite)` — correctly labelled as partial rather than a
false PASS. Note `coverage.all` does **not** work: it was removed in v4 and
silently does nothing.

---

## 10. "Tool not installed" for tools that are installed

**Severity: medium. Environment/UX, not filed separately — the underlying cause
turned out to be the WSL detour itself, and it is gone now that the gates run
natively in Git Bash.**

`lizard` (Gate 3), `semgrep` (Gate 10) and `detect-secrets-hook` (Gate 8) were
reported missing on every run, with `pip install` hints attached. All three were
installed and executable in the WSL user's `~/.local/bin`.

1. `~/.profile` and `~/.bashrc` both export `~/.local/bin`, but only
   *interactive login* shells read them. The gates run from a non-interactive
   shell, so `command -v` genuinely found nothing — the gate reported what it
   saw.
2. Adding the directory to PATH was not sufficient. Python resolves user
   site-packages from `$HOME`, and the wrapper repoints `HOME` at the Windows
   profile so Gate 9 can resolve its node modules. A console script on PATH then
   died with `ModuleNotFoundError: No module named 'semgrep'`.

The symptom ("not installed") pointed at the wrong action (install), which is
why the real fault stayed hidden across repeated "I installed it already"
rounds.

**How it was actually resolved:** not by patching the WSL environment, but by
leaving it. All three tools were *also* installed natively on the Windows side,
several of them newer (lizard 1.24.2, semgrep 1.171.0 vs 1.21.3 / 1.164.0). Once
the machine PATH puts `C:\Program Files\Git\bin` ahead of the WSL launcher, the
hooks run in Git Bash where `$HOME` already is the Windows profile — both
mechanisms above vanish rather than needing to be worked around, and the
`scripts/run-xp-gate.sh` wrapper that carried the workarounds was deleted.

Suggested upstream fix: when `command -v` fails, distinguish "binary absent"
from "binary present but not importable", and probe the language-specific user
bin dirs (`~/.local/bin`, `%APPDATA%\Python\Scripts`) before concluding a tool is
missing.

---

## 11. The gates cannot run in WSL against this checkout at all — and it is not the tools

**Severity: n/a (not a gate defect). Recorded because it is easy to blame the
wrong thing, and was initially blamed on the wrong thing here.**

The Python tools *are* reachable in WSL. Measured:

```
$ wsl bash -c 'command -v node npx lizard semgrep detect-secrets-hook'
                             # all NOT FOUND in a bare non-interactive shell
$ wsl bash -c 'source ~/.nvm/nvm.sh; export PATH=$HOME/.local/bin:$PATH; ...'
node                 /home/boyingliu01/.nvm/versions/node/v24.19.0/bin/node
lizard               /home/boyingliu01/.local/bin/lizard
semgrep              /home/boyingliu01/.local/bin/semgrep
detect-secrets-hook  /home/boyingliu01/.local/bin/detect-secrets-hook
```

So after sourcing nvm and adding `~/.local/bin`, every gate tool resolves inside
WSL, and the hooks do start and reach Gate 1. They then stop here:

```
→ Gate 1: Code Quality (static analysis + linting)...
✅ PASSED - TypeScript static analysis.
Running Biome lint/format check...
Error: Cannot find module '@biomejs/cli-linux-x64/biome'
❌ BLOCKED - Biome check failed
```

**The real blocker is `node_modules`, not the tooling.** `/mnt/d` is one
directory seen by two operating systems, so Windows and WSL share a single
`node_modules` — and it was populated by `npm install` on Windows. Native
packages therefore exist only in their win32 builds:

| package | present | missing |
|---|---|---|
| `@biomejs` | `cli-win32-x64` | `cli-linux-x64` |
| `lightningcss` | `win32-x64-msvc` | `linux-x64-gnu` |
| `@esbuild` | `win32-x64` | `linux-x64` |

Any gate that shells out to a native binary (Biome here; esbuild/rollup and
lightningcss behind Vite/Build Integrity) fails in WSL for that reason. This is
inherent to a shared checkout and cannot be fixed by adding PATH entries — the
Linux binaries are simply not on disk.

**Consequences, stated plainly:**

- Running the gates from Windows is the supported configuration. They are
  Windows-native and self-contained.
- Running them from WSL would require its own dependency tree (a second
  `npm install` performed *from WSL* into a separate directory, e.g. a dedicated
  worktree), i.e. exactly the two-environment split that was just removed. It is
  a deliberate choice not to maintain that.
- `scripts/run-xp-gate-native.sh` invokes Git Bash explicitly, so calling it from
  a WSL shell does not "fall back" to a WSL run — it fails loudly on the missing
  Git Bash path, which is the honest outcome rather than a misleading half-run.
- The WSL environment itself is untouched and still works for everything else;
  its tool versions are simply older and it cannot run *this checkout's* JS
  tooling.

Suggested upstream improvement: the failure surface would be much clearer if the
adapter distinguished "native binary missing for this platform" from "code
quality violation". `Cannot find module '@biomejs/cli-linux-x64/biome'` presented
under `❌ BLOCKED - Biome check failed` reads as the project having a lint
problem.

---

## Not filed: already known upstream

- Gate M (mutation) issues are tracked by dialog-survey issue #209 and the
  four local patches in `~/.config/xp-gate/`. Re-verified present with
  `node scripts/verify-xp-gate-patches.cjs` on 0.31.1.
- Gate 6 archlint `DeadSymbol` false positives for methods reached through
  callbacks — documented in dialog-survey `AGENTS.md`.
- Gate 3, Gate 8 and Gate 10 report SKIP/WARN rather than running, because the
  underlying tools were unreachable. That was an environment fault, not a gate
  defect; see section 10 for the two mechanisms and the repair. With the wrapper
  they all run.

## Filed

| xp-gate issue | Defect |
|---|---|
| #579 | Stray backtick in `hooks/pre-commit` — whole gate suite stops parsing after Gate 5 |
| #580 | WSL `appendWindowsPath=false`: JS gates either silently SKIP or falsely BLOCK; `command -v` cannot see `.exe` |
| #581 | `$HOME` / `PROJECT_ROOT` POSIX paths handed to `node.exe` — Gate 9 reports a build failure |
| #582 | Gate 8 passes a POSIX config path to native gitleaks; a tool that cannot start is judged "secrets found" |
| #592 | Gate 8 reports a clean scan as SKIP — gitleaks writes no report when there are no findings |
| #594 | Gate 5 judges a `NaN` coverage figure as PASS — `Math.round` does not throw, and bash integer comparison failure reads as "false" |
