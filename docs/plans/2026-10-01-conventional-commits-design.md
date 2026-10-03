# #153 设计文档 v8：Conventional Commits 校验 + 自动 CHANGELOG + 自动版本发布

- **Issue**: #153 · **Sprint**: sprint-20261001-30 · `sprint/2026-10-01-01`
- **版本沿革**: v1 方案经 spike 证伪 → v2 重写并吸收 R1 缺口 → v3 钉死 R1 Round 2 剩余缺口 → **v4–v8 由 R2 五轮评测逐轮修正（含 §0.4 的关键缺陷发现）**

---

## 0. 修正历史（全部由实测驱动）

| 版本 | 关键修正 | 触发 |
|------|----------|------|
| v1 → v2 | 原方案「用 `<repo>/githooks/commit-msg` 作为零冲突挂载点」**被 spike 证伪**，方案作废重写 | R1 Expert C F-2 提出的可验证假设 |
| v2 → v3 | 钉死 CI 环境假设、`after:bump` 版本来源、卸载边界情形、tag 前缀字面量 | R1 Round 2 的 T-1..T-10 |

### 0.1 spike 证据（回答 T-10：附命令与输出）

```bash
$ git config --get core.hooksPath
C:/Users/think/.config/xp-gate/hooks

# ① 全局 hooksPath 生效时，创建 <repo>/githooks/commit-msg（内容打印 SPIKE_COMMIT_MSG_FIRED）
#    执行 git commit  →  SPIKE_COMMIT_MSG_FIRED 从未打印 ⇒ 该 hook 被完全忽略，提交正常创建

# ② 临时 git config core.hooksPath githooks 后重试
#    → SPIKE_COMMIT_MSG_FIRED with arg: .../COMMIT_EDITMSG ⇒ 触发

# ③ 证据文件枚举：~/.config/xp-gate/hooks/ 下无 commit-msg
# ④ xp-gate install.sh:15,28 项目模式装 hook 到 .git/hooks/（被全局 hooksPath 遮蔽）
# ⑤ git tag -l → 空
```

**结论**：git 只从**单一** `core.hooksPath` 目录取 hook；`githooks/` 仅用于解析
adapter 文件（`adapter-common.sh` Tier-2），**不转发新 hook 类型**。

### 0.2 `release-it@21.1.0` 契约核实（回答 N-1/N-5/N-6/N-11）

来源：包内 `types/hooks.d.ts`、`lib/shell.js`、`lib/plugin/GitBase.js` + 独立探针仓库实测。

| 事实 | 证据 | 回应 |
|------|------|------|
| `after:version:bump` 是**合法 hook 名** | `types/hooks.d.ts:17`：`['after:version:bump']?: string \| string[];` | N-1 |
| hook 支持 **字符串或字符串数组** | 同上（`string \| string[]`） | N-1 |
| `${version}` **会被插值** | `lib/shell.js:19` `format(command, context)`；实测插值出 `1.13.2` | N-1 |
| **dry-run 时 hook 被 no-op** | `lib/shell.js:31-34`：`if (isDryRun && isWrite) { log; return noop }`；`index.js:37` 以 `{external:true}` 调用，未传 `write:false` ⇒ `isWrite` 为 true | N-5 |
| `tagName` 默认**按最新 tag 推断** `v` 前缀 | `lib/plugin/GitBase.js:20` | — |
| 最新 tag 查询用 `for-each-ref` / `git describe --tags`，**annotated tag 正常匹配** | `GitBase.js:118,125` | N-6 |
| 默认 `npm.publish: true`（**必须显式关闭**）、`github.release: false` | `config/release-it.json` | — |

⚠️ **关键推论 1**：因当前**零 tag**，`tagName` 自动推断退化为**无 `v` 前缀**。
故必须**显式**配置 `git.tagName`，否则首跑产出 `1.10.1` 而非 `v1.10.1`。

⚠️ **关键推论 2（实测，影响 AC-5 的可验证性）**：dry-run **不执行** hook，
因此 **AC-5（CHANGELOG 内容）无法用 dry-run 验证**——dry-run 下 CHANGELOG 根本不会生成。
实测：`npx release-it --dry-run --ci` → `package.json` 哈希不变、`CHANGELOG.md` 未创建、工作树干净。

### 0.3 hook 命令形式实测（回答 N-1 的"具体写法"）

独立探针仓库（release-it@21.1.0 + @release-it/conventional-changelog@12.0.2）实测三种写法：

| 写法 | 结果 |
|------|------|
| `"hooks": { "after:version:bump": "node a.cjs ${version} && node b.cjs" }` | ❌ **两个都不执行**（`&&` 链式在 hook 中失效） |
| `"hooks": { "after:version:bump": "node a.cjs ${version}" }` | ✅ 单个命令正常执行 |
| `"hooks": { "after:bump": ["node a.cjs ${version}", "node b.cjs"] }` | ✅ **两个都执行**（探针日志 `HOOK_LOG.txt` 同时记录到两条） |

**结论：必须使用数组形式**，禁止 `&&` 链式。这是本项目 `after:bump` 的强制写法（键名选择见 §0.4）。
**机制说明（措辞精确化，回答 R2-B-F13）**：`&&` 失败的**观测事实**是明确的
（探针实测：两个命令都不执行），但**根因未经独立证明**——未能在 `lib/shell.js`
中定位到"把它当字面参数传递"的确切代码路径。

因此采用**更强的工程约束**，不依赖机制解释的正确性：

> **hook 命令中禁止使用任何 shell 元字符**（`&&`、`;`、`|`、`>`、`<`、`$()`、反引号）。
> 需要多个动作时**一律使用数组**，每个元素是**单一命令**。

该约束比"搞清楚为什么 `&&` 失效"更稳健：即使将来 release-it 改变执行方式，
只要坚持"数组 + 单命令"，就不会踩到任何 shell 解析差异。

实测全链路结果（探针仓库）：

```
$ npx release-it --ci
🚀 Let's release probe (1.13.2...1.13.3)
- node scripts/write-version.cjs 1.13.3
√ node scripts/write-version.cjs 1.13.3

$ cat HOOK_LOG.txt
write-version ran at 2026-10-01T15:37:25.229Z
sync-version ran

$ cat VERSION          → 1.13.3
$ package.json version → 1.13.3      ⇒ AC-7 成立
```

---

### 0.4 ⛔ 关键缺陷：`after:version:bump` 在安装 changelog 插件后**静默失效**（R2 R4 实测发现）

**这是本次评审最有价值的发现，若不修正将导致 `VERSION` 永久陈旧。**

R2 Round 4 的 A-F1 / B-N-1 / C-F3 三位专家**独立指出**：§4.6 引用的探针输出
（`Release 1.13.4`）只含 `AGENTS.md, VERSION, package-lock.json, package.json`，
**没有 `CHANGELOG.md`**，而 §7.2 的 AC-7 却断言"四文件"——证据与断言不匹配。

**该质疑完全正确。** 深挖后发现的真相比"措辞不匹配"严重得多：

#### 实测对照（A/B 隔离）

| 配置 | `after:version:bump` 是否触发 | `VERSION` 是否进入发布提交 |
|------|------------------------------|---------------------------|
| **不含** `@release-it/conventional-changelog` | ✅ 触发 | ✅ 进入 |
| **含** `@release-it/conventional-changelog` | ❌ **静默不触发** | ❌ **不进入（永久陈旧）** |

关键命令与输出（含 changelog 插件、仅用 `after:version:bump`）：

```
$ npx release-it --ci
🚀 Let's release probe (1.15.1...1.16.0)
## [1.16.0](compare/v1.15.1...v1.16.0) (2026-10-02)
# 注意：没有 "node scripts/write-version.cjs" 的输出行

$ git show --name-only --pretty=format:'commit: %s' HEAD
commit: Release 1.16.0
CHANGELOG.md          ← 有
package-lock.json
package.json
# VERSION 与 AGENTS.md 缺失！

$ cat VERSION        → 1.15.1   （应为 1.16.0，陈旧）
$ package.json       → 1.16.0
```

#### 根因：**未能确证**（如实记录，回答 R2-B-R5-1）

⚠️ **重要修正**：本节初版给出的机制解释是**错误的**，R2 专家 B 正确地指出了这一点。
因此我如实记录，而不是保留一个听起来合理但已被代码证伪的解释。

**曾经（错误地）声称的机制**："两插件 namespace 都是 `version`；changelog 插件的
`bump()` 不返回 `true`，故 `willHookRun` 为假而抑制 hook。"

**该解释被其自身引用的代码证伪**：`lib/index.js:45` 是
`const willHookRun = (await plugin[name](...args)) !== false;`
——只有**严格返回 `false`** 才抑制。而实测 `ConventionalChangelog.bump()`
（`@release-it/conventional-changelog@12.0.2` `index.js:282-291`）**没有 return 语句**，
返回 `undefined` ⇒ `undefined !== false` 为**真** ⇒ 按该代码路径 hook **应当触发**。
因此原机制解释与所引代码**自相矛盾**。

**已核查但仍不足以定论的线索**：

| 线索 | 位置 | 为何仍不足 |
|------|------|-----------|
| `ConventionalChangelog.disablePlugin()` 返回 `version` | changelog `index.js:51-54` | 会**禁用内置 version 插件**，但如何影响 hook 派发未经追踪 |
| bump 循环前 `plugins = [...external, ...internal]`（第 53 行）；release 循环前反转为 `[...internal, ...external]`（第 126 行） | `lib/index.js` | 顺序变化确实存在，但按 `!== false` 语义仍推不出"静默不触发" |
| `runHook` 用 `hooks[name.join(":")]`，name 来自 `plugin.namespace` | `lib/index.js:31-32, 42-50` | 派发键构造方式明确，但各 plugin 实例 namespace 的运行时实际取值未打印验证 |

