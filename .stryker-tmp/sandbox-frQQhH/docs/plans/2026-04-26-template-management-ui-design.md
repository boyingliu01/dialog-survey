# 访谈模板管理界面设计方案

> **日期**: 2026-04-26
> **状态**: ✅ Delphi APPROVED（Round 2 — 2/2 专家同意，3 个 Critical 实现细节已采纳）
> **范围**: 后端 API 扩展 + HTMX 服务端渲染管理页面
> **触发**: 用户要求提供图形化模板增删改查界面，替代纯命令行操作

---

## 一、背景与目标

### 现状
- 模板管理仅通过 REST API (`POST/GET/PUT/DELETE /api/templates`) 操作
- 无任何前端界面，需要 curl 或代码调用
- 删除/修改操作不受限制，可能误删已有访谈数据的模板

### 目标
- 提供图形化的模板增删改查管理界面
- 删除/修改时有使用约束检查与警告
- 最小化新增依赖，快速交付

---

## 二、技术架构

| 层级 | 选择 | 理由 |
|------|------|------|
| 渲染 | HTMX 2.x + 服务端渲染 | 无额外构建步骤，Fastify 直接返回 HTML |
| CSS | Tailwind CSS CDN（v3.x 固定版本号） | 快速出样式，零构建 |
| JS 交互 | Alpine.js 3.x CDN | 轻量弹窗/状态管理 |
| 模板引擎 | @fastify/view + Nunjucks | 需 `@fastify/view`（非裸 nunjucks），兼容 ESM |
| 静态文件 | @fastify/static | 服务 CDN 本地缓存兜底 |

### 新增依赖
```json
{
  "@fastify/static": "^8.x",
  "@fastify/view": "^10.x",
  "nunjucks": "^3.x"
}
```
HTMX / Alpine / Tailwind 通过 CDN 引入，同时本地缓存 `public/js/htmx.min.js` 和 `public/js/alpine.min.js` 作为降级。

**⚠️ CDN 使用限制**：本管理页面仅在内网使用，Tailwind CDN 的 JIT 编译不影响生产。**不上公网环境**。

### 项目结构
```
src/
├── views/
│   ├── layouts/
│   │   └── admin.njk                   # 管理页通用布局
│   └── templates/
│       ├── index.njk                   # 模板列表页
│       ├── form.njk                    # 新建/编辑表单
│       ├── row.njk                     # HTMX 行片段
│       ├── delete-modal.njk            # 删除确认弹窗
│       └── usage-warning.njk           # 使用统计警告
├── api/
│   ├── admin-templates.ts              # 管理页面路由 + 管理专用 API
│   └── templates.ts                    # 已有 REST API（不变）
├── middleware/
│   └── admin-auth.ts                   # 管理页认证中间件
└── server.ts                            # 注册新路由
public/
├── js/
│   ├── htmx.min.js                     # CDN 本地缓存
│   └── alpine.min.js
└── css/
    └── admin.css                       # 自定义样式补充
```

### 路由分离策略
| 路由前缀 | 用途 | 内容类型 |
|----------|------|----------|
| `/api/templates` | 已有 REST API（程序调用） | JSON |
| `/admin/templates` | 管理页面（SSR HTML） | HTML |
| `/admin/api/templates` | 管理页面 AJAX（HTMX 调用） | HTML 片段 或 JSON |

---

## 三、约束设计（删除/修改）

### 3.1 核心概念澄清（Round 1 修复）

**状态枚举澄清**：约束检查统计的是**关联 Interview 的状态分布**（`InterviewStatus`：PENDING/ACTIVE/WAITING/COMPLETED/CANCELLED），而非模板自身状态（`TemplateStatus`：DRAFT/PUBLISHED/ARCHIVED）。

### 3.2 关联性检查

每次删除或修改前，查询以下实体的使用情况：

| 关联实体 | 状态 | 风险等级 | 用户提示 |
|----------|------|----------|----------|
| Interview | ACTIVE / WAITING | 🔴 高风险 | "X 场访谈正在进行中，请勿随意修改" |
| Interview | PENDING | 🟡 中风险 | "X 场待开始访谈将受此变更影响" |
| Interview | COMPLETED / CANCELLED | 🟢 低风险 | "X 场已归档访谈，不受影响" |
| InterviewPlan | RUNNING / PAUSED | 🟡 中风险 | "X 个进行中的计划，新访谈将使用新模板内容" |
| InterviewPlan | PENDING / READY | 🟢 低风险 | "X 个未启动计划" |
| BatchAnalysisReport | 任意 | 🟢 低风险 | "X 份报告引用，不受影响" |

