# 质量门禁全貌审计（2026-10-23）

目标：让仓库真正满足**所有**质量门禁，而不只是让它们显示绿色。

这份文档记录的不是「门禁通过了吗」，而是「每个门禁到底检查了什么、有没有在检查」。上一轮发现的关键问题是：**多个门禁长期显示 PASS，实际从未扫描过**。原因都是同一个——它们只扫描「本次提交改动的文件」，而问题恰恰躺在没人再动过的地方。

---

## 一、结论速览

| 门禁 | 状态 | 实际做了什么 |
|------|------|-------------|
| Gate 0 提交规范 | ✅ PASS | VERSION + CHANGELOG 校验 |
| Gate 1 静态分析 | ✅ PASS | biome 268 文件 0 error **0 warning**（本轮清零）、tsc 0 error |
| Gate 2 重复率 | ✅ PASS | 0.22% 行 / 0.15% token，阈值 1% |
| Gate 3 复杂度 | ✅ PASS | CCN 阈值 10，**无函数超标**；基线 633 条 |
| Gate 4 原则检查 | ✅ PASS | exit 0，**0 个 ERROR**；308 条全部为 warning/info |
| Gate 5 测试+覆盖率 | ✅ PASS | 162 文件 / 1897 测试全通过；覆盖率 93.21/81.71/95.95/93.69（阈值 80/80/70/80） |
| Gate 6 架构 | ✅ PASS | `diff --fail-on high` exit 0；37 项改进，**无新增 HIGH** |
| Gate 7 IaC | ✅ PASS | checkov 324 通过 / 0 失败 |
| Gate 8 密钥 | 🔴 **发现 3 组真实凭据** | 见下文——这是本轮最重要的发现 |
| Gate 9 构建完整性 | ✅ PASS | `npm run build` 成功 |
| Gate 10 SAST | ✅ PASS | semgrep 全仓 1 条 WARNING，已确认误报 |
| Gate 11 Sprint Flow | ✅ PASS | — |
| Gate 12 文件卫生 | ⚠️ 1 项 | `admin-templates.ts` 1019 行（issue #205） |
| Gate M 变异测试 | ✅ PASS | 12 个文件全部 ≥60%，未下调阈值、未排除 |
| Gate MD/ML/MW/MS/MP | 结构性 SKIP | 见下文说明 |
| Gate UI | 结构性 SKIP | 本次无 UI 改动 |

---

## 二、最重要的问题：Gate 8 从未扫描过历史

### 发现

对全部 398 个提交跑 `gitleaks git`，发现 **3 组真实生产凭据**：

1. **钉钉应用凭据**（`CLIENT_ID` / `CLIENT_SECRET` / `AGENT_ID`），出现在 3 个规划文档里（`.omo/`、`.sisyphus/`、`.speckit/`）。**已核实：与本机 `.env` 中的值完全一致，即当前线上正在使用的凭据。** 持有者可冒充本机器人向企业成员发消息、读取 Stream 回复。
2. **DashScope API Key**（`sk-sp-…`），`benchmark_llm.py`，2026-03-31 首次提交引入。
3. **火山引擎 Ark API Key**（UUID 格式），同一文件。

### 为什么门禁没拦住

三层原因，每一层单独看都"合理"：

- `gitleaks/gitleaks-action` 默认只扫 **PR 的 diff**。凭据在首个提交就进了历史，之后 diff 里再没出现过，所以每次都报 PASS。
- xp-gate 的 Gate 8 同样只看本次变更的文件。
- 没有任何环节跑过全历史扫描。

这三个文件早已从工作区删除——**但删除不解决任何问题**，任何人 clone 之后都能检出历史 blob。

### 必须人工处理（Issue #211）

按优先级：

1. **立即在钉钉开放平台重置 AppSecret**（这是当前在线的生产机器人）
2. 轮换 DashScope 和火山引擎密钥
3. 检查暴露期（约 7 个月）内的账单和调用日志
4. 历史重写不现实（398 提交 + 已推送 + 可能已 fork）——**轮换是唯一有效手段**

### 已完成的自动化防护

- `scripts/scan-git-history-secrets.mjs` — 全历史扫描，退出码契约：0 干净 / 1 发现 / **2 工具缺失**。第三条是关键：扫描器没装却返回绿色，比不做检查更糟，因为它给出了错误答案。
- `.gitleaks.toml` — 占位符 allowlist（`your_api_key`、`<YOUR_*>`、`xxx`、`test-secret-*`），排除 `.stryker-tmp/`（Stryker 把整个工作区复制进沙箱，2 条真实命中因此膨胀成 19 条重复）。
- CI `security-scan` 增加全历史扫描步骤，job 超时从 5 分钟提到 12 分钟。**暂时保持 `continue-on-error`**：发现的问题在不可变历史里，现在改为阻断会永久标红，反而训练所有人忽略这一步。**轮换完成后应改回阻断。**
- `tests/scan-git-history-secrets.test.ts` — 4 个测试钉住退出码契约，含「工具缺失」路径。

---

## 三、Gate 6 的真实判定方式

上一轮曾被 143 条 archlint findings 误导。实际情况：

