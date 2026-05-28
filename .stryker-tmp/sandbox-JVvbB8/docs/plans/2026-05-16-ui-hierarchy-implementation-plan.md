# UI 层级重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前并列的模板/计划/报告 UI 重构为反映真实层级关系的层级导航，新增模板详情、计划详情、统计分析页面。

**Architecture:** 在现有 admin-templates.ts 单文件路由中新增详情页路由，创建对应 Nunjucks 视图模板，HTMX 处理页面局部更新。所有路由通过 adminAuth 中间件保护。

**Tech Stack:** TypeScript, Fastify 5.x, Nunjucks, HTMX, Prisma, TailwindCSS

---

### Task 1: Prisma Schema 添加审计字段

**Files:**
- Modify: `prisma/schema.prisma` (Template, InterviewPlan, AnalysisReport, BatchAnalysisReport 模型)

**Step 1: 修改 Template 模型**

在 `prisma/schema.prisma` 中找到 Template 模型 (约 line 72-87)，添加:

```prisma
model Template {
  id          String   @id @default(cuid())
  // ... existing fields ...
  createdBy   String   @default("admin")
  updatedBy   String   @default("admin")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // ... existing relations ...
}
```

**Step 2: 修改 InterviewPlan 模型**

在 InterviewPlan 模型 (约 line 89-109) 添加相同字段:

```prisma
model InterviewPlan {
  id          String   @id @default(cuid())
  // ... existing fields ...
  createdBy   String   @default("admin")
  updatedBy   String   @default("admin")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // ... existing relations ...
}
```

**Step 3: 修改 AnalysisReport 模型**

在 AnalysisReport 模型 (约 line 120-133) 添加:

```prisma
model AnalysisReport {
  id          String   @id @default(cuid())
  // ... existing fields ...
  createdBy   String   @default("admin")
  createdAt   DateTime @default(now())

  // Note: updatedAt 由 LLM 生成，不自动更新
}
```

**Step 4: 修改 BatchAnalysisReport 模型**

在 BatchAnalysisReport 模型 (约 line 161-181) 添加:

```prisma
model BatchAnalysisReport {
  id          String   @id @default(cuid())
  // ... existing fields ...
  createdBy   String   @default("admin")
  updatedBy   String   @default("admin")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // ... existing relations ...
}
```

**Step 5: 迁移数据库**

```bash
cd /home/boyingliu01/projects/interview-bot
npx prisma generate
npx prisma db push
```

Expected: Schema synced, new columns added with defaults.

**Step 6: 验证**

```bash
npx prisma studio
```

Verify: All 4 models show createdBy, updatedBy, createdAt, updatedAt fields.

---

### Task 2: 模板详情页后端路由

**Files:**
- Modify: `src/api/admin-templates.ts` (在 plans 路由前插入新路由)
- Test: `tests/admin-templates.test.ts`

**Step 1: 添加 GET /admin/templates/:id 路由**

在 `src/api/admin-templates.ts` line 337 之前 (plans 路由前)，插入:

```typescript
// GET /admin/templates/:id - Template detail page
fastify.get(
  "/admin/templates/:id",
  { preHandler: adminAuth },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = (request.params as { id: string });
    const template = await prisma.template.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            interviewPlans: true,
            interviews: true,
          },
        },
        interviewPlans: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            name: true,
            status: true,
            completedCount: true,
            sentCount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!template) {
      return reply.status(404).type("text/html").send("模板不存在");
    }

    const content = JSON.parse(template.content || "{}");
    return reply.view("/templates/detail.njk", {
      template,
      content,
      plans: template.interviewPlans,
      planCount: template._count.interviewPlans,
      interviewCount: template._count.interviews,
    });
  },
);
```

**Step 2: 添加 GET /admin/api/templates/:id/stats JSON 路由**

紧接上一个路由后插入:

```typescript
// GET /admin/api/templates/:id/stats - Usage statistics
fastify.get(
  "/admin/api/templates/:id/stats",
  { preHandler: adminAuth },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = (request.params as { id: string });
    const interviews = await prisma.interview.groupBy({
      by: ["status"],
      where: { templateId: id },
      _count: true,
    });

    const plans = await prisma.interviewPlan.groupBy({
      by: ["status"],
      where: { templateId: id },
      _count: true,
    });

    return reply.send({
      interviews: Object.fromEntries(
        interviews.map((i) => [i.status, i._count]),
      ),
      plans: Object.fromEntries(plans.map((p) => [p.status, p._count])),
      totalInterviews: interviews.reduce((sum, i) => sum + i._count, 0),
      totalPlans: plans.reduce((sum, p) => sum + p._count, 0),
    });
  },
);
```

