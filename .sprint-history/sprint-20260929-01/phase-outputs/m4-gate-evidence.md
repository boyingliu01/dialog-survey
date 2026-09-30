# M4 gate evidence — 生产回归（R1-M4）

- **状态**: 变更集已提交 `d85167c`（sprint/2026-09-29-01）；本文件为 M4 门禁的**本机证据**；CI 半份待推送后回填
- **门禁**: AC#5 — AC-PRISMA7-005-01（pack/install 场景）+ AC-PRISMA7-005-02（build + 无源码树启动 + `/health` db ok + docker build e2e **或**预定义替代证据（tier c））
- **预算**: ≤0.5 天（实际：发布链路补完 + 冒烟 + 替代证据一轮完成）

## 0. 变更集与 DD-009 发布链路补完（7 files）

`d85167c fix(release): #149 M4 发布链路适配补完 + 静态审查整改`
（`.dockerignore` `Dockerfile` `docker-compose.yml` `scripts/cli.mjs` `scripts/deploy.sh` `tests/cli.test.ts` `tests/e2e/cli-install.e2e.test.ts`）

DD-009 发布链路行逐项落地：

| DD-009 行 | 文件 | 状态 |
|---|---|---|
| Dockerfile runner `COPY prisma.config.ts` | `Dockerfile` | ✅ d85167c |
| runner `COPY public/`（静态审查新增发现，见 §6） | `Dockerfile` | ✅ d85167c |
| `deploy.sh` Node 版本检查 major-only → semver `>=20.19.0` | `scripts/deploy.sh` | ✅ d85167c |
| `cli.mjs` (a) `filesToCopy += prisma.config.ts` | `scripts/cli.mjs` | ✅ d85167c |
| `cli.mjs` (b) `verifyInstallation.requiredFiles += prisma.config.ts` | `scripts/cli.mjs` | ✅ d85167c |
| `cli.mjs` (c) db push 保留 + `prisma@7.10.0` pin + `PRISMA_SKIP_GENERATE=1`（spike #11 验证；7.10.0 无 `--no-generate`） | `scripts/cli.mjs` | ✅ d85167c |
| `cli.mjs` 移除 `npx prisma generate` 步（包内已发 `dist/src/generated/prisma`） | `scripts/cli.mjs` | ✅ d85167c |
| `cli.mjs` `checkNodeVersion` semver `>=20.19.0` | `scripts/cli.mjs` | ✅ d85167c（+2 边界测试：20.18.9 fail / 20.19.0 pass） |
| `package.json` engines `>=20.19.0` / `publish.yml` node-version-file `.nvmrc` | 前序阶段 | ✅ 核对通过（engines 与 `.nvmrc`（20.19）一致） |

## 1. 构建 + 全量测试（本机）

| Field | Value |
|---|---|
| tsc | `npx tsc --noEmit` 干净（合并于下方 suite 命令前置） |
| 构建 | `npm run build` = tsc，6.3s；`dist/src/server.js` 16061B + `dist/src/generated/prisma/client.js` 1261B |
| 全量 | `env -u DATABASE_URL -u TEST_DATABASE_URL npx vitest run` → **117/117 files, 1266 passed \| 1 skipped, 0 failed, 77.13s, EXIT=0** |
| 日志 | `m4-full-suite.log`（`SUITE_EXIT=0`）；skip 为 `tests/server-api.test.ts` 既有 1 例（与 Stage B 基线相同） |
| 回归对照 | Stage B（116 files / 1261 passed \| 1 skipped）→ 全部仍绿；+1 file = `tests/pglite-template.test.ts`（Stage B 后补的合同测试，单独跑过），+5 tests = 3 合同 + 2 checkNodeVersion。**零回归** |

## 2. 无源码树冒烟 — fresh `npm pack`（AC-PRISMA7-005-01）

