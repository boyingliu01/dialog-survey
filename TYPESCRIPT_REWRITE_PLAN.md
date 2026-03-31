# TypeScript 重写计划

## 目标
将现有 Python 代码逻辑不变地重写为 TypeScript，使用 TDD 方式确保完整测试覆盖。

## 技术栈
- **运行时**: Node.js 20+ + TypeScript 5.4+
- **框架**: Fastify (替代 FastAPI)
- **WebSocket**: ws (DingTalk Stream 模式)
- **ORM**: Prisma (替代 SQLAlchemy)
- **验证**: Zod (替代 Pydantic)
- **测试**: Vitest + @vitest/coverage-v8
- **Lint**: ESLint + @typescript-eslint/strict-type-checked
- **CI**: GitHub Actions

## 目录结构

```
src/
├── api/                    # API 路由 (Fastify)
│   ├── routes/
│   │   ├── webhook.ts      # Webhook handler
│   │   ├── interviews.ts   # Interview CRUD
│   │   └── templates.ts   # Template routes
│   └── plugins/
│       ├── auth.ts         # 认证插件
│       └── errorHandler.ts # 错误处理
├── core/                   # 业务逻辑
│   ├── graph/              # LangGraph 状态机
│   │   ├── state.ts        # InterviewState 类型
│   │   ├── nodes.ts        # 节点函数
│   │   └── graph.ts        # 图构建
│   └── templates/          # 模板加载
├── services/               # 外部服务
│   ├── llm/                # LLM 服务
│   │   ├── index.ts        # 统一接口
│   │   ├── dashscope.ts    # 阿里云
│   │   └── volcengine.ts   # 火山引擎
│   ├── asr.ts              # 语音识别
│   ├── dingtalk.ts         # 钉钉 API
│   └── streamHandler.ts    # Stream 模式
├── models/                 # 数据模型 (Prisma)
│   └── prisma/
│       └── schema.prisma
├── db/                     # 数据库连接
│   └── index.ts
├── types/                  # 全局类型
│   └── index.ts
├── utils/                  # 工具函数
│   ├── json.ts             # JSON 解析
│   ├── logger.ts           # 日志
│   └── validation.ts       # 验证
└── index.ts                # 入口

tests/
├── unit/                   # 单元测试
│   ├── core/
│   ├── services/
│   └── utils/
├── integration/            # 集成测试
│   └── api/
├── e2e/                    # E2E 测试
└── fixtures/               # 测试数据
    └── templates/
```

## 任务分解 (TDD 方式)

### Phase 1: 基础设施 (1-2 天)
- [ ] Task 1.1: 初始化 TypeScript 项目，配置 ESLint (严格模式)
- [ ] Task 1.2: 配置 Prisma ORM，创建数据库 schema
- [ ] Task 1.3: 配置 Vitest 测试框架，覆盖率报告
- [ ] Task 1.4: 配置 CI/CD (GitHub Actions)

### Phase 2: 核心类型与工具 (1 天)
- [ ] Task 2.1: 定义 InterviewState 类型 (Zod schema)
- [ ] Task 2.2: 实现 JSON 解析工具 (带 markdown 清洗)
- [ ] Task 2.3: 实现日志工具
- [ ] Task 2.4: 编写类型和工具的单元测试

### Phase 3: 数据库层 (1 天)
- [ ] Task 3.1: 实现 Interview CRUD 操作
- [ ] Task 3.2: 实现 Message CRUD 操作
- [ ] Task 3.3: 编写数据库层测试

### Phase 4: 外部服务 (1-2 天)
- [ ] Task 4.1: 实现 LLM 服务接口 (DashScope + Volcengine)
- [ ] Task 4.2: 实现 ASR 语音识别服务
- [ ] Task 4.3: 实现 DingTalk API 服务
- [ ] Task 4.4: 编写服务层测试 (mock 外部 API)

### Phase 5: LangGraph 状态机 (2 天)
- [ ] Task 5.1: 实现 State 类型和初始状态
- [ ] Task 5.2: 实现各个 Node 函数
- [ ] Task 5.3: 实现 Edge 条件和路由逻辑
- [ ] Task 5.4: 实现图构建和运行函数
- [ ] Task 5.5: 编写 LangGraph 单元测试

### Phase 6: API 层 (1-2 天)
- [ ] Task 6.1: 实现 Fastify 服务器和路由
- [ ] Task 6.2: 实现 Webhook handler (HTTP 模式)
- [ ] Task 6.3: 实现 Interview API 路由
- [ ] Task 6.4: 实现 Template API 路由
- [ ] Task 6.5: 编写 API 集成测试

### Phase 7: Stream 模式 (1 天)
- [ ] Task 7.1: 实现 WebSocket 连接管理
- [ ] Task 7.2: 实现 Stream handler
- [ ] Task 7.3: 实现消息去重逻辑
- [ ] Task 7.4: 编写 Stream 模式测试

### Phase 8: 集成与优化 (1-2 天)
- [ ] Task 8.1: 端到端测试
- [ ] Task 8.2: 性能测试
- [ ] Task 8.3: 代码审查和重构
- [ ] Task 8.4: 文档更新
- [ ] Task 8.5: 部署配置

## 并行任务分组

为了加速开发，以下任务可以并行进行：

**Group A - 基础设施** (独立)
- Task 1.1, 1.2, 1.3, 1.4

**Group B - 核心类型与工具** (依赖 Group A)
- Task 2.1, 2.2, 2.3, 2.4

**Group C - 数据库** (依赖 Group A)
- Task 3.1, 3.2, 3.3

**Group D - 外部服务** (依赖 Group B)
- Task 4.1, 4.2, 4.3, 4.4

**Group E - LangGraph** (依赖 Group B, C, D)
- Task 5.1, 5.2, 5.3, 5.4, 5.5

**Group F - API** (依赖 Group C, E)
- Task 6.1, 6.2, 6.3, 6.4, 6.5

**Group G - Stream** (依赖 Group F)
- Task 7.1, 7.2, 7.3, 7.4

## 验收标准

1. **功能对等**: 所有 Python 版本的功能在 TypeScript 版本中都能正常工作
2. **测试覆盖**: 代码覆盖率 >= 80%，关键路径 >= 90%
3. **类型安全**: 无 `any` 类型滥用，所有外部输入都有 Zod 验证
4. **性能**: API 响应时间 <= Python 版本的 120%
5. **文档**: 所有公共 API 有 JSDoc 注释

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LangGraph 在 TS 中不如 Python 成熟 | 使用 @langchain/langgraph 最新版，做好回退方案 |
| 时间超出预期 | 按 Phase 交付，每个 Phase 可独立使用 |
| 类型过于严格导致开发慢 | 初期允许部分 `unknown`，后期逐步收紧 |
| 测试覆盖不足 | 使用 TDD，每个功能必须先有测试 |
