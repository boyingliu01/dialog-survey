# Test-Specification Alignment Plan (Scheme B)

## Project: dialog-survey

## Current State: 149 tests, 88.39% coverage, 0 TypeScript errors

---

## Objective

为 dialog-survey 项目的 149 个测试添加完整的 `@test` / `@intent` / `@covers` 注解，实现测试与 specification.yaml 的完全可追溯。

---

## Scope

### In Scope

- 19 个测试文件的注解补充
- 51 个 REQ-\* 的映射覆盖
- 生成 Alignment Report

### Out of Scope

- 不添加新测试
- 不修改业务代码

### In-Scope with Conditions (重要修复)

- **可以修改测试逻辑的情况**：
  - 当分析测试时发现测试与 REQ 不匹配
  - 需要记录在 `test-mismatch-log.md` 中
  - 修改后需运行测试验证
  - 确保不会引入新的 bug

---

### Escalation Mechanism (新增)

| 情况                | 处理方式                                   |
| ------------------- | ------------------------------------------ |
| 测试覆盖的 REQ 明确 | 正常添加注解                               |
| 测试与 REQ 无法匹配 | 记录到 mismatch log，标记为 "需要人工确认" |
| 发现测试本身有 bug  | 修复测试，记录变更原因                     |
| REQ 没有对应测试    | 记录到缺失测试清单                         |

---

## Detailed Work Breakdown

### Phase 0: Preparation (预计 30 分钟)

| Task | Description                                                  | Input              | Output       |
| ---- | ------------------------------------------------------------ | ------------------ | ------------ |
| 0.1  | 解析 specification.yaml，提取所有 REQ-_ 和 AC-_              | specification.yaml | REQ/AC 清单  |
| 0.2  | 列出所有测试文件和测试用例数量                               | tests/\*.test.ts   | 测试清单     |
| 0.2b | **（新增）分析现有注解基线** - 统计已有哪些测试有 @test 注解 | tests/\*.test.ts   | 基线数据     |
| 0.3  | 创建 REQ → Test 映射模板                                     | 模板文件           | 空映射表     |
| 0.4  | **（新增）创建反向验证机制** - 确保所有 REQ 都有测试覆盖     | REQ清单 + 测试清单 | 缺失覆盖清单 |

**产出**:

- `docs/test-alignment/req-test-mapping.md`
- `docs/test-alignment/baseline.json` - 当前注解基线
- `docs/test-alignment/coverage-gap.md` - 缺失覆盖清单

---

### Phase 1: Analysis - 逐文件分析 (预计 2-3 小时)

按文件逐个分析，每个文件：

| 步骤 | 操作                                  | 产出                 |
| ---- | ------------------------------------- | -------------------- |
| 1.1  | 读取测试文件，理解测试逻辑            | 理解每个 it() 的意图 |
| 1.2  | 对照 specification.yaml，找对应的 REQ | 匹配的 REQ 列表      |
| 1.3  | 确定覆盖的 AC                         | AC 列表              |
| 1.4  | 编写 JSDoc 注解                       | 添加到测试文件       |

**文件清单与预估时间**:

| 文件                              | 测试数 | 预估时间 |
| --------------------------------- | ------ | -------- |
| dingtalk-services.test.ts         | 13     | 25 min   |
| dingtalk-signature.test.ts        | 12     | 25 min   |
| interview-plan.test.ts            | 12     | 30 min   |
| langgraph.test.ts                 | 11     | 25 min   |
| utils.test.ts                     | 10     | 20 min   |
| analysis-features.test.ts         | 10     | 25 min   |
| env-config.test.ts                | 8      | 15 min   |
| prisma-schema.test.ts             | 8      | 15 min   |
| state-persistence.test.ts         | 8      | 15 min   |
| llm-followup-report.test.ts       | 8      | 20 min   |
| health-check.test.ts              | 7      | 15 min   |
| template-crud.test.ts             | 7      | 15 min   |
| webhook-message.test.ts           | 6      | 12 min   |
| template-import-export.test.ts    | 6      | 12 min   |
| template-version.test.ts          | 5      | 10 min   |
| logger.test.ts                    | 5      | 10 min   |
| interview-plan-additional.test.ts | 5      | 10 min   |
| project-structure.test.ts         | 5      | 10 min   |
| template-schema.test.ts           | 3      | 6 min    |

**总计**: 149 测试，预计 3-4 小时

---

### Phase 2: Annotation Format

采用以下标准格式：

```typescript
/**
 * @test REQ-XXX-Y-ZZ
 * @intent <测试意图的中文描述>
 * @covers AC-XXX-Y-ZZ-01, AC-XXX-Y-ZZ-02 (可选)
 */
it("测试描述", async () => {
  // test implementation
});
```

