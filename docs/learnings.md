# 项目经验教训 (Project Learnings)

> 从实际开发中提炼的可重用模式、陷阱和偏好。后续 session 应参考此文档避免重复踩坑。

---

## Pitfalls (陷阱)

### htmx-formbody-flat-keys
**文件**: `src/api/admin-templates.ts`
**发现**: `@fastify/formbody` 将 HTMX 表单数据保持为扁平字符串键（如 `questions[0][text]`），不是嵌套对象。
**教训**: 解析 HTMX 提交数据时，必须用正则 `/^questions\[(\d+)\]\[text\]$/` 匹配扁平键，不能假设 `body.questions[0].text` 可用。
**置信度**: 9/10

### redirect-path-mismatch
**文件**: `src/api/admin-templates.ts` (PUT handler)
**发现**: 模板保存后重定向到 `/admin/templates`（旧列表页），但用户在使用 `/admin` 树状视图。
**教训**: 所有 HTMX `HX-Redirect` 必须与当前页面视图匹配。保存操作应重定向回用户所在的视图入口（`/admin`），不是固定路径。
**置信度**: 8/10

### port-confusion-debugging
**文件**: 开发环境
**发现**: 端口 3000 被 `golembot gateway` 占用，实际应用在 3001。调试时 curl 3000 一直 401。
**教训**: 调试 HTTP 问题时先 `lsof -i :3000` 确认实际监听进程，不要假设端口对应预期服务。
**置信度**: 10/10

### template-detail-no-questions
**文件**: `src/views/admin/content/template-info.njk`
**发现**: 模板详情页只显示元数据（名称、版本、状态），不展示问题列表、邀约提示词等核心内容。
**教训**: 管理界面的"详情"视图必须展示实体的核心业务数据，否则用户无法验证保存是否生效。
**置信度**: 9/10

### htmx-fragment-must-not-extend-layout
**文件**: `src/views/templates/form.njk` → `src/views/admin/content/template-edit.njk`
**发现**: 编辑表单 `form.njk` 用 `{% extends "layouts/admin.njk" %}` 渲染完整页面（含 nav、footer），被 HTMX swap 到 `#main-content` 后出现双层导航/页脚。
**教训**: HTMX `hx-get` 加载的内容必须是纯 fragment（不 extends layout），只渲染 `{% block content %}` 内容。如果需要在 admin-tree.njk 的右侧面板中显示，创建独立的 fragment 模板。
**置信度**: 10/10

### nunjucks-dump-format-mismatch
**文件**: `src/views/admin/content/template-edit.njk`, `tests/admin-templates-integration.test.ts`
**发现**: Nunjucks `{{ data | dump | safe }}` 输出的 JSON 带空格（`"text": "value"`），不是紧凑 JSON（`"text":"value"`）。测试断言 `toContain('"text":"Q1"')` 失败。
**教训**: 测试 Nunjucks 渲染输出时，断言必须匹配 `| dump` filter 的实际格式（带空格），或用更宽松的 `toContain('Q1')` 检查关键数据存在性。
**置信度**: 9/10

### alpine-xfor-key-index-corruption
**文件**: `src/views/admin/content/template-edit.njk`, `src/views/admin/content/template-new.njk`
**发现**: `x-for="(item, index) in items" :key="index"` 在 reorder/delete 时导致 Alpine 错误复用 DOM 节点，静默数据损坏。
**教训**: Alpine.js `x-for` 的 `:key` 必须使用稳定唯一标识符，不能用数组 index。方案：server 端生成 `uid_\${i}`，client 端新增项用 `'uid_' + Date.now()`。
**置信度**: 10/10

### delphi-consensus-premature-build
**文件**: 流程
**发现**: Delphi Round 2 只有 1/3 APPROVED (33%) 就进入了 build 环节，违反 ≥95% 共识阈值规则。用户发现并指出流程违规。
**教训**: Delphi 评审必须严格遵循终止条件——所有专家 APPROVED + 共识 ≥95%。不能因为"大部分问题已修复"就跳过剩余专家的裁决。REQUEST_CHANGES 的专家必须在后续 round 中明确改变立场才算共识。
**置信度**: 10/10

---

## Patterns (模式)

### integration-test-with-mocked-prisma
**文件**: `tests/admin-templates-integration.test.ts`
**模式**: 使用 `vi.mock('@prisma/client')` + 内存 Map 存储 + `app.inject()` 进行集成测试。
**要点**:
1. `vi.mock` 必须在模块顶层，不能在函数内
2. Mock 返回 getter 属性而非直接属性，避免引用过期
3. 每个 test 用 `beforeEach` 重置 mock 和 store
4. 必须配置 `fastify-view` 的 `templates` 目录指向 `src/views/`
**置信度**: 9/10

### admin-view-content-display
**文件**: `src/views/admin/content/template-info.njk`
**模式**: 管理界面详情页应展示：
- 元数据网格（状态、版本、关联计数）
- 核心业务内容（问题列表带计数、邀约提示词、结束语）
- 操作按钮（编辑、创建计划、删除）
- 使用 Nunjucks `{% for %}` 循环渲染列表项
**置信度**: 8/10

