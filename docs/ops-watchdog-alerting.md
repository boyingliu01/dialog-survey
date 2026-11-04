# 运维监控与告警 Runbook（WSL + Docker 部署）

> 适用范围：`docker compose` 部署（`dialog-survey-app` / `dialog-survey-db`）跑在 WSL2 里的形态。
> 脚本位置：[scripts/ops/](../scripts/ops/README.md)。业务侧通用备份文档见 [operations.md](./operations.md)。

## 1. 为什么需要这一套（两次真实故障）

### 2026-11-03 服务不可用：Store 自动升级 WSL → dockerd 漏编程网络规则

- Microsoft Store 在后台把 WSL 从 2.7.8.0 升到 2.7.14.0（19:55）再到 3.0.5.0（23:57），每次升级都会重启 VM。
- VM 非正常停机后，dockerd 恢复旧沙箱失败（日志 `error locating sandbox id ...: not found`），随后**跳过该 compose 网络的
  `DOCKER-FORWARD` / `DOCKER-CT` / `DOCKER-BRIDGE` 规则**。`FORWARD` 链策略是 DROP，于是容器看起来 running/healthy，
  但所有出站连接被丢弃。
- 表现：`/health` 返回 503，`checks.db` 超时、`checks.llm` = `fetch failed`。人工 `systemctl restart docker` 后立刻恢复。
- 结论：这类故障**不需要改代码**，需要一条「检测到规则缺失 → 重启 dockerd 自愈」的定时器，即 `ds-net-repair.sh`。
- 治本措施：关闭 Store 自动更新（`HKLM\SOFTWARE\Policies\Microsoft\WindowsStore` DWORD `AutoDownload=2`），
  WSL 升级改由人工在业务空闲时段执行，升级后跑 `ds-smoke.sh` 验收。

### 2026-11-04 告警抖动：一天 8 次「中断/恢复」误报

- `src/api/health.ts` 的 `checkLLM()` 会向 LLM 网关发一次真实 chat completion，超时 30s，成功结果缓存 60s，且没有并发去重。
- 老版看门狗 `curl -m 25` 先超时 → 判定失败 → 下一次成功 → 判定恢复。当天网关确有慢窗口（10 时最长 14.8s、11 时最长 23.1s、
  36 次健康请求挂起），于是每次慢都变成一次「中断」。
- 修正三件事：探测超时提高到 40s；**连续 2 次**异常才告警；告警文案区分「/health 超时（端口可连，疑似上游 LLM 慢）」与
  「端口不可连」。修完当天再无误报。
- 遗留改进（未做，属于应用代码）：`/health` 对 LLM 的探测应加并发去重 + 失败短缓存，避免健康检查被上游拖成 30s。

## 2. 监控平面

| 平面 | 载体 | 覆盖 | 盲区 |
|------|------|------|------|
| VM 内 | `ds-health-watch.sh`（cron，每分钟） | 容器状态、`/health`、钉钉 Stream | WSL 整机停机时它自己也不运行 |
| VM 内 | `ds-net-repair.sh`（systemd timer，每 2 分钟） | dockerd 漏编程 iptables 规则 | 只修这一类故障，重启 docker 有约 10s 抖动 |
| Windows 侧 | `ds-win-watch.ps1`（计划任务，每 5 分钟） | WSL 挂了 / docker 起不来 / 服务不可用 | 需连续 2 次（≈10 分钟）才告警 |
| 人工 | `ds-smoke.sh` | 升级/重启/改配置后的 14 项验收 | 需要有人跑 |
| 数据 | `ds-db-backup.sh`（每日）+ `ds-restore-drill.sh`（每月） | 备份存在且**真的能还原** | 演练失败要靠告警发现 |
| 汇总 | `ds-daily-report.sh`（每日 09:00） | 让「监控本身」可见，含近 24h 异常次数 | — |

告警统一经 `ds-alert.sh` 投递钉钉工作通知。凭据不落 git、不落 Windows：运行时从部署 `.env` 读
`DINGTALK_CLIENT_ID/SECRET/AGENT_ID`，接收人来自 `ALERT_USERIDS`（ops env 或 `~/.config/dialog-survey-alert.env`）。
`ds-alert.sh` 刻意**不依赖** compose 自己的网络——它坏的时候正是需要告警的时候：先走默认 `bridge` 上的一次性容器，
再退回主机 `curl`；`ds-win-watch.ps1` 在配置 `ALERT_WEBHOOK` 时用群机器人 webhook，WSL 完全不可用时仍能发。

## 3. 部署步骤

```bash
# 0) 前置：jq、curl、docker；cron 用户能执行 docker 与 systemctl restart docker
cp scripts/ops/ops.env.example ~/.config/dialog-survey-ops.env
$EDITOR ~/.config/dialog-survey-ops.env      # 至少填 ALERT_USERIDS 与 DS_ENV_FILE
chmod 600 ~/.config/dialog-survey-ops.env

# 1) 安装脚本（root 时装到 /usr/local/bin）
bash scripts/ops/install.sh --cron

# 2) 网络规则自愈定时器（需要 root；单元里的 EnvironmentFile 指向 /etc/default/dialog-survey-ops）
sudo cp ~/.config/dialog-survey-ops.env /etc/default/dialog-survey-ops && sudo chmod 600 /etc/default/dialog-survey-ops
sudo bash scripts/ops/install.sh --systemd
```

Windows 侧兜底（cmd 或 PowerShell 里执行；Git Bash 需 `MSYS_NO_PATHCONV=1` 才能传 `/Create`）：

