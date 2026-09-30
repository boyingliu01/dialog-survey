# M3 gate evidence — Stage B（PGlite 替换）

- **状态**: working tree（未提交）；本文件为 M3 门禁的**本机证据**；CI 半份待推送后回填
- **门禁**: 设计 §「M3 gate = 无 PG 全量绿（本机 + CI）+ 内存判据」

## 1. 无 PG 全量绿（本机）

| Field | Value |
|---|---|
| 命令 | `env -u DATABASE_URL -u TEST_DATABASE_URL npx vitest run` |
| 结果 | **116/116 files, 1261 passed \| 1 skipped, 0 failed, 74.16s** |
| e2e | 11/11 文件通过（78 tests；Playwright chromium，real PGlite） |
| PG 服务 | 未运行、env 已显式 unset（任何残留 PG 读路径都会红） |
| 日志 | `stageB-full-suite-nopg.log` |
| 对照（Stage A @eb707f9, real PG） | 116/116, 1261 passed \| 1 skipped —— 数量一致，零回归 |

## 2. 内存判据（T-M4 / T-m3，§3.6 / §4.1 #12 最终确认）

- 探针: `.sprint-state/phase-outputs/pglite-memory-probe.ts`（tsx 运行，真实 helper 生命周期: createTestPglite → PrismaClient(adapter) → SELECT 1 → $disconnect → close）
- 日志: `stageB-memory-probe.log`

| 判据 | 结果 | 解读 |
|---|---|---|
| **T-M4 单进程最大实例数** | 16 个同时存活 → RSS 3573.6MB（安全阀 3.5GB）；单实例边际 ≈ **+210MB** | 真实测试文件实测并存需求 ≤2（共享单例 + 单测实例；analysis-api 跨实例已由文件级单例承接）→ **≥5× 余量** |
| **T-m3 单 worker 连续 30 文件生命周期 RSS 曲线** | 583MB → 598.8MB，**漂移仅 +15.8MB / 29 cycles（≈0.5MB/cycle，无泄漏）**；单生命周期 ≈225ms | 单 worker 稳态 ≈0.6GB |
| maxWorkers 决断 | **维持 `min(4, os.cpus())`** | 4 worker × ~0.6GB + vitest 主进程 ≈ 3GB 以内；ubuntu-latest 16GB / 本机余量充足；74s 全量实测即 4 worker 下的真实吞吐 |

## 3. 稳定性观察

- **R1-min15（retry 观察）**: 全量运行 **0 次 vitest 级 retry**（日志中 `retry` 仅出现于产品自身重试逻辑的测试与 `tests/retry.test.ts`）。无需对 PGlite 用例单独降 retry。
- 无 unhandled error；退出码 0。

## 4. 合同测试补充

- 新增 `tests/pglite-template.test.ts`（3 tests，2.7s，biome 干净）:
  1. DDL 记忆化（同调用返回同串）；
  2. **DDL 回放回退路径**：`new PGlite()` + `applyTestSchema()` → `information_schema` 中 schema 可查询（AC-PRISMA7-002-01「PGlite 内存库回放 DDL 成功」的直接证据，此前仅由模板构建隐式覆盖）；
  3. 模板快路径与 DDL 回放路径落出**同一 public 表集合**（两路径一致性契约）。

## 5. CI 半份（待推送）

- [ ] pr.yml（workflow_dispatch）：7 job 全绿且**全部无 postgres service / 无 DB env**（unit、integration、coverage、e2e 为关键）
- [ ] spike-prisma7.yml 自动复跑：`#11` 修复后 ubuntu 预期 `PASS#`（仅 #6b），job exit 0
- [ ] 推送后回填 run ID 与逐 job 结论