### htmx-alpine-integration-pattern
**文件**: `src/views/layouts/admin-tree.njk`
**模式**: HTMX 加载 Alpine.js 内容的正确流程：
1. `admin-tree.njk` 的 `<head>` 中定义 `toggleNode()` 等 Alpine 函数
2. `admin-tree.njk` 的 `<body>` 底部注册 `htmx:afterSwap` 监听器
3. 在 `htmx:afterSwap` 回调中调用 `Alpine.initTree(evt.detail.target)`
4. HTMX 加载的模板必须是纯 fragment（不 extends layout）
5. Fragment 中的 `x-data` 会在 `Alpine.initTree()` 时正确初始化
**置信度**: 10/10

### stable-uid-for-alpine-lists
**文件**: `src/views/admin/content/template-edit.njk`, `src/api/admin-templates.ts`
**模式**: 为 Alpine.js `x-for` 列表生成稳定唯一 key：
1. Server 端生成现有项的 uid：`questions.map((q, i) => ({ ...q, uid: \`uid_\${i}\` }))`
2. Client 端新增项用时间戳：`this.questions.push({ text: '', uid: 'uid_' + Date.now() })`
3. Template 中使用 `:key="question.uid"` 而非 `:key="index"`
4. Reorder 操作（moveUp/moveDown）交换数组元素但保留 uid
**置信度**: 10/10

---

## Preferences (偏好)

### save-redirect-to-tree-view
**上下文**: 管理后台使用树状视图 `/admin` 作为主入口
**偏好**: 所有 CRUD 操作完成后重定向到 `/admin`，保持用户在树状视图中，不跳转到旧的列表页。
**来源**: 用户反馈

### verify-save-through-browser
**上下文**: 模板保存功能
**偏好**: 用户希望保存后能在同一界面直接看到结果，不需要刷新或导航到其他页面确认。
**来源**: 用户反馈"保存没有生效"的困惑

---

## Architecture Notes (架构笔记)

### two-server-instances
**文件**: 开发环境
**笔记**: 开发时可能同时运行两个 Node 服务（golembot gateway :3000 + dialog-survey :3001）。
使用 `lsof -i :PORT` 确认实际进程。

### fastify-formbody-limitation
**文件**: `src/api/admin-templates.ts`
**笔记**: `@fastify/formbody` 不支持嵌套表单字段解析。如果需要嵌套格式，可考虑 `qs` 库自定义解析，但当前方案（正则匹配）更简单可靠。

### htmx-toast-notification-pattern
**文件**: `src/views/layouts/admin-tree.njk`
**模式**: HTMX 全局 toast 通知（成功/错误）：
```javascript
document.body.addEventListener('htmx:afterOnLoad', function(evt) {
  var s = evt.detail.xhr.status;
  var txt = evt.detail.xhr.responseText;
  if (!txt) return;
  var isErr = s >= 400;
  // 提取纯文本，创建 toast div，3 秒后自动消失
});
```
成功用绿色（`bg-green-50 border-green-200`），失败用红色（`bg-red-50 border-red-200`）。
**置信度**: 9/10

### template-lifecycle-publish-gate
**文件**: `src/api/admin-templates.ts`, `src/views/admin/content/template-info.njk`
**模式**: 模板状态流转（DRAFT → PUBLISHED）需要：
1. 按钮仅在 DRAFT 状态显示（`{% if template.status != 'PUBLISHED' %}`）
2. API 端点验证当前状态（防止重复发布）
3. 发布后刷新详情视图（HTMX `HX-Get` header）
**置信度**: 9/10

---

## 2026-05-28: Design Review & Delphi Review 经验

### dual-template-set (pitfall)
**文件**: `src/views/admin/content/*`, `src/views/templates/*`, `src/views/plans/*`
**问题**: 项目有两套模板——新的 admin tree view HTMX fragments（`admin/content/`）和旧的全页面模板（`templates/`、`plans/`）。修改模板行为时必须同时修改两套，否则会遗漏。用 `grep -r` 搜索所有相关文件。
**置信度**: 9/10

### alpinejs-v3-no-set (pitfall)
**文件**: `src/views/admin/content/template-edit.njk`, `src/views/templates/form.njk`
**问题**: Alpine.js v3（admin-tree.njk 加载 v3.14.8）没有 `this.$set()` API。这是 v2/Vue.js 的 API，在 v3 中静默失败。正确做法：直接赋值 `this.questions[index] = value` + `this.questions = [...this.questions]` 触发响应式更新。
**置信度**: 10/10

### hx-indicator-declarative-only (pitfall)
**文件**: `src/views/admin/tree-body.njk`, `src/views/layouts/admin-tree.njk`
**问题**: HTMX 的 `hx-indicator` 属性只对声明式 `hx-get`/`hx-post` 有效，对 `htmx.ajax()` JavaScript 调用无效。对于 `htmx.ajax()` 内容加载，需要使用 `htmx:beforeRequest`/`htmx:afterOnLoad` 事件监听器来显示/隐藏自定义 loading overlay。
**置信度**: 9/10