```bat
mkdir %LOCALAPPDATA%\DialogSurvey 2>nul
copy scripts\ops\ds-win-watch.ps1 %LOCALAPPDATA%\DialogSurvey\
:: alert.env 里没有凭据，只有主机事实与收件人（凭据仍从 WSL 的部署 .env 现取）
>> %LOCALAPPDATA%\DialogSurvey\alert.env echo WATCH_WSL_DISTRO=Ubuntu-22.04
>> %LOCALAPPDATA%\DialogSurvey\alert.env echo WATCH_WSL_USER=your-user
>> %LOCALAPPDATA%\DialogSurvey\alert.env echo WATCH_ENV_FILE=/home/your-user/dialog-survey-src/.env
>> %LOCALAPPDATA%\DialogSurvey\alert.env echo ALERT_USERIDS=your-dingtalk-userid
:: 可选：ALERT_WEBHOOK=群机器人 webhook（WSL 完全不可用时唯一可用的通道）
:: 首次自检（会真的发一条测试通知；-DryRun 只写日志不发送）
powershell -NoProfile -ExecutionPolicy Bypass -File %LOCALAPPDATA%\DialogSurvey\ds-win-watch.ps1 -Test
schtasks /Create /F /SC MINUTE /MO 5 /TN dialog-survey-win-watch ^
  /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File %LOCALAPPDATA%\DialogSurvey\ds-win-watch.ps1"
```

WSL 关机后 Windows 计划任务不探测、VM 起来后自动继续；发行版开机自启依赖
`/etc/wsl.conf` 的 `systemd=true`（systemd timer 与 cron 都需要它或 cron 服务在跑）。

## 4. 验证（不要只信「脚本装好了」）

```bash
bash /usr/local/bin/ds-smoke.sh                 # 期望 PASS=14 FAIL=0（iptables 项需 root）
DS_REPAIR_ACTION=detect ds-net-repair.sh; echo $?   # 0 = 规则齐全
# 故障注入：删掉一条规则，确认定时器自己修回来
sudo iptables -D DOCKER-FORWARD -i br-$(docker network inspect dialog-survey-src_default --format '{{.Id}}' | cut -c1-12) -j ACCEPT
sudo DS_REPAIR_ACTION=detect /usr/local/bin/ds-net-repair.sh; echo $?   # 期望 1
sudo /usr/local/bin/ds-net-repair.sh; echo $?                            # 期望 0
bash /usr/local/bin/ds-restore-drill.sh                                  # 期望日志 PASS
```

告警链路可用 `ds-alert.sh "测试" "巡检链路验证"` 单测；`ds-win-watch.ps1 -DryRun` 只写日志不发送。

## 5. 收到告警怎么办

| 告警 | 先查 | 已验证的处置 |
|------|------|--------------|
| `app 容器状态=exited` / `db 容器健康=unhealthy` | `docker ps`、`docker logs --tail 100 dialog-survey-app` | `docker compose up -d`；卡在迁移时看 `docker top` 是否未到 `server-entry` |
| `/health 超时（40s，端口可连，疑似上游 LLM 慢）` | 网关侧、`checks.llm` | 通常自愈；持续则查 LLM 网关可用性，勿重启应用 |
| `/health 无响应（端口不可连）` | 容器与端口映射 | 重启容器 |
| `钉钉 Stream 未连接` | `docker logs dialog-survey-app \| grep -i stream` | 多为凭据/网络问题；容器网络类问题见下一条 |
| `网络规则自愈失败` | `iptables -S DOCKER-FORWARD \| grep br-<id>` | dockerd 重启仍缺规则时，`docker compose down && up -d` 重建网络 |
| `数据库备份失败` / `恢复演练失败` | `$DS_BACKUP_LOG`、`$DS_DRILL_LOG`、磁盘空间 | 备份目录满 / 归档头校验失败要立刻人工 `pg_dump` 一份并排查 |
| Windows 侧 `访谈机器人不可用` | `wsl -l -v`、`systemctl status docker` | WSL 未运行则 `wsl`；docker 起不来先看是否 Store 又升级了 |

## 6. 已知局限

- **`docker run` 会让 dockerd 丢掉 compose 网络的 per-network 规则**（2026-11-04 14:05 实测：执行备份 + 恢复演练期间
  `br-b164630542dc` 的 `FORWARD/CT/BRIDGE` 三条规则同时消失，`/health` 立即变成 db 超时 + llm fetch failed；
  14:07 自愈定时器重启 dockerd 后恢复，期间用户收到一条「异常」和一条「已恢复」）。
  因此恢复演练要放在业务空闲时段（cron 里是每月 1 日 03:00），且必须与 `ds-net-repair.timer` 同时在线；
  单独立项跟踪（见 [issues](https://github.com/boyingliu01/dialog-survey/issues)）。
- WSL 整机被升级/重启期间 VM 内监控不可用，Windows 侧要连续 2 次（约 10 分钟）才告警——夜间故障可能只有日报可见。
- `ds-net-repair.sh` 的自愈动作是重启 dockerd，会让全部容器短暂断连；已用 `DS_REPAIR_MIN_INTERVAL`（默认 600s）防止重启循环。
- `/health` 内含真实 LLM 调用，任何监控该端口的系统都要按「可容忍几十秒」设计（本套用 40s 超时 + 连续 2 次阈值）。
  端口语义见 AGENTS.md：`/health` 是 liveness（仅 DB 不可用才 503），`/health/ready` 是 readiness。
  看门狗默认探 liveness 以少误报；若要让「LLM/钉钉不可用」也算故障，把 `DS_HEALTH_URL` 指向 `/health/ready`。
- 备份文件含访谈正文与用户标识，属 PII：备份目录保持 0700/0600，异地副本目录不要共享给他人；日志只记录文件名与大小。