| Field | Value |
|---|---|
| 命令/脚本 | `bash .sprint-state/phase-outputs/m4-smoke.sh`（日志 `m4-smoke.log`） |
| 工件 | `dialog-survey-1.8.9.tgz` 718,324B，sha256 `0d650855abf42d64a4ae902c1f1ab7f9fdbe8af5697427f2ed6e30547b99fbc2`，**846 files** |
| 无源码树断言 | `tsconfig.json` / `tests` / `src/api` / `src/server.ts` 均 absent ✅ |
| 关键运行时件 | `dist/src/server.js`、`dist/src/generated/prisma/client.js`、`src/views/layouts/admin.njk`、`public/css/admin.css`、`prisma/schema.prisma`、`prisma.config.ts`、`package.json`、`ecosystem.config.cjs`、`scripts/cli.mjs` 均 present ✅ |
| views 完整性 | worktree `src/views` 17/17 全部在 pack 内（tar 清单 vs `git ls-files` diff 为空） |
| 对照 listing | `m4-pack-listing.json`（`npm pack --dry-run --json`，846 files / dist=813 / views=17 / public=3 / prisma=3） |

### 场景 P（pack 布局 boot，真实 WSL2 PG，port 3921）

| 探测 | 结果 |
|---|---|
| boot | 1s 内可连（`Database connection OK` → `Server listening`） |
| `GET /health` | **HTTP 200**；`{"db":{"status":"ok","latencyMs":0}, llm/dingtalk degraded(dummy env)}` |
| `GET /admin/login` | **HTTP 200**（1731B，Nunjucks 真实渲染「登录 - 访谈管理后台」） |
| `GET /css/admin.css` | **HTTP 200**（真实 CSS） |
| `GET /js/htmx.min.js` | **HTTP 200**（82020B 真实 htmx） |

### 场景 L1b（pack 布局 + 不可达 DB，port 3922）

**exit=1** 设计内 fail-fast：`Database connection FAILED` → `PostgreSQL must be running before starting the server` → `Run: sudo systemctl start postgresql` ✅

### 场景 L2（pack 布局 − public/，同 dist 对照实验，port 3923）

**exit=1**：`Could not resolve static files directory. Tried: ...\l2\dist\public, ...\l2\public` —— 复现「旧 runner 不 COPY public/ 则镜像无法启动」；与场景 P 构成受控对照（唯一差异 = public/ 存在性），证明 `COPY public/` 修复必要且充分 ✅

## 3. Docker builder 链 WSL 等价复跑（tier c 替代证据 ①）

脚本 `m4-builder-sim.sh`，日志 `m4-builder-sim.log`；输入 = `git archive HEAD`（d85167c）sha256 `d5c867f716428c624f14b2c5a42470105b88e3cb2ad007b17f565ed2782783e0`；WSL Ubuntu / node **v20.19.6**（`.nvmrc` 20.19）

| 步骤（= Dockerfile builder 链） | 结果 |
|---|---|
| `npm ci --ignore-scripts` | **exit 0**（620 packages / 10.2s） |
| `npx prisma generate` | **exit 0** — `Loaded Prisma config from prisma.config.ts`（形态 B 在新装 Linux 树加载成功）+ Client 7.10.0 → `./src/generated/prisma` |
| `npm run build` | **exit 0**（6.7s）；`dist/src/server.js` 16061B（与 Windows 构建字节数一致） |
| Linux boot + PG | `Database connection OK` → listening :3905；`/health` **db ok latencyMs=1**；`/admin/login` **HTTP 200** |

观察（非阻断）：npm ci 输出 3 条 `EBADENGINE` 告警（`cookie@2.0.1`/`@prisma/streams-local` engines 声明 node>=22、`commander@15` node>=22.12）——npm engines 为 advisory；node 20.19.6 实测全链路 boot + 关键页 200，与 engines `>=20.19.0` 结论一致。

## 4. Docker 不可用与 tier-(c) 组合（AC-PRISMA7-005-02 替代路径）

- **基线尝试**: `m4-docker-build-baseline.log` — `docker build` 在拉取 `node:20-alpine` metadata 时 TLS 证书不匹配（企业网络阻断 registry-1.docker.io），exit 1；环境无 podman/buildah。
- **替代组合（tier c）**:
  1. **builder 链等价复跑**（§3，WSL Ubuntu）；
  2. **runner 静态逐行核对（T-m4/R4-T9）**：每个 `COPY --from=builder` 源 ∈ pack 产物 ∪ 基础镜像：

