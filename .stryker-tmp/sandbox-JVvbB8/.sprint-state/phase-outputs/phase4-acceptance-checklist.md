# Phase 4: 用户验收测试清单

> Sprint: sprint-2026-04-26-01
> 功能: 访谈模板管理界面
> 日期: 2026-04-26

---

## 0. 环境准备

```bash
# 1. 启动 PostgreSQL
sudo pg_ctlcluster 16 main start

# 2. 生成 Prisma Client
npx prisma generate

# 3. 设置管理密码
export ADMIN_API_KEY="my-test-key-123"

# 4. 启动服务
npm run dev
```

---

## 1. 页面渲染 [P0]

- [ ] 访问 `http://localhost:3000/admin/templates`，页面正常展示
- [ ] 无 CDN 资源加载失败（浏览器控制台无 404 错误）
- [ ] 显示"访谈模板管理"标题和列表（即使为空）

---

## 2. 认证检查 [P0]

```bash
# 不传 Key → 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3000/admin/api/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"test","content":{}}'
# 预期: 401

# 错误 Key → 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3000/admin/api/templates \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: wrong-key" \
  -d '{"name":"test","content":{}}'
# 预期: 401

# 正确 Key → 201
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3000/admin/api/templates \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"name":"测试模板","content":{"invitationPrompt":"欢迎","questions":["问题1"],"closingMessage":"感谢"}}'
# 预期: 201（然后 302 重定向）
```

- [ ] 无 Key → 401
- [ ] 错误 Key → 401
- [ ] 正确 Key → 创建成功

---

## 3. 新建模板 [P0]

- [ ] 访问 `/admin/templates/new`，表单正常渲染
- [ ] 表单包含：名称、描述、邀约提示词、问题列表、结束语
- [ ] 能动态新增/删除/上移/下移问题行
- [ ] 不填名称提交 → 422 错误提示
- [ ] 正常提交 → 重定向到列表页

---

## 4. 编辑模板 [P0]

- [ ] 点击"编辑" → 加载并正确渲染表单
- [ ] 修改内容后提交 → 成功更新
- [ ] **并发测试**：两个页面同时编辑同一模板，先提交的生效，后提交的返回 409 "模板已被他人修改"

---

## 5. 删除模板（核心约束验证） [P0]

### 场景 A: 无关联数据
- [ ] 新建一个模板 → 删除 → 成功

### 场景 B: 有活跃访谈（需通过 DB 手动创建关联）

```
-- 先通过 Prisma Studio 或 SQL 确认:
-- 1. 找一个有 ACTIVE 访谈关联的模板 ID
-- 2. 尝试通过 API 删除

curl -s -X DELETE http://localhost:3000/admin/api/templates/{templateId} \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

- [ ] 有 ACTIVE/WAITING 访谈关联 → 返回 409 "不能删除：有 X 场访谈正在进行中"
- [ ] 仅 COMPLETED 访谈关联 → 允许删除

### 场景 C: Usage 统计
- [ ] 访问 `/admin/api/templates/{id}/usage` → 返回 JSON，包含 interviews 按状态分组计数、plans 计数、safeToDelete 字段

---

## 6. XSS 防护 [P1]

```bash
# 创建含特殊字符的模板名
curl -X POST http://localhost:3000/admin/api/templates \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"name":"<script>alert(1)</script>","content":{"invitationPrompt":"test","questions":["q1"]}}'
```

- [ ] 模板名含 `<script>` 标签 → 在列表页和 HTMX 片段中被转义显示，不执行

---

## 7. 分页 [P1]

- [ ] 当模板数量 > 20 时，列表页显示分页控件
- [ ] 点击下一页 / 直接跳转页码 → 页面正确展示对应页数据

---

## 8. 现有 REST API 不变 [P0]

```bash
# 验证现有 API 不受影响
curl -s http://localhost:3000/api/templates | head -c 200
# 预期: 正常返回模板列表 JSON
```

- [ ] `GET /api/templates` 正常工作
- [ ] `POST /api/templates` 正常工作
- [ ] `PUT /api/templates/:id` 正常工作
- [ ] `DELETE /api/templates/:id` 正常工作（可能因 FK 约束拒绝，但行为与之前一致）

---

## 验收结果汇总

| 序号 | 测试项 | 结果 (✓/✗) | 备注 |
|------|--------|-----------|------|
| 0 | 环境准备 | | |
| 1 | 页面渲染 | | |
| 2 | 认证检查 | | |
| 3 | 新建模板 | | |
| 4 | 编辑模板 + 乐观锁 | | |
| 5 | 删除约束 | | |
| 6 | XSS 防护 | | |
| 7 | 分页 | | |
| 8 | 现有 API 兼容性 | | |

---

## 验收后下一步

1. 全部通过 → 合并到 main
2. 有 P0 失败 → 记录 bug，修复后重测
3. 仅 P1 失败 → 可合并，后续修复