- hook 用的是 `archlint diff .architecture-baseline.json --fail-on high`，**棘轮模式**——只拦截新增的 HIGH，基线内的已知问题不阻断。
- 实测：**exit 0**，37 项改进，无新增 HIGH。
- 3 条新增 MEDIUM（`loadInviteeInfo` 认知复杂度 16、`prune-runtime-deps.mjs:main` 34/21）由本轮改动引入。虽然不阻断，但棘轮的意义就是不让新债停在那里，**已全部重构掉**。

### DeadSymbol 的两种性质（重要区分）

不能一律当误报处理。逐个 grep 调用点后：

| 符号 | 判定 |
|------|------|
| `InterviewPlanService.{addMember,removeMember,sendReminder}` | **误报** — `src/api/plans.ts:229/252/268` 有直接调用 |
| `InterviewPlanSendService.{sendInvitations,resendToInterview,pausePlan,resumePlan,cancelPlan}` | **误报** — 经 `registerLifecyclePost` 回调间接调用，archlint 不解析 |
| `PromptService.getTemplate` | **真实死代码** — 仅 `tests/smart-response.test.ts` 调用，生产代码零调用 |
| `DingTalkClient.generateSignature` | **真实死代码** — 生产/测试都无调用；`middleware.ts` 里有个同名独立函数，遮蔽了它 |
| `scripts/prune-runtime-deps.mjs` | **结构性** — CLI 入口本就没有 import 者 |

已在 AGENTS.md 记录：处理 DeadSymbol 前必须先 grep，不可删除误报项、不可加 `# noqa` 式抑制。

---

## 四、Gate 4 的真实状况

重跑全部 `src/**/*.ts`（排除 `src/generated`）：

- **exit 0**
- 308 条 findings = 133 warning + 175 info，**0 个 ERROR**

即：没有任何阻断性问题。集中于 `clean-code.long-function`（最大是 `admin-templates.ts:336`）和 `clean-code.magic-numbers`。前者与 Gate 12 / issue #205 是同一个根因。

---

## 五、Gate 10 首次真正跑通

过去它一直显示 SKIP（`no_code_files_changed`），从未对本仓库源码扫过。本次直接跑 semgrep：

- 全仓 **1 条 WARNING**：`src/api/templates.ts:91`，`javascript.express.security.audit.xss.direct-response-write.direct-response-write`
- **已确认误报**：该规则针对 Express 风格直接写 HTML 响应；这里是 Fastify handler，`formatTemplateResponse` 返回纯对象，由 Fastify 按 `application/json` 序列化，不存在 HTML 拼接路径。

---

## 六、本轮顺带修掉的既有问题

### 1. `pr.yml` 缺少 `permissions` 声明

改动 `pr.yml` 后 checkov 报 `CKV2_GHA_1`（top-level permissions write-all）。这是**既有问题**——该文件从未在提交中变更过，所以 Gate 7 从未扫到它。

已补最小权限：`contents: read` / `pull-requests: read` / `security-events: write`（后者供 gitleaks 上传 SARIF）。现在 checkov 324 通过 / 0 失败。

### 2. 两处 `noExplicitAny`

`tests/interview-dialog-determinism.test.ts` 里的 `as any` 改用导出的 `StructuredResponse` 类型。biome 从「2 warnings 常驻」变为**完全干净**——常驻 warning 会被所有人学会忽略，那等于没有。

---

## 七、关于「偶发失败」

一次 `vitest run --coverage` 出现 7 个失败，随后连跑两次（含全量）均 1897 全通过。

判断：**资源竞争，非代码缺陷**。当时后台同时在跑 8 worker 的 Stryker 变异测试，覆盖率插桩又额外增负。配置已有 `retry: 1` / `testTimeout: 30000`。这是本机并发场景，CI 单 job 不会复现。**未为此修改任何断言**——按项目约定，不准用放宽断言来消除告警。

---

## 八、结构性 SKIP 说明

这些不是问题，是 xp-gate 自身机制：

- **Gate MP**（镜像一致性）：检查 xp-gate 自己的 npm 包镜像，与本仓库无关
- **Gate M Python**：无 Python 源文件变更
- **Gate MD / ML**（mock 密度/分层）：本次推送无测试文件
- **Gate MW**（代码走查）：master 分支推送时跳过（PR 流程才需要）
- **Gate UI**：无 UI 改动

---

## 九、剩余未完成项

| 项 | 说明 |
|----|------|
| **Issue #211 密钥轮换** | 🔴 只能人工处理，优先级最高 |
| **Issue #205** `admin-templates.ts` 拆分 | 1019 行 / 887 mutants，是 Gate 4 long-function、Gate 6 部分 finding、Gate 12 的共同根因 |
| **Issue #203b** LLM 对话质量 | 已明确推迟到长期 |
| CI 全历史扫描改阻断 | 需等 #211 轮换完成后 |

---

## 十、可复现命令

```bash
node scripts/scan-git-history-secrets.mjs --verbose   # 全历史密钥扫描
npx @archlinter/cli diff .architecture-baseline.json --fail-on high   # Gate 6 真实判定
semgrep scan --config=auto src/                        # Gate 10
npx vitest run --coverage                              # Gate 5
npm run complexity && npm run duplicates               # Gate 3 / Gate 2
npx biome check . && npx tsc --noEmit                  # Gate 1
checkov -f .github/workflows/pr.yml --framework github_actions --compact
```
