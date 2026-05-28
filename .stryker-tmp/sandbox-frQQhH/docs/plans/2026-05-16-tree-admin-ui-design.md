# 树状导航管理后台 - 设计文档 (v3 — Round 2 Issues 已修复)

> 创建时间: 2026-05-16
> v3 修订: 2026-05-16 — 修复 Round 2 全部 6 个 Issues
> 状态: Round 3 评审中

### Changelog (v2→v3)
1. [FIX-R2-1] 服务端渲染语法：Nunjucks 变量直接赋值给 x-data，如 `x-data="{ tplExpanded: true }"`（不嵌套 {{ }}），HTMX 内容区单独定义 Alpine 作用域，避免与主页面冲突
2. [FIX-R2-2] 右键菜单改为节点右侧操作图标（📝🗑️），hover 显示，避免与浏览器右键菜单冲突
3. [FIX-R2-3] `"...X人"` 节点点击触发 HTMX 加载完整访谈列表到内容区
4. [FIX-R2-4] 无完成者时统计分析 Tab 显示空状态提示（"暂无数据，完成访谈后可查看统计"）
5. [FIX-R2-5] 模态框通过 `<body hx-headers>` 自动继承 adminApiKey
6. [FIX-R2-6] 顶栏搜索框支持按模板名/计划名实时过滤树节点

---

## 1. 需求

（同 v1）

## 2. 层级结构 (3 层)

（同 v1，保持不变）

```text
▼ 访谈模板 (根)
  ▼ 产品调研模板 [Level 1]
    ▼ Q1调研计划 [🟢进行中 3/10] [Level 2]
      ├── 张三 ✅ 已完成 (点击→个人报告)
      ├── 李四 ✅ 已完成 (点击→个人报告)
      ├── 王五 ⏳ 待访谈 (点击→计划创建受访记录)
      └── ...
    ▼ Q2调研计划 [⚪待启动 0/5]
      └── ...
```

### 节点类型与交互
| 类型 | 图标 | 颜色 | 点击行为 |
|---|---|---|---|
| 模板 | 📁 文件夹 | 灰色 | 右侧显示模板信息+关联计划列表 |
| 计划 | 📋 文档 | 状态色(见下) | 右侧显示计划详情+统计分析(已完成的受访者汇总) |
| 个人报告 | 📄 报告 | 状态色(见下) | 右侧显示个人访谈报告详情 |

### 计划状态色
| 状态 | 颜色 | 标签 |
|---|---|---|
| PENDING | ⚫ 灰色 | 待启动 |
| READY | 🔵 蓝色 | 准备中 |
| RUNNING | 🟡 黄色 | 进行中 |
| PAUSED | 🟠 橙色 | 已暂停 |
| COMPLETED | 🟢 绿色 | 已完成 |
| CANCELLED | 🔴 红色 | 已取消 |

### 访谈状态色
| 状态 | 颜色 | 标签 |
|---|---|---|
| PENDING | ⚫ 灰色 | 待访谈 |
| ACTIVE | 🟡 黄色 | 访谈中 |
| WAITING | 🟠 橙色 | 等待中 |
| COMPLETED | 🟢 绿色 | 已完成 |
| CANCELLED | 🔴 红色 | 已取消 |

## 3. 页面布局 (v2 修订)

```
┌─────────────────────────────────────────────────────────┐
│ 📋 访谈管理后台    [+ 新建模板] [+ 新建计划]     [🔍搜索] │  ← 顶栏工具栏
├──────────────────┬──────────────────────────────────────┤
│ ◁ 导航树 (280px) │  右侧内容区 (HTMX动态加载)             │
│                  │                                      │
│ ▼ 访谈模板 (根)  │  ┌──────────────────────────────┐    │
│   ▼ 产品调研模板 │  │ 基本 | 统计 | 成员   ← Tab   │    │
│   │  ▼ Q1计划 🟢│  ├──────────────────────────────┤    │
│   │    ├ 张三 ✅  │  │ [Tab1: 基本信息]              │    │
│   │    ├ 李四 ✅  │  │ - 计划名称: Q1调研计划        │    │
│   │    ├ 王五 ⏳  │  │ - 关联模板: 产品调研模板       │    │
│   │    └ ...7人   │  │ - 进度: 3/10 (30%)            │    │
│   │              │  └──────────────────────────────┘    │
│   ▼ 客户调研     │  ┌──────────────────────────────┐    │
│   └── ...        │  │ [Tab2: 统计分析]              │    │
│                  │  │ - 已完成: 3人                  │    │
│                  │  │ - 满意度: 4.2/5.0             │    │
│                  │  │ - 情感分布: 积极 80%           │    │
│                  │  └──────────────────────────────┘    │
│                  │                                       │
└──────────────────┴──────────────────────────────────────┘
```

