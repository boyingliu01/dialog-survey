# 项目环境备忘

> 维护人: Sisyphus
> 最后更新: 2026-04-26

---

## PostgreSQL 启动

**本项目使用单机版 PostgreSQL，不使用数据库集群。**

```bash
sudo systemctl start postgresql
```

❌ 不要用 `pg_ctlcluster` 或集群相关命令——开发环境未配置集群。

验证：
```bash
pg_isready
# 或
psql -h localhost -U investigator -d interview_bot -c "SELECT 1"
```
