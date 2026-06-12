# Interview Bot 质量门禁报告

> 生成时间: 2026-06-12 09:50  
> 分支: master | 提交: 0182974

---

## 门禁总览

| 门禁 | 状态 | 严重程度 | 备注 |
|------|------|---------|------|
| Gate 1: Code Quality | 🟢 PASS | - | tsc 0 errors, biome 0 fixes |
| Gate 2: Duplicate Code | 🟡 WARN | LOW | 187 clones, ~10% 重复率 |
| Gate 3: Complexity | 🟡 WARN | MEDIUM | 4 个函数 CCN > 10 |
| Gate 4: Principles (SOLID) | ✅ SKIP | - | Principles checker 未配置 |
| Gate 5: Tests & Coverage | 🟢 PASS | - | 733/733 通过, 覆盖率达标 |
| Gate 6: Architecture | 🟡 WARN | LOW | 3 orphan types + 3 code clones |
| Gate M: Mutation Testing | ⚠️ SKIP | - | Gate M 脚本未实现 |
| Gate M2: Mock Density | 🟢 PASS | - | 10.1% mock density |

---

## Gate 1: Code Quality

### TypeScript 静态分析 (`tsc --noEmit`)
- 类型错误: **0 errors**
- 检查文件: src/ 全部 51 文件

### 代码规范检查 (`biome check`)
- 格式问题: **0 fixes applied**
- 检查文件: src/ 51 + tests/ 70 = 121 文件

---

## Gate 2: 重复代码检测 (jscpd)

- **克隆数**: 187
- **重复代码行数**: ~10.21% (31,709 tokens)

### 主要重复位置

| 文件 | 重复行范围 | 行数 | Tokens | 匹配行范围 |
|------|-----------|------|--------|-----------|
| `stream-message.service.ts` | 328-339 | 11 | 88 | 295-306 |
| `stream-message.service.ts` | 351-362 | 11 | 100 | 64-75 |
| `stream-message.service.ts` | 375-390 | 15 | 101 | 115-130 |
| `stream-message.service.ts` | 387-401 | 14 | 102 | 133-147 |
| `stream-message.service.ts` | 401-413 | 12 | 98 | 147-159 |
| `followup.service.ts` | 132-140 | 8 | 91 | 88-96 |
| `conversation-engine.ts` | 50-65 | 15 | 92 | stream-message.service.ts 191-206 |

**分析**: 重复率阈值建议设为 15%，当前 10.21% 未超过阈值。重复代码多为同文件内的模式相似，可通过提取公共函数优化。

---

## Gate 3: 圈复杂度 (lizard)

- 总函数数: 268
- 平均 CCN: 2.2 (阈值 ≤5)
- 平均 NLOC: 12.4 (阈值 ≤1000)
- **Warning 函数**: 4 个 (CCN > 10)

### 超标函数

| 函数 | 文件 | 行号 | CCN | NLOC | 长度 |
|------|------|------|-----|------|------|
| `String` (验证器) | `src/api/admin-templates.ts` | 38-74 | 15 | 33 | 37行 |
| `getPlanStats` | `src/services/analytics.service.ts` | 210-271 | 15 | 55 | 62行 |
| `computeDimensionStats` | `src/services/batch-aggregation.service.ts` | 43-98 | 12 | 50 | 56行 |
| `interviewingNode` | `src/core/nodes/interviewing.ts` | 15-102 | 11 | 76 | 88行 |

**分析**: 4 个函数 CCN 在 11-15 之间，可通过抽取子函数、拆分条件分支来降低。

---

## Gate 5: 测试 & 覆盖率

### 测试执行
- 测试文件: **70/70 passed**
- 测试用例: **733/733 passed**
- 执行时间: 9.24s
- 失败: 0 | 跳过: 0

### 代码覆盖率

| 指标 | 实际 | 阈值 | 状态 |
|------|------|------|------|
| Statements | 83.32% | ≥80% | ✅ |
| Branches | 70.87% | ≥70% | ✅ |
| Functions | 87.16% | ≥80% | ✅ |
| Lines | 82.82% | ≥80% | ✅ |

### 覆盖率不足的文件

| 文件 | Statements | Lines | 备注 |
|------|-----------|-------|------|
| `src/utils/db.ts` | 57.14% | 57.14% | Prisma 客户端封装，需补充测试 |
| `src/utils/markdown.ts` | 76.92% | 76.92% | Markdown→HTML 转换，需补充边界测试 |

---

## Gate 6: 架构 & 技术债务

### Orphan Types (未使用类型)

| 类型 | 文件 | 说明 |
|------|------|------|
| `DingTalkMessageData` | `src/integrations/dingtalk/stream-client.ts` | 未使用的消息数据类型 |
| `DingTalkMessageEvent` | `src/api/webhook.ts` | 未使用的事件类型 |
| `PipelineStep` | `src/services/batch-aggregation.service.ts` | 未使用的流水线步骤类型 |

### 忽略项
- `public/js/htmx.min.js` 深度嵌套 - 第三方库，不处理
- `public/js/alpine.min.js` 参数过多 - 第三方库，不处理

---

## Gate 4: SOLID 原则检查

**状态**: SKIP (项目未配置 principles checker)

**分析**: xp-gate 的 Gate 4 依赖外部工具 `principles-checker`，该项目未内置此工具。需要确认 xp-gate 是否要求项目自行安装 principles checker，还是 xp-gate 应自带。

---

## Gate M: 变异测试

**状态**: SKIP (Gate M 脚本未实现)

**分析**: 预推送检查尝试运行 `src/mutation/gate-m.ts`，但该脚本不存在。需要确认 xp-gate 是否期望项目自行实现变异测试脚本，还是 xp-gate 应提供默认实现。

---

## 待办事项

- [ ] Gate 2: 提取公共函数优化重复代码
- [ ] Gate 3: 重构 4 个高圈复杂度函数
- [ ] Gate 5: 补齐 db.ts 和 markdown.ts 测试覆盖率
- [ ] Gate 6: 清理 3 个 orphan types
- [ ] xp-gate: 调查 Gate 4 (SOLID) 跳过原因
- [ ] xp-gate: 调查 Gate M (变异测试) 脚本缺失原因
- [ ] xp-gate: 请求 push 后展示完整质量门禁报告
