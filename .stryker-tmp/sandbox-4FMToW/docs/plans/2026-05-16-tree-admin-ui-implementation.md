# Tree Admin UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the flat admin navigation into a hierarchical tree UI (Template → Plan → Interview) with server-side rendering, HTMX content loading, and Alpine.js interactivity.

**Architecture:** Server-rendered Nunjucks tree layout (`admin-tree.njk`) with Alpine.js for collapse/expand/select interactions. Right content area loads via HTMX `hx-get` to dedicated `/admin/content/*` routes. Plan detail uses Alpine.js tabs (Basic/Stats/Members). Data clipping: plans capped at 20, interviews at 15.

**Tech Stack:** Nunjucks (server templates), HTMX 2.0 (content loading), Alpine.js 3.14 (interactivity), Tailwind CSS (styling), Fastify + Prisma (backend), TypeScript.

---

### Task 1: Rewrite `admin-tree.njk` Layout

**Files:**
- Rewrite: `src/views/layouts/admin-tree.njk`

**Step 1: Write the new layout**

Replace the entire file with a server-rendered tree layout:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ title | default('访谈管理后台') }}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" onerror="this.src='/js/htmx.min.js'"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js" onerror="this.src='/js/alpine.min.js'"></script>
  <style>
    [x-cloak] { display: none !important; }
    .tree-node { transition: background 0.12s; border-left: 2px solid transparent; }
    .tree-node:hover { background: #f1f5f9; border-left-color: #94a3b8; }
    .tree-node.selected { background: #e0e7ff; border-left-color: #6366f1; color: #4338ca; }
    .chevron { transition: transform 0.15s; }
    .chevron.rotated { transform: rotate(90deg); }
    .sidebar-scroll::-webkit-scrollbar { width: 5px; }
    .sidebar-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  </style>
</head>
<body class="bg-gray-50 h-screen flex flex-col overflow-hidden" hx-headers='{"X-Admin-Key": "{{ adminApiKey | default('') | e('html_attr') }}"}'>
  <!-- Top bar -->
  <header class="bg-white border-b border-gray-200 flex-shrink-0 h-11 flex items-center px-4 gap-3">
    <span class="text-sm font-semibold text-gray-800">访谈管理后台</span>
    <div class="ml-auto flex items-center gap-2">
      <input type="text" id="tree-search" x-model.debounce.300ms="searchQuery"
             class="text-xs border border-gray-200 rounded-md px-2 py-1 w-40 focus:outline-none focus:border-indigo-400"
             placeholder="搜索模板/计划..." />
    </div>
  </header>

  <div class="flex flex-1 overflow-hidden">
    <!-- Left Sidebar: Tree -->
    <aside class="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto sidebar-scroll px-1 py-2 text-sm">
        {% block tree %}{% endblock %}
      </div>
    </aside>

    <!-- Right Content Area -->
    <main id="main-content" class="flex-1 overflow-y-auto" hx-target="#main-content" hx-swap="innerHTML show:top">
      {% if content_html | default(false) %}
      <div class="p-6">{{ content_html | safe }}</div>
      {% else %}
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <p class="text-base">点击左侧节点查看详情</p>
      </div>
      {% endif %}
    </main>
  </div>

  <!-- Global error toast -->
  <script>
  document.body.addEventListener('htmx:afterOnLoad', function(evt) {
    var s = evt.detail.xhr.status;
    if (s >= 400) {
      var msg = '操作失败 (HTTP ' + s + ')';
      var t = document.createElement('div');
      t.className = 'fixed top-3 right-3 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-xs';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){t.remove()}, 4000);
    }
  });

  // Initialize Alpine in HTMX-loaded content
  document.addEventListener('htmx:afterSwap', function(evt) {
    if (typeof Alpine !== 'undefined') {
      Alpine.initTree(evt.detail.target);
    }
  });
  </script>
