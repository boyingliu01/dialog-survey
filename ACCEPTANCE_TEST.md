# 访谈机器人人工验收清单

## 验收准备

### 环境状态检查

| 项目 | 状态 | 说明 |
|------|------|------|
| Python 依赖 | ✅ | SQLAlchemy 2.0.48, FastAPI 0.135.1 |
| 数据库连接 | ✅ | PostgreSQL 连接正常 |
| 钉钉配置 | ✅ | AppKey, Secret, AgentID 已配置 |
| LLM 配置 | ✅ | 阿里百炼 API 已配置 |
| 公网地址 | ✅ | ngrok 隧道已配置 |
| 单元测试 | ✅ | 80 passed (核心模块) |

---

## Phase 1.5 验收项目

### 1. 追问次数限制 (FR-002 AC-003)

**测试步骤**:
1. 启动服务: `uvicorn src.api.main:app --reload`
2. 发送钉钉消息开始访谈
3. 对同一话题连续回答 3 次以上
4. 验证: 每个话题最多追问 2 次

**预期结果**: 第 3 次回答后自动跳转到下一个话题

### 2. 报告内容完善 (FR-003 AC-002)

**测试步骤**:
1. 完成一场完整访谈
2. 检查生成的报告文件
3. 验证报告包含:
   - [ ] 访谈概览
   - [ ] 关键发现
   - [ ] 情绪分析
   - [ ] 改进建议
   - [ ] 原始对话摘要

### 3. 报告持久化 (FR-003 AC-003)

**测试步骤**:
1. 完成访谈后查看 `reports/{session_id}/` 目录
2. 验证 Markdown 文件存在
3. 通过 API 查询报告: `GET /api/interviews/{session_id}/report`

### 4. 钉钉主动发送消息 (FR-004 AC-004)

**测试步骤**:
```bash
# 使用 curl 测试发送消息 API
curl -X POST "http://localhost:8000/api/test/send-message" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "钉钉用户ID", "message": "测试消息"}'
```

---

## Phase 2 验收项目

### 5. 访谈计划管理 (FR-005)

**API 测试**:
```bash
# 创建计划
curl -X POST "http://localhost:8000/api/plans" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "员工满意度调查", "template_id": "quality_survey"}'

# 添加被访谈人
curl -X POST "http://localhost:8000/api/plans/{plan_id}/interviewees" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '[{"name": "张三", "user_id": "dingtalk_user_id"}]'
```

### 6. 模板管理 (FR-006)

**API 测试**:
```bash
# 克隆模板
curl -X POST "http://localhost:8000/api/templates/quality_survey/clone" \
  -H "X-API-Key: your_api_key"

# 导出模板
curl "http://localhost:8000/api/templates/quality_survey/export" \
  -H "X-API-Key: your_api_key"

# 导入模板
curl -X POST "http://localhost:8000/api/templates/import" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d @template.json
```

---

## Phase 3 验收项目

### 7. 邀约发送 (FR-005 AC-004)

**测试步骤**:
```bash
# 批量发送邀约
curl -X POST "http://localhost:8000/api/plans/{plan_id}/send-invitations" \
  -H "X-API-Key: your_api_key"
```

**验证**: 钉钉收到邀约消息

### 8. 定时提醒

**测试步骤**:
- 等待 24 小时后检查是否收到提醒
- 或修改 `REMINDER_INTERVAL_HOURS` 为更短时间测试

---

## Phase 4 验收项目

### 9. 统计分析 (FR-007)

**前置条件**: 需要至少 10 场完成的访谈

**API 测试**:
```bash
# 创建分析任务
curl -X POST "http://localhost:8000/api/analysis/jobs" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"plan_id": 1}'

# 查看分析结果
curl "http://localhost:8000/api/analysis/jobs/{job_id}/result" \
  -H "X-API-Key: your_api_key"

# 导出报告
curl "http://localhost:8000/api/analysis/jobs/{job_id}/export/pdf" \
  -H "X-API-Key: your_api_key" \
  -o analysis_report.pdf
```

---

## 启动服务命令

```bash
cd E:\Study\LLM\InterviewAgent\interview-bot

# 1. 启动开发服务器
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# 2. 或者使用 Docker
docker-compose up -d
```

---

## 验收结果记录

| 功能 | 测试人 | 日期 | 结果 | 备注 |
|------|--------|------|------|------|
| 追问次数限制 | | | | |
| 报告内容完善 | | | | |
| 报告持久化 | | | | |
| 钉钉主动发送 | | | | |
| 访谈计划管理 | | | | |
| 模板管理 | | | | |
| 邀约发送 | | | | |
| 统计分析 | | | | |

---

## 问题记录

| 问题 | 严重程度 | 状态 | 解决方案 |
|------|----------|------|----------|
| | | | |