<#
.SYNOPSIS
    Check PowerShell layering declared in architecture.yaml for xp-gate Gate 6.

.DESCRIPTION
    The xp-gate pre-commit hook runs this via -Command and parses three things
    straight out of its output:

        violations=<n>      number of dependency edges examined
        failing=<n>         how many of them broke the declared layering
        NO_POWERSHELL_LAYERS     emitted when architecture.yaml declares none

    Anything it cannot parse makes the gate report WARN rather than PASS, so the
    summary line's exact shape is part of the contract.

    This repo's PowerShell is two standalone gate-runner scripts under scripts/.
    There is no layering to enforce: neither imports the other, and neither has a
    layer below it. Declaring one layer with no dependencies is the honest
    description of that, and this check still earns its keep — it fails if a
    future script in a declared layer starts reaching into one it must not use.

.PARAMETER ConfigPath
    Path to architecture.yaml.

.PARAMETER Root
    Repository root. Files are discovered relative to it.

.PARAMETER BaselinePath
    Optional JSON file recording known-and-accepted violations.

.OUTPUTS
    violations=<n> failing=<n> on the first line, then one VIOLATION line per
    broken edge.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path (Get-Location) 'architecture.yaml'),
    [string]$Root = (Get-Location).Path,
    [string]$BaselinePath = ''
)

$ErrorActionPreference = 'Stop'

# The hook passes the repo root as an absolute path, but a human may pass '.'.
# Everything below compares $file.FullName against $Root by prefix, so $Root has
# to be absolute and free of a trailing separator or the reported paths come out
# as ":\projects\..." instead of repo-relative.
if (Test-Path -LiteralPath $Root) {
    $Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\', '/')
}
$ConfigPath = if (Test-Path -LiteralPath $ConfigPath) { (Resolve-Path -LiteralPath $ConfigPath).Path } else { $ConfigPath }

function Write-Summary {
    param([int]$Violations, [int]$Failing)
    Write-Output "violations=$Violations failing=$Failing"
}

# --- read the powershell: block ----------------------------------------------
# A hand-rolled reader instead of ConvertFrom-Yaml: PowerShell ships no YAML
# parser and adding a module dependency just to read four lines would make this
# check fail on any machine without it.
if (-not (Test-Path $ConfigPath)) {
    Write-Output 'NO_POWERSHELL_LAYERS'
    exit 0
}

$lines = Get-Content -LiteralPath $ConfigPath
$inBlock = $false
$layers = [ordered]@{}
$currentLayer = $null

foreach ($line in $lines) {
    $trimmed = $line.TrimEnd()

    if ($trimmed -match '^powershell:\s*$') {
        $inBlock = $true
        continue
    }

    # Leaving the block: any other top-level (column 0) key ends it.
    if ($inBlock -and $trimmed -match '^\S') {
        break
    }

    if (-not $inBlock) { continue }
    if ($trimmed -match '^\s*#' -or $trimmed -match '^\s*$') { continue }

    # Layer declaration is indented under powershell: (2 or 4 spaces).
    if ($trimmed -match '^\s{2,4}(\w[\w-]*):\s*$') {
        $currentLayer = $Matches[1]
        $layers[$currentLayer] = @{
            Pattern = $null
            Depends = @()
        }
        continue
    }

    if ($null -eq $currentLayer) { continue }

    if ($trimmed -match '^\s+pattern:\s*"?([^"#]+)"?') {
        $layers[$currentLayer].Pattern = $Matches[1].Trim()
        continue
    }

    if ($trimmed -match '^\s+depends:\s*\[(.*)\]') {
        $inner = $Matches[1].Trim()
        if ($inner) {
            $layers[$currentLayer].Depends = @(
                $inner -split ',' | ForEach-Object { $_.Trim().Trim("'", '"') } | Where-Object { $_ }
            )
        }
        continue
    }
}

