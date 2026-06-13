# 钉钉主动邀约功能设计方案

> 设计日期: 2026-04-13
> 目的: Delphi Review 评审

---

## 1. 功能概述

**目标**: 让访谈机器人能够主动向钉钉用户发送访谈邀约消息，触发访谈流程。

**当前状态**: `InterviewPlanService.sendInvitation()` 只打印日志，未实际发送。

---

## 2. 技术方案

### 2.1 钉钉 API 流程

```
Step 1: 获取 AccessToken
├─ API: GET https://oapi.dingtalk.com/gettoken
├─ 参数: appkey={CLIENT_ID}, appsecret={CLIENT_SECRET}
└─ 返回: { access_token, expires_in (7200s) }

Step 2: 发送消息
├─ API: POST https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2
├─ Header: x-acs-dingtalk-access-token: {token}
├─ Body: {
│     agent_id: "{AGENT_ID}",
│     userid_list: "user1,user2",  // 钉钉员工ID
│     msg: { msgtype: "text", text: { content: "..." } }
│   }
└─ 返回: { task_id, success_count }
```

### 2.2 AccessToken 缓存策略

- Token 有效期 2 小时
- 缓存 Token，过期前 5 分钟刷新
- 单例模式，避免并发重复获取
- Token 失效时自动重试

```typescript
interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp
}

class DingTalkTokenManager {
  private cache: TokenCache | null = null;

  async getAccessToken(): Promise<string> {
    // 检查缓存是否有效（提前5分钟过期）
    if (this.cache && this.cache.expiresAt > Date.now() + 5 * 60 * 1000) {
      return this.cache.accessToken;
    }

    // 重新获取
    const response = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${CLIENT_ID}&appsecret=${CLIENT_SECRET}`,
    );
    const data = await response.json();

    this.cache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.cache.accessToken;
  }
}
```

### 2.3 发送消息类型

| 类型       | 适用场景   | 说明               |
| ---------- | ---------- | ------------------ |
| text       | 简单邀约   | 纯文本             |
| actionCard | 交互式邀约 | 包含按钮，推荐使用 |

```json
{
  "msgtype": "actionCard",
  "actionCard": {
    "title": "访谈邀约",
    "text": "您被邀请参与「员工满意度调查」",
    "singleTitle": "开始访谈",
    "singleURL": "https://..."
  }
}
```

---

## 3. 架构设计

```
src/
├── integrations/
│   └── dingtalk/
│       ├── client.ts            # 已有：基础 HTTP 客户端
│       ├── stream-client.ts     # 已有：Stream 模式 WebSocket
│       ├── token-manager.ts     # 新增：AccessToken 管理
│       └── message-sender.ts    # 新增：主动发送消息
│
├── services/
│   └── interview-plan.service.ts  # 修改：调用 message-sender
```

---

## 4. 关键接口定义

```typescript
// token-manager.ts
export interface TokenManager {
  getAccessToken(): Promise<string>;
  invalidateToken(): void;
}

// message-sender.ts
export interface MessageSender {
  sendTextMessage(userIds: string[], content: string): Promise<SendResult>;
  sendActionCard(
    userIds: string[],
    card: ActionCardContent,
  ): Promise<SendResult>;
}

export interface SendResult {
  taskId: string;
  successCount: number;
  failedUserIds: string[];
}
```

---

## 5. 错误处理

| 错误类型   | 处理方式                           |
| ---------- | ---------------------------------- |
| Token 过期 | 自动刷新，重试一次                 |
| 用户不存在 | 记录 failedUserIds，不阻塞其他用户 |
| API 限流   | 指数退避，队列化发送               |
| 网络错误   | 3 次重试                           |

---

## 6. 环境变量

```bash
DINGTALK_CLIENT_ID=dingemmnhyusk82zvx7t
DINGTALK_CLIENT_SECRET=[REDACTED]
DINGTALK_AGENT_ID=4340017075
```

---

## 7. 验收标准

| AC     | 描述                               |
| ------ | ---------------------------------- |
| AC-001 | AccessToken 正确获取并缓存         |
| AC-002 | 缓存过期自动刷新（提前5分钟）      |
| AC-003 | 发送文本消息成功                   |
| AC-004 | 发送 ActionCard 消息成功           |
| AC-005 | 批量发送支持（userid_list 多用户） |
| AC-006 | 失败用户正确记录                   |
| AC-007 | Token 过期自动重试                 |
| AC-008 | 单测覆盖率 >= 80%                  |

---

## 8. 风险评估

| 风险                 | 影响     | 缓解措施             |
| -------------------- | -------- | -------------------- |
| AccessToken 获取失败 | 无法发送 | 重试 + 告警          |
| 用户 userId 不存在   | 发送失败 | 批量发送记录失败列表 |
| API 限流             | 发送延迟 | 队列化 + 批量发送    |
