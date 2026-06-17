# Interview Bot - Windows 开发环境搭建指南

> 本文档适用于在 Windows 系统上从零搭建 Interview Bot 项目的开发环境。

## 环境要求

| 组件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| Windows | 10/11 | 11 | 需支持 PowerShell 5.1+ |
| Node.js | >= 20.0.0 | 20 LTS | 必须 20+ (项目使用 `tsx --env-file` 特性) |
| PostgreSQL | 14+ | 16 | 数据存储 |
| Git | 2.40+ | 最新 | 版本控制 |
| jq | 任意 | 最新 | pre-push hook 依赖 |
| VS Code | 可选 | 最新 | 推荐编辑器 |

---

## 步骤 1: 安装 Node.js

1. 访问 [https://nodejs.org](https://nodejs.org)
2. 下载 **LTS (v20.x)** Windows 安装包
3. 运行安装向导（保持默认选项即可）
4. 验证安装：
   ```powershell
   node --version    # 应输出 v20.x.x
   npm --version     # 应输出 10.x.x
   ```

> **注意**: 如果你使用 `nvm-windows`，安装方法为：
> ```powershell
> nvm install 20
> nvm use 20
> ```

---

## 步骤 2: 安装 PostgreSQL

### 方式 A: EDB 安装版（推荐）

1. 访问 [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. 下载 EDB 安装版
3. 运行安装向导，记住设置的 **superuser 密码**
4. 安装完成后，PostgreSQL 服务会自动运行

### 方式 B: Docker Desktop

```powershell
# 安装 Docker Desktop 后，运行:
docker run -d `
  --name dialog-survey-db `
  -e POSTGRES_PASSWORD=your_password `
  -e POSTGRES_DB=dialog_survey `
  -p 5432:5432 `
  postgres:16
```

### 验证数据库连接

```powershell
# 使用 psql 测试 (EDB 安装包自带)
psql -U postgres -d dialog_survey
```

---

## 步骤 3: 安装 Git

1. 访问 [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. 下载并安装 Git for Windows
3. 验证：
   ```powershell
   git --version
   ```

> **重要**: Git for Windows 自带 **Git Bash**，这是 Git hooks (`pre-commit`, `pre-push`) 的执行环境，必须安装。

---

## 步骤 4: 安装 jq

`jq` 用于 pre-push hook 解析 JSON 文件，必须安装。

### 方式 A: winget（推荐）

```powershell
winget install jqlang.jq
```

### 方式 B: Chocolatey

```powershell
choco install jq
```

### 方式 C: 手动下载

1. 访问 [https://jqlang.github.io/jq/download/](https://jqlang.github.io/jq/download/)
2. 下载 Windows 二进制文件
3. 将 `jq.exe` 放到系统 `PATH` 目录中（如 `C:\Windows\System32`）

### 验证:

```powershell
jq --version
```

---

## 步骤 5: 获取项目代码

### 方式 A: Git 克隆（推荐）

```powershell
cd C:\projects   # 或你选择的目录
git clone <repo-url> dialog-survey
cd dialog-survey
```

### 方式 B: 拷贝项目目录

直接将从笔记本导出的项目文件夹拷贝到目标位置。

---

## 步骤 6: 安装项目依赖

```powershell
npm install
```

> 所有依赖均为纯 JavaScript/TypeScript 包，**无原生 C++ 模块编译步骤**，Windows 上完全兼容。

---

## 步骤 7: 配置环境变量

```powershell
# 复制示例配置文件
Copy-Item .env.example .env
```

用编辑器打开 `.env`，填入实际配置值：

```ini
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/dialog_survey?schema=public"

# LLM Configuration
DASHSCOPE_API_KEY=sk-your-dashscope-api-key
MAX_LLM_RETRIES=2
LLM_TIMEOUT=30000

# DingTalk Configuration
DINGTALK_APP_KEY=your-dingtalk-app-key
DINGTALK_APP_SECRET=your-dingtalk-app-secret
DINGTALK_AGENT_ID=your-dingtalk-agent-id
PUBLIC_URL=http://your-internal-ip:3001

# Fun-ASR Configuration
FUN_ASR_API_KEY=your-fun-asr-api-key

# Security
ENCRYPTION_KEY=your-32-byte-hex-key
ADMIN_API_KEY=your-admin-api-key

# Report Configuration
REPORTS_DIR=./reports

# Logging
LOG_LEVEL=info
```

### 关键配置说明

| 变量 | Windows 注意事项 |
|------|------------------|
| `DATABASE_URL` | 如果 PG 在本地，确保端口 5432 可访问 |
| `PUBLIC_URL` | 钉钉回调地址。局域网内用 `http://内网IP:3001` |
| `ENCRYPTION_KEY` | 生成方法见下方 |

### 生成 ENCRYPTION_KEY

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## 步骤 8: 初始化数据库

```powershell
# 生成 Prisma Client
npx prisma generate

# 同步数据表结构到数据库
npx prisma db push
```

### 验证:

```powershell
# 打开 Prisma Studio 查看数据库
npx prisma studio
```

---

## 步骤 9: 启动服务

### 开发模式（热重载）

```powershell
npm run dev
```

服务默认监听 `http://0.0.0.0:3001`。

### 健康检查

```powershell
# 新开一个 PowerShell 窗口
curl http://localhost:3001/health
```

### 生产模式（长期运行）

```powershell
npm run build       # 编译到 dist/

# 直接运行
node dist\src\server.ts

# 或使用 PM2 管理（推荐）
npm install -g pm2
pm2 start dist/src/server.ts --name dialog-survey
pm2 save
pm2 startup   # 设置 Windows 开机自启
```

> **注意**: PM2 在 Windows 上的开机自启需要额外安装 `pm2-windows-service`：
> ```powershell
> npm install -g pm2-windows-service
> pm2-service-install
> ```

---

## 跨平台兼容性说明

### ✅ 完全兼容，无需额外处理

| 组件 | 说明 |
|------|------|
| `tsx --env-file=.env` | 在 Windows PowerShell 上正常工作 |
| `path.resolve()`, `path.join()` | Node.js 自动将 `/` 转为 `\` |
| `fs.writeFileSync()` | 自动适配 Windows 换行符 |
| `node:path` 模块 | 跨平台路径处理 |
| TypeScript 编译 | 无平台相关代码 |
| Vitest 测试 | 纯 Node.js 环境，无平台依赖 |
| Git hooks (`pre-commit`) | 通过 Git Bash 执行，Windows 上可用 |

### ⚠️ 需要注意

| 组件 | 问题 | 状态 |
|------|------|------|
| `scripts/dev.sh` | 使用 Linux 专属命令 `lsof`, `kill` | **Windows 上不可用**，直接 `npm run dev` 即可 |
| Git pre-push hook | 依赖 `jq` 命令 | 安装 jq 后正常 |
| 环境变量设置 | PowerShell 语法不同于 bash | 项目使用 `--env-file` 加载，无需手动 `export` |

> **`scripts/dev.sh` 说明**: 该脚本仅用于在 Linux/WSL 上自动释放端口，Windows 上不需要它。如果端口被占用，手动关闭占用程序即可。

---

## 完整验证清单

完成上述步骤后，逐一验证：

- [ ] `node --version` 输出 >= 20.0.0
- [ ] `npm install` 无报错
- [ ] `.env` 已配置所有必填项
- [ ] `npx prisma generate` 成功
- [ ] `npx prisma db push` 成功（数据表已创建）
- [ ] `npm run dev` 启动无报错
- [ ] `curl http://localhost:3001/health` 返回正常响应
- [ ] `npm run test` 测试通过
- [ ] `npm run type-check` 类型检查通过
- [ ] `npm run lint` 代码检查通过
- [ ] `jq --version` 可用（pre-push hook 需要）
- [ ] 钉钉 Stream 连接成功（日志中无报错）

---

## 常见问题

### Q: `npm install` 报错 `node-gyp` / 编译失败？

**A**: 项目的依赖中无原生 C++ 模块。如果遇到 `node-gyp` 错误，通常是某个间接依赖触发的，可以尝试：
```powershell
npm ci --ignore-scripts
```

### Q: PostgreSQL 连接被拒绝？

**A**: 检查：
1. PostgreSQL 服务是否在运行（Windows 服务管理器 → PostgreSQL）
2. `DATABASE_URL` 中的用户名/密码是否正确
3. 数据库 `dialog_survey` 是否已存在（`npx prisma db push` 会自动创建）

### Q: `npm run dev` 启动后钉钉 Stream 连接失败？

**A**: 检查：
1. `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 是否正确
2. 网络能否访问钉钉 API（公司防火墙是否放行）
3. `PUBLIC_URL` 是否为钉钉服务器可访问的地址

### Q: Git pre-push hook 报错 `jq: command not found`？

**A**: 安装 jq（见步骤 4），并确认 `jq.exe` 在系统 PATH 中。

### Q: 端口 3001 被占用？

**A**: PowerShell 中查找占用的进程：
```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

---

## 参考文档

- 项目结构说明: [README.md](../README.md)
- 架构设计文档: [docs/plans/](plans/)
- 项目知识基座: [AGENTS.md](../AGENTS.md)
