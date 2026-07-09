# maxFollowups 修复说明

## 问题背景

v1.8.0 将单个问题的最大追问次数 (`maxFollowups`) 从 2 次提升到 5 次，但这个修改只更新了默认值定义，**没有更新已存在的数据库记录**。

### 根本原因

1. v1.8.0 之前，`maxFollowups` 的默认值是 2
2. v1.8.0 将默认值改为 5（在 `prisma/schema.prisma` 和 `src/core/types/index.ts` 中）
3. 项目使用 `prisma db push` 同步 schema，但 **`db push` 不会更新已存在的记录**
4. 已存在的 interview 记录的 `maxFollowups` 字段仍然是 2
5. 当这些旧记录被加载时，追问次数限制仍然是 2 次

### 影响范围

- **新创建的 interview**：使用正确的默认值 5 ✅
- **v1.8.0 之前创建的 interview**：仍然是旧值 2 ❌

## 修复方案

### 方案 A：使用修复脚本（推荐）

```bash
# 运行修复脚本，自动更新所有旧记录
npx tsx scripts/fix-max-followups.ts
```

脚本会：
1. 查询有多少旧记录需要更新
2. 将所有 `maxFollowups = 2` 的记录更新为 5
3. 输出更新结果

### 方案 B：手动执行 SQL

```bash
# 连接到 PostgreSQL 数据库
psql $DATABASE_URL

# 执行 SQL
UPDATE "Interview" SET "maxFollowups" = 5 WHERE "maxFollowups" = 2;
```

### 方案 C：使用 Prisma 迁移

```bash
# 生成迁移文件
npx prisma migrate dev --name fix-max-followups

# 或者直接执行 SQL
npx prisma db execute --file prisma/migrations/20260709_fix_max_followups/migration.sql
```

## 验证修复

### 方法 1：查看日志

在访谈过程中，查看日志输出：

```
[DIAG] routeAction input
  maxFollowups: 5  ← 应该是 5，不是 2
  followupCount: 0
  ...
```

### 方法 2：查询数据库

```bash
# 检查是否还有旧记录
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Interview\" WHERE \"maxFollowups\" = 2;"
```

应该返回 0。

### 方法 3：实际测试

1. 找到一个 v1.8.0 之前创建的 interview
2. 进行访谈，观察追问次数
3. 应该可以追问 5 次，而不是 2 次

## 代码变更

本次修复还包括以下代码变更：

1. **测试文件更新**：将 15 个测试文件中的 `maxFollowups: 2` 更新为 `maxFollowups: 5`，确保测试与实际行为一致
2. **迁移文件**：添加了 SQL 迁移文件 `prisma/migrations/20260709_fix_max_followups/migration.sql`
3. **修复脚本**：添加了 `scripts/fix-max-followups.ts` 用于一键修复

## 相关文件

- `src/core/types/index.ts` - 定义 `DEFAULT_MAX_FOLLOWUPS = 5`
- `prisma/schema.prisma` - 数据库 schema，`maxFollowups Int @default(5)`
- `src/core/nodes/interviewing.ts` - 追问逻辑，使用 `state.maxFollowups`
- `src/services/stream-message.service.ts` - 创建 interview 时使用默认值
- `scripts/fix-max-followups.ts` - 修复脚本
- `prisma/migrations/20260709_fix_max_followups/migration.sql` - SQL 迁移

## 后续建议

1. **部署时运行修复脚本**：在部署 v1.8.0+ 时，运行一次修复脚本
2. **监控日志**：部署后观察日志，确认 `maxFollowups` 值为 5
3. **文档更新**：在 CHANGELOG 中记录此修复

## 技术细节

### 为什么 `prisma db push` 不会更新已存在的记录？

`prisma db push` 只会：
- 创建新表
- 添加新列（使用默认值）
- 修改列类型（如果兼容）
- 删除不存在的列

但**不会**：
- 更新已存在的记录以匹配新的默认值
- 修改已有列的默认值（只修改 schema 元数据）

这是 Prisma 的设计决策，目的是避免意外修改生产数据。

### 为什么测试文件使用 `maxFollowups: 2`？

测试文件中的 `maxFollowups: 2` 是跟随旧的默认值。更新为 5 后，测试仍然有效，因为：
- 测试验证的是逻辑正确性，不是具体数值
- 边界测试（如 `followup-branches.test.ts`）使用 `maxFollowups: 3`，故意测试边界情况
- 所有 1009 个测试都通过，证明修复正确