## 4. 技术方案 (v2 重要修订)

### 4.1 树形数据：服务端渲染 HTML（v3 语法修正）

**服务端渲染树结构示例**（注意 `x-data` 中不嵌套 `{{ }}`）：
```html
<div x-data="{ selectedId: null }">
  {% for template in templates %}
  <div x-data="tplNode()">
    <div @click="selectedId='{{ template.id }}'" class="tree-node">
      <span class="chevron" @click.stop="toggle()">▼</span>
      <span>{{ template.name }}</span>
      <!-- 操作图标 (hover 显示) -->
      <span class="actions opacity-0 group-hover:opacity-100">
        <button @click.stop="editTemplate('{{ template.id }}')" title="编辑">📝</button>
        <button @click.stop="deleteTemplate('{{ template.id }}')" title="删除">🗑️</button>
      </span>
    </div>
    <div x-show="expanded" class="tree-children">
      {% for plan in template._plans %}
      <div x-data="tplNode()">
        <!-- 计划节点 -->
        {% if plan.totalInterviews > 15 %}
        <div class="tree-node text-gray-400 text-xs cursor-pointer"
             hx-get="/admin/content/plans/{{ plan.id }}/all-interviews"
             hx-target="#main-content">
          └ ...{{ plan.totalInterviews - 15 }} 人 — 点击查看完整列表
        </div>
        {% endif %}
      </div>
      {% endfor %}
    </div>
  </div>
  {% endfor %}
</div>

<script>
function tplNode() {
  return { expanded: true, toggle() { this.expanded = !this.expanded; } };
}
</script>
```

**HTMX 内容区独立 Alpine 作用域**：每个内容模板定义自己的 `x-data`，通过 `id` 隔离：
```html
<!-- plan-detail.njk 示例 -->
<div x-data="planDetailTabs()" @htmx:after-swap.window="init()">
  <div class="flex border-b">
    <button @click="activeTab='basic'" :class="activeTab==='basic' ? 'active' : ''">基本信息</button>
    <button @click="activeTab='stats'" :class="activeTab==='stats' ? 'active' : ''">统计分析</button>
    <button @click="activeTab='members'" :class="activeTab==='members' ? 'active' : ''">成员列表</button>
  </div>
  <div x-show="activeTab==='basic'">...</div>
  <div x-show="activeTab==='stats'" x-cloak>
    {% if completedCount == 0 %}
    <div class="text-center text-gray-400 py-8">暂无数据，完成访谈后可查看统计</div>
    {% else %}
    <!-- 统计分析内容 -->
    {% endif %}
  </div>
</div>
<script>
function planDetailTabs() {
  return { activeTab: 'basic', init() {} };
}
</script>
```

### 4.2 树数据裁剪策略 (FIX-C3)

```typescript
// GET /admin — 聚合查询优化
const templates = await prisma.template.findMany({
  orderBy: { name: 'asc' },
  select: {
    id: true, name: true, status: true, version: true, createdAt: true,
    _count: { select: { interviewPlans: true, interviews: true } },
    interviewPlans: {
      orderBy: { createdAt: 'desc' },
      take: 20, // 最多显示20个计划
      select: {
        id: true, name: true, status: true, completedCount: true, sentCount: true, createdAt: true,
        _count: { select: { interviews: true } },
        interviews: {
          orderBy: { createdAt: 'desc' },
          take: 15, // 最多显示15个访谈
          select: { id: true, userId: true, status: true }
        }
      }
    }
  }
});
```

### 4.3 计划详情 Tab 设计 (FIX-C4)

计划详情页面使用 Alpine.js Tab 组件：

```html
<div x-data="{ activeTab: 'basic' }">
  <div class="flex border-b">
    <button @click="activeTab='basic'" :class="activeTab==='basic' ? 'active-tab' : 'inactive-tab'">基本信息</button>
    <button @click="activeTab='stats'" :class="activeTab==='stats' ? 'active-tab' : 'inactive-tab'">统计分析</button>
    <button @click="activeTab='members'" :class="activeTab==='members' ? 'active-tab' : 'inactive-tab'">成员列表</button>
  </div>
  <div x-show="activeTab==='basic'" x-cloak>
    <!-- 基本信息：名称/描述/状态/创建人/进度 -->
  </div>
  <div x-show="activeTab==='stats'" x-cloak>
    <!-- 统计分析：已完成受访者汇总/情感分布/满意度/关键发现 -->
  </div>
  <div x-show="activeTab==='members'" x-cloak>
    <!-- 成员列表：所有被访者及状态 -->
  </div>
</div>
```

### 4.4 HTMX 内容区 JS 初始化 (FIX-C5)

