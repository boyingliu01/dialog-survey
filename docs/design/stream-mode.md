# Stream 模式接入设计文档

> **日期**: 2026-03-25  
> **目标**: 为访谈机器人添加钉钉 Stream 模式支持，替代 HTTP Webhook 模式

---

## 1. 背景与动机

### 1.1 当前问题
- HTTP Webhook 模式需要公网可访问的 URL（ngrok）
- 钉钉现在主推 Stream 模式，HTTP 模式配置不稳定
- 用户反馈：Stream 模式配置后过段时间失效，需重新删除配置

### 1.2 Stream 模式优势
| 特性 | Stream 模式 | HTTP Webhook |
|------|------------|--------------|
| 内网穿透 | ❌ 不需要 | ✅ 需要 ngrok |
| 公网端口 | ❌ 不需要开放 | ✅ 需要开放 |
| 防火墙 | ❌ 无需配置 | ✅ 需配置白名单 |
| 连接稳定性 | ✅ WebSocket 长连接 | ❌ HTTP 短连接 |
| 签名验证 | ❌ 自动处理 | ✅ 需手动实现 |

---

## 2. 技术方案

### 2.1 SDK 选择
- **官方 SDK**: `dingtalk-stream` (Python)
- **安装**: `pip install dingtalk-stream`
- **依赖**: `aiohttp`, `websockets`

### 2.2 认证方式
```python
# Stream 模式使用 ClientId + ClientSecret
# 对于企业内部应用:
#   ClientId = AppKey
#   ClientSecret = AppSecret
```

### 2.3 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      钉钉开放平台                                │
│                     (Stream Mode)                               │
└────────────────┬────────────────────────────────┬───────────────┘
                 │ WebSocket                      │
                 ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DingTalkStreamClient                           │
│                     (SDK 封装)                                   │
└────────────────┬────────────────────────────────┬───────────────┘
                 │ 事件分发                         │
    ┌────────────┼────────────┐                   │
    ▼            ▼            ▼                   ▼
┌────────┐  ┌────────┐  ┌────────┐       ┌──────────────┐
│on_text │  │on_voice│  │on_other│       │  异常处理     │
└────┬───┘  └────┬───┘  └───┬────┘       └──────────────┘
     │           │          │
     └───────────┴──────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              InterviewStreamHandler                             │
│              (自定义消息处理器)                                  │
└────────────────┬────────────────────────────────┬───────────────┘
                 │ 复用现有业务逻辑                  │
                 ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              handle_chat_message()                              │
│        (抽离的公共消息处理函数 - 复用 webhook 逻辑)              │
└────────────────┬────────────────────────────────┬───────────────┘
                 │                                │
    ┌────────────┼────────────┐                  │
    ▼            ▼            ▼                  ▼
┌────────┐  ┌────────┐  ┌────────┐     ┌─────────────────┐
│LangGraph│  │PostgreSQL│  │ASR服务 │     │  生成回复消息    │
│ 对话引擎 │  │ 数据存储  │  │(语音) │     │                 │
└────────┘  └────────┘  └────────┘     └─────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              通过 Stream 发送回复                                │
│          handler.reply_text(response, message)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 改动范围

### 3.1 新增文件

| 文件路径 | 功能描述 |
|----------|----------|
| `src/services/stream_handler.py` | Stream 消息处理器，继承 `ChatbotHandler` |
| `src/services/message_service.py` | 抽离的公共消息处理服务（复用逻辑） |
| `docs/design/stream-mode.md` | 本设计文档 |

### 3.2 修改文件

| 文件路径 | 改动内容 |
|----------|----------|
| `requirements.txt` | 添加 `dingtalk-stream` 依赖 |
| `src/api/webhook.py` | 复用 `message_service`，精简代码 |
| `src/api/main.py` | 添加 Stream Client 启动/生命周期管理 |
| `.env` | 添加 Stream 模式相关配置 |

### 3.3 文件关系图

```
src/
├── api/
│   ├── main.py              [修改: +Stream Client 启动]
│   ├── webhook.py           [修改: 复用 message_service]
│   └── ...
├── services/
│   ├── stream_handler.py    [新增: Stream 消息处理器]
│   ├── message_service.py   [新增: 公共消息处理逻辑]
│   ├── dingtalk.py          [保留: HTTP 发送消息]
│   └── ...
└── ...
```

---

## 4. 关键代码设计

### 4.1 消息处理服务 (`message_service.py`)

```python
# 抽离公共逻辑，供 Stream 和 Webhook 复用

async def handle_chat_message(
    user_id: str,
    content: str,
    msg_type: str = "text",
    voice_url: Optional[str] = None,
    db_session: Session = None,
) -> str:
    """
    统一处理聊天消息，返回回复内容
    
    流程:
    1. 查找或创建访谈会话
    2. 语音消息 -> ASR 转写
    3. 调用 LangGraph 处理
    4. 存储消息到数据库
    5. 返回回复文本
    """
    pass
```

### 4.2 Stream 处理器 (`stream_handler.py`)

```python
import dingtalk_stream
from dingtalk_stream import AckMessage

class InterviewStreamHandler(dingtalk_stream.ChatbotHandler):
    """钉钉 Stream 模式消息处理器"""
    
    def __init__(self, db_session_factory):
        self.db_session_factory = db_session_factory
    
    async def process(self, callback: dingtalk_stream.CallbackMessage):
        """处理收到的消息"""
        message = dingtalk_stream.ChatbotMessage.from_dict(callback.data)
        
        # 提取消息内容
        content = ""
        msg_type = "text"
        voice_url = None
        
        if message.text:
            content = message.text.content
            msg_type = "text"
        elif message.voice:
            content = ""  # 需要下载语音后转写
            msg_type = "voice"
            voice_url = message.voice.url
        
        # 调用公共处理逻辑
        db = self.db_session_factory()
        try:
            response = await handle_chat_message(
                user_id=message.sender_id,
                content=content,
                msg_type=msg_type,
                voice_url=voice_url,
                db_session=db
            )
            
            # Stream 方式回复
            self.reply_text(response, message)
            
        finally:
            db.close()
        
        return AckMessage.STATUS_OK, 'OK'
```