</body>
</html>
```

**Step 2: Verify layout renders**

No build step needed for templates. Proceed to next task.

**Step 3: Commit**

```bash
git add src/views/layouts/admin-tree.njk
git commit -m "feat: rewrite admin-tree layout with SSR tree + HTMX content area"
```

---

### Task 2: Create Tree Body Partial

**Files:**
- Create: `src/views/admin/tree-body.njk`
- Modify: `src/api/admin-templates.ts` (add GET /admin route)

**Step 1: Write the tree body partial**

```html
<!-- tree-body.njk — Server-rendered tree of templates → plans → interviews -->
<div x-data="{ selectedId: null, searchQuery: '' }">
  <div class="font-semibold text-xs text-gray-400 uppercase tracking-wider px-2 py-1">
    访谈模板
  </div>
  {% for template in templates %}
  <div x-data="treeNode(true)" class="tree-group">
    <!-- Template Node -->
    <div class="tree-node flex items-center cursor-pointer rounded-md px-2 py-1 text-[13px]"
         :class="{'selected': selectedId === '{{ template.id }}'}"
         @click="selectedId = '{{ template.id }}'; htmx.ajax('GET', '/admin/content/templates/{{ template.id }}', {target: '#main-content', swap: 'innerHTML', pushUrl: true})"
         x-show="matchesSearch('{{ template.name | e('js') }}')">
      <!-- Chevron -->
      <button @click.stop="toggle()" class="p-0.5 mr-0.5 flex-shrink-0">
        <svg class="w-3 h-3 text-gray-400 chevron" :class="{'rotated': expanded}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
      <!-- Icon -->
      <svg class="w-3.5 h-3.5 text-gray-400 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
      </svg>
      <span class="truncate flex-1">{{ template.name }}</span>
      <span class="text-[10px] text-gray-400 ml-1">{{ template._plans.length }}/{{ template._count.interviewPlans }}</span>
    </div>

    <!-- Plans (level 2) -->
    <div x-show="expanded" class="ml-3">
      {% for plan in template._plans %}
      <div x-data="treeNode({{ plan.interviewCount <= 15 | lower }})">
        <div class="tree-node flex items-center cursor-pointer rounded-md px-2 py-1 text-[13px]"
             :class="{'selected': selectedId === '{{ plan.id }}'}"
             @click="selectedId = '{{ plan.id }}'; htmx.ajax('GET', '/admin/content/plans/{{ plan.id }}', {target: '#main-content', swap: 'innerHTML', pushUrl: true})">
          <button @click.stop="toggle()" class="p-0.5 mr-0.5 flex-shrink-0" x-show="expanded || (!expanded && {{ plan.interviewCount > 0 | lower }})">
            <svg class="w-3 h-3 text-gray-400 chevron" :class="{'rotated': expanded}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <!-- Status dot -->
          <span class="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 {{ plan.status | statusDotClass }}"></span>
          <span class="truncate flex-1">{{ plan.name }}</span>
          <span class="text-[10px] text-gray-400 ml-1">{{ plan.completedCount }}/{{ plan.interviewCount }}</span>
        </div>

        <!-- Interviews (level 3) -->
        <div x-show="expanded" class="ml-3">
          {% for interview in plan._interviews %}
          <div class="tree-node flex items-center cursor-pointer rounded-md px-2 py-1 text-[13px]"
               :class="{'selected': selectedId === '{{ interview.id }}'}"
               @click="selectedId = '{{ interview.id }}'; htmx.ajax('GET', '/admin/content/reports/{{ interview.id }}', {target: '#main-content', swap: 'innerHTML', pushUrl: true})">
            <span class="w-4 flex-shrink-0"></span>
            <span class="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0 {{ interview.status | interviewDotClass }}"></span>
            <span class="truncate">{{ interview.userId }}</span>
          </div>
          {% endfor %}
          {% if plan.interviewCount > 15 %}
          <div class="text-xs text-gray-400 px-2 py-1 cursor-pointer hover:text-indigo-500"
               hx-get="/admin/content/plans/{{ plan.id }}/all-interviews"
               hx-target="#main-content">
            └ ...{{ plan.interviewCount - 15 }} 人 — 点击查看完整列表
          </div>
          {% endif %}
        </div>
      </div>
      {% endfor %}
      {% if template._count.interviewPlans > 20 %}
      <div class="text-xs text-gray-400 px-2 py-1">└ ...{{ template._count.interviewPlans - 20 }} 个计划</div>
      {% endif %}
    </div>
  </div>
  {% endfor %}
