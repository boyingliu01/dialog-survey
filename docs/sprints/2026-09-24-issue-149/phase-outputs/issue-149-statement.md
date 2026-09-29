feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖

## 背景

当前集成测试（`tests/*.integration.test.ts`）需要真实 PostgreSQL 实例，CI 中通过 Docker service 启动。这导致：
- 本地开发无法直接运行集成测试（需手动启动 PG）
- CI 启动 PG service 增加延迟
- 并发测试可能出现竞态条件

## 目标

升级到 Prisma 7 + PGlite（嵌入式 PostgreSQL），使集成测试零外部依赖。

## 验收标准

- [ ] Prisma 升级到 7.x
- [ ] PGlite 作为测试数据库后端集成
- [ ] 所有集成测试通过（无外部 PG 依赖）
- [ ] CI pr.yml 中 integration-tests job 移除 postgres service
- [ ] 本地 npm test 无需手动启动 PG

## 参考

- 项目复盘报告 6.2 节：P0 优先级
- 当前版本：v1.8.5，Prisma 5.22