> **注意**: REQ 格式为 `REQ-任务号-子任务号-序号`，例如 `REQ-001-1-01`、`REQ-007-2-01`

**示例**:

```typescript
/**
 * @test REQ-007-2-01
 * @intent 验证创建访谈计划功能正常工作，返回计划ID
 * @covers AC-007-2-01-01, AC-007-2-01-02
 */
it("should create a plan with correct data", async () => {
  // ...
});
```

---

### Phase 3: Verification (预计 30 分钟)

| Task | Description                                              |
| ---- | -------------------------------------------------------- |
| 3.1  | 运行 `npm test` 确保所有测试通过                         |
| 3.2  | 运行 `npm run type-check` 确保无 TS 错误                 |
| 3.3  | **（新增）注解完整性验证** - 检查每个测试都有 @test 注解 |
| 3.4  | **（新增）反向验证** - 确保所有 51 个 REQ 都有对应测试   |
| 3.5  | **（新增）生成 Alignment Report** - 覆盖率矩阵           |

---

### Phase 4: Report (预计 15 分钟)

生成 Alignment Report：

```markdown
## Alignment Report

### Summary

- Total Tests: 149
- Annotated: 149
- Coverage: 100%

### Coverage Matrix

| REQ-ID       | Test Coverage                           |
| ------------ | --------------------------------------- |
| REQ-001-1-01 | template-crud.test.ts::should create... |
| ...          | ...                                     |

### Status

✅ Complete
```

---

## Verification Scripts (新增)

### 注解完整性检查脚本

```bash
#!/bin/bash
# scripts/verify-annotations.sh

# 检查所有测试文件是否有 @test 注解
for file in tests/*.test.ts; do
  count=$(grep -c "@test REQ-" "$file")
  test_count=$(grep -c "it('" "$file")
  echo "$file: $count/$test_count annotated"
done
```

### REQ 覆盖检查脚本

```bash
#!/bin/bash
# scripts/verify-req-coverage.sh

# 提取所有 @test 标签中的 REQ-ID
grep -oh "@test REQ-[0-9]*-[0-9]*-[0-9]*" tests/*.test.ts | \
  sort -u > /tmp/annotated-reqs.txt

# 提取 specification.yaml 中的所有 REQ-ID
grep -o "REQ-[0-9]*-[0-9]*-[0-9]*" specification.yaml | \
  sort -u > /tmp/all-reqs.txt

# 找出缺失的 REQ
comm -23 /tmp/all-reqs.txt /tmp/annotated-reqs.txt
```

| Risk            | Likelihood | Impact | Mitigation                                             |
| --------------- | ---------- | ------ | ------------------------------------------------------ |
| 改错测试逻辑    | Medium     | High   | 使用 escalation mechanism 记录变更，每次修改后运行测试 |
| REQ 映射错误    | High       | Medium | 交叉检查 + 反向验证脚本                                |
| 时间超支        | Medium     | Medium | 分批执行，每批验证                                     |
| 遗漏注解        | Medium     | Low    | 自动化验证脚本扫描                                     |
| 测试与REQ不匹配 | Medium     | High   | 记录到 mismatch log，允许修改测试，并验证通过          |

---

## Execution Strategy

### 批量执行

- 每 10 个文件为一组
- 每组完成后运行测试验证
- 确保不破坏现有功能

### Checkpoint

- Checkpoint 1: Phase 0 完成
- Checkpoint 2: Phase 1 完成 50%
- Checkpoint 3: Phase 1 完成 100%
- Checkpoint 4: Phase 2 + 3 完成

---

## Success Criteria

- [ ] 所有 149 个测试都有 @test 注解
- [ ] 所有 51 个 REQ 都有对应测试（反向验证）
- [ ] 注解完整性验证脚本运行通过
- [ ] REQ 覆盖检查显示 100% 覆盖
- [ ] 所有测试仍然通过
- [ ] TypeScript 0 错误
- [ ] Alignment Score >= 80%

---

## Timeline

| Phase   | Duration | Total    |
| ------- | -------- | -------- |
| Phase 0 | 30 min   | 30 min   |
| Phase 1 | 3-4 hr   | 4-4.5 hr |
| Phase 2 | 30 min   | 5-5.5 hr |
| Phase 3 | 30 min   | 6-6.5 hr |
| Phase 4 | 15 min   | 6-7.5 hr |

**预计总时长**: 6-7.5 小时

---

## Notes

- 采用 Legacy Mode 兼容模式（测试先于规范存在）
- 不修改测试逻辑，只添加注解
- 使用中文 @intent 描述便于理解
- 可以夜间运行，白天人工验收
