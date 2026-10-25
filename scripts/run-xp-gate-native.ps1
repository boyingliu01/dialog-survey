# Run the xp-gate hooks natively on Windows, without WSL.
#
#   powershell -File scripts/run-xp-gate-native.ps1 pre-commit
#   powershell -File scripts/run-xp-gate-native.ps1 pre-push
#
# This is a thin wrapper over scripts/run-xp-gate-native.sh so the gates can be
# started from a normal PowerShell prompt. The work happens in Git Bash; see the
# header of that script for why WSL must not be involved.
#
# Resolution order for Git Bash:
#   1. $env:XP_GATE_GIT_BASH
#   2. Git's own bash.exe, located from git.exe on PATH
#   3. C:\Program Files\Git\bin\bash.exe
#
# Exit code is the hook's own exit code: 0 means every gate that ran passed.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('pre-commit', 'pre-push')]
    [string]$Hook = 'pre-commit',

    # Remaining arguments are forwarded to the hook unchanged.
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

function Resolve-GitBash {
    if ($env:XP_GATE_GIT_BASH) {
        if (Test-Path $env:XP_GATE_GIT_BASH) { return $env:XP_GATE_GIT_BASH }
        throw "XP_GATE_GIT_BASH points at a missing file: $env:XP_GATE_GIT_BASH"
    }

    # git.exe lives at <root>\cmd\git.exe or <root>\bin\git.exe; bash.exe is a
    # sibling of the latter. Prefer this over a hard-coded path so a non-default
    # install location works.
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        $root = Split-Path (Split-Path $git.Source -Parent) -Parent
        $candidate = Join-Path $root 'bin\bash.exe'
        if (Test-Path $candidate) { return $candidate }
    }

    foreach ($fallback in @(
            'C:\Program Files\Git\bin\bash.exe',
            'C:\Program Files (x86)\Git\bin\bash.exe',
            (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe')
        )) {
        if (Test-Path $fallback) { return $fallback }
    }

    throw 'Git Bash not found. Set $env:XP_GATE_GIT_BASH to the path of bash.exe.'
}

$bash = Resolve-GitBash
$script = Join-Path $PSScriptRoot 'run-xp-gate-native.sh'

# Deliberately NOT using -NoProfile/-l: the script builds its own PATH and the
# point is to be independent of whatever the interactive shell happens to have.
& $bash $script $Hook @Rest

exit $LASTEXITCODE