### 3.3 操作流程

```
用户点击"删除" / "修改"
    ↓
HTMX 请求 GET /admin/api/templates/:id/usage
    ↓
IF 无关联数据
    → 直接执行
IF 仅有低风险关联
    → 弹窗警告，用户确认后执行
IF 有 ACTIVE/WAITING/RUNNING（高风险）
    → 强制二次确认弹窗 + 明确警告，用户点"确认删除（危险）"后执行
```

**服务端语义（Round 1 修复，Round 2 细化）**：
- `GET /admin/api/templates/:id/usage` — 仅统计、不修改
- `DELETE /admin/api/templates/:id` — **后端同样做 usage 检查**（Round 2 修复）：
  - 有 ACTIVE/WAITING 关联 → 返回 `409 Conflict` + 错误信息，拒绝删除
  - 仅低风险关联 → 允许删除
  - 无关联 → 允许删除
  - 注意：Prisma FK 约束会阻止有相关 Interview/Plan 的删除（无 `onDelete: Cascade`），管理路由应先业务层检查再操作，避免 500 错误
- `PUT /admin/api/templates/:id` — 直接执行，但需通过乐观锁校验（见第五节）
- 保留 `/api/templates` REST API 供程序调用，与 `/admin/` 管理路由**完全分离**，现有 API 行为不变

### 3.4 API 设计（管理路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/admin/templates` | SSR：渲染模板列表页 HTML |
| `GET` | `/admin/templates/new` | SSR：渲染新建表单页 |
| `GET` | `/admin/templates/:id/edit` | SSR：渲染编辑表单页 |
| `GET` | `/admin/api/templates` | HTMX：返回模板列表 HTML 片段（含分页） |
| `GET` | `/admin/api/templates/:id/usage` | HTMX：返回使用情况统计 JSON |
| `GET` | `/admin/api/templates/:id` | HTMX：返回单个模板详情 JSON |
| `POST` | `/admin/api/templates` | HTMX：创建模板，成功返回 201 + 重定向，失败返回 HTML 错误信息 |
| `PUT` | `/admin/api/templates/:id` | HTMX：更新模板，返回 HTML 片段（含 warnings） |
| `DELETE` | `/admin/api/templates/:id` | HTMX：删除模板，返回 HTML 片段（成功/错误） |

### 3.5 content JSON ↔ 表单映射（Round 1 修复）

`Template.content` 是存储为 String 的 JSON 对象，包含 `invitationPrompt`、`questions[]`、`closingMessage` 等字段。

**编辑表单映射策略**：
- 服务端加载模板时将 `JSON.parse(content)` 后注入 Nunjucks 模板变量
- Alpine.js 驱动动态表单：`x-data="{ questions: [...] }"` 实现问题行的增/删
- 排序：提供 **上移/下移按钮**（非拖拽，降低复杂度）
- 提交时将表单数据组装为 JSON，服务端验证后 `JSON.stringify()` 写入

**content 结构定义**：
```typescript
interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  closingMessage?: string;
}
```
编辑表单字段与 content 一一映射。`dimensions` 字段通过独立 API `PUT /api/templates/:id/dimensions` 管理，不在表单内编辑。

---

## 四、页面设计

### 4.1 模板列表页

```
┌──────────────────────────────────────────────────────────┐
│ 访谈模板管理                                          [新建]
├──────────────────────────────────────────────────────────┤
│ 名称              状态      版本  访谈数   创建时间     操作      │
│ ───────────────── ───── ──── ──────── ────────── ──────
│ 满意度调查       🟢已发布  v1    21/3进行中  2024-03-01 [查看][编辑][删除]
│ 技术面试评估     🟡草稿     v2    3/0进行中    2024-03-10 [查看][编辑][删除]
│ 年度回顾调查     ⚪已归档  v1    120/0进行中  2024-01-15 [查看][编辑][删除]
└──────────────────────────────────────────────────────────┘
```

### 4.2 删除确认弹窗

