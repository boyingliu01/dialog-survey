# TODO — 迁移到 WSL + DSH 开发环境前的交接清单

> 生成时间：2026-11-11
> 仓库状态：`master` @ `c888ceb` 之后的发布提交，VERSION = **1.19.3**，与 `origin/master` 同步，工作树干净。
> 用途：在**新机器**（WSL + DSH）上继续开发前，先消化下面这些未完成事项。每条都写清了"为什么还没做完"和"验收标准"，避免新会话重新踩一遍。

---

## 0. 先读这一段：当前任务到底进行到哪了

原始任务（笔记本上完成的部分）：

1. ✅ 分析 6 个受访者体验相关 issue（#228–#233）
2. ✅ 全部修复、走完质量门禁、发布一致版本
3. ✅ 关闭全部 6 个 issue
4. ✅ 修复 CI 门禁工具缺失（Smoke Test 长期红灯 → 全 12 job 绿）
5. ⚠️ **生产模板 DB 更新 —— 部分完成**（台式机已跑，暴露 3 个新问题，见下）

**第 5 项是唯一未闭环的主线**。台式机 2026-11-11 实测升级到 v1.19.3 后，`Template` 表 6 行中 5 行成功迁移，1 行（E2E 测试模板）无法处理，并额外暴露了 2 个部署缺陷。

---

## 1. 🔴 P0 — #234 升级/重启会向真实受访者重发消息（**已造成生产影响**）

**现状**：已发生。升级到 v1.19.3 时，2 名真实受访者（userId 63、1203）收到了重复的末条消息。

**根因**（已定位，`src/server.ts:638`）：

```ts
async function resendUnsentMessages(prisma: PrismaClient): Promise<void> {
  const sender = new DingTalkMessageSender();
  const stalledInterviews = await fetchStalledInterviews(prisma);
  for (const iv of stalledInterviews) {
    resendLastAssistantMessage(sender, iv);   // 无条件重发
  }
}
```

对 `status ∈ {ACTIVE, PROCESSING}` 的访谈**无条件**重发末条 assistant 消息，既不检查 `Message.messageId` 是否为空，也不检查投递状态。默认开启，只能靠 `DISABLE_STARTUP_RESEND=1` 关闭。

**待办**：

- [ ] **立即运维处置**：在台式机 `.env` 加 `DISABLE_STARTUP_RESEND=1`，重启 app。这一步不需要改代码，今天就能做。
- [ ] 修复逻辑：`fetchStalledInterviews` 应只返回"确实未投递"的访谈 —— 至少要求末条 `Message.messageId IS NULL` **且** `Interview.sendStatus ≠ SENT`。
- [ ] 补测试：现有测试没覆盖"`messageId` 已存在却被重发"这一分支。请写一个失败用例后再改。
- [ ] 决定默认值：启动重发是生产副作用，"默认关闭、显式开启"比反过来安全。改默认值需要在 AGENTS.md 记录理由。

**验收**：`docker compose up -d` 后日志**不出现** `Resending unsent message on startup`，除非真的存在未投递消息。

> ⚠️ 注意：#171 当初把 `DISABLE_STARTUP_RESEND` 设计成"默认开启重发"，是为了解决重发失效的 bug。改默认值前先读 AGENTS.md 的 "Credential-free startup (#171)" 那一条，别把已修的问题改回去。

---

## 2. 🟠 P1 — #235 sync 脚本无法处理 E2E 测试模板，升级流程与文档冲突

**现状**：`--dry-run` 必然 exit 1。5 个业务模板成功，E2E 自动测试模板（`访谈机器人公司应用部署验收访谈（E2E 自动测试） 20261021094313`，prompt 长度 598）没有 `9.` 编号行，脚本拒绝猜插入位置。

**脚本行为本身是对的**（宁可不动也不编造提示词），问题在于**升级文档的验收条件和现实矛盾**：
- 文档要求"确认没有 `?` / `!` 之后再 apply"
- 文档又要求"每行 `has_strategy_10 = t`"
- 任何跑过 E2E 的部署都有一张测试模板，两个条件无法同时满足

**待办**（三选一，建议按 1 → 2 顺序）：

- [ ] **修 E2E 模板生成逻辑**：让测试模板的提示词包含带编号的策略列表（至少 `9.` 行）。这是根治，且能让测试模板与真实模板结构一致。
- [ ] **脚本增加显式跳过**：例如 `--skip=<name 子串>`，让操作者明确声明"这张不需要迁移"，而不是靠忽略退出码。**不要**改成"无法放置就静默跳过"——那是把已知问题变成静默失败。
- [ ] **文档区分**：把 E2E 模板的 `?` 标注为预期情况，并给出"删除该测试模板"或"接受它留在旧版"的明确指引。

