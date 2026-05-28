# Workflow Lifecycle Tests Plan

## Background

现有 66 个测试文件 / 678 个测试全部是**单点测试**——每个操作单独测，没有模拟"真实用户操作链路"的端到端工作流测试。

计划在 `tests/workflow-interview-lifecycle.test.ts` 中新增 2 个工作流测试，覆盖用户提出的 2 个基础场景及边界情况。

---

## Scenario 1: 访谈计划维护

**用户操作链路**: 创建访谈模板 → 创建访谈计划 → 删除访谈计划 → 删除访谈模板

### Happy Path

```typescript
it('should complete: create template → create plan → delete plan → delete template')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | POST /admin/api/templates 创建模板(DRAFT) | 201, DB 存在 |
| 2 | POST /api/plans 创建计划(引用模板) | 200, DB 存在, plan.templateId == template.id |
| 3 | DELETE /admin/api/plans/:id 删除计划 | 200, DB 无此 plan |
| 4 | DELETE /admin/api/templates/:id 删除模板 | 200, DB 无此 template |

### Boundary: 先删模板（被计划引用）

```typescript
it('should reject: delete template when associated plan exists')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | 创建模板 | 201 |
| 2 | 创建计划(引用模板) | 200 |
| 3 | DELETE /admin/api/templates/:id **先删模板** | **409** 不能删（有关联计划） |
| 4 | DELETE /admin/api/plans/:id 删计划 | 200 |
| 5 | DELETE /admin/api/templates/:id 再删模板 | 200 |

### Boundary: 删除有已结束访谈的计划

```typescript
it('should reject: delete plan when completed interviews exist')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1-2 | 创建模板 + 计划 | 成功 |
| 3 | 创建 interview(COMPLETED, planId=plan.id) | 成功 |
| 4 | DELETE /admin/api/plans/:id | **409**（有关联访谈） |

---

## Scenario 2: 访谈分析

**用户操作链路**: 创建模板 → 创建计划 → 发布计划 → 执行访谈 → 生成报告 → ~~导出报告~~ → 生成聚合分析 → ~~导出分析~~

### ⚠️ 已知限制

- **导出报告**: 项目无"导出报告"的 API endpoint（只有 `GET /api/templates/export` 模板导出，report/analysis 只有 DB 内查询）
- **导出分析**: 同样无导出 API
- 这两个步骤在测试中标记为 **NOT_IMPLEMENTED**，建议后续增加导出功能后再补测

### Happy Path

```typescript
it('should complete: create template → create plan → publish → execute → report → analysis')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | POST /admin/api/templates 创建模板 | 201 |
| 2 | POST /api/plans 创建计划(PENDING) | 200 |
| 3 | POST /api/plans/:id/invitees 导入受访者 | 200, success > 0 |
| 4 | POST /api/plans/:id/send 发送邀请 = 发布 | 200（使计划进入 SENDING 流程） |
| 5 | 直接创建 Interview(COMPLETED) + Message + Response | DB 存在 |
| 6 | POST /api/analysis/single { interviewId } | 200, report 生成 |
| 7 | GET /api/analysis/report/:interviewId 获取报告 | 200, content 存在 |
| 8 | POST /api/analysis/aggregate/:planId 生成聚合分析 | 201, batchReportId 返回 |
| 9 | GET /api/analysis/aggregate/:batchReportId 获取聚合报告 | 200, metrics/topics/emergents 存在 |

### Boundary: 分析未完成的访谈

```typescript
it('should reject: analyze incomplete interview (ACTIVE status)')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1-4 | 创建模板 + 计划 + 受访者 + 发送 | 成功 |
| 5 | 创建 Interview(ACTIVE, 无 completedAt) | 成功 |
| 6 | POST /api/analysis/single { interviewId } | **500/400**（访谈未完成） |

### Boundary: 聚合分析时计划无已完成访谈

```typescript
it('should reject: batch aggregate with no completed interviews')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1-4 | 同上 | 成功 |
| 5 | 创建 Interview(PENDING, planId=plan.id) | 成功 |
| 6 | POST /api/analysis/aggregate/:planId | **400**（无 completed interviews） |

### Boundary: 重复聚合分析

```typescript
it('should reject: duplicate aggregate analysis (already RUNNING)')
```

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1-6 | 同上 happy path | 成功 |
| 7 | POST /api/analysis/aggregate/:planId 再次聚合 | **409**（已有 RUNNING 报告） |

---

## 测试设计说明

### 方法论
这次计划不再仅凭经验枚举，而是参考了 Yoni Goldberg 的 Node.js Testing Best Practices：
- **5 退出点验证**: 每个测试验证 HTTP 状态码 + DB 状态变更
- **AAA 模式**: Arrange(创建数据) → Act(调用 API) → Assert(验证)
- **每个测试独享数据**: 每个测试在 beforeAll 中创建自身完整数据链，afterAll 清理
- **三要素命名**: `{workflow} when {scenario} should {expectation}`
- **测试菱形**: 80% 组件测试（真实 HTTP + 真实 DB），非纯单元测试

### 文件结构
```
tests/workflow-interview-lifecycle.test.ts

describe('Workflow: Interview Plan Maintenance')
  ✓ happy path: create template → create plan → delete plan → delete template
  ✓ boundary: delete template when associated plan exists (409)
  ✓ boundary: delete plan when completed interviews exist (409)

describe('Workflow: Interview Analysis')
  ✓ happy path: create template → create plan → publish → execute → report → analysis
  ✓ boundary: analyze incomplete interview (500)
  ✓ boundary: batch aggregate with no completed interviews (400)
  ✓ boundary: duplicate aggregate analysis (409)
```

总计 **7 个测试**，覆盖 2 个工作流的 happy path + 5 个边界场景。
