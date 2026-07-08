# Dialog Survey

> **把钉钉对话转化成结构化洞察。**
>
> 一款 AI 驱动的异步对话机器人，通过钉钉自动进行多轮问卷对话——具备 LLM 智能追问、跨消息上下文记忆、以及自动化报告生成能力。

[![Version](https://img.shields.io/badge/version-1.8.1-blue)](https://github.com/boyingliu01/dialog-survey)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## 快速开始

```bash
# 一键安装——交互式提示填入各项配置
npx dialog-survey install

# 启动服务
npx dialog-survey start

# 完成。你的对话机器人已经在钉钉上就绪。
```

**环境要求：** Node.js >= 20、PostgreSQL 14+、一个钉钉应用（Client ID / Secret / Agent ID）

---

## Why — 为什么做这个项目？

**一对一交流的效果非常好。** 优秀的沟通者能建立信任、听懂弦外之音、在恰当时刻追问关键问题——但和几百上千人逐一深谈，成本太高，难以规模化。

**问卷调查能覆盖大量人群**，但深度有限——固定的问卷无法在受访者说出意料之外的答案时灵活追问。

Dialog Survey 填补了这两者之间的空白：**比问卷深入，比人工对话广泛。** AI 驱动的对话机器人能像人类一样对有价值的回答进行深入追问，同时通过钉钉并行触达成百上千位参与者。它不会取代真实的对话——但当需要从大规模人群中获取结构化的一手信息时，这是最接近人工沟通体验的选择。

---

## What — 这个项目是什么？

Dialog Survey 是一个**驻留在钉钉里的异步对话机器人**。你设计一个问卷模板、邀请参与者，AI 就会和每个人进行多轮对话——提出初始问题、在有价值的回答上深入追问、跨消息跨天数地记住上下文。

### 核心能力

| 能力 | 说明 |
|------|------|
| **AI 智能追问** | 基于 LLM 的深层追问——当参与者说到有趣的内容时，机器人会自动深入挖掘 |
| **多轮上下文记忆** | 跨越数天、数十条消息的连贯对话，而非孤立的 Q&A |
| **异步消息对话** | 参与者在钉钉上利用碎片时间回答——无需排期通话，没有压迫感 |
| **自动生成报告** | 对话结束后自动生成 Markdown 报告，支持 PDF/Excel 导出（基于 Playwright） |
| **私有部署** | 所有数据留在你的基础设施中。你的 PostgreSQL、你的 LLM（ollama / vLLM / 云端）、你的钉钉应用 |

### 近期更新 (v1.8.x)

- **v1.8.1** — 文档大刷新：AGENTS.md 从 597 行压缩至 88 行，新增子目录 AGENTS.md
- **v1.8.0** — 移除未使用的 ASR 语音识别。修复 COMPLETED 状态对话陷入 CONTINUE 循环的 bug。修复 maxFollowups 未持久化到数据库的问题。修复添加成员时错误信息被静默吞掉的问题
- **v1.7.9** — CI 稳定性：修复不稳定的集成测试，清理示例配置中的敏感信息
- **v1.7.8** — 统一 tsconfig.json，修复 35 个文件中的 81 个类型错误

> 完整变更日志见 [CHANGELOG.md](./CHANGELOG.md)。

---

## How — 怎么使用这个项目？

### 技术栈

| 层级 | 技术 |
|------|------|
| **对话引擎** | 自研 LangGraph 工作流 |
| **LLM** | OpenAI 兼容 API——ollama / vLLM / LocalAI / 云端 |
| **消息平台** | 钉钉 Stream Mode (WebSocket) |
| **数据库** | PostgreSQL + Prisma ORM |
| **Web 框架** | Fastify 5.x |
| **模板引擎** | Nunjucks（管理后台 UI） |
| **语言** | TypeScript（严格模式，ESM） |

---

### 安装方式

#### 方式 A：CLI 快捷安装（生产环境推荐）

```bash
# 交互式安装
npx dialog-survey install

# 非交互式安装（CI / 自动化）
npx dialog-survey install \
  --db-url "postgresql://user:pass@localhost:5432/dialog_survey" \
  --dingtalk-client-id "xxx" \
  --dingtalk-client-secret "xxx" \
  --dingtalk-agent-id "xxx"
```

CLI 会自动生成 `.env`、运行 `prisma generate` + `db push`、并配置 PM2（Linux/macOS）或直接 node 启动（Windows）。

#### 方式 B：Docker Compose（评估推荐）

```bash
cp .env.example .env
# 填入钉钉 + LLM 配置
docker compose up -d
curl http://localhost:3001/health
```

#### 方式 C：手动安装（开发环境）

```bash
git clone https://github.com/boyingliu01/dialog-survey
cd dialog-survey
npm install
cp .env.example .env
# 编辑 .env 填入你的配置
npx prisma generate && npx prisma db push
npm run dev
```

---

### 生命周期管理

```bash
npx dialog-survey start      # 启动服务
npx dialog-survey stop       # 停止服务
npx dialog-survey status     # 查看状态
npx dialog-survey uninstall  # 完全卸载（保留数据）
npx dialog-survey help       # 查看所有命令
```

---

### 配置说明

关键环境变量（完整列表见 `.env.example`）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/dialog_survey` |
| `LLM_BASE_URL` | LLM 服务地址（OpenAI 兼容） | `http://localhost:11434/v1` |
| `LLM_MODEL` | 模型名称 | `qwen2.5` |
| `DINGTALK_CLIENT_ID` | 钉钉 Client ID | 从钉钉开放平台获取 |
| `DINGTALK_CLIENT_SECRET` | 钉钉 Client Secret | 从钉钉开放平台获取 |
| `DINGTALK_AGENT_ID` | 钉钉 Agent ID | 从钉钉开放平台获取 |
| `ADMIN_API_KEY` | 管理后台 API Key | 自定义密钥 |

> 留空 `LLM_API_KEY` 则默认使用本地 LLM (`http://localhost:11434/v1`)。

---

### 生产部署

**Linux / macOS** (PM2)：
```bash
npm run build
pm2 start dist/src/server.js --name dialog-survey
pm2 save && pm2 startup
```

**Windows**（直接 node 启动）：
```bash
npm run build
node dist/src/server.js
```

**Docker**：
```bash
docker compose up -d
docker compose logs -f app
```

健康检查：`curl http://localhost:3001/health`

---

### 开发命令

```bash
npm run dev          # 热重载开发服务器，端口 :3001
npm run type-check   # TypeScript 类型检查
npm test             # 运行测试 (Vitest)
npm run lint         # Biome 代码检查
npm run build        # 编译到 dist/
npm run smoke        # 快速验证（类型检查 + lint + 核心测试）
```

---

### 项目结构

```
dialog-survey/
├── src/
│   ├── api/          # Fastify 路由
│   ├── core/         # 图工作流引擎
│   ├── services/     # 业务逻辑（18 个服务）
│   ├── repositories/ # 数据访问层 (Prisma)
│   ├── integrations/ # 钉钉 + LLM 客户端
│   ├── middleware/   # Fastify 中间件
│   ├── views/        # Nunjucks 管理后台 (HTMX + Alpine.js)
│   └── utils/        # 工具函数（日志、安全、PII 等）
├── tests/            # 92 个测试文件，~930 个测试用例
├── scripts/          # CLI 入口 + 部署脚本
├── prisma/           # Schema + 迁移 + 种子数据
└── docs/             # 架构与设计文档
```

---

### 进一步阅读

- [DEPLOY.md](./DEPLOY.md) — 详细部署指南
- [AGENTS.md](./AGENTS.md) — AI Agent 代码库地图
- [CHANGELOG.md](./CHANGELOG.md) — 完整发布历史
- [Architecture](./architecture.yaml) — 架构验证规则

---

## License

MIT
