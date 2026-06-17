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
cd dialog-survey
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
dialog-survey/
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

### 环境要求

| 组件 | 版本/说明 |
|------|-----------|
| Node.js | >= 20.0.0 (推荐 v20 LTS) |
| PostgreSQL | 14+ |
| npm | 随 Node.js 自带 |
| 操作系统 | Linux / macOS / Windows |

### 部署步骤

#### 1. 克隆或复制项目

```bash
# 推荐: 从 Git 仓库克隆
git clone <repo-url> dialog-survey
cd dialog-survey

# 或: 直接拷贝项目目录到目标机器
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入实际配置值（见下方环境变量说明）
```

#### 4. 初始化数据库

```bash
npx prisma generate   # 生成 Prisma Client
npx prisma db push     # 同步 schema 到数据库
```

#### 5. 启动服务

**开发模式** (热重载):
```bash
npm run dev
# 默认监听 http://0.0.0.0:3001
```

**生产模式** (推荐用于长期运行):
```bash
npm run build   # 编译到 dist/
node dist/src/server.ts
```

或使用 PM2 管理进程:
```bash
npm install -g pm2
pm2 start dist/src/server.ts --name dialog-survey
pm2 save
pm2 startup  # 设置开机自启
```

### 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `3001` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/dialog_survey?schema=public` |
| `DASHSCOPE_API_KEY` | 阿里云通义千问 API Key | `sk-xxx` |
| `DINGTALK_APP_KEY` | 钉钉 AppKey | 开放平台获取 |
| `DINGTALK_APP_SECRET` | 钉钉 AppSecret | 开放平台获取 |
| `DINGTALK_AGENT_ID` | 钉钉 AgentId | 开放平台获取 |
| `PUBLIC_URL` | 公网回调地址 | `https://your-domain.com` |
| `FUN_ASR_API_KEY` | 阿里云 Fun-ASR API Key | 语音识别用 |
| `ENCRYPTION_KEY` | AES 加密密钥 | 32 字节 hex 字符串 |
| `ADMIN_API_KEY` | 管理后台 API Key | 自定义密钥 |
| `REPORTS_DIR` | 报告存储目录 | `./reports` |
| `LOG_LEVEL` | 日志级别 | `info` |

安全起见，`ENCRYPTION_KEY` 可通过 Node.js 生成:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 健康检查

服务启动后可访问:
```bash
curl http://localhost:3001/health
```

### Docker 部署 (推荐)

使用 Docker Compose 一键部署应用和 PostgreSQL 数据库。

#### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DingTalk、LLM、ASR 等实际配置值
```

#### 2. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 查看所有服务状态
docker-compose ps
```

#### 3. 验证部署

服务启动后，访问健康检查端点：
```bash
curl http://localhost:3001/health
```

#### 常用 Docker 命令

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看数据库日志
docker-compose logs -f postgres

# 进入数据库 shell
docker-compose exec postgres psql -U dialog_survey -d dialog_survey

# 重新构建应用镜像
docker-compose build --no-cache app
docker-compose up -d app
```

### 预提交检查 (开发时)

```bash
npm run type-check && npm run lint && npm run test:coverage
```