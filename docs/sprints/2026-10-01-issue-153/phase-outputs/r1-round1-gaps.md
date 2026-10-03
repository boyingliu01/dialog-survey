# R1 需求评审 — Round 1 结果（GAPS_FOUND）

- **模式**: `requirements`
- **轮次**: 1 / 最多 5
- **裁决**: **3/3 GAPS_FOUND**（共识 0.0）
- **head_commit**: f37235f

## 专家裁决

| 专家 | 角色 | requested_model | 裁决 | 置信 |
|------|------|-----------------|------|------|
| Expert A | architecture | `whalecloud/g-qwen3.8-flash` | GAPS_FOUND | 8/10 |
| Expert B | technical | `whalecloud/g-deepseek-flash` | GAPS_FOUND | 7/10 |
| Expert C | feasibility | `whalecloud/g-glm-5.3-flash` | GAPS_FOUND | 7/10 |

## 汇总缺口（去重后）

### Critical（必须在进入设计前解决）

| # | 缺口 | 提出者 |
|---|------|--------|
| C1 | **发布触发器未定义**：push to master？merge？手动 dispatch？semantic-release 与 release-it 的触发模型根本不同，两个工程师会造出不兼容的流水线 | B-F1 |
| C2 | **工具选择悬空**（"semantic-release 或 release-it"）：二者不可互换，直接决定 AC-6/AC-7 能否达成 | B-F2 |
| C3 | **AC-7 与既有扇出方向冲突且未定真源**：release 工具默认改 package.json，而现有 `sync-version.sh` 是 VERSION → package.json，自动化后必然漂移 | B-F3 / A-1 / C-F4 |
| C4 | **husky vs AC-8 的内部矛盾未解决**：目标写 husky，但约束 #2 指出 husky 会覆盖 core.hooksPath 从而违反 AC-8 | B-F7 / C-F1 |

### Major

| # | 缺口 | 提出者 |
|---|------|--------|
| M1 | **AC-8 无可验证手段**——需具体检查程序 | B-F5 / C-F9 |
| M2 | **AC-9 幂等/卸载语义未定义**——卸载是否恢复原 hooksPath？ | B-F6 / A-3 / C-F8 |
| M3 | **AC-4 提交范围未定义**——只查 head？全范围？fail 还是 warn？ | B-F4 |
| M4 | **AC-4 的"被拒绝"需要分支保护 required check**——超出"仅新增 CI job"范围，且需仓库管理员权限（未声明的假设） | C-F5 |
| M5 | **发布 bootstrap 未定义**：当前 VERSION=1.10.0 但**零 git tag**，首次自动化发布会算出与 1.10.0 无关的版本；tag 前缀（`v1.10.0` vs `1.10.0`）也未定 | C-F3 |
| M6 | **依赖 xp-gate Tier-2 会转发 commit-msg 的假设未经验证**，且无回退方案 | C-F2 |

### Minor

| # | 缺口 | 提出者 |
|---|------|--------|
| m1 | AC-1「规则正确」主观不可测——需点名 preset 与覆盖项 | B-F8 / C-F7 |
| m2 | AC-5 CHANGELOG 目标文件/格式未定，与手工条目共存方式未定 | B-F9 / C-F10 |
| m3 | GitHub Release 内容/草稿/预发布未定 | B-F10 |
| m4 | CI 密钥与环境假设未声明（token 权限、分支保护） | B-F11 / C-F11 |
| m5 | 新 CI job 与现有 7 job 的依赖顺序未定 | B-F12 / A-4 |
| m6 | 合并策略（squash→PR 标题才是关键）与 ignores 未定 | C-F6 |
| m7 | 目标用户/角色与已知局限未声明（本地强制仅覆盖装了 xp-gate 的机器） | C-F11 |
| m8 | 现状表被当作"实测"但未附证据 | C-F12 |

---

## ⚠️ 本次评审最有价值的发现：M6 已被实测证伪

Expert C 的 F-2 提出了一个**可立即验证**的假设，并给出了升级条件
（"若该缝不转发 commit-msg，则升级为 Critical，因为没有不违反 AC-8 的回退方案"）。
我据此执行了 spike：

```
# 1) core.hooksPath = 全局 xp-gate 路径时，创建 <repo>/githooks/commit-msg
#    结果：提交时 SPIKE_COMMIT_MSG_FIRED 从未打印 → 完全被忽略

# 2) 将 core.hooksPath 临时指向 githooks/ 后重试
#    结果：SPIKE_COMMIT_MSG_FIRED with arg: .../COMMIT_EDITMSG → 触发
```

**结论：`<repo>/githooks/` 只用于解析 adapter 文件，不转发新的 hook 类型。**
我原先设计文档 §2.2/§4.1 中"用 githooks/commit-msg 作为零冲突缝"的方案
**是错的**，已作废。Expert C 的 F-2 升级为 **Critical（已验证）**。

同时发现 xp-gate 的 `install.sh` 项目模式是把 hook 装到 **`.git/hooks/`**（第 15/28 行），
而 `.git/hooks` 在设置了全局 `core.hooksPath` 时**完全被遮蔽**。
即：**全局模式与项目模式在设计上互斥**。

### 因此，本地 commit-msg 强制的可行路径只有三条（均有代价）

| 选项 | 做法 | 代价 |
|------|------|------|
| L1 | 保持现状，**仅 CI 强制** + 提供可选本地 opt-in | 本地无强制；但 AC-8 完好、零越权 |
| L2 | 把 `core.hooksPath` 改为仓库内目录，并**把 xp-gate hook 一并纳入仓库** | 彻底改变用户全局开发环境；其他项目受影响；需持续同步 xp-gate 升级 |
| L3 | 向**全局** xp-gate hooks 目录新增 `commit-msg` | 修改用户全局配置；不可仓库追踪；违背"不修改 ~/.config/xp-gate"的既定边界 |

这三条都需要用户决策——它们都触碰"是否改动用户全局环境"这一越权边界。

---

## Status

```
verdict: GAPS_FOUND
round: 1
consensus_ratio: 0.0
escalation_needed: false
next: 回到需求补充（本轮直接发现设计前提被证伪），随后 Round 2 复审
```