#### 因此：只承诺**可复现的经验规则**，不承诺机制

> **经验规则（A/B 隔离实测，可复现）**：存在 `@release-it/conventional-changelog` 时，
> `after:version:bump` 与 `before:version:bump` **都不触发**；只有 bare `after:bump` 可靠触发。
> 不含该插件时，`after:version:bump` 正常触发。
> **机制未确证，本设计不依赖机制解释。**

**A/B 证据（同一探针仓库，唯一差异是 changelog 插件）**：

```
# A：不含 changelog 插件，hooks 含 before/after:version:bump + after:bump
$ npx release-it --ci
- node scripts/write-version.cjs 1.16.1
√ node scripts/write-version.cjs 1.16.1
VERSION in commit: YES

# B：含 changelog 插件，同一组 hooks（另加 after:conventional-changelog:bump）
$ npx release-it --ci
# 无 write-version 输出
# TRACE.log 仅含：after:bump / before:release
# 即 before:version:bump 与 after:version:bump 均未触发
VERSION in commit: NO
```

**为何这仍足以支撑设计**：AC-7 断言的是**可观察结果**
（四文件进入发布提交 + 工作树干净），而非 hook 的触发机制。
选用 bare `after:bump` 是**基于实测的工程选择**，其正确性由 §4.6 的端到端实测保证。

**给实现者的明确指引（回答 R2-B-R5-1 的"升级后无可依赖模型"）**：
升级 `release-it` 或 `@release-it/conventional-changelog` 时，
**必须重跑 §4.6 的端到端断言**（四文件 + 干净树 + 三者一致）——
这是唯一可靠的回归保护，不要依赖对 hook 机制的推断。

#### 修正：改用 bare `after:bump`

```json
"hooks": { "after:bump": ["node scripts/write-version.cjs ${version}", "node scripts/sync-version.cjs"] }
```

**实测验证（含 changelog 插件，修正后）**：

```
$ npx release-it --ci
🚀 Let's release probe (1.17.0...1.18.0)
- node scripts/write-version.cjs 1.18.0
√ node scripts/write-version.cjs 1.18.0

$ git show --name-only --pretty=format:'commit: %s' HEAD
commit: Release 1.18.0
AGENTS.md        ✓
CHANGELOG.md     ✓
VERSION          ✓
package-lock.json
package.json     ✓

$ git status --porcelain  → 空（CLEAN）
$ VERSION=1.18.0  package.json=1.18.0  AGENTS.md=v1.18.0   ⇒ 三者一致
```

#### 为何这是 Critical 级缺陷

若沿用 `after:version:bump`：**每次发布都会成功**（退出码 0、CI 绿），
但 `VERSION`/`AGENTS.md` **永远不更新**，且工作树**仍是干净的**
（因为文件根本没被写）。这是**静默的错误结果**——比崩溃危险得多，
因为 AC-7 若写成"三文件一致"的断言，会在开发机上通过（无 changelog 插件的小探针）
而在真实配置下失败；反之若没人断言，缺陷会一路带到生产。

**教训（记入 §8）**：hook 键名必须在**与生产配置完全一致**的环境下验证——
移除任何一个插件都可能改变 hook 的触发行为。

## 1. 已确认决策（用户裁定）

| # | 决策 | 选择 |
|---|------|------|
| D1 | 本地 hook 策略 | **保留可选 opt-in hook（默认不装）**：仅 CI 强制 + 可选本地 opt-in，默认不触碰全局环境 |
| D2 | 发布工具/触发 | **release-it**，**手动本地触发**，**dry-run 为默认** |
| D3 | AC-10 分支保护 | **作为运维步骤**，需仓库管理员，**不计入代码验收范围** |
| D4 | `sync-version` 邻近修复 | **纳入本 sprint**：修 `--list-targets` + **新增 `scripts/sync-version.cjs`**（消除 WSL bash `exit 127`） |
| D5 | tag 前缀 | **统一为 `v`**：bootstrap `v1.10.0`，`git.tagName = "v${version}"` |
| D6 | R1 评审闸门 | **选项 A**：携带已处置缺口进入 Phase 2（需求未经第三方确认的风险由用户明确接受） |

### 1.1 R1 评审的真实状态（诚实披露）

R1 requirements 评审跑满 **5 轮**，**每轮均为 3/3 GAPS_FOUND，共识率 0.00（阈值 0.90）**。
按协议本应 BLOCKED；用户经知情后选择 **A（携带缺口继续）**。

最终缺口分布：**0 Critical / 11 Major / 16 Minor**（共 27 项），均已逐条处置。

本轮评审的**实际价值**是拦下了 7 个客观错误（详见
`.sprint-state/phase-outputs/requirements-delphi-verdict.md` §2.1），其中最重要的是：
- **v1 的核心方案（`githooks/commit-msg`）经实测证伪**，避免了按错误前提实施
- 发现 `--list-targets` 缺失计数错误（4→5）、JSON 不能写注释、
  `continue-on-error` 逻辑矛盾、`&&` 链式 hook 完全失效、dry-run 不产生 CHANGELOG、
  以及 `sync-version.sh` 在 WSL bash 下 `exit 127`

**未验证面**（不掩盖）：GitHub Release 创建链路从未实测（详见 §7.6）。
发布提交内容的时序**已于 §4.6 实测证实**（不再属未验证项）。

---

## 2. 需求与范围

### 2.1 目标

1. CI **强制** commit 格式，不合规**阻断** PR
2. **可选**本地 opt-in hook（**默认不安装**）
3. `release-it`：算版本 → 生成 CHANGELOG → bump → commit → tag → GitHub Release
4. `VERSION` 为**发布后的规范记录与同步扇出中心**（bump 期间的操作输入是 `package.json`，见 §4.1），发布后与 `package.json`/`AGENTS.md` **恒一致**
5. 全局 xp-gate 门禁链**不受默认状态影响**

### 2.2 In / Out

**In**：commitlint 配置与依赖 · 新增 1 个 CI job · 可选本地 hook 安装器（幂等/可卸载/恢复原值）·
`.release-it.json` + 封装脚本 · bootstrap 初始 tag 脚本 · `docs/contributing.md` ·
修复 `sync-version.sh` 失效 fan-out（§6）

**Out**：不改全局 `~/.config/xp-gate/` · 不改全局 `core.hooksPath`（默认状态）· 不迁移 CHANGELOG 历史 ·
不发布 npm 包 · 不改现有 7 个 CI job 语义 · **不新增发布类 CI job**（发布为纯本地，回答 T-8）

### 2.3 触发模型

| 环节 | 触发 | 说明 |
|------|------|------|
| commit 校验 | **每 PR**（CI） | 见 §5 的精确定义 |
| 发布 | **手动**：`npm run release`（默认 dry-run） | release-it 为本地驱动；发布含不可逆外部副作用，保留人工确认 |

### 2.4 角色与已知局限（回答 m7）

| 角色 | 本地强制 | CI 强制 |
|------|----------|---------|
| 启用 opt-in 的开发者 | ✅ | ✅ |
| 其他协作者 / bot / CI | ❌（**已知局限**） | ✅ |

本地拦截为**便利功能**；**真正的强制保障是 CI**。

#### 已知局限：squash 提交消息可在合并时被改写（回答 R2-A-F2 / R3-2）

⚠️ **诚实披露**：本设计校验的是 **PR 标题**（DD-003）。但 GitHub 允许维护者在
**合并时编辑 squash commit message**。因此存在这条绕过路径：

```
PR 标题合规 → CI 绿灯 → 合并时被改成不合规消息 → master 上留下违规提交
```

**为何仍选 PR 标题**：squash 合并下中间提交会被丢弃，校验 PR 标题是
**唯一能在合并前拦住的点**（校验全范围会产生大量假阳性，见 DD-003）。

**该局限的处置**：

| 措施 | 说明 |
|------|------|
| **文档明示** | `docs/contributing.md` 写明：CI 校验 PR 标题；**维护者合并时须保持最终 squash 消息合规** |
| **事后可见** | 范围校验（§5.2 步骤 c，仅警告）会在后续 PR 中暴露历史不合规提交 |
| **不假装已覆盖** | 本条记入本节"已知局限"，**不**声称"master 上所有提交都被强制合规" |
| **后续可选** | 增加 master 分支上的 post-merge 校验属**超出本 issue 范围**，记录为未来改进项 |

因此本 sprint 的准确承诺是：**"PR 标题在合并前被强制校验"**，
而非"master 上的每一个提交都保证合规"。


---

## 3. 本地 opt-in 的诚实边界（回答 A-R2 #1 与 M6）

由于 git 只从单一 `core.hooksPath` 取 hook，**二者不可兼得**：

| 状态 | `core.hooksPath` | 本仓库 xp-gate 门禁 | 本地 commit 校验 |
|------|------------------|---------------------|------------------|
| **默认（未安装）** | 全局 xp-gate | ✅ 完好 | ❌ 无 |
| **opt-in 已安装** | 仓库内钩子目录 | ⚠️ **本仓库临时失效** | ✅ 有 |

**因此 AC-2 必须按上表精确表述**（回答 A-R2 #1 的"AC-2 逻辑矛盾"）：
AC-2 只在"opt-in 已启用"这一前提下成立，并**显式声明其代价**。

**安装脚本契约（回答 T-5/T-6 与 C-R5 R-11）**：

⚠️ **hook 实现必须避免 C2/C3 所证的失败类别**（PATH 依赖的 bash 钩子）。
因此 `githooks/commit-msg` **不使用 bash**，而是：