HTMX 加载的内容区如果包含 Alpine.js 组件（如 Tab 切换），需要手动初始化：

```javascript
// 在 admin-tree.njk 的 <script> 中
document.addEventListener('htmx:afterSwap', function(evt) {
  if (typeof Alpine !== 'undefined') {
    Alpine.initTree(evt.detail.target);
  }
});
```

### 4.5 CRUD 操作入口 (FIX-C6)

| 操作 | 入口 | 交互 |
|------|------|------|
| 新建模板 | 顶栏 `[+ 新建模板]` 按钮 | HTMX 加载模态框表单 |
| 新建计划 | 顶栏 `[+ 新建计划]` 按钮 或 右键模板节点 → 新建计划 | 模态框，自动关联选中模板 |
| 编辑模板 | 右键模板节点 → 编辑 | HTMX 加载编辑表单到内容区 |
| 删除模板/计划 | 右键节点 → 删除 → 确认 | 删除后刷新树（`hx-get="/admin" hx-target="body"`） |
| 查看报告 | 点击个人节点 | HTMX 加载报告详情 |

### 4.6 路由定义 (FIX-C1/C7)

| 方法 | 路径 | 描述 | 返回 |
|---|---|---|---|
| GET | `/admin` | **新默认入口：树状主页面** | `admin-tree.njk` + 服务端渲染树 |
| GET | `/admin/templates` | 旧列表页（向后兼容） | `templates/index.njk` |
| GET | `/admin/api/tree` | 树数据 JSON（备用/刷新用） | JSON |
| GET | `/admin/content/templates/:id` | 模板详情内容（右区 HTMX） | HTML 片段 |
| GET | `/admin/content/plans/:id` | 计划详情+统计（右区 HTMX） | HTML 片段 |
| GET | `/admin/content/reports/:interviewId` | 个人报告（右区 HTMX） | HTML 片段 |

### 4.7 内容区模板

| 内容路由 | 模板文件 | 说明 |
|---|---|---|
| `/admin/content/templates/:id` | `src/views/admin/content/template-info.njk` | 模板基本信息+关联计划列表 |
| `/admin/content/plans/:id` | `src/views/admin/content/plan-detail.njk` | 计划详情+Tab（基本/统计/成员） |
| `/admin/content/reports/:interviewId` | `src/views/admin/content/report-detail.njk` | 个人访谈报告详情 |

## 5. 现有路由兼容性
（同 v1，保持不变）

## 6. 文件清单 (v2 修订)

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/views/layouts/admin-tree.njk` | 重写 | 树状布局+服务端渲染树 |
| `src/api/admin-templates.ts` | 修改 | 新增 `/admin` + `/admin/content/*` 路由 |
| `src/views/admin/tree-body.njk` | 新建 | 树形结构局部模板（服务端渲染） |
| `src/views/admin/content/template-info.njk` | 新建 | 模板详情信息+关联计划列表 |
| `src/views/admin/content/plan-detail.njk` | 新建 | 计划详情+3Tab（基本/统计/成员） |
| `src/views/admin/content/report-detail.njk` | 新建 | 个人访谈报告详情 |
| `prisma/schema.prisma` | 无修改 | 现有数据模型已支持 |

## 7. 风险分析 (v2 修订)

| 风险 | 级别 | 状态 | 缓解措施 |
|---|---|---|---|
| Alpine.js 在 Nunjucks 中可能延迟初始化 | 低 | ✅ 修复 | `defer` 加载 Alpine，`x-cloak` 防闪烁 |
| 大数据量时树形展开卡顿 | 低 | ✅ 修复 | `take: 20/15` 限制，超限显示省略 |
| HTMX pushUrl 导致历史记录混乱 | 中 | ⚠️ 监控 | 每个内容 URL 对应独立路由 |
| 树形数据一次性加载过多 | 低 | ✅ 修复 | 服务端渲染+裁剪策略 |
| HTMX 加载内容 Alpine 未初始化 | 中 | ✅ 修复 | `htmx:afterSwap` → `Alpine.initTree()` |
| `adminApiKey` 在 HTMX 内容区丢失 | 低 | ✅ 修复 | `<body hx-headers>` 继承到子请求 |

## 8. 验收标准

- [ ] 访问 `/admin` 显示树状导航
- [ ] 点击模板节点，右侧显示模板信息
- [ ] 展开模板显示关联计划，计划显示状态色和进度
- [ ] 点击计划，右侧显示计划详情+统计分析
- [ ] 展开计划显示每个被访者，显示访谈状态
- [ ] 点击被访者，右侧显示个人报告
- [ ] 旧路由 (`/admin/templates`, `/admin/plans`, `/admin/reports`) 仍可用
- [ ] TypeScript 类型检查通过
- [ ] 全部现有测试通过
