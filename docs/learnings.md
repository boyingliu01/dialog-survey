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
**笔记**: 开发时可能同时运行两个 Node 服务（golembot gateway :3000 + interview-bot :3001）。
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