```bash
#!/bin/sh
# commit-msg hook —— 只用 node，不依赖 bash/PATH 之外的假设
exec node "$(dirname "$0")/../node_modules/@commitlint/cli/lib/cli.js" --edit "$1"
```

| 项 | 明确值（回答 R-11） |
|----|---------------------|
| hook 文件 | `githooks/commit-msg`（git 传入消息文件路径作为 `$1`） |
| 执行体 | `node` + `@commitlint/cli`，**不 shell 转发**，规避 C2 的 PATH 失败类别 |
| 依赖 | `@commitlint/cli` + `@commitlint/config-conventional` 均为 **devDependencies** |
| AC-2/AC-3 验证程序 | ① 运行 `bash scripts/install-git-hooks.sh` → ② 用非法消息（如 `bad message`）提交，断言**非零退出** → ③ 用合规消息（如 `feat: x`）提交，断言**零退出** → ④ 运行 `--uninstall` 并断言 `core.hooksPath` 恢复原值 |

**安装脚本契约**：

| 场景 | 行为 |
|------|------|
| 安装前记录 | 将原 `core.hooksPath` 写入 `.git/xp-gate-uninstall-record`（**不在仓库内、不提交**）；若原本**未设置**则记录哨兵值 `__UNSET__` |
| 重复安装 | 检测到已安装标记 → **no-op**，**不覆盖**已记录的原值（防止把已改值当成原值） |
| 安装提示 | 打印醒目警告：本仓库全局门禁将临时失效，卸载可恢复 |
| 卸载 | 记录值为 `__UNSET__` → 执行 `git config --unset core.hooksPath`；否则恢复记录值 |
| 卸载时当前值 ≠ 记录值 | **警告并以非零退出中止**（避免静默覆盖他人后续修改） |
| `--force` 的确切语义（回答 B-R4 F-7 与 R2-B-F7） | **恢复记录值，覆盖当前值**，并把被覆盖的原值**同时**写入 `.git/xp-gate-uninstall.log`（持久审计，非仅 stderr）。**定义明确、单一含义** |
| **记录文件缺失时的卸载**（回答 R2-B-F7） | 无"记录值"可恢复 ⇒ **`--uninstall` 非零退出**并提示"无法确定原值，请手工 `git config core.hooksPath <路径>`"；**`--force` 也非零退出**（没有可恢复的目标，强制无意义） |
| 需要"重置为未设置"的逃生口 | 提供**独立命名**的开关 `--reset-unset`（语义单一：执行 `git config --unset core.hooksPath`），与 `--force` 分离——避免 `--force` 一词承担两种破坏性语义 |
| 卸载后 | 删除**记录文件**与**安装时写入的** hook 包装文件；⚠️ **绝不删除被版本控制的文件**（如 `githooks/commit-msg` 在 slice-3 中是 tracked 交付物——卸载只改 `core.hooksPath` 与 `.git/` 下文件，不触碰工作树中的 tracked 文件） |

---

## 4. release-it 配置（钉死 T-3/T-4/T-9）

### 4.1 版本真源与同步时序（回答 N-1/N-2）

实测时序：release-it 先由自身 `npm` 插件 bump `package.json`，**随后**触发 `after:bump`。
因此钩子内**不能**回读 `VERSION`（此刻仍是旧值），必须使用 release-it 插值出的 `${version}`
（`shell.js:19` 已确认插值；探针实测插值正确）。

**必须使用数组形式**（§0.3 实测：`&&` 链式两命令都不执行）：

```jsonc
{
  "hooks": {
    "after:bump": [
      "node scripts/write-version.cjs ${version}",
      "node scripts/sync-version.cjs"
    ]
  }
}
```

**时序修正（回答 N-1 / B-R4 F-3 的措辞矛盾）**：release-it 先 bump `package.json`，
**之后** hook 才写 `VERSION`。故不宣称"先写 VERSION"。

**关于 `VERSION` 的定位（回答 B-R4 F-3 与 R2-A-F1 的架构批评）**：
bump 时刻的**输入**是 release-it 算出的版本（经 `${version}` 插值），**不是** `VERSION` 文件。
⚠️ **R2-A-F1 的批评成立并被采纳**：把 `VERSION` 称为"单一真源（source of truth）"是
**架构表述错误**——release flow **绕过**它算版本（从 `package.json` 算），
故真正的**操作输入**是 `package.json`。

准确的三层定位：

| 文件 | 在 bump 阶段的角色 |
|------|-------------------|
| `package.json` | release-it **读取并算出**下一版本的**操作输入** |
| `${version}`（插值） | 该次发布的**权威版本号** |
| `VERSION` | **同步目标 + 发布后状态标记**（published state marker），**不是**输入 |

因此准确表述为：

> **`VERSION` 是发布后的「规范记录」（canonical record），不是 bump 的输入。**
> bump 期间的操作输入是 `package.json`；`VERSION` 与之一致是**同步的产物**，而非前提。

**为什么仍以 `VERSION` 为中心组织设计**：`VERSION` 是人类可读、跨工具（含多个 npm package 目标）
的**单一扇出源**——一处更新即全仓一致，比"多处手工维护"更可靠。
但这是**分发中心**，不是**版本计算源**。

**防漂移（回答 R2-A-F1 的"若 package.json 与 VERSION 漂移"）**：
`scripts/release.sh` 在**任何** dry-run/execute 之前**强制**断言
`VERSION == package.json`，不一致则非零退出（§7.4 前置检查）。
这堵住了"用错误基线版本发布"的路径（且该检查是**本地阻断**，不依赖 CI）。

**占位符记法说明（回答 B-R4 F-4）**：本文中 `${version}` 是 release-it 的**真实插值语法**（`lib/shell.js:19`），可直接复制使用；文中出现的「版本占位符」字样只是行文简写，与 `${version}` 同义。

**幂等性要求（回答 N-2）**：`scripts/sync-version.cjs` 必须在目标文件**已等于** `VERSION` 时
仍以 0 退出（no-op 重写），因为 release-it 已先行 bump 过 `package.json`。
既有 `scripts/sync-version.sh` 已是幂等写入（同值重写无副作用），沿用该语义。

#### 两个脚本的精确契约（回答 R2-B-F3 的歧义）

| 脚本 | 输入 | 输出 | 是否读 `VERSION` |
|------|------|------|------------------|
| `scripts/write-version.cjs <version>` | 命令行参数（来自 `${version}` 插值） | 把该版本写入 `VERSION` 文件 | ❌ 不读（只写） |
| `scripts/sync-version.cjs` | **`VERSION` 文件** | 扇出到 `package.json` + `AGENTS.md` | ✅ 读 |

**执行顺序由数组顺序保证**（实测已确认数组形式逐元素顺序执行，见 §0.3）：

```
1. write-version.cjs <version>   → VERSION 被写为新版本
2. sync-version.cjs              → 读 VERSION，扇出到 package.json / AGENTS.md
```

⚠️ **消除 R2-B-F3 指出的表面矛盾**：§4.1 说的"钩子内不能回读 `VERSION`"
指的是**第一个脚本不能从 `VERSION` 取版本号**（此刻仍是旧值），
而**第二个脚本读 `VERSION` 是正确的**——因为第一个脚本刚刚写入新值。
两者不矛盾：**取版本号靠参数插值，扇出靠读文件**。

`write-version.cjs` 失败语义：参数缺失/非 semver → **非零退出**（不写文件）。
`sync-version.cjs` 失败语义：目标文件**存在但不可写**，或 `AGENTS.md` 头部行缺失/格式不符
→ **非零退出**；目标文件**整体不存在** → 跳过（属可选目标）。

### 4.2 配置全文（键名均对照 v21.1.0 schema 核实）

```jsonc
{
  "git": {
    "requireBranch": "master",
    "requireCleanWorkingDir": true,
    "tagName": "v${version}",
    "commitMessage": "chore(release): v${version}",
    "tagAnnotation": "Release v${version}"
  },
  "npm": { "publish": false },
  "github": {
    "release": true,
    "releaseNotes": null,
    "draft": false,
    "preRelease": false
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": "conventionalcommits",
      "infile": "CHANGELOG.md"
    }
  },
  "hooks": {
    "after:bump": [
      "node scripts/write-version.cjs ${version}",
      "node scripts/sync-version.cjs"
    ]
  }
}
```

**tag 前缀**（回答 N-4）：字面量**就是** `"v${version}"`（`v`、`$`、`{`、`version`、`}`，
**无任何反斜杠**）。bootstrap tag 为 `v1.10.0`。必须显式设置（§0.2 零 tag 时默认推断退化）。

**`requireBranch` 与 CI base-ref 的耦合（回答 N-3 与 B-R4 F-11 / R2-B-F11）**：CI 使用 `github.base_ref`
以支持任意 base 分支；而 `requireBranch: "master"` 是**有意的发布约束**——发布只允许从 master 发生。
二者不矛盾（一个管 PR 校验、一个管发布源）。

✅ **默认分支名已实测确认（回答 R2-B-F11）**：`git symbolic-ref refs/remotes/origin/HEAD`
→ `refs/remotes/origin/master`。因此 `requireBranch: "master"` **与仓库实际默认分支一致**，
不会出现"config 阻塞所有发布"的情形。该事实写入设计文档，使单测可断言**与实际默认分支一致**：

```bash
# 单测断言：.release-it.json 的 requireBranch == 仓库实际默认分支
test "$(node -p "require('./.release-it.json').git.requireBranch")" \
   = "$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|origin/||')"
```

**耦合的记录位置**：落实为两处（**不含 JSON 注释**）：

⚠️ 修正：`.release-it.json` **是 JSON，不支持注释**（release-it 按 JSON 解析），
故原先设想的"配置内注释"**不可实现**，已删除该位置。改用两处**可执行**记录：

