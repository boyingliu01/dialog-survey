# 升级到 v1.19.2 并应用模板提示词迁移

> 面向台式机（安装部署 + 实际商用环境）。笔记本是开发机，本仓库的 `origin` 就是两台机器之间的传递渠道 —— **不需要手工传输任何文件或指令**。

## 这次为什么要多做一步

v1.19.0 修复了两个影响受访者体验的问题：

| Issue | 问题 | 修在哪 |
|---|---|---|
| #229 | 前提已被上一轮回答锁定，仍原样重问 | `src/services/prompt.service.ts` 的「策略 10 已答 / 前提已锁定」 |
| #233 | 提示词写死「最多 2 次」，代码实际是 5 | 提示词改用 `{{maxFollowups}}` 变量 |

**关键在于**：`Template.content.llmPromptTemplate` 是**按行存储**的，它会**覆盖** `prompt.service.ts` 里的默认提示词。所以升级代码后，线上那 4 个模板仍然是旧提示词，这两个修复**不会自动生效**，必须跑一次数据迁移。

这不是 schema 迁移（不是 DDL），所以不在 `prisma/migrations/` 里，由独立脚本处理。

---

## 完整操作步骤

### 0. 确认当前状态

```bash
cd <你的部署目录>
docker compose ps
cat VERSION            # 记下当前版本
git log --oneline -1
```

### 1. 备份（**必做**）

```bash
mkdir -p backups/$(date +%Y%m%d)
docker compose exec -T postgres \
  pg_dump -U dialog_survey -d dialog_survey \
  > backups/$(date +%Y%m%d)/before-1.19.2.sql
ls -lh backups/$(date +%Y%m%d)/before-1.19.2.sql
```

文件大小应是几十 KB 以上。如果接近 0，说明 dump 失败，**不要继续**。

同时备份 `.env`：

```bash
cp .env .env.bak.$(date +%Y%m%d)
```

### 2. 拉取最新代码

```bash
git pull
git describe --tags          # 应显示 v1.19.2
cat VERSION                  # 应为 1.19.2
```

### 3. 重建镜像并启动

```bash
docker compose build app
docker compose up -d
docker compose ps            # 等 app 变成 healthy
```

健康检查用的是 `/health/ready`，它会真实探测数据库和 LLM 配置，不是只看端口。

### 4. 应用模板提示词迁移（本次升级的核心）

先用 dry run 看清楚会改什么：

```bash
docker compose exec app node scripts/sync-template-prompts.mjs --dry-run
```

输出符号含义：

| 符号 | 含义 | 要做什么 |
|---|---|---|
| `~` | 将修改（apply 时会写） | 无需操作 |
| `=` | 已是最新 | 无需操作 |
| `?` | 认不出结构，需人工 | **记下来告诉我**，脚本不会瞎改 |
| `!` | 该行不是 JSON 或找不到提示词字段 | **记下来告诉我** |

确认 `~` 或 `=` 覆盖了你的 4 个模板，且**没有** `?` / `!` 之后，正式执行：

```bash
docker compose exec app node scripts/sync-template-prompts.mjs --apply
```

脚本是**幂等**的 —— 重复跑不会重复插入策略 10，第二次会全部显示 `=`。

退出码：`0` = 无待办或已完成，`1` = 有需人工处理项，`2` = 连不上库或表为空（**不是**成功）。

### 5. 验证

```bash
# 数据库层面：确认策略 10 已写入、旧的上限文案已消失
# content 是 TEXT 列（JSON 字符串），不是 json/jsonb，所以要 ::jsonb 转换后再取键，
# 不能直接写 content->>'llmPromptTemplate'
docker compose exec -T postgres psql -U dialog_survey -d dialog_survey -c \
  "SELECT name,
          (content::jsonb)->>'llmPromptTemplate' LIKE '%前提已锁定%' AS has_strategy_10,
          (content::jsonb)->>'llmPromptTemplate' LIKE '%最多 2 次%'   AS has_stale_cap
   FROM \"Template\" ORDER BY name;"
```

**期望结果**：每一行 `has_strategy_10 = t`，`has_stale_cap = f`。

```bash
# 应用层面
curl -s http://127.0.0.1:3001/health/ready | head -c 400
docker compose logs --tail=50 app
```

### 6. 端到端确认（建议）

新建一个测试访谈，走几轮，确认：
- 追问次数能到 5 次（不是 2 次就结束）
- 当你已经明确回答了某个前提（比如「基层和中层」），下一轮不会原样重问

---

## 出了问题怎么回滚

**只回滚代码**（数据库仍是新版，安全）：

```bash
git checkout v1.19.1
docker compose build app && docker compose up -d
```

**连数据库一起回滚**（仅当迁移改坏了数据）：

```bash
docker compose exec -T postgres psql -U dialog_survey -d dialog_survey \
  < backups/<日期>/before-1.19.2.sql
```

> 注意：恢复后要重新 `docker compose up -d` 让应用重连。

---

## 常见问题

**Q: `docker compose exec app node scripts/sync-template-prompts.mjs` 报文件不存在？**

说明镜像不是从 v1.19.2 构建的。确认：

```bash
docker compose exec app cat /app/VERSION
```

如果不是 `1.19.2`，重新 `docker compose build --no-cache app`。

**Q: 能直接在宿主机连数据库跑脚本吗？**

不能，而且**不建议改**。`docker-compose.yml` 里 postgres 端口刻意不映射到宿主机（issue #215：既避免和本机已有 PostgreSQL 抢 5432，也避免把库暴露到局域网）。脚本已经随镜像发布，在容器内跑即可。

**Q: dry run 显示 `?` 或 `!` 怎么办？**

把输出发给我。脚本只改它认得出的结构，认不出就报告并退出 1 —— 这是刻意的，宁可不改也不编造提示词。需要看一下那个模板的实际结构再决定。

**Q: 迁移需要停服吗？**

不需要。只更新 4 行 `Template.content`，不锁表、不改 schema。正在进行的访谈不受影响（它们读的是已生成的提示词）。