```
┌─────────────────────────────────────────┐
│ ⚠️  确认删除模板                        │
│                                         │
│ "研发线质量满意度调查"                  │
│ 该模板有 21 条关联访谈：                 │
│   🔴 3 场访谈正在进行中                 │
│   🟡 2 场访谈待开始                     │
│   🟢 15 场已完成                         │
│                                         │
│ 删除后将：                              │
│   • 不影响已完成的访谈数据              │
│   • 进行中的访谈将无法加载新模板内容    │
│   • 关联计划将无法使用此模板            │
│                                         │
│         [取消]     [确认删除（危险）]    │
└─────────────────────────────────────────┘
```

---

## 五、安全考虑（Round 1 修复）

| 风险 | 对策 |
|------|------|
| 未授权访问 | API Key 方案（`X-Admin-Key` 请求头），环境变量 `ADMIN_API_KEY`，`src/middleware/admin-auth.ts` 校验 |
| XSS | Nunjucks 模板默认 `{{ var }}` 自动 HTML 转义，`{{ var | safe }}` 仅在受信任内容使用 |
| CSRF | 管理路由 POST/PUT/DELETE 请求检查 `X-Admin-Key` header（同 API Key 认证），无需额外 CSRF token |
| 数据完整性 | DB FK 约束（Prisma） + API 用量查询双重保护 |
| 并发修改 | 乐观锁：PUT 请求携带 `If-Match: <version>` 头或 `?version=N` 参数，服务端校验 `where: { id, version }`，不匹配返回 409 Conflict |
| 速率限制 | 管理路由使用简单的 **固定窗口计数**（非现有 `rate-limiter.ts` 排队模型），基于 IP 或 API Key 计数，超限返回 `429 Too Many Requests`，不排队 |

### 乐观锁实现细节（Round 2 细化）

**关键**：`Template.version` 是普通 `Int` 字段（不会自动递增），需在 Repository 层封装乐观锁逻辑。

```
Client: GET /admin/templates/:id/edit     ← 获取模板 + version
        → 页面返回 version 值注入隐藏字段 <input type="hidden" name="version" value="3">
Client: PUT /admin/api/templates/:id      ← 提交时携带 version 字段
Server: TemplateRepository.updateWithVersion(id, expectedVersion, data) {
          prisma.template.update({
            where: { id, version: expectedVersion },   // 乐观锁校验
            data: {
              ...updateData,
              version: { increment: 1 }                // 自动递增
            }
          })
        }
        → 409 Conflict if version mismatch (0 rows affected)
        → 前端展示 "模板已被他人修改，请刷新后重试"
```

**必须新增 Repository 方法**：
```typescript
// template.repository.ts
async updateWithVersion(
  id: string,
  expectedVersion: number,
  data: Partial<{ name: string; content: Record<string,unknown>; description: string }>
): Promise<Template> {
  return this.prisma.template.update({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } }
  });
}
```

**必须新增 Repository 方法：分页**：
```typescript
async findAllPaginated(page: number, limit: number): Promise<{
  items: Template[]; total: number; page: number; limit: number;
}> {
  const [items, total] = await Promise.all([
    this.prisma.template.findMany({
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    this.prisma.template.count(),
  ]);
  return { items, total, page, limit };
}
```

**必须新增 Repository 方法：usage 统计**：
```typescript
async getUsageStats(templateId: string): Promise<UsageStats> {
  const [interviews, plans, reports] = await Promise.all([
    this.prisma.interview.groupBy({
      by: ['status'],
      where: { templateId },
      _count: true,
    }),
    this.prisma.interviewPlan.groupBy({
      by: ['status'],
      where: { templateId },
      _count: true,
    }),
    this.prisma.batchAnalysisReport.count({ where: { templateId } }),
  ]);
  // ... 聚合为 UsageStats 结构
}
```

---

## 六、性能考虑

| 方面 | 分析 |
|------|------|
| usage 查询 | 单次 `count()` 查询 per 状态，共 7 次 count，可合并为 1 次 `groupBy` + 聚合 |
| 列表页 | 分页策略：`?page=1&limit=20`，HTMX infinite scroll 可后续迭代 |
| HTMX 片段 | 按需加载，编辑表单/弹窗仅渲染变更部分 |
| 静态资源 | CDN 引入 + 本地缓存兜底，无自建静态服务器压力 |

### 错误处理策略（Round 2 细化）

HTMX 请求通过 `hx-on::htmx:afterRequest` 统一捕获错误：

