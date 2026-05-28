# Sprint Specification — 补充测试覆盖率达到质量门禁

## 目标

补充自动化单元测试，使覆盖率达到质量门禁要求：
- **行覆盖率**: 63.31% → ≥80%
- **函数覆盖率**: 63.93% → ≥80%
- **分支覆盖率**: 52.92% → ≥70%
- **语句覆盖率**: 63.21% → ≥80%

## 约束

1. **测试层级**：优先在接口层次进行集成测试，连接真实 PostgreSQL 数据库，避免过度 mock
2. **测试质量**：应用 Stryker 变异测试提升测试用例质量
3. **遗留问题不重踩**：不使用 mock Prisma，不做纯函数 mock 测试
4. **TypeScript strict mode, ESM, .js 导入**
5. **Biome: `noExplicitAny: warn`** — 避免 `any`

## 当前缺口分析

| 指标 | 当前 | 目标 | 差距 |
|------|------|------|------|
| Lines | 63.31% | 80% | +16.69% |
| Functions | 63.93% | 80% | +16.07% |
| Branches | 52.92% | 70% | +17.08% |
| Statements | 63.21% | 80% | +16.79% |

## 实施 REQ 明细

### REQ-1: MessageRepository 集成测试（最高优先级）
**文件**: `src/repositories/message.repository.ts` (49 行，4 个 public 方法)
**当前**: 60% lines, 61% branches, 38% functions — 无任何测试文件
**策略**: 
- 创建 `tests/message-repository.test.ts`
- 每个方法：success + error + edge case
- 使用真实 PrismaClient 连接 PostgreSQL
- 测试前清理测试数据，测试后清理
**预计贡献**: +~8% lines, +~5% functions, +~4% branches

### REQ-2: Security 工具函数集成测试
**文件**: `src/utils/security.ts` (101 行，4 个公开函数 + middleware)
**当前**: 33% coverage — 无测试文件
**策略**:
- 创建 `tests/security.integration.test.ts`
- `anonymizeData()`: 多种输入（手机号、邮箱、身份证号、无匹配、混合）
- `generateApiKey()`: 格式验证、唯一性
- `logSecurityEvent()`: 真实 Prisma 写入，验证 AuditLog 表记录
- `verifyApiKey()`: 有效 key / 无效 key / 无 key — 需要测试 API key 生命周期
- `securityMiddleware()`: 中间件行为 — 跳过 /health + /webhook，记录其他请求
**预计贡献**: +~7% lines, +~4% functions, +~3% branches

### REQ-3: InterviewStateRepository 补充测试
**文件**: `src/repositories/interview-state.repository.ts` (390 行)
**当前**: ~96% lines, ~72% branches, ~90% functions
**策略**:
- 在 `tests/state-persistence.test.ts` 基础上补充 3 个分支
- 乐观锁冲突重试（乐观锁失败重试分支）
- 保存时 pendingMessages/pendingResponses 合并逻辑
- 真实 Prisma 集成
**预计贡献**: +~1% lines, +~1% functions, +~4% branches

### REQ-4: Followup.service.ts 补充集成测试
**文件**: `src/services/followup.service.ts` (173 行)
**当前**: 67% lines, 67% branches, 83% functions
**策略**:
- 在已有 `tests/followup.test.ts` 基础上补充
- `smartTruncate()` 边界情况测试（中文标点截断，英文标点截断，超长文本等）
- `parseLLMResponse()` 补充 JSON 包裹的各种解析场景
- 注意：generateSmartResponse 涉及 LLM 调用——mock LLM 部分，保留业务逻辑验证
**预计贡献**: +~3% lines, +~2% functions, +~3% branches

### REQ-5: DingTalk Stream Client 分支补充
**文件**: `src/integrations/dingtalk/stream-client.ts` (358 行)
**当前**: ~78% lines, ~60% branches
**策略**:
- 在已有 `tests/dingtalk-stream.test.ts` 基础上补充
- 错误重试分支、连接断开重连、超时处理
- Mock WebSocket，但验证完整业务逻辑
**预计贡献**: +~4% lines, +~2% functions, +~5% branches

### REQ-6: Core/Nodes 分支补充
**文件**: `src/core/nodes/analyzing.ts` + `src/core/nodes/interviewing.ts`
**当前**: analyzing 50% branches, interviewing ~65% branches
**策略**:
- 补充错误处理分支
- Mock LLM 调用，保留状态机逻辑验证
**预计贡献**: +~2% lines, +~1% functions, +~3% branches

### REQ-7: Unused Utilities 补充测试
**文件**: `src/utils/encryption.ts`, `src/utils/validation.ts`, `src/utils/date.ts`, `src/utils/rate-limiter.ts`
**当前**: 从未被 import
**策略**: 创建 `tests/util-encryption.test.ts`, `tests/util-validation.test.ts`, `tests/util-date.test.ts`, `tests/util-rate-limiter.test.ts`
**预计贡献**: +~5% lines, +~2% functions, +~2% branches

### REQ-8: Stryker 变异测试工具配置
**策略**:
- 安装 `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` + `@stryker-mutator/typescript`
- 配置 `stryker.config.json`
- 运行变异测试，验证新增测试用例质量
- 变异存活目标 ≥ 80%

## 执行顺序

```
Phase 1: 基础设施 → REQ-8 (Stryker)
Phase 2: 集成测试 → REQ-1 → REQ-2 → REQ-3 (真实 DB 测试)
Phase 3: 分支补充  → REQ-4 → REQ-5 → REQ-6
Phase 4: 工具测试  → REQ-7
Phase 5: 验证     → vitest --coverage + stryker run
```

## 验收标准

1. `vitest run --coverage` 满足阈值要求
2. `npx stryker run` 变异存活率 ≥ 80%
3. `tsc --noEmit` 通过
4. `biome check src tests` 通过