1. `docs/contributing.md` §Release 显式说明"默认分支改名需同步修改 `git.requireBranch`"
2. **单测**：读 `.release-it.json` 与 workflow 文件，断言二者引用的分支一致 —— 使耦合**可被 CI 捕获**

（若确需配置内注释，可改用 release-it 支持的 `.release-it.js`；本设计为与既有 JSON 风格保持一致，
选择"不放注释 + 单测兜底"。）

**`requireCleanWorkingDir` 与 hook 时序（回答 N-11 / B-R4 F-6）**：
已定位到确切代码路径，不再是"探针跑过一次"的弱证据：

| 位置 | 行为 |
|------|------|
| `lib/plugin/git/Git.js:36`（git 插件 **`init()`**，即流程**最开始**） | 工作树脏则 **抛错中止**：`Working dir must be clean.` |
| `lib/plugin/git/Git.js:80-88`（`beforeRelease()`） | **不重新检查**干净度；仅在 `requireCleanWorkingDir` 为真时 `enableRollback()`，随后 `status()` + `stageDir()` |

**不变式**：`requireCleanWorkingDir` **只在流程开始时检查一次**，之后不再复查。
`after:bump` 在 bump 之后才写文件，故 hook 造成的脏工作树**不会**触发该检查
（探针实测亦通过）。

⚠️ **推论（对本项目重要）**：该检查是**开始时的硬失败**。因此发布前工作树必须干净，
这与 D2「手动触发、dry-run 为默认」相配合：开发者须先提交所有改动再发起发布。

**⚠️ `releaseNotes: null` 的语义未核证（回答 R2-B-R5-10）**：release-it 文档称 `null` 表示
"使用插件生成的 changelog 作为 Release body"，但**该行为未经实测**（GitHub 路径从未执行）。
已记入 §8 未验证面；首次发布时须人工确认 Release body 非空——若为空，
则显式改为传入生成的 changelog 段落或使用 `releaseNotes` 模板。

### 4.3 bootstrap（回答 M5/T-9）

`scripts/release-bootstrap.sh`：
- 当前 `VERSION=1.10.0`，`git tag -l` 为空 → 创建 `git tag -a v1.10.0 -m "Release v1.10.0"`
- **幂等**（回答 A-R2 #3）：若 `v1.10.0` 已存在 → 打印警告并以 **0** 退出，不覆盖
- **SHA 校验（回答 A-R3#3 与 B-R4 F-12）**：比较对象是**首次 bootstrap 时记录的 SHA**，
  而非"运行时的活动 HEAD"——因为重新运行时 HEAD 可能已前进。
  记录写入 `.git/xp-gate-bootstrap-sha`（**不在工作树内、不提交**）。

三分支语义（明确"当前 HEAD"的歧义，并回答 R2-B-F6）：

| 情形 | 行为 |
|------|------|
| tag 不存在 | 创建 tag 指向当前 HEAD，并记录该 SHA 到 `.git/xp-gate-bootstrap-sha` |
| tag 存在 且 其 SHA == **记录的 SHA** | 警告 + 以 **0** 退出（真正的幂等重跑） |
| tag 存在 且 其 SHA ≠ 记录的 SHA | **报错 + 非零退出**，要求人工介入 |
| **tag 存在 但记录文件缺失**（回答 R2-B-F6 的跨克隆陷阱） | 先做**祖先性校验**（回答 R2-B-F6 的第二轮补强）：若 tag 指向的 commit 是 HEAD 的祖先 → **警告 + 0** 并补记；**若不是祖先 → 非零退出**（视为真实漂移） |

⚠️ **R2-B-F6 的修正（真实运维陷阱）**：`.git/` 不被版本控制，**新克隆上没有记录文件**。
若把"记录缺失"也判为错误分支，则任何新克隆上重跑 bootstrap 都会**硬失败**——
这会让新贡献者踩坑。故：**记录缺失 + tag 已存在 ⇒ 先验证祖先性**：

| 记录缺失时的 tag 情形 | 行为 |
|----------------------|------|
| tag 是 HEAD 的祖先（正常历史） | 警告 + **0**，并补写记录（幂等成功） |
| tag **不是** HEAD 的祖先（被改指/历史重写） | **非零退出**，要求人工介入 |

这消除了 R2-B-F6 第二轮指出的"新盲区"：单纯"记录缺失即放行"会**静默接受真实漂移**，
加入祖先性校验后，漂移仍能被捕获，而正常的新克隆不会误报。

`bootstrap` 的定位：**一次性维护者操作**（非日常开发步骤）；
但重跑在**任何克隆上都是安全的**（正常历史下不会破坏已有 tag）。
文档措辞用 "Already initialized" 而非 "Warning"，避免让新贡献者误以为出错（回答 R2-A-F3）。

- **明确声明**（回答 T-9）：`v1.10.0` 之前的历史提交**有意不纳入**生成的 CHANGELOG；
  首个自动生成的条目只覆盖 bootstrap 之后的提交。这与 Out-of-scope「不迁移 CHANGELOG 历史」一致，
  但**后果在此显式声明**，避免误解。

### 4.4 `sync-version.sh` 修复的精确语义（回答 N-2 与 B-R4 F-5）

**先澄清可达性（回答 B-R4 F-5）**：既有 `scripts/sync-version.sh` 的**主流程是正确的**
（Git Bash 下实测：`VERSION=9.9.9` → `package.json` 扇出为 `9.9.9`，exit 0，且同值重写为 no-op）。
缺陷**仅在 `--list-targets` 的查询输出**：

| 路径 | 状态 |
|------|------|
| 主流程（写入扇出） | ✅ 正确、幂等 |
| `--list-targets`（查询） | ❌ 输出 7 个路径，其中 5 个在本仓库不存在 |

实测 `--list-targets` 输出：
```
package.json
src/npm-package/package.json                    ← 不存在
plugins/claude-code/.claude-plugin/plugin.json  ← 不存在
plugins/opencode/package.json                   ← 不存在
src/npm-package/plugins/claude-code/...         ← 不存在
src/npm-package/plugins/opencode/package.json   ← 不存在
AGENTS.md
```
该输出被 pre-commit hook 消费，与实际写入行为不一致。

**修复范围（最小且明确）**：仅修改 `--list-targets` 分支，使其按与主流程相同的
存在性判定过滤输出。**不改动主流程的写入逻辑**（回答 B-R4 F-5 的"1 行级 fix"确认）。

### 4.5 ⚠️ 新发现的必需项：`scripts/sync-version.cjs`（本次实测发现）

xp-gate 全局 pre-commit hook（`pre-commit:337-342`）写明：

```bash
# Prefer Node.js (.cjs) for cross-platform; fall back to bash (.sh).
if [ -f "$ROOT_DIR/scripts/sync-version.cjs" ] && command -v node >/dev/null 2>&1; then
  SYNC_VERSION_CMD="node $ROOT_DIR/scripts/sync-version.cjs"
elif [ -f "$ROOT_DIR/scripts/sync-version.sh" ]; then
  SYNC_VERSION_CMD="bash $ROOT_DIR/scripts/sync-version.sh"
fi
```

即：**该 hook 优先寻找 `scripts/sync-version.cjs`，但它在本仓库不存在**（实测确认），
故每次都退化到 `bash ...sh` 分支。

**实测风险**：本机 `bash.exe` 解析到 **WSL bash**（`C:\WINDOWS\system32\bash.exe`），
其 PATH 中**没有 `node`**，导致：

```
scripts/sync-version.sh: line 41: node: command not found
EXIT CODE: 127
```

而既有 `tests/sync-version.test.ts` 恰好**优先使用 Git Bash**
（`C:\Program Files\Git\bin\bash.exe`，其 PATH 含 node），因此测试通过、
**掩盖了 WSL bash 下的失败**。

**结论与本 sprint 的处置**：
1. **新增 `scripts/sync-version.cjs`**（Node 实现，与 `.sh` 语义等价且幂等）——
   这使 hook 走上跨平台首选分支，消除对 bash/PATH 的依赖。
2. release 的 `after:bump` 钩子**必须调用 `.cjs` 版本**（而非 `.sh`），
   以保证在 Windows 原生 Node 环境下可靠（回答 N-1/N-5 的落地形式）。
3. 该发现同时解释并强化了 AC-7 的可靠性要求。

**这是本次 PREP/DESIGN 阶段发现的最有价值的缺陷**：既有手工发布流程在
WSL bash 环境下**已经会失败**（exit 127），只是尚未被触发（因为尚无自动化发布）。

#### `.sh` 的生命周期定位（回答 R2-A-F4）

引入 `.cjs` 后出现"双实现"的维护税。明确处置：

| 脚本 | 定位 |
|------|------|
| `scripts/sync-version.cjs` | ✅ **唯一功能开发目标**（新特性、修复、语义变更都只改这里） |
| `scripts/sync-version.sh` | 🔒 **冻结为兼容层**——仅为不识别 `.cjs` 的旧调用方保留现有行为 |

**冻结的含义**：`.sh` 只接受**使行为与 `.cjs` 保持一致**的改动，不接受新功能。
AC-13 的 parity 测试是这一约束的**执行机制**（防止二者漂移）。

**未采用"让 `.sh` 只做转发"的原因**：`.sh` 无法可靠调用 `node`
（正是 §4.5 的 WSL `exit 127` 问题），故转发方案在它本应兜底的场景下**恰好失效**。
因此保留其原生实现，用 parity 测试锁住一致性。


#### parity 测试的执行环境（回答 R3-5）

parity 测试**必须显式指定 shell**，不能依赖测试运行器的默认 `bash`：