</div>

<script>
function treeNode(defaultExpanded) {
  return { expanded: defaultExpanded, toggle() { this.expanded = !this.expanded; } };
}
</script>
```

**Step 2: Add Nunjucks filters for status colors**

In `src/server.ts` (inside `buildApp()` before registering routes), add custom filters:

```typescript
// After fastifyView registration, add custom Nunjucks filters
fastify.register(fastifyView, {
  engine: nunjucks,
  templates: viewsDir,
  options: {
    autoescape: true,
    noCache: true,
    onConfigure: (env: unknown) => {
      if (env && typeof env === 'object' && 'addFilter' in env) {
        const e = env as Record<string, unknown> & { addFilter: (n: string, fn: (...a: unknown[]) => string) => void };
        e.addFilter('statusDotClass', (status: string) => {
          const map: Record<string, string> = {
            PENDING: 'bg-gray-400', READY: 'bg-blue-400', RUNNING: 'bg-yellow-400',
            PAUSED: 'bg-orange-400', COMPLETED: 'bg-green-400', CANCELLED: 'bg-red-400',
          };
          return map[status] || 'bg-gray-400';
        });
        e.addFilter('interviewDotClass', (status: string) => {
          const map: Record<string, string> = {
            PENDING: 'bg-gray-400', ACTIVE: 'bg-yellow-400', WAITING: 'bg-amber-400',
            COMPLETED: 'bg-green-400', CANCELLED: 'bg-red-400',
          };
          return map[status] || 'bg-gray-400';
        });
      }
    },
  },
});
```

**Step 3: Commit**

```bash
git add src/views/admin/tree-body.njk src/server.ts
git commit -m "feat: add tree-body partial with SSR tree + status dot filters"
```

---

### Task 3: Add GET /admin Route with Tree Data

**Files:**
- Modify: `src/api/admin-templates.ts`

**Step 1: Add the GET /admin route**

At the start of `adminTemplatesRoutes()` function, before the existing `/admin/templates` route:

```typescript
// GET /admin — Tree view main entry
fastify.get('/admin', { preHandler: adminAuth }, async (_request: FastifyRequest, reply: FastifyReply) => {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, status: true, version: true, createdAt: true,
        _count: { select: { interviewPlans: true, interviews: true } },
        interviewPlans: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, name: true, status: true, completedCount: true, sentCount: true, createdAt: true,
            _count: { select: { interviews: true } },
            interviews: {
              orderBy: { createdAt: 'desc' },
              take: 15,
              select: { id: true, userId: true, status: true },
            },
          },
        },
      },
    });

    // Flatten for template
    const templatesWithPlans = templates.map(t => ({
      ...t,
      _plans: t.interviewPlans.map(p => ({
        ...p,
        interviewCount: p._count.interviews,
        _interviews: p.interviews,
      })),
      interviewPlans: undefined,
    }));

    return reply.view('admin-tree.njk', {
      adminApiKey: ADMIN_API_KEY,
      templates: templatesWithPlans,
    }, { layout: false });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Failed to load admin tree';
    error('Failed to load admin tree', { error: errMsg });
    return reply.status(500).view('error.njk', { message: errMsg });
  }
});
```

**Step 2: Commit**

```bash
git add src/api/admin-templates.ts
git commit -m "feat: add GET /admin route with tree data aggregation"
```

---

### Task 4: Create Content Routes (Templates, Plans, Reports)

**Files:**
- Modify: `src/api/admin-templates.ts`

**Step 1: Add content routes**

```typescript
// GET /admin/content/templates/:id
fastify.get('/admin/content/templates/:id', { preHandler: adminAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, status: true, version: true, createdAt: true, updatedAt: true,
      _count: { select: { interviewPlans: true, interviews: true } }},
  });
  if (!template) return reply.status(404).type('text/html').send('模板不存在');
  return reply.view('admin/content/template-info.njk', { adminApiKey: ADMIN_API_KEY, template });
});