**验收**：跑过 E2E 的部署上，`--dry-run` 的退出码能明确区分"全部完成"和"有需人工项"，且文档给出的步骤能真正走到 exit 0。

---

## 3. 🟡 P1 — #236 非 git 安装（源码 tarball）时字体无路可走

**现状**：`assets/fonts/NotoSansCJKsc-Regular.otf` 是 Git LFS 对象（16MB）。用 GitHub codeload 下载源码 tarball 时拿到的是 **133 字节 LFS 指针**，`docker compose build app` 会因 `verify-font-asset.mjs` 校验失败而中止。

错误信息只提示 `git lfs install && git lfs pull` —— 对没有 git 的部署毫无帮助。`v1.19.3` 的 GitHub Release 也**没有任何附件**。

**你已验证的绕过方案**：先从旧部署保留那份 16MB 字体。但这不可持续（新机器没有旧部署时走不通）。

**待办**：

- [ ] **首选：把字体作为 Release 附件自动上传**。`scripts/release.sh` 在创建 Release 后追加 `NotoSansCJKsc-Regular.otf` 附件，部署侧 `gh release download` 即可拿到。这正好满足"借 GitHub 传递、不手工搬文件"的目标。
- [ ] 改进 `verify-font-asset.mjs` 的提示：检测到 LFS 指针时，除 `git lfs pull` 外，同时给出下载 URL / `gh release download` 命令。
- [ ] 文档（见第 4 项）里写清非 git 安装的完整路径。

**验收**：在一台没有旧部署、没有 `git lfs` 的干净机器上，仅靠"下载 tarball + 从 Release 取字体"就能 `docker compose build` 成功。

> ⚠️ 不要把字体改成 git 普通文件塞进仓库——16MB 二进制会永久留在每次 clone 里，这正是当初转 LFS 的原因。

---

## 4. 🟠 P1 — 重写升级指南，当前版本与真实部署方式不符

**现状**：`docs/upgrade-to-1.19.2.md` 是按"台式机是 git 仓库"写的，但实际部署环境**不是 git 仓库**，且形态是"只有 compose + .env"。

我之前给的步骤有偏差已被你指出：
- `git pull` — 部署目录没有 `.git`
- `git lfs pull` — 没有 LFS，字体拿不到（见第 3 项）

**待办**：

- [ ] 先查清台式机实际形态（`docker compose images`、compose 里是 `image:` 还是 `build:`、`/app/VERSION` 是多少），再动笔。**不要把没验证的步骤写进文档**。
- [ ] 按真实形态重写，覆盖三种情况：
  - git clone 部署
  - 源码 tarball 覆盖（非 git）
  - 仅 `docker compose pull`（若走 registry 镜像）
- [ ] 文件改名为 `docs/upgrade-guide.md`（去掉版本号，做成长期文档），或在 `DEPLOY.md` 里加一节。带版本号的文件名会随每次发版失效。
- [ ] **加进升级必做项**：升级前设置 `DISABLE_STARTUP_RESEND=1`（见第 1 项），升级完成、确认无重发后再决定是否移除此变量。

**验收**：一个没参与过本项目的人，只按文档就能在一台干净机器上完成升级，且不会给真实受访者发消息。

---

## 5. ⚪ P2 — 环境迁移本身（本次任务的直接目标）

- [ ] 新机器装 WSL2 + Node 22 + DSH
- [ ] `git clone` 到 **WSL 的 Linux 文件系统**（`~/` 下），**不要放 `/mnt/*`**
  - 原因见 AGENTS.md：`/mnt/d` 是两个系统看同一目录，只有一个 `node_modules`，会缺 `@biomejs/cli-linux-x64` 导致 Gate 1 报 `BLOCKED - Biome check failed`
- [ ] 重装 xp-gate（用 `xp-gate-reinstall` skill），装完后 `node scripts/verify-xp-gate-patches.cjs` 必须通过
- [ ] 装门禁工具：`lizard==1.25.1`、`semgrep==1.183.0`、`bc-detect-secrets==1.5.52`
  - ⚠️ `detect-secrets-hook` 由 **`bc-detect-secrets`** 提供，不是 PyPI 的 `detect-secrets`（后者停在 1.5.0，永远匹配不上 1.5.52）
