# Interview Bot

AI-powered interview robot with intelligent follow-up questions, multi-turn context memory, and voice input support.

## Features

- **AI智能追问**: 基于LLM的完全智能型追问能力
- **多轮上下文记忆**: 支持跨多天、多条消息的对话连贯性
- **语音输入**: 支持语音消息回答
- **异步消息式访谈**: 被访谈者可以在碎片时间回答
- **自动生成报告**: 访谈结束后自动生成Markdown报告
- **私有部署**: 数据全留存，确保安全性

## Tech Stack

- **对话引擎**: LangGraph.js
- **LLM服务**: 阿里云通义千问 (DashScope)
- **语音识别**: 阿里云Fun-ASR
- **消息平台**: 钉钉
- **数据存储**: PostgreSQL (Prisma ORM)
- **Web框架**: Fastify
- **语言**: TypeScript (strict mode)

## Quick Start

### 1. 安装依赖

```bash
cd interview-bot
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动服务

```bash
npm run dev
```

## 项目结构

```
interview-bot/
├── src/
│   ├── api/          # API层 (Fastify routes)
│   ├── core/         # 核心逻辑 (LangGraph StateGraph)
│   ├── services/    # 服务层 (LLM, ASR, 钉钉)
│   ├── repositories/ # 数据访问层 (Prisma)
│   └── utils/       # 工具函数
├── tests/           # 测试 (Vitest)
├── prisma/          # Prisma schema
├── templates/       # 访谈模板
├── reports/         # 生成的报告
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 开发命令

```bash
# 类型检查
npm run type-check

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 代码检查
npm run lint

# 构建
npm run build
```

## 部署

详见 [架构设计文档](../docs/plans/2026-03-07-interview-robot-architecture.md)