**Step 3: 添加测试**

在 `tests/admin-templates.test.ts` 中添加:

```typescript
it("should return template detail with plans", async () => {
  mockPrisma.template.findUnique.mockResolvedValue({
    id: "tpl-1",
    name: "Test Template",
    content: '{"questions":[]}',
    _count: { interviewPlans: 2, interviews: 5 },
    interviewPlans: [
      { id: "plan-1", name: "Plan A", status: "IN_PROGRESS", completedCount: 3, sentCount: 5, createdAt: new Date() },
    ],
  });
  mockReply.view.mockResolvedValue("<html>detail</html>");

  const response = await app.inject({
    method: "GET",
    url: "/admin/templates/tpl-1",
    headers: { "x-admin-key": "dev-admin-key-123" },
  });

  expect(response.statusCode).toBe(200);
  expect(mockPrisma.template.findUnique).toHaveBeenCalledWith({
    where: { id: "tpl-1" },
    include: expect.any(Object),
  });
});
```

**Step 4: 运行测试**

```bash
cd /home/boyingliu01/projects/interview-bot
npm run test -- --run tests/admin-templates.test.ts
```

Expected: All tests pass.

**Step 5: 提交**

```bash
git add src/api/admin-templates.ts tests/admin-templates.test.ts prisma/schema.prisma
git commit -m "feat: add template detail route with plans and stats"
```

---

### Task 3: 模板详情页视图 (3 Tab)

**Files:**
- Create: `src/views/templates/detail.njk`

**Step 1: 创建模板详情页面**