```html
<div hx-on::htmx:after-request="
  if (event.detail.failed) {
    const status = event.detail.xhr.status;
    if (status === 401) showLoginReminder();
    if (status === 404) { showToast('模板已不存在'); refreshList(); }
    if (status === 409) showConflictMessage(event.detail.xhr.responseText);
    if (status === 422) showFieldErrors(event.detail.xhr.responseText);
    if (status === 429) showToast('请求过于频繁，请稍后重试');
  }
">
```

| 状态码 | 用户提示 | 操作 |
|--------|---------|------|
| 401 | "认证失效，请联系管理员" | 停留当前页 |
| 404 | "模板已被删除" | 关闭弹窗，刷新列表 |
| 409 | 乐观锁冲突 / 高风险关联拒绝 | 展示冲突信息，提供"刷新"按钮 |
| 422 | 表单验证失败 | 内联显示字段错误（服务端返回错误 HTML 片段）|
| 500 | "系统错误，请重试" | 通用 toast |

**HTMX 路由响应类型澄清（Round 2 修复）**：
| 路径 | 响应类型 |
|------|---------|
| `GET /admin/templates` | 完整 HTML 页面 |
| `GET /admin/api/templates?page=...` | HTML 片段（行列表 + 分页） |
| `GET /admin/api/templates/:id` | JSON（给 Alpine.js `fetch` 消费） |
| `GET /admin/api/templates/:id/usage` | JSON（给 Alpine.js 弹窗消费） |
| `POST/PUT/DELETE /admin/api/templates/...` | HTML 片段（成功/错误信息），Fastify 设置 `Content-Type: text/html` |

---

## 七、工作量估算（Round 2 最终修正）

| 任务 | 估时 |
|------|------|
| 添加 @fastify/static + @fastify/view + nunjucks（ESM 适配） | 1.5h |
| admin-auth 中间件 | 0.5h |
| 新增 Repository 方法（`updateWithVersion` + `findAllPaginated` + `getUsageStats`） | 2h |
| 管理页面路由：列表页 + 分页 | 1.5h |
| 新建/编辑表单（JSON content ↔ form 双向映射 + Alpine 驱动） | 3.5h |
| 删除弹窗 + usage 统计 + 后端检查 | 2h |
| HTMX 交互（错误提示、确认流程、409/404 处理） | 2h |
| 简单速率限制（固定窗口计数，非排队模型） | 0.5h |
| 测试 | 2h |
| **总计** | **~15.5h** |

---

## 八、风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Nunjucks 在 ESM 项目中的集成 | 默认 CJS，需通过 `import * as nunjucks from 'nunjucks'` 或 `@fastify/view` 包装 | 使用 `@fastify/view` 插件，自动处理 ESM/CJS 桥接 |
| HTMX CDN 不可用 | 页面 HTMX 功能缺失 | 本地缓存 `public/js/htmx.min.js` 作为降级 |
| Tailwind CDN JIT 编译慢 | 首屏加载延迟 | 仅内网使用，可接受；固定 CDN 版本号 |
| content JSON 结构变更导致表单不兼容 | 表单解析失败 | 表单仅展示 content 中已定义的字段，unknown 字段跳过 |

## 九、决策记录

### 决策 1：HTMX vs SPA
**选择**: HTMX 服务端渲染
**理由**: 项目当前零前端依赖，HTMX 最小化新增复杂度；内部管理页面无需复杂交互

### 决策 2：不硬阻断删除/编辑
**选择**: 允许 force 删除，但强制警告
**理由**: 管理员可能有紧急修复需求（如模板内容有误），硬阻断可能导致无法操作

### 决策 3：路由分离（Round 1 新增）
**选择**: `/admin/` 前缀管理路由，`/api/` 保持 REST API
**理由**: 避免路由冲突，管理页面返回 HTML，API 返回 JSON，语义清晰

### 决策 4：认证方案（Round 1 新增）
**选择**: API Key（`X-Admin-Key` header）
**理由**: HTTP Basic Auth 浏览器弹窗体验差，API Key 更易与现有 `securityMiddleware` 集成

### 决策 5：问题排序（Round 1 新增）
**选择**: 上移/下移按钮
**理由**: 拖拽排序引入额外依赖和复杂度，不是一等需求

