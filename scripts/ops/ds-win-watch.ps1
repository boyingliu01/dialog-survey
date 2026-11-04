# Dialog Survey Windows-side watchdog.
# Purpose: alert from the Windows side when WSL itself is down / dockerd will not
# start / the compose network is unusable — the cases where the in-VM cron watcher
# cannot report anything, because it is down too.
# Mechanics: probe /health every run (register it as a 5-minute scheduled task),
# alert after 2 consecutive failures, notify on recovery, re-alert every 30 minutes.
# Credentials: read at runtime from the deployment .env inside WSL (nothing is
# persisted on the Windows side); recipients come from alert.env (ALERT_USERIDS),
# and ALERT_WEBHOOK in the same file is preferred when set, because a group-robot
# webhook still works when WSL is completely unavailable.
param(
    [string]$HealthUrl = "http://127.0.0.1:3001/health",
    # WSL distro / user and the path of the deployment .env inside it. Left empty here
    # on purpose: they are host facts, so set them in alert.env
    # (%LOCALAPPDATA%\DialogSurvey\alert.env) as WATCH_WSL_DISTRO / WATCH_WSL_USER /
    # WATCH_ENV_FILE, or pass them on the command line.
    [string]$WslDistro = "",
    [string]$WslUser = "",
    [string]$EnvFile = "",
    [switch]$DryRun,
    [switch]$Test
)

$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "DialogSurvey"
$stateFile = Join-Path $dir "win-watch.state"
$logFile = Join-Path $dir "win-watch.log"
$cfgFile = Join-Path $dir "alert.env"
$curl = Join-Path $env:SystemRoot "System32\curl.exe"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Write-Log([string]$m) {
    $line = "{0} {1}`r`n" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
    [IO.File]::AppendAllText($logFile, $line, (New-Object Text.UTF8Encoding($false)))
}

function Get-WslValue([string]$key) {
    try {
        $v = & wsl.exe -d $WslDistro -u $WslUser --exec bash -lc "grep -E '^$key=' '$EnvFile' | tail -1 | cut -d= -f2-"
        if ($LASTEXITCODE -eq 0) { return ($v -join "").Trim() }
    } catch { }
    return $null
}

function Get-CfgValue([string]$key) {
    if (-not (Test-Path $cfgFile)) { return $null }
    $line = Get-Content $cfgFile | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
    if ($line) { return ($line -split "=", 2)[1].Trim() }
    return $null
}

function Send-Alert([string]$title, [string]$body) {
    $content = "[$title] $body`n主机: $env:COMPUTERNAME  时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    if ($DryRun) { Write-Log "DRYRUN alert: $content"; return $true }

    $webhook = Get-CfgValue "ALERT_WEBHOOK"
    $tmp = Join-Path $dir "payload.json"

    if ($webhook) {
        $payload = @{ msgtype = "text"; text = @{ content = $content } } | ConvertTo-Json -Depth 5 -Compress
        [IO.File]::WriteAllText($tmp, $payload, (New-Object Text.UTF8Encoding($false)))
        $r = & $curl -sS -m 10 --ssl-no-revoke -H "Content-Type: application/json" --data-binary "@$tmp" $webhook 2>&1
        Write-Log "ALERT(webhook) $title -> $r"
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        return ($r -match '"errcode"\s*:\s*0')
    }

    $key = Get-WslValue "DINGTALK_CLIENT_ID"
    $sec = Get-WslValue "DINGTALK_CLIENT_SECRET"
    $agent = Get-WslValue "DINGTALK_AGENT_ID"
    $users = Get-CfgValue "ALERT_USERIDS"
    if (-not $users) {
        Write-Log "ERROR 告警失败：alert.env 未配置 ALERT_USERIDS"
        return $false
    }
    if (-not $key -or -not $sec -or -not $agent) {
        Write-Log "ERROR 告警失败：WSL 不可用且未配置 ALERT_WEBHOOK（无法取到钉钉凭据）"
        return $false
    }

    $tokenUrl = "https://oapi.dingtalk.com/gettoken?appkey=" + [uri]::EscapeDataString($key) + "&appsecret=" + [uri]::EscapeDataString($sec)
    $tok = (& $curl -sS -m 10 --ssl-no-revoke $tokenUrl | ConvertFrom-Json)
    if (-not $tok.access_token) {
        Write-Log "ERROR 取 token 失败: $($tok.errcode) $($tok.errmsg)"
        return $false
    }

    $msg = @{ msgtype = "text"; text = @{ content = $content } } | ConvertTo-Json -Depth 5 -Compress
    [IO.File]::WriteAllText($tmp, $msg, (New-Object Text.UTF8Encoding($false)))
    $resp = & $curl -sS -m 10 --ssl-no-revoke -X POST `
        "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=$([uri]::EscapeDataString($tok.access_token))" `
        --data-urlencode "agent_id=$agent" `
        --data-urlencode "userid_list=$users" `
        --data-urlencode "msg@$tmp" 2>&1
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Write-Log "ALERT($(if ($resp -match '"errcode"\s*:\s*0') { 'ok' } else { 'fail' })) $title -> $resp"
    return ($resp -match '"errcode"\s*:\s*0')
}