| 项 | 规定 |
|----|------|
| `.sh` 的调用方式 | 复用 `tests/sync-version.test.ts` 已有的 `resolveBashCommand()`：优先 `C:\Program Files\Git\bin\bash.exe`，否则 `bash` |
| 为何不能靠默认 `bash` | 本机 `bash` 解析为 **WSL**（`C:\WINDOWS\system32\bash.exe`），其 PATH 无 `node` ⇒ `exit 127`（§4.5 实测） |
| Linux/CI 环境 | 直接用 `bash`（真实 GNU bash，行为与 Git Bash 在本用例上等价——脚本只用 POSIX 特性） |
| 明确声明 | 脚本仅使用 POSIX 特性（无 bash-ism、无 GNU 扩展），使 Git Bash 与 Linux bash 行为一致 |

因此 parity 测试的断言是**跨环境**的：在维护者机器（Git Bash）与 CI（Linux bash）上
都要求 `.cjs` 与 `.sh` 产出相同结果。

#### 发布失败后的恢复流程（回答 R3-8）

⚠️ **未探测面**：`sync-version.cjs` 非零退出、或 GitHub API 报错时，
release-it 的 rollback 行为**未在本次探针中验证**。已知的风险链：

```
hook 失败 → 发布中止 → 但 VERSION/package.json 已在工作树被改动（未提交）
         → requireCleanWorkingDir 阻止重试 → release.sh 的前置检查仍通过（两者都是新值）
```

**规定的恢复步骤**（写入 `docs/contributing.md`）：

```bash
git restore VERSION package.json AGENTS.md CHANGELOG.md   # 丢弃未提交的 bump
git tag -d v<version>        # 仅在 tag 已创建的情况下
git reset --soft HEAD~1      # 仅在发布提交已创建的情况下
git status --porcelain       # 必须为空后才能重试
```

**远端侧恢复（回答 R2-C-F6）**：上列步骤只处理本地状态。若**提交/tag 已推送**后
GitHub Release 步骤失败（AC-16 路径），远端仍保留发布提交与 tag。补充：

```bash
git push origin :refs/tags/v<version>      # 删除远端 tag
git push --force-with-lease origin master  # 仅在确需回退 master 时（高危，需二次确认）
# 或：保留已推送的 tag，改为【手工在 GitHub 上为该 tag 创建 Release】
```

**决策规则**：若变更集本身正确（只是 Release 创建失败），
**优先选"手工补建 Release"**而非回退——回退 master 的风险远大于补一个 Release。

**定位**：本项如实记录为**未探测的失败路径**（§8 风险表同步更新），
首次真实发布前需在临时仓库演练一次恢复流程（记入 §7.6 人工清单）。

### 4.6 ✅ 发布提交内容 — 已由实测证实（回答 R2-B-F1/F2 的 Critical）

R1 阶段我把"hook 写入的文件是否进入发布提交"列为**未验证**。R2 评审将其升级为
**Critical**（若 hook 在 staging **之后**写文件，则发布提交会包含已 bump 的 `package.json`
但**陈旧的 `VERSION`/`AGENTS.md`**，且工作树变脏 ⇒ REQ-153-4 的核心不变量会在每个克隆上失效）。

**该质疑促成了本 sprint 最重要的修正（详见 §0.4）**：最初引用的探针输出确实不含
`CHANGELOG.md`，深挖后发现 `after:version:bump` 在安装 changelog 插件后**静默不触发**。
改用 bare `after:bump` 后，以**与生产完全一致的配置**（含 changelog 插件）重新实测：

```
$ npx release-it --ci
🚀 Let's release probe (1.17.0...1.18.0)
- node scripts/write-version.cjs 1.18.0
√ node scripts/write-version.cjs 1.18.0

$ git show --name-only --pretty=format:'commit: %s' HEAD
commit: Release 1.18.0
AGENTS.md            ← hook 写入，已进入提交 ✓
CHANGELOG.md         ← changelog 插件生成，已进入提交 ✓
VERSION              ← hook 写入，已进入提交 ✓
package-lock.json
package.json         ← bump 后进入提交 ✓

$ git status --porcelain
(空 = CLEAN)          ← 无残留脏文件 ✓

$ cat VERSION          → 1.18.0
$ package.json version → 1.18.0
$ AGENTS.md            → > Updated: 2026-10-02 (v1.18.0).   ⇒ 三者一致，AC-7 成立
```

**四文件断言现已由实测支持**（此前只验证了三个，且是在**不含 changelog 插件**的
配置下——那正是 R2-A-F1 / B-N-1 / C-F3 正确指出的证据缺口）。

**机制（与观测一致的代码路径，回答 R2-B-F2 的措辞要求）**：
`after:bump` 在**版本 bump 阶段**触发（`lib/index.js:119-124` 的 bump 循环结束后，
由 `plugins.at(-1)` 触发 bare `after:bump`）；而暂存发生在**更晚**的
`beforeRelease()`（`Git.js:80-88` 的 `stageDir()`）。

⚠️ **措辞精确化**：上述代码路径**与观测结果一致**，但**观测本身不构成对时序的独立证明**
（同一结果也可能由其他机制产生）。因此本项的定性是：

| 层面 | 状态 |
|------|------|
| **行为事实**：hook 写入的文件确实进入发布提交，且工作树干净 | ✅ **已实测证实**（上列输出） |
| **机制解释**：`after:bump` 早于 `stageDir()` | ⚠️ **与代码路径一致，但未独立证明时序** |

**工程含义**：AC-7 的断言基于**行为事实**（可直接验证、且已通过），
因此**不依赖**机制解释的正确性。机制说明仅用于帮助理解与排查。

**因此**：
1. AC-7 的断言（`git show --name-only` 含四类文件 + `git status --porcelain` 为空）**必要且已验证可满足**
2. 该项的**行为层面**从 `known_unverified` **移出**；机制层面如实标注为"一致但未独立证明"
3. **探针必须复刻生产配置**：本次教训是"移除一个插件就改变了 hook 触发行为"（§0.4），
   故 AC-5/AC-7 的 fixture **必须包含 changelog 插件**（§7.4 已列明）

## 5. CI 校验的精确定义（钉死 T-1/T-2/T-7）

### 5.1 环境假设（回答 T-2 与 C-R5 R-6）

| 项 | 明确值 |
|----|--------|
| CI 提供方 | GitHub Actions |
| 检出 | `actions/checkout` + **`fetch-depth: 0`**（全历史，否则 `origin/master` 不存在→范围静默为空） |
| base ref | `origin/${{ github.base_ref }}`（不用硬编码 master） |
| base ref 缺失时 | **失败**并提示，不静默跳过 |

⚠️ **R-6 的修正（真实逻辑错误）**：原先设想把"base ref 解析"与"范围校验 (b)"放在同一个
`continue-on-error: true` 步骤中，这是**自相矛盾**的——`continue-on-error` 会把
"base ref 缺失"这一次**必须失败**的情形也降级为警告，正好违反了本节"缺失时失败"的要求。

**因此拆为三个独立步骤**（回答 C-R5 R-6）：

| 步骤 | `continue-on-error` | 职责 |
|------|---------------------|------|
| ① 解析 base ref | **否**（阻断） | 求 base ref；缺失即**失败** |
| ② PR 标题校验 (a) | **否**（阻断，承重） | 唯一阻断项 |
| ③ 范围校验 (b) | **是**（仅警告） | 可见性信号，不阻断 |

即：**"必须失败"与"仅警告"分属不同步骤**，`continue-on-error` 只作用于 (b)，
不会再掩盖 base ref 缺失。

### 5.2 校验对象（回答 T-1 与 A-R3#2）

仓库使用 **squash 合并**，因此**最终落入 master 的消息 = PR 标题**，
分支上的中间提交**会被丢弃**。

⚠️ **A-R3#2 的批评成立**：若无条件校验 `origin/master..HEAD` 的全部提交，
则开发者推送的 WIP 提交（如 `wip`、`fix typo`）会导致 CI 失败，
而这些提交**根本不会进入 master** —— 这是**假阳性**，会造成无谓摩擦。

**因此采用差异化策略**：

| 步骤 | 命令 | 失败影响 | 理由 |
|------|------|----------|------|
| 前置 | 该 job 在**所有** `npx --no-install` 步骤之前执行 `npm ci`（否则离线解析失败） | — | 回答 R2-B-R5-7 |
| (a) **PR 标题校验（承重）** | `printf '%s' "$PR_TITLE" \| npx --no-install commitlint --verbose` | ❌ job 失败 | squash 后它就是 master 上的提交消息 |
| (b) 范围校验（**警告，不阻断**） | `npx --no-install commitlint --from "origin/$BASE_REF" --to HEAD --verbose` | ⚠️ 仅输出警告 | 中间提交会被丢弃，不应阻断 |

**精确命令与转义处理（回答 R2-B-F7）**：`commitlint` **从 stdin 或 `--edit` 文件读取**，
不接收位置参数——把标题当参数传入会被**静默忽略**。因此 (a) 必须用管道：

```yaml
- name: Validate PR title
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: printf '%s' "$PR_TITLE" | npx --no-install commitlint --verbose
```

- 用 `env:` 传递标题（**不**直接内插到 shell 字符串），避免标题中的
  反引号/`$`/引号造成 shell 注入或解析错误（回答 F-7 的转义担忧）
- 用 `printf` 而非 `echo`，避免标题以 `-n` 等开头时被误解析
- 多行标题：`printf '%s'` 原样传入，commitlint 会按完整消息解析（首行即 header）

- (a) 为**唯一阻断项**，与 squash 工作流语义一致（回答 A-R3#2）
- (b) 保留为**可见性信号**（`continue-on-error: true`），既避免假阳性，
  又能在非 squash 合并（如直接 merge）时提醒历史不整洁
