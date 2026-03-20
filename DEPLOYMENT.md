# 部署指南

本文档提供访谈机器人的完整部署步骤。

## 快速开始（Docker Compose）

### 1. 配置环境变量

```bash
cd interview-bot
cp .env.example .env
```

编辑 `.env` 文件，填入真实配置：

```env
# 阿里云配置（必填）
DASHSCOPE_API_KEY=your_dashscope_api_key

# 钉钉配置（必填）
DINGTALK_APP_KEY=your_app_key
DINGTALK_APP_SECRET=your_app_secret
DINGTALK_AGENT_ID=your_agent_id

# 服务配置
PUBLIC_URL=https://your-domain.com
```

### 2. 启动服务

```bash
docker-compose up -d
```

服务将在 `http://localhost:8000` 启动。

### 3. 验证服务

```bash
# 健康检查
curl http://localhost:8000/health

# 查看 API 文档
open http://localhost:8000/docs
```

---

## 本地开发部署

### 1. 安装依赖

```bash
cd interview-bot
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入配置
```

### 3. 启动 PostgreSQL

```bash
# 方式1: Docker
docker run -d --name interview-bot-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=interview_bot \
  -p 5432:5432 \
  postgres:15

# 方式2: 本地安装
# 确保 PostgreSQL 运行并创建数据库
```

### 4. 运行数据库迁移

```bash
# 创建数据表
alembic upgrade head

# 查看迁移状态
alembic current
```

### 5. 启动服务

```bash
uvicorn src.api.main:app --reload
```

---

## 钉钉机器人配置

### 1. 创建钉钉应用

1. 登录 [钉钉开放平台](https://open.dingtalk.com/)
2. 创建企业内部应用
3. 获取 AppKey、AppSecret、AgentId

### 2. 配置消息接收

1. 在应用管理中找到「消息接收」
2. 设置 Webhook URL: `https://your-domain.com/api/webhook`
3. 启用消息加密（推荐）

### 3. 配置权限

确保应用有以下权限：
- 企业内消息通知
- 通讯录只读权限

---

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `DASHSCOPE_API_KEY` | ✅ | 阿里云 DashScope API Key |
| `DINGTALK_APP_KEY` | ✅ | 钉钉应用 AppKey |
| `DINGTALK_APP_SECRET` | ✅ | 钉钉应用 AppSecret |
| `DINGTALK_AGENT_ID` | ✅ | 钉钉应用 AgentId |
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `PUBLIC_URL` | ✅ | 服务公网地址（钉钉回调用） |
| `MAX_LLM_RETRIES` | ❌ | LLM 调用重试次数，默认 2 |
| `LLM_TIMEOUT` | ❌ | LLM 调用超时秒数，默认无限制 |
| `REPORTS_DIR` | ❌ | 报告存储目录，默认 `reports/` |

---

## 常见问题

### Q: 数据库连接失败

确保 `DATABASE_URL` 格式正确：
```
postgresql://用户名:密码@主机:端口/数据库名
```

### Q: 钉钉消息接收不到

1. 检查 `PUBLIC_URL` 是否可公网访问
2. 确认钉钉开放平台中的 Webhook URL 配置正确
3. 检查服务器防火墙是否开放端口

### Q: LLM 调用失败

1. 确认 `DASHSCOPE_API_KEY` 有效
2. 检查 API 配额是否充足
3. 查看 `MAX_LLM_RETRIES` 和 `LLM_TIMEOUT` 配置

---

## 生产环境建议

1. **HTTPS**: 使用 Nginx 反向代理配置 HTTPS
2. **监控**: 添加日志收集和性能监控
3. **备份**: 定期备份 PostgreSQL 数据库
4. **安全**: 启用钉钉消息签名验证