- [ ] `npx prisma generate`，然后 `npx vitest run` 全量通过（基线：194 文件 / 2467 通过 / 13 跳过 / 0 失败）
- [ ] 确认 `git commit` 走的是 **Git Bash 或 Linux bash**，不是 WSL 启动器劫持（`bash -n ~/.config/xp-gate/hooks/pre-commit` 应无报错）

---

## 6. ⚪ P2 — 收尾事项（有明确结论，只是没动手）

- [ ] **`.gitignore` 与事实矛盾**：第 156 行忽略 `docs/reports/loadtest-results-*.json`，但目录里 5 个这类文件**全部被跟踪**（都是当初 `git add -f` 加的）。要么改规则让两者一致，要么 `git rm --cached`。目前状态是"规则说不要，历史说都要"。这是产品决策，不是 bug。
- [ ] **19 条历史访谈缺 `startedAt`/`completedAt`**：#233 修复前完成的访谈这两个字段为空。`completionInstant()` 已用 `updatedAt` 兜底，统计不断裂，所以是**可选**回填。要补的话写一个一次性迁移脚本。

---

## 7. 不要重做的事情（已经验证过的结论，避免新会话走回头路）

| 事项 | 结论 |
|---|---|
| 精简 git 历史（filter-repo） | **不做**。`.git` 54M（gc 后曾降到 36M，随发版又增长），重写历史会作废全部 55 个 tag，代价远大于收益 |
| `loadtest-baseline` 分支 | 已删除。它从 2026-03-12 的 Python 时代分叉（361 vs 508 提交），唯一缺的文件已捞回 master（`641fac5`） |
| 把 `test`/`chore` 加进 changelog 预设 | **不做**。会让每个测试提交进公开 changelog；infra-only 发版就手写一节 |
| 手写 `.mutation-baseline.json` | **禁止**。baseline 只能抬高阈值，伪造的会让门禁更严 |
| 放大镜式降 CCN | 已 0 个生产函数超 5。继续压是负收益 |
| 门禁工具缺失时改为 SKIP | **禁止**。这是项目既定策略：缺工具必须失败，强制安装 |
| 删 `system32\bash.exe` 修 PATH | **禁止**，`wsl` 本体就在那里 |
| 字体改成普通 git 文件 | **禁止**，16MB 二进制会永久拖慢每次 clone |

---

## 8. 关键背景（新会话必读）

**版本与发布**
- 当前 **1.19.3**；`VERSION` / `package.json` / `AGENTS.md` / tag / npm / GitHub Release 六处必须一致
- 发版：`bash scripts/release.sh`（dry run）→ `--execute <版本>`（真发）
- **发版前必看 dry run 的 changelog 行**：只有标题没 bullet 就是空的，要手写一节
- npm 发布走 `.github/workflows/publish.yml`（OIDC Trusted Publishing），**tag 推送后自动触发**
- `npm view` 有客户端缓存，确认发布要直接查 `https://registry.npmjs.org/dialog-survey`

**测试**
- 全量 `npx vitest run`，用 PGlite（WASM），**不需要 PostgreSQL**
- 集成测试文件名必须是 `*.integration.test.ts`（点号），连字符会被错误的 CI job 选中

**提交**
- `git commit` 会跑完整门禁，**耗时 4–7 分钟**，超过 120s bash 超时 → 必须后台跑
- 遇到 `detect-secrets-hook` 拦截 `.secrets.baseline` 未暂存 → `git add .secrets.baseline`
- `git commit` 失败 `index.lock` → 等 15 秒自行消失

**本机特有陷阱**
- `python3` 不可靠（exit 49 无输出），用 `python` 或 `python -m pip`
- Node 把 `/tmp` 解析成 `D:\tmp` → 用工作目录内的临时文件
- XP-Gate 的 esbuild 子进程偶发 `spawn EPERM`，是环境问题不是代码问题，重试或用 `npx vitest` 直接跑

---

## 9. 建议的接手顺序

```
1. 台式机 .env 加 DISABLE_STARTUP_RESEND=1        ← 今天，止血
2. 新机器环境搭好，跑通全量测试（第 5 项）
3. 修 #234 的代码逻辑 + 补测试（第 1 项）
4. 修 #235（第 2 项）—— 让升级流程能真正 exit 0
5. 做 #236 + 重写升级文档（第 3、4 项）
6. 重新在一台干净机器上验证整个升级流程
7. 发一个包含以上修复的新版本
```

第 1 步和第 2 步可以并行，第 3–5 步之间有依赖（都涉及升级流程），建议一次做完再发版。