- 若仓库未来改为非 squash 合并，须将 (b) 提升为阻断项；此约束在此显式记录

### 5.3 ignores（回答 T-7）

保留 `@commitlint/config-conventional` 的 `defaultIgnores: true`，**额外**明确：

```js
ignores: [
  (m) => /^Merge /.test(m),
  (m) => /^Revert /.test(m),
  (m) => /^chore\(release\):/.test(m),
  (m) => /^Merge pull request/.test(m),
  // 机器人提交：只写【已确认真实存在】的格式（回答 R2-B-F8）
  (m) => /^Bump /.test(m),            // dependabot 默认标题格式（已确认存在）
  (m) => /^chore\(deps\)/.test(m),    // 配置 commit-message.prefix 后的格式
]
```

**说明（回答 T-7 / B-R4 F-8 / C-R5 R-7 / R2-B-F8）**：

1. **本仓库当前没有任何机器人提交**（实测：`git log` 无 bot 作者，9 条含 "bump" 的
   全部是人工提交），且**不存在 `.github/dependabot.yml`**
2. 因此上面三条机器人正则是**面向未来启用 dependabot 的前瞻性配置**
3. ⚠️ **R2-B-F8 的批评成立并被采纳**：v5 曾使用 `/^\[dependabot/`，
   但 dependabot 的真实标题是 `Bump X from Y to Z`，该正则**永远无法命中**——
   属于"看起来有保护实则没有"的误导性代码，**已删除并替换为可命中的格式**
4. **主干保障不是正则，而是配置**：启用 dependabot 时**同时**设置
   `commit-message.prefix: "chore(deps)"`，使其产出天然合规。
   正则仅作兜底，且只写**能实际命中**的模式


现状定性：

| 项 | 结论 |
|----|------|
| 当前影响 | **无**（本仓库无机器人提交可被阻断） |
| 正则的作用 | 前瞻性兜底，避免未来启用 dependabot 时误阻断 |
| 兜底方案 | 启用 dependabot 时**同时配置 `commit-message.prefix`**，从源头消除对正则的依赖 |

即：**不应假装这是已解决的现存风险**；它是"未来启用机器人时需一并处理"的前置条件，
已记录于此并在 `docs/contributing.md` 中说明。

### 5.4 运行时自检（回答 R2-A-F1 的"仅配置层断言不足以证明生效"）

R2-A-F1 指出：单测只能断言 YAML **结构**（step 数、`continue-on-error` 取值），
**不能证明校验在运行时真的生效**——若管道断裂或 `npx` 不在 PATH，
job 可能空过（fail open），而 PR 仍会带着不合规标题被合入（AC-10 又不在代码范围）。

**因此 commit-lint job 增加一个自检步骤（放在真实校验之前）**：

```yaml
- name: Install dependencies (pinned, no registry drift)
  run: npm ci

- name: Self-check (lint command actually rejects bad input)
  run: |
    set -euo pipefail
    # 必须失败：不合规消息
    if printf '%s' "bad message no type" | npx --no-install commitlint --verbose; then
      echo "::error::commitlint accepted a non-conventional message — gate is fail-open"
      exit 1
    fi
    # 必须通过：合规消息
    printf '%s' "feat: self check" | npx --no-install commitlint --verbose
```

**该步骤的价值**：用**已知坏输入**证明门禁确实会红。
若 commitlint 未安装、`npx` 不可用或配置被清空，自检会**先失败**，
而不是让真实校验静默通过。这弥补了"仅结构断言"的空洞性（回答 F-1）。

**运行时验证的最终确认**：AC-4 的验收包含一次**人工端到端确认**——
用一个不合规标题的真实 PR 观察 job 变红，再用合规标题观察变绿
（记入 CLOSE 阶段的 UAT 清单）。

### 5.5 job 与分支保护（回答 M4）

| 项 | 定义 |
|----|------|
| job 名 | `commit-lint` |
| 现有 7 个 job（实测枚举，回答 B-R4 F-9） | `static-analysis`、`unit-tests`、`integration-tests`、`security-scan`、`coverage`、`e2e-tests`、`smoke` |
| job 总数 | 7 + 新增 1 = **8**；新 job **无 `needs`**（回答 AC-12） |
| AC-4 | "CI job `commit-lint` 对不合规 commit **失败**" —— 代码可交付、可测试 |
| AC-10 | *(运维)* 将 `commit-lint` 设为 required status check —— 需仓库管理员，**不在代码交付范围** |

**7 个 job 名已按 `.github/workflows/pr.yml` 实测枚举**（非凭记忆），
故 AC-12 的"总数 8"可被独立复核。

拆分原因：避免把需要管理员权限的动作伪装成代码验收项。

---

## 6. 邻近修复：`sync-version.sh` 失效 fan-out

详见 §4.4（语义定义）。要点：`--list-targets` 输出 7 个目标，
其中 5 个在本仓库不存在（`src/npm-package/**`、`plugins/**`），
脚本主体静默跳过缺失文件，但 `--list-targets` 仍打印它们，**与实际行为不一致**。
该输出被 pre-commit hook 消费。修复：只输出实际存在的目标。

---

## 7. 成功标准（含全部 R1 修正）

| ID | 标准 | 验证方式 |
|----|------|----------|
| AC-1 | 配置 = `@commitlint/config-conventional` + 文档化覆盖项与 ignores | 读取配置断言 preset/overrides/ignores 正则 |
| AC-2 | **当 opt-in 已安装时**，不合规 commit 被本地 hook 拒绝；其代价（本仓库全局门禁临时失效）已声明 | 测试：非法 message → 非零退出；并断言文档含该声明 |
| AC-3 | 合规 commit 被接受 | 测试：多种 type/scope → 零退出 |
| AC-4 | CI job `commit-lint` 对不合规 commit 失败；范围 `origin/base..HEAD` + PR 标题；`fetch-depth: 0`；ignores 具名 | workflow 断言 + 校验函数单测 |
| AC-5 | CHANGELOG 追加到顶部且既有条目保留 | **方式见 §7.1**（dry-run 不可用） |
| AC-6 | release-it **能算出**正确的下一版本与 tag 名，且**远端不被改动** | 见 §7.2（dry-run 只验证计算，不验证产物） |
| AC-7 | 发布后 `VERSION`/`package.json`/`AGENTS.md` 三者一致，**且该一致性已进入发布提交** | 见 §7.2 集成层；**已在探针仓库实测成立** |
| AC-8 | **默认状态下**全局 `core.hooksPath` 值不变，xp-gate 门禁仍触发 | 见 §7.3 断言程序 |
| AC-9 | 安装器幂等（重复安装 no-op 且不覆盖记录值）；卸载精确恢复（含 `__UNSET__` 情形）；当前值≠记录值时需 `--force` | 单测覆盖 4 种情形 |
| AC-10 | *(运维)* `commit-lint` 设为 required check | 人工确认，不在代码范围 |
| AC-11 | bootstrap 创建 `v1.10.0`；重复执行幂等（已存在则警告并 0 退出） | 单测 + 幂等断言 |
| AC-12 | 新增 1 个 job（总数 8）且无 `needs`；**发布不新增 CI job** | workflow 断言 |
| AC-13 | `scripts/sync-version.cjs` 与 `.sh` 在共享 fixture 上**语义等价**（含 AGENTS.md 用例）；同值重跑为 no-op | 见 §7.4 |
| AC-14 | `--list-targets` **只列出实际存在的目标**（回归测试：不得再列出 5 个不存在的路径） | 单测断言输出集合 == 实际存在集合 |
| AC-15 | `node scripts/sync-version.cjs` **不依赖 bash 或 PATH** 即可成功（C2/WSL 失败模式回归测试） | 测试：以原生 `node` 调用，断言 exit 0 且扇出生效 |
| AC-16 | GitHub Release 在**首次真实发布**时创建成功且含生成的 notes | 见 §7.5（首发布人工清单；CI 无法覆盖） |

### 7.1 AC-5 的验证方式（回答 N-5，实测驱动）

**实测结论：dry-run 不执行 hook，因此 dry-run 下 CHANGELOG 根本不会生成**
（`shell.js:31` 对 dry-run 下的写操作直接 no-op）。

因此 AC-5 **不能**用 release-it dry-run 验证。改用**两层验证**：

| 层 | 方式 | 验证内容 |
|----|------|----------|
| 1. 配置层 | 单测断言 `.release-it.json` 中 `infile: "CHANGELOG.md"` 且 preset 为 `conventionalcommits` | 配置正确性 |
| 2. 集成层 | 在**一次性临时仓库**（复制本仓库的 `CHANGELOG.md` 到临时目录）执行真实 release，随后断言：`## 1.8.9` 仍存在、新版本条目位于文件顶部 | 追加语义与历史保留 |

集成层在**临时目录**进行，**不触碰本仓库**，避免测试产生副作用。
该方式已由本次探针实验验证可行（探针仓库成功生成 `CHANGELOG.md` 并保留历史）。

### 7.2 AC-6 与 AC-7 的验证边界（回答 A-R4#1 与 B-R4 F-1）

⚠️ **自我矛盾修正**：v3 的 AC-6 写"dry-run 验证 bump+tag"，但 §0.2 已证明
dry-run 下 hook 被 no-op、不产生 CHANGELOG/commit/tag。二者不能同时成立。

**因此明确划分两个验证面（dry-run 只验"算得对"，集成层验"写得对"）：**

| AC | 验证面 | 断言内容 | **不**断言 |
|----|--------|----------|-----------|
| AC-6 | **dry-run** | (i) 从 release-it 输出解析出正确的下一版本与 tag 名；(ii) `git diff --exit-code` 干净；(iii) `git ls-remote --tags` 前后无新 tag | ❌ VERSION/CHANGELOG/本地 tag 的**存在性**（dry-run 不产生它们） |