// GET /admin/content/plans/:id
fastify.get('/admin/content/plans/:id', { preHandler: adminAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  const plan = await prisma.interviewPlan.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true } },
      interviews: { orderBy: { status: 'asc' }, select: { id: true, userId: true, status: true, createdAt: true, completedAt: true } },
      _count: { select: { interviews: true } },
    },
  });
  if (!plan) return reply.status(404).type('text/html').send('计划不存在');
  const completed = plan.interviews.filter(i => i.status === 'COMPLETED');
  return reply.view('admin/content/plan-detail.njk', {
    adminApiKey: ADMIN_API_KEY, plan, template: plan.template,
    interviews: plan.interviews, totalInterviews: plan._count.interviews,
    completedCount: completed.length,
    completionRate: plan.sentCount > 0 ? Math.round((completed.length / plan.sentCount) * 100) : 0,
  });
});

// GET /admin/content/reports/:interviewId
fastify.get('/admin/content/reports/:interviewId', { preHandler: adminAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
  const { interviewId } = request.params as { interviewId: string };
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { id: true, userId: true, status: true, createdAt: true, completedAt: true },
  });
  if (!interview) return reply.status(404).type('text/html').send('访谈不存在');
  const report = await prisma.analysisReport.findFirst({
    where: { interviewId }, orderBy: { createdAt: 'desc' },
  });
  return reply.view('admin/content/report-detail.njk', {
    adminApiKey: ADMIN_API_KEY, interview, report,
  });
});
```

**Step 2: Commit**

```bash
git add src/api/admin-templates.ts
git commit -m "feat: add content routes for templates, plans, reports"
```

---

### Task 5: Create Content View Templates

**Files:**
- Create: `src/views/admin/content/template-info.njk`
- Create: `src/views/admin/content/plan-detail.njk`
- Create: `src/views/admin/content/report-detail.njk`

**Step 1: Create template-info.njk**

```html
<div class="max-w-3xl mx-auto p-6">
  <h2 class="text-lg font-semibold text-gray-800 mb-4">{{ template.name }}</h2>
  <div class="grid grid-cols-2 gap-4 text-sm">
    <div><span class="text-gray-500">状态:</span> {{ template.status }}</div>
    <div><span class="text-gray-500">版本:</span> v{{ template.version }}</div>
    <div><span class="text-gray-500">关联计划:</span> {{ template._count.interviewPlans }}</div>
    <div><span class="text-gray-500">关联访谈:</span> {{ template._count.interviews }}</div>
  </div>
  {% if template.description %}
  <p class="mt-4 text-sm text-gray-600">{{ template.description }}</p>
  {% endif %}