### delphi-round2-file-coverage (pattern)
**问题**: Delphi Round 2 验证时，专家会读取实际代码库而不是声称的修复清单。本次验证发现 4/8 修复只应用到了新模板，旧模板被遗漏。这比自我验证更有效——让专家检查所有相关文件，不只是我声称修改的文件。
**置信度**: 9/10

### nunjucks-dump-html-attribute (pitfall) — 2026-05-28
**文件**: `src/views/admin/content/template-edit.njk`, `src/views/templates/form.njk`
**问题**: Nunjucks `| dump | safe` filter 产生带双引号的 JSON（如 `"q1"`），这会破坏 HTML 属性中也用双引号包裹的 `x-data` 属性。浏览器在第一个 `"` 处截断属性，导致 Alpine.js 初始化失败。
**修复**: 使用 `| dump | replace('"', '&quot;') | safe` 编码引号，或改用单引号包裹 uid。
**置信度**: 10/10

### browse-qa-for-htmx-alpine (pattern) — 2026-05-28
**文件**: `src/views/layouts/admin-tree.njk`, `src/views/admin/content/template-edit.njk`
**模式**: HTMX+Alpine.js 应用必须用浏览器测试，不能只用 curl。curl 测试会遗漏 JavaScript 执行错误（如 Alpine.js 解析失败）。browse 工具可以检测控制台错误、测试 HTMX 内容交换、验证 Alpine.js 响应式更新。
**置信度**: 9/10

### htmx-confirm-not-testable (pitfall) — 2026-05-28
**文件**: `src/views/admin/content/template-info.njk`, `src/views/admin/content/plan-detail.njk`
**问题**: HTMX `hx-confirm` 使用浏览器原生 `confirm()` 对话框，browse 自动化工具无法与之交互。对于可测试的删除确认，应使用 Alpine.js 自定义模态对话框代替 `hx-confirm`。
**置信度**: 8/10

### status-label-nunjucks-filter (pattern)
**文件**: 所有模板文件
**模式**: 项目没有自定义 Nunjucks filter 基础设施，用模板条件块显示状态中文标签：
```nunjucks
{% if status == 'PUBLISHED' %}已发布{% elif status == 'DRAFT' %}草稿{% else %}{{ status }}{% endif %}
```
跨所有模板文件（新旧两套）保持一致。
**置信度**: 8/10

---

## 2026-05-29: HTMX 嵌套 Bug 修复经验

### htmx-success-redirect-to-shell-url (pitfall)
**文件**: `src/views/plans/form.njk`
**问题**: 在 `hx-on::after-request` 成功回调中调用 `htmx.ajax('GET', '/admin', {target: '#main-content', swap: 'innerHTML'})` 会把整个完整 HTML 页面（含 layout、sidebar、`#main-content` 自身）塞进当前页内的容器，产生页面套页面的嵌套效果。
**根因**: `/admin` 是 shell URL（返回完整页面），不是 fragment。HTMX 不区分 "完整页面" 和 "内容片段"，它只做字符串替换。
**修复**: redirect 到 fragment endpoint（如 `/admin/content/plans/:id`），它只返回内容区 HTML。任何重定向到 shell/layout URL 的 `hx-on` 都是 bug。
**与 `htmx-fragment-must-not-extend-layout` 的区别**: 那条是 **GET 请求返回完整页面**，这条是 **成功回调主动加载完整页面**。Root cause 不同，但症状相同（嵌套显示）。
**置信度**: 10/10

### htmx-create-success-redirect-via-json-id (pattern)
**文件**: `src/views/plans/form.njk`
**模式**: HTMX 表单 POST 创建资源后，若 API 返回 JSON `{id}` 而非 `HX-Redirect` header，可在 `hx-on::after-request` 中解析 `event.detail.xhr.responseText` 拿到 id，然后用 `htmx.ajax` 加载详情 fragment：
```javascript
var newId = null; try { newId = JSON.parse(event.detail.xhr.responseText).id; } catch(_){}
if (newId) { htmx.ajax('GET', '/admin/content/plans/' + newId, {target: '#main-content', swap: 'innerHTML'}); }
```
比改后端加 `HX-Redirect` header 更轻量，不需要修改 API 层。
**置信度**: 9/10

### fragment-vs-shell-url-naming (architecture)
**文件**: `src/api/admin-templates.ts`
**约定**: dialog-survey 项目的 URL 分两类：
- **Shell URL**（完整页面，含 layout）：`/admin`、`/admin/templates`、`/admin/plans`、`/admin/analytics`
- **Fragment URL**（仅内容区，用于 HTMX swap）：`/admin/content/templates/:id`、`/admin/content/plans/:id`

命名约定靠 `/content/` 前缀区分。所有 `hx-get` + `hx-target="#main-content"` 必须使用 `/content/` 前缀的 URL。Shell URL 只用于浏览器直接导航或 `window.location`。
**置信度**: 9/10