| runner COPY 源 | 判定 | 证据 |
|---|---|---|
| `/app/dist` | ✅ pack（813 entries） | P 场景 boot |
| `/app/node_modules` | ✅ builder 产物（npm ci，非 pack 内容属预期） | sim npm ci exit 0（620 pkgs）；P boot 经 junction 解析成功 |
| `/app/prisma` | ✅ pack（3） | present 断言 |
| `/app/src/views` | ✅ pack（17/17） | views diff 空 |
| `/app/public` | ✅ pack（3） | present 断言 + L2 对照证明必要性 |
| `/app/prisma.config.ts` | ✅ pack（1） | present 断言 |
| `/app/.env.example` | ✅ build context（tracked；`.dockerignore` `!.env.example` 保留） | `git ls-files` ✅ |
| `CMD dist/src/server.js` | ✅ pack | P 场景 boot |
  3. **受控对照实验**（§2 L2 vs P）替代容器内启动验证。

- **残余风险声明（SHIP 用户门禁引用）**: docker build/run **未在容器内实际执行**。差异点 = `node:20-alpine`（musl）vs WSL Ubuntu（glibc）——但 Dockerfile 的 `npm ci` 发生在 alpine 容器内，原生模块会在目标 libc 下安装；本机模拟覆盖的是构建链语义与包内容，不含 alpine rootfs 特有行为。若 CI 或部署机可访问 registry，建议推送后以 `docker build` 一次实测关闭该残余项。

## 5. 静态审查整改（3 处真实缺陷，共同修复于 d85167c）

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| 1 | runner 未 `COPY public/` | 镜像启动即抛 `Could not resolve static files directory`（L2 复现） | `COPY --from=builder /app/public ./public` + P 场景验证 |
| 2 | `HEALTHCHECK` 用 `curl`（node:20-alpine 无 curl） | 容器永远 unhealthy / 启动脚本误判 | 改 `node -e fetch(...)`；`docker-compose.yml` 同步 |
| 3 | `.dockerignore` 缺 `node_modules/` 等 | 构建上下文膨胀、可能污染 `COPY . .` | 补 Node.js / sprint 产物 / `.env.*`+`!.env.example` 规则 |

## 6. Emergent issues（记录，不在本 sprint 修复）

| # | 事项 | 依据 | 处置 |
|---|---|---|---|
| 1 | `ecosystem.config.cjs` 的 `script: 'dist/server.js'` 与实际入口 `dist/src/server.js` 不符；`cli.mjs` start 走 `pm2 start ecosystem.config.cjs` → **Linux+PM2 路径受影响**（Windows 无 pm2 时走 direct 不受影响） | 设计 §1.3 Out of Scope（记为 emergent） | 记录至 CLOSE；候选后续 issue |
| 2 | `HEALTHCHECK` curl 版从未在容器内被验证过（修复前坏、修复后为 node fetch） | 本文件 §4 残余风险 | 随 §4 一并记录 |
| 3 | EBADENGINE 告警（3 传递依赖声明 node>=22） | §3 观察 | 记录；若后续升 Node 基线可消除 |

## 7. 证据文件索引

| 文件 | 内容 |
|---|---|
| `m4-full-suite.log` | 117 files / 1266 passed \| 1 skipped / EXIT=0 |
| `m4-pack-listing.json` | `npm pack --dry-run --json` 清单（846 files） |
| `m4-smoke.sh` / `m4-smoke.log` | fresh pack + 场景 P / L1b / L2 全记录 |
| `m4-builder-sim.sh` / `m4-builder-sim.log` | WSL builder 链等价复跑 |
| `m4-docker-build-baseline.log` | docker build 不可用基线（registry TLS 阻断） |
| `stageB-gate-evidence.md` 等 | 前序阶段上下文 |

## 8. CI 半份（待推送回填）

- [ ] `pr.yml`（workflow_dispatch）7 job 全绿（无 PG service）
- [ ] `spike-prisma7.yml` 自动复跑：`#11` 修复后 ubuntu `PASS#`（仅 #6b），job exit 0
- [ ] 推送后回填 run ID 与本表