</div>
```

**Step 2: Create plan-detail.njk with Alpine.js Tabs**

```html
<div x-data="{ activeTab: 'basic' }" class="max-w-4xl mx-auto p-6">
  <!-- Tabs -->
  <div class="flex border-b border-gray-200 mb-4">
    {% for tab in [{id:'basic',label:'基本信息'},{id:'stats',label:'统计分析'},{id:'members',label:'成员列表'}] %}
    <button @click="activeTab='{{ tab.id }}'"
            :class="activeTab==='{{ tab.id }}' ? 'border-b-2 border-indigo-500 text-indigo-600 font-medium' : 'text-gray-500'"
            class="px-4 py-2 text-sm">
      {{ tab.label }}
    </button>
    {% endfor %}
  </div>

  <!-- Tab 1: Basic Info -->
  <div x-show="activeTab==='basic'" class="space-y-3 text-sm">
    <p><span class="text-gray-500">计划名称:</span> {{ plan.name }}</p>
    <p><span class="text-gray-500">关联模板:</span> {{ template.name }}</p>
    <p><span class="text-gray-500">状态:</span> {{ plan.status }}</p>
    <p><span class="text-gray-500">进度:</span> {{ completedCount }}/{{ totalInterviews }} ({{ completionRate }}%)</p>
    {% if plan.description %}
    <p><span class="text-gray-500">描述:</span> {{ plan.description }}</p>
    {% endif %}
  </div>

  <!-- Tab 2: Stats -->
  <div x-show="activeTab==='stats'" x-cloak>
    {% if completedCount == 0 %}
    <div class="text-center text-gray-400 py-8">暂无数据，完成访谈后可查看统计</div>
    {% else %}
    <div class="space-y-3 text-sm">
      <p><span class="text-gray-500">已完成:</span> {{ completedCount }} 人</p>
      <!-- TODO: Add real sentiment analysis aggregation -->
      <p class="text-gray-400 text-xs italic">统计分析功能开发中...</p>
    </div>
    {% endif %}
  </div>

  <!-- Tab 3: Members -->
  <div x-show="activeTab==='members'" x-cloak>
    <table class="w-full text-sm">
      <thead><tr class="border-b"><th class="text-left py-2">姓名</th><th class="text-left py-2">状态</th><th class="text-left py-2">完成时间</th></tr></thead>
      <tbody>
        {% for interview in interviews %}
        <tr class="border-b">
          <td class="py-1.5">{{ interview.userId }}</td>
          <td class="py-1.5">{{ interview.status }}</td>
          <td class="py-1.5">{{ interview.completedAt | default('-') }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</div>
```

**Step 3: Create report-detail.njk**

```html
<div class="max-w-4xl mx-auto p-6">
  <h2 class="text-lg font-semibold text-gray-800 mb-2">访谈报告 — {{ interview.userId }}</h2>
  <div class="text-sm space-y-2 mb-4">
    <p><span class="text-gray-500">状态:</span> {{ interview.status }}</p>
    <p><span class="text-gray-500">创建时间:</span> {{ interview.createdAt }}</p>
  </div>
  {% if report %}
  <div class="prose prose-sm max-w-none">
    {{ report.content | safe }}
  </div>
  {% else %}
  <div class="text-center text-gray-400 py-8">暂无报告</div>
  {% endif %}
</div>
```

**Step 4: Commit**

```bash
git add src/views/admin/content/template-info.njk src/views/admin/content/plan-detail.njk src/views/admin/content/report-detail.njk
git commit -m "feat: add content view templates (template-info, plan-detail, report-detail)"
```

---

### Task 6: Ensure Backward Compatibility + Type Check

**Files:**
- Verify: `src/api/admin-templates.ts` (existing routes untouched)

**Step 1: Verify old routes still exist**

Check that these routes are still in `admin-templates.ts`:
- `/admin/templates` (list page)
- `/admin/plans` (plans list)
- `/admin/reports` (reports list)
- `/admin/templates/:id/edit` (edit form)

All should remain functional.

**Step 2: Run type check**

```bash
npm run type-check
```

Expected: 0 errors.

**Step 3: Run tests**

```bash
npm run test -- --run
```

Expected: All existing tests pass. The new routes don't have dedicated unit tests yet (they render views), but existing tests should not be broken.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify backward compatibility, type check, tests pass"
```

---

### Task 7: Integration Test

**Files:**
- Test manually via browser

**Step 1: Start server**

```bash
sh scripts/dev.sh
```

**Step 2: Verify in browser**

1. Navigate to `http://127.0.0.1:3000/admin`
2. Verify tree displays: Templates → Plans → Interviews
3. Click template → right panel shows template info
4. Click plan → right panel shows plan detail with 3 tabs
5. Click interview → right panel shows report
6. Verify old routes still work: `/admin/templates`, `/admin/plans`

**Step 3: Fix any runtime errors**

Check server logs for template rendering errors.

---

### Task 8: Add Tests for New Routes

**Files:**
- Create: `tests/admin-tree.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('GET /admin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  it('should return 200 for /admin', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin', headers: { 'X-Admin-Key': '' } });
    expect(response.statusCode).toBe(200);
  });

  it('should include tree markup', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin' });
    expect(response.body).toContain('访谈模板');
  });
});
```

**Step 2: Run tests**

```bash
npm run test -- tests/admin-tree.test.ts -v
```

**Step 3: Commit**

```bash
git add tests/admin-tree.test.ts
git commit -m "test: add basic tests for admin tree routes"
```
