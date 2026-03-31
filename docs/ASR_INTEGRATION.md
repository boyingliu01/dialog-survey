# Fun-ASR 语音识别集成文档

## 概述

本文档描述了 Fun-ASR (阿里巴巴开源语音识别) 服务与 Interview Bot 的集成实现。

## 实现内容

### 1. ASR 服务增强 (`src/services/asr.py`)

#### 新增功能
- **异步支持**: 添加了 `transcribe_async()` 和 `transcribe_from_url_async()` 方法
- **错误处理**: 完善了 `ASRServiceError` 和 `AudioFormatError` 异常类
- **日志记录**: 添加了结构化日志记录

#### 主要方法
```python
# 同步方法
transcribe(audio_data: bytes) -> str
transcribe_from_url(audio_url: str) -> str
transcribe_from_file(file_path: str) -> str

# 异步方法
transcribe_async(audio_data: bytes) -> str
transcribe_from_url_async(audio_url: str) -> str
```

### 2. Webhook 集成 (`src/api/webhook.py`)

#### 新增功能
- **语音消息检测**: 自动检测 msg_type == "voice" 的消息
- **ASR 调用**: 调用 ASR 服务进行语音转文字
- **优雅降级**: ASR 失败时返回友好的错误提示
- **_handle_voice_message()**: 专门的语音消息处理函数

#### 处理流程
```
1. 接收语音消息 (DingTalk webhook)
2. 解析消息获取 media_id
3. 调用 ASR 服务进行转录
4. 将转录文本传递给 LangGraph 处理
5. 返回 AI 响应给用户
```

### 3. 测试用例

#### ASR 服务测试 (`tests/services/test_asr.py`)
- 音频格式检测测试
- 同步/异步转录测试
- 重试和超时测试
- 错误处理测试

#### Webhook 语音测试 (`tests/api/test_webhook_voice.py`)
- 语音消息无媒体ID测试
- ASR 服务错误处理测试
- 空转录结果处理测试
- 模块导入测试

## 配置

### 环境变量

```bash
# ASR 配置
ASR_MAX_RETRIES=2          # 最大重试次数
ASR_TIMEOUT=60             # 超时时间(秒)
ASR_MODEL_NAME=paraformer-zh  # Fun-ASR 模型名称
```

### DingTalk 语音消息格式

```json
{
  "msgtype": "voice",
  "senderStaffId": "user_id",
  "voice": {
    "mediaId": "media_id",
    "duration": 5,
    "recognition": "http://example.com/audio.wav"
  }
}
```

## 错误处理

### 优雅降级策略

1. **ASR 服务不可用**: 返回 "语音识别服务暂时不可用，请用文字发送您的回答。"
2. **转录失败**: 返回 "语音识别失败，请用文字发送您的回答。"
3. **空转录结果**: 返回 "未能识别语音内容，请重试。"
4. **网络超时**: 自动重试，最多 ASR_MAX_RETRIES 次

## 性能优化

### 异步处理
- 使用 `asyncio` 和 `run_in_executor` 避免阻塞事件循环
- 支持并发处理多个语音消息

### 缓存
- ASR 服务使用单例模式，避免重复加载模型
- 支持模型懒加载，首次使用时初始化

## 测试运行

```bash
# 运行 ASR 服务测试
pytest tests/services/test_asr.py -v

# 运行 Webhook 语音测试
pytest tests/api/test_webhook_voice.py -v

# 运行所有测试
pytest tests/ -v
```

## 总结

本次 Fun-ASR 集成实现了：

1. **完整的 ASR 功能**: 支持多种音频格式，同步/异步处理
2. **优雅的 Webhook 集成**: 自动检测和处理语音消息
3. **健壮的错误处理**: 多种降级策略，确保用户体验
4. **全面的测试覆盖**: 76 个测试用例，全部通过

系统现在可以接收钉钉语音消息，自动转录为文字，并通过 LangGraph 进行处理，最后返回 AI 响应。
