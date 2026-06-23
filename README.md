# Dialog Survey

AI-powered interview robot that conducts async multi-turn interviews via DingTalk with intelligent follow-up questions, multi-turn context memory, and voice input support.

## Features

- **AI 智能追问**: 基于 LLM 的完全智能型追问能力
- **多轮上下文记忆**: 支持跨多天、多条消息的对话连贯性
- **语音输入**: 支持语音消息回答
- **异步消息式访谈**: 被访谈者可以在碎片时间回答
- **自动生成报告**: 访谈结束后自动生成 Markdown 报告
- **私有部署**: 数据全留存，确保安全性

## Tech Stack

- **对话引擎**: Custom LangGraph-inspired workflow (not StateGraph API)
- **LLM**: OpenAI-compatible API（支持本地部署：如 ollama / vLLM / LocalAI；也可对接云服务）
- **语音识别**: 阿里云 Fun-ASR
- **消息平台**: DingTalk Stream Mode (WebSocket)
- **数据存储**: PostgreSQL (Prisma ORM)
- **Web 框架**: Fastify 5.x
- **模板引擎**: Nunjucks (server-side views)
- **语言**: TypeScript (strict mode, ESM)

## Installation

```bash
# Interactive installation — prompts for each value
npx dialog-survey install

# Non-interactive installation (all required flags)
npx dialog-survey install \
  --db-url "postgresql://user:pass@localhost:5432/dialog_survey" \
  --dingtalk-client-id "xxx" \
  --dingtalk-client-secret "xxx" \
  --dingtalk-agent-id "xxx"

# Lifecycle management
npx dialog-survey start
npx dialog-survey stop
npx dialog-survey status
npx dialog-survey uninstall

# View help
npx dialog-survey help
```

**Prerequisites**: Node.js >=20, PostgreSQL 14+.
- **Linux**: [PM2](https://pm2.keymetrics.io/) (`npm install -g pm2`) recommended for production process management
- **Windows**: PM2 在 Windows 上的稳定性存在问题，CLI 会自动使用直接 `node` 启动（TypeScript 编译必须可用）

> For local LLM deployment, leave `--llm-api-key` empty during install;
> the service will connect to an OpenAI-compatible endpoint at `http://localhost:11434/v1`
> by default. Set `LLM_BASE_URL` and `LLM_MODEL` in the generated `.env` file if needed.

## Usage

After installation, use the CLI commands for lifecycle management:

```bash
# Start the service
npx dialog-survey start

# Stop the service
npx dialog-survey stop

# Check service status
npx dialog-survey status

# Uninstall completely
npx dialog-survey uninstall

# View help
npx dialog-survey help
```

## Quick Start (Development)

### 1. Install Dependencies

```bash
cd dialog-survey
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Initialize Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Start Service

```bash
npm run dev
```

## 项目结构

```
dialog-survey/
├── src/
│   ├── api/          # API 层 (Fastify routes)
│   ├── core/         # 核心逻辑 (LangGraph StateGraph)
│   ├── services/     # 服务层 (LLM, ASR, 钉钉)
│   ├── repositories/ # 数据访问层 (Prisma)
│   ├── integrations/ # 外部服务集成
│   ├── domains/      # 领域实体
│   ├── middleware/   # Fastify 中间件
│   ├── views/        # Nunjucks 模板
│   └── utils/        # 工具函数
├── tests/            # 测试 (Vitest)
├── scripts/          # CLI 脚本和部署脚本
├── prisma/           # Prisma schema 和迁移
├── templates/        # 访谈模板
├── reports/          # 生成的报告
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
# 推荐：从 Git 仓库克隆
git clone <repo-url> dialog-survey
cd dialog-survey

# 或：直接拷贝项目目录到目标机器
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

**Linux / macOS** — 使用 PM2 管理进程：
```bash
npm install -g pm2
npm run build   # 编译到 dist/
pm2 start dist/src/server.ts --name dialog-survey
pm2 save
pm2 startup  # 设置开机自启
```

**Windows** — 直接使用 Node 启动（PM2 在 Windows 上不稳定）：
```bash
npm run build   # 编译到 dist/
node dist/src/server.ts
```

### 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `3001` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/dialog_survey?schema=public` |
| `LLM_BASE_URL` | LLM 服务地址（OpenAI-compatible），指向本地或云服务 | `http://localhost:11434/v1` |
| `LLM_API_KEY` | LLM API Key | `sk-xxx` |
| `LLM_MODEL` | LLM 模型名称 | `qwen2.5` |
| `DINGTALK_CLIENT_ID` | 钉钉 Client ID | 开放平台获取 |
| `DINGTALK_CLIENT_SECRET` | 钉钉 Client Secret | 开放平台获取 |
| `DINGTALK_AGENT_ID` | 钉钉 Agent ID | 开放平台获取 |
| `DINGTALK_APP_KEY` | 钉钉 AppKey | 开放平台获取 |
| `DINGTALK_APP_SECRET` | 钉钉 AppSecret | 开放平台获取 |
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
