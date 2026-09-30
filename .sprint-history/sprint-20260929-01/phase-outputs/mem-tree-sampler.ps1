param([string]$OutFile, [string]$StopFile)
# Samples the peak total WorkingSet of the vitest process tree (node root +
# workers + playwright chromium descendants) until $StopFile exists.
$peak = 0
while (-not (Test-Path -LiteralPath $StopFile)) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $byPid = @{}
  $children = @{}
  foreach ($p in $all) {
    $pid2 = [int]$p.ProcessId
    $byPid[$pid2] = $p
    $parent = [int]$p.ParentProcessId
    if (-not $children.ContainsKey($parent)) {
      $children[$parent] = New-Object 'System.Collections.Generic.List[int]'
    }
    $children[$parent].Add($pid2) | Out-Null
  }
  $roots = New-Object 'System.Collections.Generic.List[int]'
  foreach ($p in $all) {
    if ($p.Name -eq 'node.exe' -and ([string]$p.CommandLine) -match 'vitest') {
      $roots.Add([int]$p.ProcessId) | Out-Null
    }
  }
  if ($roots.Count -gt 0) {
    $seen = New-Object 'System.Collections.Generic.HashSet[int]'
    $stack = New-Object 'System.Collections.Generic.Stack[int]'
    foreach ($r in $roots) { $stack.Push($r) }
    $sum = [long]0
    $counts = @{}
    $sumByName = @{}
    while ($stack.Count -gt 0) {
      $id = $stack.Pop()
      if (-not $seen.Add($id)) { continue }
      $proc = $byPid[$id]
      if ($null -ne $proc) {
        $sum += [long]$proc.WorkingSetSize
        $n = [string]$proc.Name
        if ($counts.ContainsKey($n)) { $counts[$n]++ } else { $counts[$n] = 1 }
        if ($sumByName.ContainsKey($n)) { $sumByName[$n] += [long]$proc.WorkingSetSize } else { $sumByName[$n] = [long]$proc.WorkingSetSize }
      }
      if ($children.ContainsKey($id)) {
        foreach ($c in $children[$id]) { $stack.Push($c) }
      }
    }
    if ($sum -gt $peak) {
      $peak = $sum
      $detail = ($sumByName.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$([math]::Round($_.Value / 1MB, 1))MB(n=$($counts[$_.Name]))" }) -join ' '
      Set-Content -LiteralPath $OutFile -Value ("peak={0}MB split: {1} at {2}" -f [math]::Round($sum / 1MB, 1), $detail, (Get-Date -Format o))
    }
  }
  Start-Sleep -Milliseconds 500
}
Add-Content -LiteralPath $OutFile -Value ("final={0}MB" -f [math]::Round($peak / 1MB, 1))
