# Pain Document: 访谈模板管理界面

> **Sprint**: sprint-2026-04-26-01
> **日期**: 2026-04-26
> **阶段**: Phase 0 — THINK

---

## 痛点

### 痛点 1：模板管理只有 CLI/API，操作门槛高
- **现状**：只能通过 `curl` 或代码调用 REST API 创建/管理模板
- **影响**：非技术人员无法独立管理模板，必须找开发帮忙
- **频率**：每次新增访谈类型都需要创建新模板

### 痛点 2：删除/修改模板无任何保护
- **现状**：`DELETE /api/templates/:id` 直接删除，不检查关联数据
- **影响**：可能误删已有访谈数据的模板，导致 Prisma FK 约束报错（500 错误）
- **风险**：高 — 进行中访谈依赖的模板被改/删会导致体验断裂

### 痛点 3：无法直观看到哪些模板在用的
- **现状**：模板列表只有基本信息（id、name、status）
- **影响**：不知道哪些模板有活跃访谈，不敢随便动
- **缺失**：使用统计、关联数据可视化

### 痛点 4：无法可视化编辑模板内容
- **现状**：`Template.content` 是 JSON 字符串，需要手动构建
- **影响**：容易出错，缺少格式校验和预览

---

## 目标

1. 提供图形化管理界面，降低模板管理门槛
2. 删除/修改时有关联数据检查与警告，防止误操作
3. 直观展示模板使用状态（关联访谈数、进行中数）
4. 表单化编辑模板，支持动态增删问题

---

## 约束

- **不引入重型前端框架**（React/Vue），保持最小化变更
- **兼容现有 Fastify + TypeScript ESM 项目架构**
- **不破坏现有 REST API 契约**（`/api/templates` 保持不变）
- **安全**：管理页面需有认证保护，XSS/CSRF 防护

---

## 技术选型

- HTMX + 服务端渲染（Nunjucks via @fastify/view）
- Tailwind CSS CDN + Alpine.js CDN
- 新增依赖：`@fastify/view`, `@fastify/static`, `nunjucks`
- 认证：API Key（`X-Admin-Key` header）

---

## 已完成的评审

- **Delphi 评审**：Round 1 + Round 2，2/2 专家 APPROVED
- **设计文档**：`docs/plans/2026-04-26-template-management-ui-design.md`