```nunjucks
{% extends "layouts/admin.njk" %}

{% block content %}
<div class="mb-6">
  <div class="flex items-center gap-3 mb-2">
    <a href="/admin/templates" class="text-blue-600 hover:text-blue-800 text-sm">
      ← 返回模板列表
    </a>
  </div>
  <h1 class="text-2xl font-bold text-gray-900">模板详情：{{ template.name }}</h1>
</div>

<!-- Tab Navigation -->
<div class="border-b border-gray-200 mb-6"
     x-data="{ activeTab: 'basic' }">
  <nav class="-mb-px flex gap-6">
    <button @click="activeTab = 'basic'"
            :class="activeTab === 'basic' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      基本信息
    </button>
    <button @click="activeTab = 'plans'"
            :class="activeTab === 'plans' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      关联计划 ({{ planCount }})
    </button>
    <button @click="activeTab = 'stats'"
            :class="activeTab === 'stats' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      使用统计
    </button>
  </nav>

  <!-- Tab: Basic Info -->
  <div x-show="activeTab === 'basic'" class="py-4">
    <dl class="grid grid-cols-2 gap-4 max-w-4xl">
      <div>
        <dt class="text-sm font-medium text-gray-500">名称</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ template.name }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">状态</dt>
        <dd class="mt-1">
          <span class="px-2 py-1 text-xs font-semibold rounded-full
            {% if template.status == 'ACTIVE' %}bg-green-100 text-green-800
            {% else %}bg-yellow-100 text-yellow-800{% endif %}">
            {{ template.status }}
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">创建人</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ template.createdBy or 'admin' }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">创建时间</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ template.createdAt | date('Y-m-d H:i') }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">更新人</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ template.updatedBy or 'admin' }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">更新时间</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ template.updatedAt | date('Y-m-d H:i') }}</dd>
      </div>
    </dl>

    <!-- Interview Prompt -->
    <div class="mt-6">
      <h3 class="text-sm font-medium text-gray-700 mb-2">访谈 Prompt</h3>
      <pre class="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{{ content.invitationPrompt or '未设置' }}</pre>
    </div>

    <!-- Questions -->
    <div class="mt-6">
      <h3 class="text-sm font-medium text-gray-700 mb-2">问题列表 ({{ content.questions | length }})</h3>
      <ol class="space-y-2">
        {% for q in content.questions or [] %}
        <li class="flex items-start gap-2">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center">{{ loop.index }}</span>
          <span class="text-sm text-gray-700">{{ q }}</span>
        </li>
        {% endfor %}
      </ol>
    </div>

    <!-- Closing Message -->
    <div class="mt-6">
      <h3 class="text-sm font-medium text-gray-700 mb-2">结束语</h3>
      <pre class="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap">{{ content.closingMessage or '未设置' }}</pre>
    </div>

    <!-- LLM Prompt -->
    <div class="mt-6">
      <h3 class="text-sm font-medium text-gray-700 mb-2">LLM Prompt</h3>
      <pre class="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">{{ content.llmPrompt or '使用默认' }}</pre>
      <button class="mt-2 text-sm text-blue-600 hover:text-blue-800"
              hx-get="/admin/templates/{{ template.id }}/edit"
              hx-target="body">
        [编辑模板]
      </button>
    </div>
  </div>

  <!-- Tab: Related Plans -->
  <div x-show="activeTab === 'plans'" class="py-4">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">计划名称</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">状态</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">完成率</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">创建时间</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">操作</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {% for plan in plans %}
        <tr>
          <td class="px-4 py-2">
            <a href="/admin/plans/{{ plan.id }}" class="text-blue-600 hover:text-blue-800">
              {{ plan.name }}
            </a>
          </td>
          <td class="px-4 py-2">
            <span class="px-2 py-1 text-xs font-semibold rounded-full
              {% if plan.status == 'COMPLETED' %}bg-green-100 text-green-800
              {% elif plan.status == 'IN_PROGRESS' %}bg-blue-100 text-blue-800
              {% else %}bg-yellow-100 text-yellow-800{% endif %}">
              {{ plan.status }}
            </span>
          </td>
          <td class="px-4 py-2">
            {% if plan.sentCount > 0 %}
              {{ plan.completedCount }}/{{ plan.sentCount }} ({{ (plan.completedCount / plan.sentCount * 100) | round }}%)
            {% else %}
              0/0
            {% endif %}
          </td>
          <td class="px-4 py-2 text-sm text-gray-500">
            {{ plan.createdAt | date('Y-m-d') }}
          </td>
          <td class="px-4 py-2">
            <a href="/admin/plans/{{ plan.id }}" class="text-blue-600 hover:text-blue-800 text-sm">
              查看详情
            </a>
          </td>
        </tr>
        {% else %}
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-gray-500">
            暂无关联计划。
          </td>
        </tr>
        {% endfor %}
      </tbody>
    </table>

    <div class="mt-4">
      <a href="/admin/plans/new?templateId={{ template.id }}"
         class="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
        + 从此模板创建新计划
      </a>
    </div>
  </div>

  <!-- Tab: Usage Stats -->
  <div x-show="activeTab === 'stats'" class="py-4"
       x-data="{}"
       hx-get="/admin/api/templates/{{ template.id }}/stats"
       hx-trigger="revealed"
       hx-swap="innerHTML">
    <!-- HTMX 加载统计数据 -->
    <div class="flex items-center gap-3 text-gray-500 py-8">
      <span class="animate-spin">⏳</span>
      <span>加载统计数据...</span>
    </div>
  </div>
</div>
{% endblock %}
```

**Step 2: 验证 Nunjucks date 过滤器**

确认 `src/server.ts` 中注册了 date 过滤器。如未注册，在 fastify-view 配置中添加:

```typescript
// In server.ts where nunjucks is configured:
env.addFilter('date', function(date, format) {
  if (!date) return '-';
  const d = new Date(date);
  // Simple format: YYYY-MM-DD HH:mm
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});
```

**Step 3: 提交**

```bash
git add src/views/templates/detail.njk src/api/admin-templates.ts
git commit -m "feat: add template detail page with 3 tabs"
```

---

### Task 4: 计划详情页后端路由

**Files:**
- Modify: `src/api/admin-templates.ts`
- Test: `tests/admin-templates.test.ts`

**Step 1: 添加 GET /admin/plans/:id 路由**

在 plans 列表路由 (line 337-367) 后插入:

