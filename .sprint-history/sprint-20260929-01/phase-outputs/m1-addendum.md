# M1 addendum — ubuntu-latest 复跑分析 + #11 修复（任务 #15 回填）

- **触发**: 推送 `eb707f9` 命中 `.github/workflows/spike-prisma7.yml` paths 过滤 → run **36600066391**（event=push, headSha=eb707f9, linux/x64, node v20.19.6, 2026-09-29T16:45:40Z）
- **工件**: `prisma7-pglite-spike-results` → `stage0-spike-results-ubuntu.json`（已下载核对）
- **结论**: 11 PASS / 2 FAIL / 1 INFO —— FAIL = #6b（预期，跨平台同现象）+ #11（**载体脚本 argv bug，非产品缺陷**）

## 逐项对照（ubuntu vs Windows run3）

| # | Windows（stage0 报告） | ubuntu（此 run） | 差异解读 |
|---|------------------------|------------------|----------|
| 0,1,2,3,3b,4,5,6,8,9,10 | PASS | PASS | 语义双平台一致 |
| 6b | FAIL `winnerCounts=[1,1]` | FAIL `winnerCounts=[1,1]; finalVersion=3` | 串行化双平台同现象 → PGlite 架构特性确证（非缺陷） |
| 7 | INFO(win32) | INFO(linux) | 双平台证据闭合（本 run 即第二平台） |
| 12 | FAIL（warm p95 2440ms） | **PASS**（cold 2679ms / warm p95 1371ms / 单实例 139.2MB） | ubuntu 无 Windows 杀软/文件系统开销；模板快路径仍为两平台共同落定手段 |
| 12b | PASS（692ms） | PASS（303ms） | 两平台均达标，ubuntu 余量更大 |
| 11 | PASS | **FAIL（dbPush=1 / skipEnvExitCode=1）** | argv bug（见下） |

## #11 FAIL 根因与修复

- **现象**: ubuntu 上 `defaultExitCode=1`、`skipEnvExitCode=1`；`stderrTail` 为 prisma 帮助文本（`$ prisma db push` 等命令列表）→ 典型「未知命令」路径。
- **根因**: 载体脚本 `run('npx', ['--yes', 'prisma@7.10.0', 'db push', ...])` 把 `'db push'` 作为**单个 argv token** 传入。Windows 下 `run()` 用 `shell: true`（shell 重新分词，侥幸工作）；Linux 下 `shell: false` 直接 exec —— npx 收到字面命令 `db push`（含空格，非法命令）→ 打印 help → exit 1。**纯载体脚本 bug**，产品代码/依赖无涉。
- **修复**（随 Stage B 变更集提交）: 3 处调用点拆分为 `'db', 'push'` 两个 token + 注释说明（`c11_freshInstall` 的 help 探针与 baseArgs 两处、`run()` 前探针一处）。
- **修复后本地证据**: Windows 复跑 PASS —— `spike11-windows-postfix.json`: `defaultExitCode=0` / `skipEnvExitCode=0` / `workingForm=type-only-import` / `shippedConfigLoads=true`（且同时收窄为 `EXPECTED_FAILS={'6b'}` 语义，见下）。DD-009 (c) 结论不受影响（形态 B type-only-import 在两平台 shipped 包中均加载成功）。
- **WSL 探针 bdwuif9tp**: 非交互 shell 无 node/npx（空输出，单参/拆参变体均 exit=1）→ 无判别力；由 ubuntu 工件直接定位根因取代之。

## Spike workflow exit 语义修复（同批）

- **旧语义**: 任一 FAIL → 脚本 exit 1 → job 红 —— 当 #6b（M1 已接受的预期失败）存在时，ubuntu job 将**永远红**。
- **新语义**: `EXPECTED_FAILS={'6b'}`；verdict = `PASS`（全过）/ `PASS#`（仅预期失败）/ `FAIL`（存在非预期失败）；`PASS#` → exit 0，`FAIL` → exit 1。
- **修复后 ubuntu 预期形态**: `verdict=PASS#`（仅 #6b），job exit 0。

## 回填状态

| 项 | 状态 |
|---|---|
| eb707f9 ubuntu 复跑分析 | ✅ 本 addendum（run 36600066391 工件） |
| #11 根因 + 修复 | ✅ 修复在 Stage B 变更集；本地 Windows 复跑 PASS |
| **修复后 ubuntu 复跑** | ⏳ Stage B 推送将自动触发（paths 含 `tools/spike/**`），结果回填此表 |