### 决策 6：Nunjucks + @fastify/view（Round 1 新增）
**选择**: 使用 `@fastify/view` 而非裸 nunjucks
**理由**: ESM 项目需要视图引擎包装器，`@fastify/view` 提供标准 `reply.view()` 接口

### 决策 7：分页策略（Round 1 新增）
**选择**: 传统分页 (`?page&limit`)，后续可升级 HTMX infinite scroll

---

## 十一、Round 1 修复记录

### Critical 修复
| # | 问题 | 专家 | 修复方案 |
|---|------|------|----------|
| C1 | `version` 字段语义模糊 | A | 明确为乐观锁，`where: { id, version }`，不匹配返回 409 |
| C2 | `BatchAnalysisReport` 不在数据模型 | A | 确认在 schema.prisma:161-181 中存在 |
| C3 | 缺少鉴权策略定义 | A | `X-Admin-Key` header，`src/middleware/admin-auth.ts` |
| C4 | 路由冲突风险 | A | 路由分离：`/api/` vs `/admin/` vs `/admin/api/` |
| C5 | InterviewStatus vs TemplateStatus 混淆 | B | 明确统计关联 Interview 的状态分布 |
| C6 | 现有 DELETE 无关联检查 | B | 管理路由独立 DELETE，DB FK 兜底 |
| C7 | 并发控制未定义 | B | 详见第五节乐观锁实现（同 C1） |

### Major 修复
| # | 问题 | 专家 | 修复方案 |
|---|------|------|----------|
| M1 | CDN 生产风险 | A,B | 仅内网使用，固定版本，本地缓存 |
| M2 | JSON content → 表单映射 | B | 新增 3.5 节详细说明 |
| M3 | 缺少 `@fastify/view` | B | 已添加到依赖列表 |
| M4 | `DELETE ?force` 语义混乱 | A,B | 移除 `?force`，管理路由直接删 |
| M5 | 动态问题行交互不完备 | B | 上移/下移按钮 |
| M6 | 估时偏乐观 | B | 11-12h → 14-15h |
| M7 | 分页缺失 | A | 传统分页策略 |
| M8 | 错误处理策略空白 | A | HTMX `hx-on::after-request` 处理错误 |
| M9 | CSRF 不完整 | A | API Key 同时保护 CSRF |

---

## 十二、Round 2 修复记录

### Critical 修复（Expert B 提出）
| # | 问题 | 修复方案 |
|---|------|----------|
| C-B1 | 乐观锁实现有 gap：version 不会自动递增，`update()` 不校验 version | 新增 `updateWithVersion(id, version, data)` 方法，单一 transaction 中 `where: { id, version }` + `version: { increment: 1 }` |
| C-B2 | FK 约束与"直接删"矛盾：有关联数据时 Prisma 抛 500 | DELETE 后端也做 usage 检查，有 ACTIVE/WAITING 关联返回 409 拒绝，与前端检查一致 |
| C-B3 | Rate limiter 不适用：现有是排队模型，HTTP 路由应返回 429 | 改用简单固定窗口计数（onRequest hook），不排队 |

### Major 修复（Expert A + B Round 2 共识）
| # | 问题 | 修复方案 |
|---|------|----------|
| M-A1 | 乐观锁 version 递增伪代码缺失 | 补完整 Repository 方法签名 |
| M-A2 | 错误处理映射缺失 | 新增错误处理策略表 + HTMX `hx-on` 示例 |
| M-B1 | `/admin/api/` JSON/HTML 混合 | 明确：仅 `:id` 和 `:id/usage` 返回 JSON，其余 HTML |
| M-B2 | 分页缺少 Repository 支持 | 新增 `findAllPaginated()` 方法签名 |
| M-B3 | CSRF/HTMX 全局 header 配置不清晰 | 决策 4 已明确 API Key，HTMX 通过 `hx-headers` 属性配置 |

### 共识结论

| 维度 | Expert A | Expert B | 共识 |
|------|----------|----------|------|
| 整体方向 | APPROVED (8/10) | Conditional APPROVE | ✅ 方向一致 |
| Critical 数量 | 0 remaining | 0 remaining (修后) | ✅ |
| Major 数量 | 2 (文档级) | 3 (实现细节) | ⚠️ 实现时需关注 |
| 估时合理性 | — | 15.5h 合理 | ✅ |

**✅ DELPHI REVIEW APPROVED — 2/2 专家同意，所有 Critical 已修复。**