```typescript
// GET /admin/plans/:id - Plan detail page
fastify.get(
  "/admin/plans/:id",
  { preHandler: adminAuth },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = (request.params as { id: string });
    const plan = await prisma.interviewPlan.findUnique({
      where: { id },
      include: {
        template: { select: { id: true, name: true } },
        interviews: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            userId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: { select: { interviews: true } },
      },
    });

    if (!plan) {
      return reply.status(404).type("text/html").send("计划不存在");
    }

    const completedCount = plan.interviews.filter(
      (i) => i.status === "COMPLETED"
    ).length;

    return reply.view("/plans/detail.njk", {
      plan,
      template: plan.template,
      interviews: plan.interviews,
      totalInterviews: plan._count.interviews,
      completedCount,
      completionRate:
        plan.sentCount > 0
          ? Math.round((completedCount / plan.sentCount) * 100)
          : 0,
    });
  },
);
```

**Step 2: 添加测试**

```typescript
it("should return plan detail with interviews", async () => {
  mockPrisma.interviewPlan.findUnique.mockResolvedValue({
    id: "plan-1",
    name: "Test Plan",
    status: "IN_PROGRESS",
    sentCount: 5,
    template: { id: "tpl-1", name: "Test Template" },
    interviews: [
      { id: "int-1", userId: "user1", status: "COMPLETED", createdAt: new Date(), updatedAt: new Date() },
      { id: "int-2", userId: "user2", status: "IN_PROGRESS", createdAt: new Date(), updatedAt: new Date() },
    ],
    _count: { interviews: 2 },
  });
  mockReply.view.mockResolvedValue("<html>plan detail</html>");

  const response = await app.inject({
    method: "GET",
    url: "/admin/plans/plan-1",
    headers: { "x-admin-key": "dev-admin-key-123" },
  });

  expect(response.statusCode).toBe(200);
});
```

**Step 3: 运行测试并提交**

```bash
npm run test -- --run tests/admin-templates.test.ts
git add src/api/admin-templates.ts tests/admin-templates.test.ts
git commit -m "feat: add plan detail route with interviews"
```

---

### Task 5: 计划详情页视图 (3 Tab)

**Files:**
- Create: `src/views/plans/detail.njk`

**Step 1: 创建计划详情页面**