**AC-6 的可执行细节（回答 C-R5 R-9）**：

| 项 | 明确值 |
|----|--------|
| 运行位置 | **本地/集成测试**中执行（不放进 CI，因为需要远端访问） |
| 解析对象 | release-it dry-run 的**首行摘要**，形如 `🚀 Let's release <pkg> (1.10.0...1.11.0)`；从中解析出 `1.11.0` 作为"下一版本" |
| tag 名断言 | 断言**解析后的具体值**：`"v" + <解析出的版本>`（如 `v1.11.0`），**不是**断言模板串 `v${version}` |
| (iii) 前提 | `git ls-remote` 需**远端访问权限/凭据**；若不可用则该子项记为"跳过"而非"通过"（不得把跳过当成功） |

即：AC-6(i) 断言的是**解析后的具体 tag 名**（如 `v1.11.0`），
而非配置模板字面量——这消除了 R-9 指出的"模板 vs 解析值"歧义。
| AC-7 | **临时仓库集成层**（真实 release） | `VERSION` = `package.json` = `AGENTS.md` 版本三者一致；本地 tag 已创建；**且发布提交内容包含这四类文件、运行后 `git status --porcelain` 为空**（回答 C-R5 R-4） | — |

**关于 R-4（发布提交内容）的修正**：`Git.js:80-88` 的 `stageDir()` 会把工作树改动纳入
发布提交。**该结论已由 §4.6 的探针实测证实**（`VERSION`/`AGENTS.md` 确实出现在发布提交中，
且工作树干净）——不再是"无法证明"的推断。因此 AC-7 的两条断言
（`git show --name-only` 含四类文件 + `git status --porcelain` 为空）是**已验证可满足**的回归保护：

```bash
git show --stat --name-only HEAD | grep -E '^(VERSION|package.json|AGENTS.md|CHANGELOG.md)$'
git status --porcelain    # 必须为空
```

这两条断言的作用是**防回归**（防止将来改配置或升级 release-it 后 hook 时序被破坏），
而非弥补当前的不确定性。

即：**dry-run 断言"计算正确且无副作用"；集成层断言"产物正确"。**
这消除了"对未生成的文件做存在性断言"的空洞测试（回答 B-R4 F-1 的 vacuous assertion 风险）。

### 7.3 AC-8 的断言程序（回答 B-R4 F-10 / R2-A-F3 / R2-B-N7 / R2-C-F4）

- 断言 1 由单测覆盖（读 `git config`，与基线比较）
- 断言 2 为**集成断言**：证明"门禁仍在链上"，而不只是"字符串没变"

#### ⚠️ Gate 0 的真实触发条件（已核对 xp-gate 源码，回答 F-4）

R2 多位专家质疑"Gate 0 存在且必然触发"缺乏证据。**已核对
`~/.config/xp-gate/hooks/pre-commit`，结论如下**：

| 事实 | 证据（pre-commit 行号） | 影响 |
|------|------------------------|------|
| Gate 0 **确实存在** | `:291` `# Gate 0: Version Consistency Check (Protected Branches)` | 名称引用正确 |
| ⚠️ **仅在受保护分支启用** | `:296-311` `PROTECTED_BRANCHES="master develop trunk mainline"`，仅当 `CURRENT_BRANCH` 命中才执行检查 | **在 `sprint/2026-10-01-01` 上 Gate 0 不激活！** |
| ⚠️ 检查的是**暂存**的 `VERSION`/`CHANGELOG.md` | `:323-329` `git diff --cached --name-only` | 仅改工作树文件而不 `git add` 也**不触发** |
| 存在环境变量旁路 | `:317-320` `SKIP_VERSION_CHECK=1` | 断言需确保该变量未设置 |
| β 行为：Gate 0 会**自动运行 sync-version 并暂存结果** | `:333-343` 优先 `scripts/sync-version.cjs`，回退 `.sh` | **重要**：这解释了 `VERSION` 如何扇出；也是 `sync-version.cjs` 必需的原因 |

**因此原设计的断言 2 是错误的**（"改 `VERSION` 不一致即触发 Gate 0 拒绝"在 sprint 分支上**永不成立**，
且在 master 上也**不会拒绝**——见下）。

#### ⚠️ Gate 0 的真实控制流：**heal-then-pass，不是 reject**（回答 R2-C-R5-1）

专家 C 指出：本节一边说 Gate 0 会自动跑 sync-version 并 `git add`，一边又断言"提交被拒（非零退出）"
——**自相矛盾**。经核对源码，**专家 C 正确**：

| 位置 | 行为 |
|------|------|
| `pre-commit:331-371` | 若 `VERSION` **或** `CHANGELOG.md` 已暂存 ⇒ 自动 sync + `git add` ⇒ **输出 PASSED**（`:371`） |
| `pre-commit:367-369` | 若 sync **失败** ⇒ 仅打印警告（"continuing without auto-sync"），**仍不失败** |

即：**Gate 0 在"版本一致性"场景下是自愈型检查，不会拒绝提交。**
因此任何"断言提交被拒"的设计都是错的。

#### 修正后的断言 2（确定性、无副作用）

放弃"制造版本不一致"的探针（它会**污染真实仓库的索引**：把伪版本写进
`package.json`/`AGENTS.md` 并暂存），改为**隔离 + 只读**的验证：

```bash
HOOKS_PATH="$(git config --get core.hooksPath || echo __UNSET__)"
if [ "$HOOKS_PATH" = "__UNSET__" ] || [ ! -d "$HOOKS_PATH" ]; then
  echo "SKIPPED: xp-gate hooks not installed on this machine"   # 显式 skipped，绝不记 passed
else
  # 在【一次性临时克隆】中验证门禁仍在链上（不在真实仓库制造版本漂移）
  TMP="$(mktemp -d)"; git clone -q . "$TMP/probe"; cd "$TMP/probe"
  git config core.hooksPath "$HOOKS_PATH"      # 临时仓库继承全局门禁
  printf "const x:any=1;\n" > src/__gate_probe.ts   # 触发必然失败的 Gate 规则
  git add src/__gate_probe.ts
  if git commit -m "chore: gate probe"; then
    echo "::error::xp-gate did not block a known-bad change - gate chain is broken"
    exit 1
  fi
  cd - >/dev/null; rm -rf "$TMP"                # 无副作用清理
fi
```

**该设计的三个关键改进（全部回应 R2-C-R5-1）**：

| 改进 | 解决的问题 |
|------|------|
| **在临时克隆中执行** | 不再污染真实仓库索引；`rm -rf` 保证清理 |
| **不制造版本漂移** | 避开 Gate 0 的 self-heal 路径，不触发 sync 扇出 |
| **不硬编码 Gate 标题** | 只断言"非零退出"，xp-gate 改名/重排均不影响 |

#### ⚠️ 对"本 sprint 不改变 Gate 0 行为"的更正（回答 R2-C-R5-1）

专家 C 指出一个我遗漏的**行为翻转**：`pre-commit:337-343` 优先用 `scripts/sync-version.cjs`，
回退 `.sh`。本 sprint **新增** `.cjs` 之前，Gate 0 的 sync 会走 `.sh`——
在 WSL 等 `node` 不在 PATH 的环境下 `.sh` 会失败（`:367-369` 只警告不阻断）；
**新增 `.cjs` 后 sync 会成功**，从而改变 Gate 0 的观察行为。

**如实定性**：这是**本 sprint 有意引入的行为改变**（正是 §4.5 的目标），
而非"不改变"。已记入 §8 风险表，并在 `docs/contributing.md` 中说明。

#### 断言 1（仍由单测覆盖）

断言 1 读 `git config core.hooksPath` 并与基线比较，在**默认未安装**状态下必须相等。
该断言不需制造任何仓库改动，无副作用。

**执行环境（回答 R2-C-R5-4）**：AC-2 / AC-3 / AC-8 / AC-9 全部涉及改写 `core.hooksPath`，
**一律在一次性临时克隆中执行**（与 §7.4 的纪律一致），绝不在开发者真实检出中改 git config。

### 7.4 集成层的 fixture 清单（回答 C-R5 R-2）

AC-5 / AC-6 / AC-7 的集成层**不能用本仓库的 `.release-it.json` 原样运行**——
因为 `github.release: true` 会在无 token、无 GitHub 的情况下令插件报错、
触发 rollback，从而使断言不可达（回答 R-2）。

**fixture 清单（一次性临时仓库，必须完整列出）**：

| 项 | 值 |
|----|-----|
| `VERSION` | `1.10.0` |
| `package.json` | 含 `"version": "1.10.0"` **且必须含 `"name"`**（release-it 需要，回答 R2-B-F10） |
| `AGENTS.md` | 含 `> Updated: <date> (v1.10.0).` 头部行 |
| `CHANGELOG.md` | **从本仓库复制**（含既有 `## 1.8.9` 条目，用于验证"历史保留"） |
| `.release-it.json` | **从本仓库复制，但覆盖 `github.release = false` 与 `git.requireBranch = false`**（回答 R2-B-F10：避免 fixture 分支名与 master 不符而失败） |
| `scripts/write-version.cjs`、`scripts/sync-version.cjs` | 本 sprint 交付物（slice-2 / slice-4） |
| git | 分支 `master`、干净工作树、annotated tag `v1.10.0`、**bare remote** |
| npm | 安装 `release-it@21.1.0` + `@release-it/conventional-changelog@12.0.2`（**两者均 pin 版本**，回答 R2-B-F11） |
| ⚠️ **changelog 插件必须存在** | 见 §0.4：**移除 changelog 插件会改变 hook 触发行为**（`after:bump` 与 `after:version:bump` 的触发条件不同）。fixture 若省略该插件，AC-5/AC-7 会**在错误的配置上通过** |
| commit | 至少一个 `feat:` 提交（使版本可 bump） |