### 4.3 FastAPI 集成 (`main.py`)

```python
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI

# Stream 模式支持
USE_STREAM = os.getenv("USE_STREAM_MODE", "false").lower() == "true"

if USE_STREAM:
    import dingtalk_stream
    from src.services.stream_handler import InterviewStreamHandler

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    stream_client = None
    stream_task = None
    
    # 启动阶段
    if USE_STREAM:
        credential = dingtalk_stream.Credential(
            os.getenv("DINGTALK_CLIENT_ID"),
            os.getenv("DINGTALK_CLIENT_SECRET")
        )
        stream_client = dingtalk_stream.DingTalkStreamClient(credential)
        stream_client.register_callback_handler(
            dingtalk_stream.chatbot.ChatbotMessage.TOPIC,
            InterviewStreamHandler(get_db)
        )
        
        # 在后台启动 Stream 连接
        stream_task = asyncio.create_task(stream_client.start())
        print("[Stream] Stream client started")
    else:
        print("[Stream] Stream mode disabled, using HTTP Webhook")
    
    yield
    
    # 关闭阶段
    if stream_task:
        stream_task.cancel()
        try:
            await stream_task
        except asyncio.CancelledError:
            pass
        print("[Stream] Stream client stopped")

app = FastAPI(
    title="Interview Bot API",
    lifespan=lifespan,
)
```

---

## 5. 配置说明

### 5.1 环境变量

```env
# ========== Stream 模式配置 ==========
# 启用 Stream 模式 (true/false)
USE_STREAM_MODE=true

# Stream 认证 (企业内部应用: ClientId = AppKey)
DINGTALK_CLIENT_ID=dingemmnhyusk82zvx7t
DINGTALK_CLIENT_SECRET=q4rcLQrsL1XXtMkoRJvDMjMzlWcshjyuYpFILLxaBHxAgrB0MD1pRGHAbSwaxzcC

# ========== 原有配置保留 ==========
DINGTALK_APP_KEY=dingemmnhyusk82zvx7t
DINGTALK_APP_SECRET=q4rcLQrsL1XXtMkoRJvDMjMzlWcshjyuYpFILLxaBHxAgrB0MD1pRGHAbSwaxzcC
DINGTALK_AGENT_ID=4340017075

# 其他配置不变...
```

### 5.2 钉钉后台配置

1. 登录 [钉钉开放平台](https://open.dingtalk.com/)
2. 进入应用 → **消息推送**
3. 推送方式选择：**Stream 模式**
4. 无需配置回调 URL（Stream 模式自动建立连接）

---

## 6. 异常处理

### 6.1 连接断开
```python
# SDK 自动处理重连
# 断线后会在后台自动重连，无需手动干预
```

### 6.2 消息处理异常
```python
# 处理异常时返回失败 ACK，钉钉会重试
try:
    response = await handle_chat_message(...)
    self.reply_text(response, message)
    return AckMessage.STATUS_OK, 'OK'
except Exception as e:
    logger.error(f"Message handling failed: {e}")
    # 返回失败，触发钉钉重试
    return AckMessage.STATUS_LATER, str(e)
```

### 6.3 降级策略
```python
# 如果 Stream 启动失败，自动降级到 HTTP Webhook
try:
    await stream_client.start()
except Exception as e:
    logger.error(f"Stream start failed: {e}")
    logger.warning("Falling back to HTTP Webhook mode")
    USE_STREAM = False
```

---

## 7. 测试计划

### 7.1 单元测试
- [ ] Stream Handler 消息解析
- [ ] 消息处理服务逻辑
- [ ] 异常处理场景

### 7.2 集成测试
- [ ] Stream 连接建立
- [ ] 文本消息收发
- [ ] 语音消息收发
- [ ] 多轮对话保持
- [ ] 报告生成

### 7.3 端到端测试
- [ ] 钉钉机器人完整对话流程
- [ ] 跨天对话恢复
- [ ] 并发用户测试

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| SDK 兼容性问题 | 低 | 高 | 保留 HTTP 备用方案 |
| WebSocket 不稳定 | 中 | 中 | SDK 自动重连 + 手动降级 |
| 消息顺序错乱 | 低 | 中 | 依赖 LangGraph 状态管理 |
| 性能瓶颈 | 低 | 低 | 异步处理 + 数据库优化 |

---

## 9. 实施计划

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| **Phase 1** | 添加依赖、抽离公共逻辑 | 30分钟 |
| **Phase 2** | 实现 Stream Handler | 30分钟 |
| **Phase 3** | FastAPI 集成启动逻辑 | 20分钟 |
| **Phase 4** | 本地测试验证 | 30分钟 |
| **Phase 5** | 钉钉后台配置 + 联调 | 20分钟 |
| **总计** | | **~2小时** |

---

## 10. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| SDK | 官方 `dingtalk-stream` | 维护保障、功能完整 |
| 双模式支持 | Stream 为主，HTTP 备用 | 稳定性、降级能力 |
| 代码复用 | 抽离 `message_service` | DRY、维护简单 |
| 认证字段 | 新增 CLIENT_ID/SECRET | 与 SDK 命名一致 |

---

**下一步**: 开始实施 Phase 1