```nunjucks
{% extends "layouts/admin.njk" %}

{% block content %}
<div class="mb-6">
  <div class="flex items-center gap-3 mb-2">
    <a href="/admin/plans" class="text-blue-600 hover:text-blue-800 text-sm">
      ← 返回计划列表
    </a>
    <span class="text-gray-400">|</span>
    <a href="/admin/templates/{{ template.id }}" class="text-blue-600 hover:text-blue-800 text-sm">
      所属模板：{{ template.name }}
    </a>
  </div>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-900">计划详情：{{ plan.name }}</h1>
    <span class="px-3 py-1 text-sm font-semibold rounded-full
      {% if plan.status == 'COMPLETED' %}bg-green-100 text-green-800
      {% elif plan.status == 'IN_PROGRESS' %}bg-blue-100 text-blue-800
      {% else %}bg-yellow-100 text-yellow-800{% endif %}">
      {{ plan.status }}
    </span>
  </div>
</div>

<!-- Tab Navigation -->
<div class="border-b border-gray-200 mb-6"
     x-data="{ activeTab: 'info' }">
  <nav class="-mb-px flex gap-6">
    <button @click="activeTab = 'info'"
            :class="activeTab === 'info' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      计划信息
    </button>
    <button @click="activeTab = 'progress'"
            :class="activeTab === 'progress' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      人员进度 ({{ totalInterviews }})
    </button>
    <button @click="activeTab = 'summary'"
            :class="activeTab === 'summary' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'"
            class="py-3 px-1 border-b-2 font-medium text-sm">
      计划总结
    </button>
  </nav>

  <!-- Tab: Plan Info -->
  <div x-show="activeTab === 'info'" class="py-4">
    <dl class="grid grid-cols-2 gap-4 max-w-4xl">
      <div>
        <dt class="text-sm font-medium text-gray-500">名称</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.name }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">描述</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.description or '-' }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">所属模板</dt>
        <dd class="mt-1 text-sm text-gray-900">
          <a href="/admin/templates/{{ template.id }}" class="text-blue-600 hover:text-blue-800">
            {{ template.name }}
          </a>
        </dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">状态</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.status }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">创建人</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.createdBy or 'admin' }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">创建时间</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.createdAt | date('Y-m-d H:i') }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">更新人</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.updatedBy or 'admin' }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">更新时间</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.updatedAt | date('Y-m-d H:i') }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">受访者总数</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ plan.sentCount }}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500">已完成</dt>
        <dd class="mt-1 text-sm text-gray-900">{{ completedCount }}</dd>
      </div>
    </dl>
  </div>

  <!-- Tab: Progress -->
  <div x-show="activeTab === 'progress'" class="py-4">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">被访谈人</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">状态</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">开始时间</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">完成时间</th>
          <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">操作</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {% for interview in interviews %}
        <tr>
          <td class="px-4 py-2 text-sm text-gray-900">{{ interview.userId }}</td>
          <td class="px-4 py-2">
            <span class="px-2 py-1 text-xs font-semibold rounded-full
              {% if interview.status == 'COMPLETED' %}bg-green-100 text-green-800
              {% elif interview.status == 'IN_PROGRESS' %}bg-blue-100 text-blue-800
              {% else %}bg-gray-100 text-gray-600{% endif %}">
              {{ interview.status }}
            </span>
          </td>
          <td class="px-4 py-2 text-sm text-gray-500">
            {{ interview.createdAt | date('Y-m-d H:i') }}
          </td>
          <td class="px-4 py-2 text-sm text-gray-500">
            {% if interview.status == 'COMPLETED' %}
              {{ interview.updatedAt | date('Y-m-d H:i') }}
            {% else %}
              -
            {% endif %}
          </td>
          <td class="px-4 py-2">
            {% if interview.status == 'COMPLETED' %}
              <a href="/admin/reports/{{ interview.id }}" class="text-blue-600 hover:text-blue-800 text-sm">
                查看报告
              </a>
            {% else %}
              <span class="text-gray-400 text-sm">-</span>
            {% endif %}
          </td>
        </tr>
        {% else %}
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-gray-500">
            暂无受访者。
          </td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>

  <!-- Tab: Summary -->
  <div x-show="activeTab === 'summary'" class="py-4">
    <div class="bg-gray-50 rounded-lg p-8 text-center">
      <p class="text-gray-500 mb-4">计划总结功能开发中...</p>
      <p class="text-sm text-gray-400">
        计划完成后，可在此生成基于 LLM 的跨受访者综合分析。
      </p>
    </div>
  </div>
</div>
{% endblock %}
```

**Step 2: 更新 plans/index.njk 链接**

在 `src/views/plans/index.njk` 中，将计划名改为指向详情页:

```nunjucks
<!-- Change from: -->
<td class="px-4 py-2">{{ plan.name }}</td>
<!-- To: -->
<td class="px-4 py-2">
  <a href="/admin/plans/{{ plan.id }}" class="text-blue-600 hover:text-blue-800">
    {{ plan.name }}
  </a>
</td>
```

**Step 3: 提交**

```bash
git add src/views/plans/detail.njk src/views/plans/index.njk
git commit -m "feat: add plan detail page with 3 tabs"
```

---

### Task 6: 报告列表页增强 (筛选)

**Files:**
- Modify: `src/api/admin-templates.ts` (reports 路由)
- Modify: `src/views/reports/index.njk`

**Step 1: 增强 GET /admin/reports 路由**

在 `src/api/admin-templates.ts` 中找到 reports 路由 (line 369-395)，修改为支持筛选:

```typescript
// GET /admin/reports - List reports with filters
fastify.get(
  "/admin/reports",
  { preHandler: adminAuth },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const page = parseInt(query.page || "1");
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.planId) where.planId = query.planId;
    if (query.templateId) where.templateId = query.templateId;
    if (query.status) where.status = query.status;

    const [reports, plans, templates] = await Promise.all([
      prisma.analysisReport.findMany({
        where: {
          interview: where,
        },
        include: {
          interview: {
            select: {
              userId: true,
              status: true,
              planId: true,
              templateId: true,
              plan: { select: { id: true, name: true } },
              template: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.interviewPlan.findMany({ select: { id: true, name: true } }),
      prisma.template.findMany({ select: { id: true, name: true } }),
    ]);

    const total = await prisma.analysisReport.count({
      where: { interview: where },
    });

    return reply.view("/reports/index.njk", {
      reports,
      plans,
      templates,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      filters: query,
    });
  },
);
```