**版本兼容性证据（回答 R2-B-F11）**：`release-it@21.1.0` 与
`@release-it/conventional-changelog@12.0.2` 的组合**已由本次探针实测成功**
（生成 `CHANGELOG.md`、bump 版本、创建 tag、hook 写入的文件进入提交），非仅凭文档推断。

**关于 `scripts/write-version.cjs`（回答 R-2）**：该文件在本仓库**尚不存在**
（hook 引用它；探针中为临时创建）。因此它在**本 sprint 的交付物清单内**，必须新建。

**关于 AGENTS.md 的替换规则（回答 C-R5 R-10）**：`sync-version.cjs` 对 `AGENTS.md`
采用**锚定单行替换**——匹配 `> Updated: ` 开头的头部行，替换其中 `(vX.Y.Z)` 为新的
`(v<version>)`；**只替换首个匹配**，且要求格式精确匹配（`v` 前缀 + 三段数字）。
若头部行不存在或格式不符 → **非零退出**（不静默跳过），避免发布状态被静默破坏。

**`scripts/release.sh` 契约（回答 R2-B-F12）**：

| 项 | 定义 |
|----|------|
| 默认行为 | **dry-run**（`npx release-it --dry-run --ci`）——不传任何开关即安全 |
| 真发布 | 必须显式传 `--execute`（内部转成 `npx release-it --ci`） |
| 退出码 | 透传 release-it 的退出码（0 成功 / 非零失败），不吞错 |
| 前置检查 | 执行前断言 `VERSION` 与 `package.json` 版本一致；不一致则**非零退出**并提示先跑 bootstrap |
| 额外开关 | `--verbose` 透传给 release-it |

即：**默认 dry-run、真发布需显式 `--execute`**，与 D2「dry-run 为默认」一致。

### 7.5 AC-6 远端断言的前置检查（回答 R2-B-F2）

R2-B-F2 指出：`git ls-remote` 在无远端时会**挂起/超时/报错**，
而设计只说"不可用则记 skipped"，**未定义如何在执行前判定可用性**。
改为**显式前置检查**（不依赖捕获 `ls-remote` 的异常来做控制流）：

```bash
if git remote get-url origin >/dev/null 2>&1; then
  # 快照前后对比【整个 tag 集合】，而非只查当前版本（回答 R3-7）
  BEFORE="$(git ls-remote --tags origin | sort)"
  npx release-it --dry-run --ci
  AFTER="$(git ls-remote --tags origin | sort)"
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "::error::dry-run changed the remote tag set"
    exit 1
  fi
else
  echo "SKIPPED: no origin remote configured"   # 记为 skipped，绝不记为 passed
fi
```

⚠️ **R3-7 的修正**：v6 曾只断言"当前版本对应的 tag 不存在"——这**严格弱于**
AC-6 的"前后无新 tag"（若 dry-run 意外创建了**其他** tag 则漏检）。
改为**对整个 tag 集合做前后 diff**，与 AC-6 的措辞严格一致。

**关键**：跳过是**显式分支**（基于 `git remote get-url` 的前置探测），
不是靠 `ls-remote` 失败后兜底——后者会把真实错误误判为"不可用"而掩盖问题。

### 7.6 AC-16 与 GitHub Release 的先决条件（回答 C-R5 R-1）

⚠️ **诚实声明**：`github.release: true` 这条链路在本次所有实测中**从未被真正执行**——
探针使用 bare remote，且 `github.release` 设为 `false`（B5/B7 均未触发 github 插件）。
因此：

1. **先决条件**：执行真实发布的操作者必须提供 `GITHUB_TOKEN`（release-it `github.tokenRef`
   的默认变量名），且该 token 具备创建 Release 的权限。**这是未在 CI 中验证的假设。**
2. **AC-16 为首次发布的人工清单项**，因为 CI 无凭据、无法自动覆盖：
   - [ ] 确认 `GITHUB_TOKEN` 已设置且在环境中可见
   - [ ] 执行真实发布后，确认 GitHub 上出现对应 tag 的 Release
   - [ ] 确认 Release notes 来自生成的 CHANGELOG 段落
3. **明确记录为已知未验证面**（而非假装已覆盖）：这是本设计**唯一**未经实测的发布环节，
   首次真实发布即为该路径的首次执行。


#### ⚠️ 生产配置 delta 与首次发布的生产端复验（回答 R2-C-R5-2）

专家 C 指出一个**与 §0.4 同类的风险**：DD-009 要求"fixture 复刻生产配置"，
但 §7.4 强制两处覆盖（`github.release=false`、`requireBranch=false`），
而 §0.4 的教训恰恰是"**配置差异会改变 hook 行为**"。
因此存在真实缺口：**fixture 通过 ≠ 生产通过**。

**DD-009 的精确化（回答 R2-C-R5-2）**：

> 探针与 fixture **必须复刻所有参与 bump / hook 生命周期的配置**；仅允许两处**具名例外**，
> 且各自有理由：`github.release=false`（避开 token 依赖）、`requireBranch=false`（避开分支名不符）。
> 例外**不得**扩展到插件集合、hook 键、`npm.publish` 或 changelog 插件配置。

**是否探测 github 插件对 hook 时序的影响**：未探测。已知 bare `after:bump` 由
`plugins.at(-1)` 触发，而插件顺序为 `[...internal, ...external]`（`lib/index.js:126`）——
启用 github 插件可能改变 `at(-1)` 的归属。**因此首次发布必须做生产端复验。**

**首次发布人工清单（在 AC-16 之外新增，回答 R2-C-R5-2）**：

- [ ] 发布后立即在**真实仓库**上复跑 AC-7 断言：`VERSION` = `package.json` = `AGENTS.md`（三者一致）
- [ ] `git show --name-only HEAD` 含**四类文件**（`VERSION` / `package.json` / `AGENTS.md` / `CHANGELOG.md`）
- [ ] `git status --porcelain` 为空（无残留未提交的版本文件）
- [ ] 确认 GitHub Release 已创建且 body 非空（见 §4.2 的 `releaseNotes` 未核证项）
- [ ] 演练一次 §4.5 的恢复流程（在临时仓库，非生产）

**若生产端复验失败**：`release.sh` 的前置检查只比对 `VERSION`/`package.json`，
**无法**发现"hook 未写入"类缺陷。故该人工清单是当前**唯一**的生产端保障，不可省略。

---

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|
| opt-in 启用后忘记卸载，全局门禁持续失效 | 高 | 默认不装；安装显著警告；`--uninstall` 记录-恢复；文档声明 |
| 零 tag 时 `tagName` 退化为无前缀 | 中 | **显式**配置 `git.tagName`（§0.2 实测推断逻辑） |
| `fetch-depth: 1` 致范围校验静默失效 | 中 | 显式 `fetch-depth: 0` + base ref 缺失即失败 |
| `after:bump` 失败致版本半更新 | 中 | 钩子非零退出使 release 中止；dry-run 先验 |
| 首跑产出错误版本 | 中 | bootstrap（AC-11）+ 默认 dry-run |
| **hook 键在配置变化后静默失效**（§0.4 实证） | **高** | 只用 bare `after:bump`；§4.6 端到端断言；升级 release-it/changelog 插件必须重跑 |
| **fixture 绿≠生产绿**（配置 delta，R2-C-R5-2） | 中 | DD-009 精确化；首次发布做生产端复验（§7.6 清单） |
| **Gate 0 行为因新增 `.cjs` 而翻转**（R2-C-R5-1） | 中 | 如实声明为有意改变；文档说明；§7.3 断言改用临时克隆 |
| **发布失败后的恢复路径未探测**（R3-8） | 中 | §4.5 规定本地+远端恢复步骤；首次发布前演练 |
| **squash 消息可在合并时被改写**（R2-A-F2） | 中 | §2.4 明示为已知局限；文档要求维护者保持合规；不声称全量强制 |
| **CI 若管道断裂会 fail-open**（R2-A-F1） | 中 | §5.4 运行时自检（已知坏输入必须被拒绝） |
| **`releaseNotes: null` 语义未核证**（R2-B-R5-10） | 低 | §4.2 标注；首次发布人工确认 body 非空 |
| **AC-8 探针可能污染仓库**（R2-C-R5-1） | 中 | §7.3 改为临时克隆中执行 + `rm -rf` 清理；不制造版本漂移 |
| 探针基线不一致致误判 hook 失效（本次实际踩到） | 低 | 探针必须从**一致基线**出发（VERSION == package.json） |
| 团队不适应规范 | 低 | 历史提交已合规；错误信息含示例 |

---

## 9. 待审批

以下三项已由用户在本次会话中裁定（详见 `.sprint-state/decisions.md`）：

| 项 | 用户裁定 |
|------|------|
| AC-10 为运维步骤，不计入代码验收 | ✅ 接受（DR-003） |
| opt-in 的"临时使本仓库全局门禁失效"是否可接受 | ✅ 接受，**保留可选 opt-in hook，默认不装**（DR-002） |
| §6 的 `sync-version.sh` 邻近修复是否纳入 | ✅ 纳入，并扩大为 + 新增 `sync-version.cjs`（DR-004） |

**R2 设计评审结论**：五轮评测均未达成 ≥90% 共识（0/3 APPROVED）；
但每轮 finding 均已逐条核验处置，且**第 4/5 轮发现了本 sprint 最严重的真实缺陷**
（§0.4 的 `after:version:bump` 静默失效）。详见 `.sprint-state/phase-outputs/` 下的评审记录。