if (-not $WslDistro) { $WslDistro = Get-CfgValue "WATCH_WSL_DISTRO" }
if (-not $WslUser) { $WslUser = Get-CfgValue "WATCH_WSL_USER" }
if (-not $EnvFile) { $EnvFile = Get-CfgValue "WATCH_ENV_FILE" }
if (-not $WslDistro -or -not $WslUser -or -not $EnvFile) {
    Write-Log "ERROR 未配置 WSL 目标：alert.env 需要 WATCH_WSL_DISTRO / WATCH_WSL_USER / WATCH_ENV_FILE（或用命令行参数）"
    exit 2
}
if ($EnvFile -notmatch '^[/\w.-]+$') {
    Write-Log "ERROR WATCH_ENV_FILE 含非法字符（只允许绝对路径字符）"
    exit 2
}

if ($Test) {
    $okSend = Send-Alert "Windows 看门狗自检" "这是 Windows 侧兜底告警通道的测试消息，无需处理。"
    if ($okSend) { Write-Log "TEST OK" ; exit 0 } else { Write-Log "TEST FAILED"; exit 1 }
}

$prevOk = $true
$failCount = 0
$lastAlert = 0
if (Test-Path $stateFile) {
    $p = (Get-Content $stateFile -Raw).Trim() -split "\s+"
    if ($p.Count -ge 3) {
        $prevOk = ($p[0] -eq "ok")
        $failCount = [int]$p[1]
        $lastAlert = [int64]$p[2]
    }
}

$healthy = $false
$detail = ""
try {
    $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 40
    $j = $resp.Content | ConvertFrom-Json
    $healthy = ($resp.StatusCode -eq 200 -and $j.status -eq "healthy")
    if (-not $healthy) { $detail = "status=$($j.status)" }
} catch {
    $detail = "探测失败: $($_.Exception.Message)"
}

$nowEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if (-not $healthy) { $failCount++ } else { $failCount = 0 }

if (-not $healthy -and $failCount -ge 2 -and ($nowEpoch - $lastAlert) -ge 1800) {
    Write-Log "UNHEALTHY ($detail) failCount=$failCount"
    Send-Alert "访谈机器人不可用" "$detail（连续 $failCount 次探测失败，Windows 侧兜底告警）" | Out-Null
    $lastAlert = $nowEpoch
} elseif ($healthy -and -not $prevOk) {
    Write-Log "RECOVERED"
    Send-Alert "访谈机器人已恢复" "Windows 侧探测 /health 恢复正常" | Out-Null
}

$state = "{0} {1} {2}" -f $(if ($healthy) { "ok" } else { "fail" }), $failCount, $lastAlert
[IO.File]::WriteAllText($stateFile, $state)
exit 0