**Step 2: 更新报告列表视图**

在 `src/views/reports/index.njk` 顶部添加筛选栏，表格增加计划/模板列。

**Step 3: 提交**

```bash
git add src/api/admin-templates.ts src/views/reports/index.njk
git commit -m "feat: add report list filtering by plan/template/status"
```

---

### Task 7: 更新导航链接

**Files:**
- Modify: `src/views/layouts/admin.njk`

**Step 1: 更新导航栏**

在 `src/views/layouts/admin.njk` 的 nav 部分 (约 line 22-26)，从 3 链接改为 4 链接:

```nunjucks
<!-- 从: -->
<nav class="flex gap-6">
  <a href="/admin/templates">模板列表</a>
  <a href="/admin/plans">访谈计划</a>
  <a href="/admin/reports">访谈报告</a>
</nav>

<!-- 改为: -->
<nav class="flex gap-6">
  <a href="/admin/templates" class="hover:text-blue-600">模板管理</a>
  <a href="/admin/plans" class="hover:text-blue-600">访谈计划</a>
  <a href="/admin/reports" class="hover:text-blue-600">访谈报告</a>
  <a href="/admin/analytics" class="hover:text-blue-600">统计分析</a>
</nav>
```

**Step 2: 提交**

```bash
git add src/views/layouts/admin.njk
git commit -m "feat: add analytics link to admin navigation"
```

---

### Task 8: 统计分析页占位

**Files:**
- Create: `src/views/analytics/index.njk`
- Modify: `src/api/admin-templates.ts`

**Step 1: 添加统计分析路由**

在 `src/api/admin-templates.ts` 末尾添加:

```typescript
// GET /admin/analytics - Analytics dashboard placeholder
fastify.get(
  "/admin/analytics",
  { preHandler: adminAuth },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const [templates, plans] = await Promise.all([
      prisma.template.findMany({
        select: { id: true, name: true },
      }),
      prisma.interviewPlan.findMany({
        select: { id: true, name: true },
      }),
    ]);

    return reply.view("/analytics/index.njk", { templates, plans });
  },
);
```

**Step 2: 创建占位页面**

```nunjucks
{% extends "layouts/admin.njk" %}

{% block content %}
<h1 class="text-2xl font-bold text-gray-900 mb-6">统计分析</h1>

<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
  <h2 class="text-lg font-semibold text-yellow-800 mb-2">功能开发中</h2>
  <p class="text-sm text-yellow-700 mb-4">
    统计分析页将提供跨计划的汇总数据，包括:
  </p>
  <ul class="list-disc list-inside text-sm text-yellow-700 space-y-1">
    <li>KPI 卡片: 总访谈数、完成率、平均用时、问题覆盖率</li>
    <li>状态分布饼图</li>
    <li>计划完成率柱状图</li>
    <li>趋势折线图</li>
  </ul>
</div>

<div class="mt-6">
  <label class="block text-sm font-medium text-gray-700 mb-2">筛选</label>
  <div class="flex gap-3">
    <select class="border rounded-lg px-3 py-2 text-sm">
      <option value="">选择模板</option>
      {% for t in templates %}
      <option value="{{ t.id }}">{{ t.name }}</option>
      {% endfor %}
    </select>
    <select class="border rounded-lg px-3 py-2 text-sm">
      <option value="">选择计划</option>
      {% for p in plans %}
      <option value="{{ p.id }}">{{ p.name }}</option>
      {% endfor %}
    </select>
    <button class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
      应用筛选
    </button>
  </div>
</div>
{% endblock %}
```

**Step 3: 提交**

```bash
git add src/api/admin-templates.ts src/views/analytics/index.njk
git commit -m "feat: add analytics dashboard placeholder page"
```

---

### Task 9: 运行质量门禁

**Step 1: TypeScript 检查**

```bash
cd /home/boyingliu01/projects/interview-bot
npm run type-check
```

Expected: 0 errors.

**Step 2: Lint 检查**

```bash
npm run lint
```

Expected: 0 errors.

**Step 3: 运行全部测试**

```bash
npm run test
```

Expected: 441+ passed, 0 failed.

**Step 4: 提交全部**

```bash
git add -A
git commit -m "feat: UI hierarchy redesign - all quality gates green"
```