if ($layers.Count -eq 0) {
    Write-Output 'NO_POWERSHELL_LAYERS'
    exit 0
}

# --- collect the files each layer owns ---------------------------------------
function Get-LayerFiles {
    param([string]$Pattern)

    if (-not $Pattern) { return @() }

    # Patterns are repo-relative globs such as "scripts/**.ps1", or a bare file
    # path such as "scripts/one.ps1". Split off the non-wildcard directory prefix
    # so the search can be scoped instead of walking the whole repo.
    $normalized = $Pattern -replace '\\', '/'
    $wildcardAt = $normalized.IndexOfAny([char[]]'*?')

    if ($wildcardAt -lt 0) {
        # No wildcard: it names one file, and the matcher below is exact.
        $exact = Join-Path $Root $normalized
        if (Test-Path -LiteralPath $exact -PathType Leaf) {
            return @(Get-Item -LiteralPath $exact)
        }
        return @()
    }

    $beforeWildcard = $normalized.Substring(0, $wildcardAt)
    $lastSlash = $beforeWildcard.LastIndexOf('/')
    $dirPart = if ($lastSlash -ge 0) { $beforeWildcard.Substring(0, $lastSlash) } else { '' }
    $leaf = $normalized.Substring($lastSlash + 1)

    $searchRoot = if ($dirPart) { Join-Path $Root $dirPart } else { $Root }
    if (-not (Test-Path $searchRoot)) { return @() }

    $filter = Split-Path $leaf -Leaf
    if (-not $filter -or $filter -match '\*{2}') { $filter = '*.ps1' }

    return @(Get-ChildItem -LiteralPath $searchRoot -Recurse -File -Filter $filter -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git)[\\/]' })
}

# --- record which layer each file belongs to --------------------------------
$fileLayer = @{}
foreach ($name in $layers.Keys) {
    foreach ($file in (Get-LayerFiles -Pattern $layers[$name].Pattern)) {
        $fileLayer[$file.FullName] = $name
    }
}

$known = @{}
if ($BaselinePath -and (Test-Path $BaselinePath)) {
    try {
        $baseline = Get-Content -LiteralPath $BaselinePath -Raw | ConvertFrom-Json
        foreach ($entry in $baseline.accepted) { $known["$($entry.file)|$($entry.layer)"] = $true }
    }
    catch {
        # A broken baseline must not silently widen the allowance.
        Write-Warning "could not read baseline ${BaselinePath}: $($_.Exception.Message)"
    }
}

# --- check every declared edge ----------------------------------------------
$total = 0
$failing = 0

foreach ($name in $layers.Keys) {
    $allowed = @($layers[$name].Depends)
    foreach ($file in (Get-LayerFiles -Pattern $layers[$name].Pattern)) {
        # . "relative.ps1" and Import-Module are the only ways one script pulls
        # in another here; both are literal enough to match with a regex.
        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        foreach ($m in [regex]::Matches($content, '(?m)^\s*\.\s+[''"](?<p>[^''"]+)[''"]')) {
            $total++
            # Join-Path keeps a leading "./" in the string it returns, which would
            # never match the normalised keys in $fileLayer — resolve it instead.
            $target = Join-Path $file.DirectoryName $m.Groups['p'].Value
            if (Test-Path -LiteralPath $target) {
                $target = (Resolve-Path -LiteralPath $target).Path
            }
            $targetLayer = $fileLayer[$target]
            if (-not $targetLayer) { continue }
            if ($targetLayer -eq $name) { continue }
            if ($allowed -contains $targetLayer) { continue }
            if ($known.ContainsKey("$($file.Name)|$targetLayer")) { continue }

            $failing++
            $rel = $file.FullName.Substring($Root.Length).TrimStart('\', '/')
            Write-Output "VIOLATION $rel ($name) dot-sources into layer '$targetLayer' (allowed: $($allowed -join ', '))"
        }
    }
}

Write-Summary -Violations $total -Failing $failing
exit 0
