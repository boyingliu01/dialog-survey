# scripts/ops — 部署侧巡检与告警脚本

面向 Docker 部署（`docker compose` + `dialog-survey-app` / `dialog-survey-db`）的可用性监控、
告警投递、备份与恢复演练脚本。业务侧备份/还原的通用文档见 [docs/operations.md](../../docs/operations.md)，
本目录是它在「容器 + WSL」形态下的具体实现，并额外覆盖 dockerd 网络规则失效这一类故障。

| 文件 | 作用 | 触发方式 |
|------|------|----------|
| `ds-alert.sh` | 钉钉工作通知投递（凭据运行时从部署 `.env` 读取） | 被其他脚本调用 |
| `ds-alert-send.mjs` | `ds-alert.sh` 在一次性容器里调用的发送器 | 由 `ds-alert.sh` 调用 |
| `ds-health-watch.sh` | 容器状态 + `/health` + 钉钉 Stream 巡检，连续 2 次异常才告警 | cron，每分钟 |
| `ds-daily-report.sh` | 巡检日报（含近 24h 异常、备份与恢复演练状态） | cron，每天 09:00 |
| `ds-db-backup.sh` | `pg_dump -Fc` + 容器内 `pg_restore -l` 校验 + 保留 + 异地副本 | cron，每天 02:30 |
| `ds-restore-drill.sh` | 把最新备份还原进一次性 PG16 容器并校验核心表 | cron，每月 1 日 03:00 |
| `ds-net-repair.sh` | 检测 dockerd 漏编程的 per-network iptables 规则并重启 docker 自愈 | systemd timer，每 2 分钟 |
| `ds-net-repair.service` / `.timer` | 上一条的 systemd 单元 | — |
| `ds-smoke.sh` | 变更后验收（升级/重启/改配置后必跑，14 项检查） | 人工执行 |
| `ds-win-watch.ps1` | Windows 侧兜底看门狗，覆盖 WSL 整机不可用的场景 | 计划任务，每 5 分钟 |
| `install.sh` | 安装到 `$DS_BIN_DIR`，可选注册 cron / systemd | 人工执行 |
| `ds-ops-env.sh` | 公共配置加载器：读 `~/.config/dialog-survey-ops.env`，只填充未被环境里显式设置的变量 | 被其他脚本 source |
| `ops.env.example` | 全部 `DS_*` 变量与告警接收人的样例配置（不含凭据） | 复制后编辑 |

设计要点与故障复盘见 [docs/ops-watchdog-alerting.md](../../docs/ops-watchdog-alerting.md)。
