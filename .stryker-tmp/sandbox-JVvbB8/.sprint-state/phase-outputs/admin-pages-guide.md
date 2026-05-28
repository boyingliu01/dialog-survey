# Admin 页面访问指南

> 日期: 2026-04-27

---

## 快速访问

确保服务已启动：`npm run dev`

### 1. 模板管理
| 页面 | URL |
|------|-----|
| 模板列表 | http://localhost:3000/admin/templates |
| 新建模板 | http://localhost:3000/admin/templates/new |
| 编辑模板 | http://localhost:3000/admin/templates/{id}/edit |

### 2. 访谈计划管理
| 页面 | URL |
|------|-----|
| 计划列表 | http://localhost:3000/admin/plans |

**包含信息**：
- 计划名称、描述
- 状态（PENDING/RUNNING/PAUSED/COMPLETED/CANCELLED 带颜色标识）
- 关联访谈数量
- 创建时间

### 3. 访谈报告查询
| 页面 | URL |
|------|-----|
| 报告列表 | http://localhost:3000/admin/reports |
| 单个报告详情 | http://localhost:3000/admin/reports/{interviewId} |

**包含信息**：
- 受访者 userId、状态
- 情感倾向（正面/负面/中性 带颜色标识）
- 报告创建时间
- 完整报告内容（markdown 渲染）
- 主要发现和关键建议

---

## 导航栏

所有页面的顶部导航栏包含三个入口：
- **模板列表** → `/admin/templates`
- **访谈计划** → `/admin/plans`
- **访谈报告** → `/admin/reports`
