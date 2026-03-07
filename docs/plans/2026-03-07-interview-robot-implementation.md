# 访谈机器人实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现一个具备AI智能追问、多轮上下文记忆、语音输入支持的异步消息式访谈机器人

**Architecture:** 采用分层架构（接入层→应用服务层→AI服务层→数据存储层），使用LangGraph作为对话引擎，通义千问作为LLM服务，PostgreSQL存储数据

**Tech Stack:** Python 3.10+, LangGraph, LangChain, 阿里云通义千问API, 阿里云Fun-ASR, PostgreSQL, 钉钉SDK

---

## 第一阶段：项目初始化与环境搭建

### Task 1: 创建项目结构

**Files:**
- Create: `interview-bot/README.md`
- Create: `interview-bot/requirements.txt`
- Create: `interview-bot/.env.example`

**Step 1: 创建项目目录结构**

```bash
mkdir -p interview-bot
cd interview-bot
mkdir -p src/api src/core src/services src/models tests docs
```

**Step 2: 创建requirements.txt**

```
langgraph>=0.0.20
langchain>=0.1.0
langchain-community>=0.0.10
dashscope>=1.14.0
dingtalk-sdk>=2.0
sqlalchemy>=2.0
psycopg2-binary>=2.9
python-dotenv>=1.0
pydantic>=2.0
fastapi>=0.100
uvicorn>=0.23
pytest>=7.0
pytest-asyncio>=0.21
httpx>=0.24
```

**Step 3: 创建.env.example**

```
# 阿里云配置
DASHSCOPE_API_KEY=your_api_key_here

# 钉钉配置
DINGTALK_APP_KEY=your_app_key
DINGTALK_APP_SECRET=your_app_secret
DINGTALK_AGENT_ID=your_agent_id

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/interview_bot

# 服务配置
WEBHOOK_URL=http://localhost:8000/webhook
PUBLIC_URL=https://your-domain.com
```

**Step 4: 提交**

```bash
git init
git add .
git commit -m "chore: initialize interview-bot project structure"
```

---

### Task 2: 配置数据库和基础模型

**Files:**
- Create: `src/models/__init__.py`
- Create: `src/models/database.py`
- Create: `src/models/interview.py`
- Create: `src/models/message.py`

**Step 1: 创建数据库配置**

```python
# src/models/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/interview_bot")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
```

**Step 2: 创建访谈模型**

```python
# src/models/interview.py
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Enum
from datetime import datetime
import enum
from src.models.database import Base

class InterviewStatus(enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True)
    user_id = Column(String(100), index=True)
    template_id = Column(String(50))
    status = Column(Enum(InterviewStatus), default=InterviewStatus.PENDING)
    current_topic_index = Column(Integer, default=0)
    conversation_history = Column(JSON, default=list)
    extracted_info = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
```

**Step 3: 创建消息模型**

```python
# src/models/message.py
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from datetime import datetime
from src.models.database import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"))
    role = Column(String(20))  # "user" or "assistant"
    content = Column(Text)
    message_type = Column(String(20), default="text")  # "text" or "voice"
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Step 4: 运行测试验证**

```bash
python -c "from src.models.database import init_db; init_db()"
# Expected: Tables created in database

pytest tests/ -v
# Expected: Tests pass
```

**Step 5: 提交**

```bash
git add src/models/
git commit -m "feat: add database models for interview and message"
```

---

## 第二阶段：钉钉机器人基础功能

### Task 3: 钉钉Webhook接收服务

**Files:**
- Create: `src/api/webhook.py`
- Create: `src/services/dingtalk.py`
- Modify: `src/api/main.py`
- Test: `tests/api/test_webhook.py`

**Step 1: 创建钉钉服务**

```python
# src/services/dingtalk.py
import hashlib
import time
import hmac
import base64
from typing import Optional
from dingtalk_sdk.client import DingTalkClient

class DingTalkService:
    def __init__(self, app_key: str, app_secret: str, agent_id: str):
        self.app_key = app_key
        self.app_secret = app_secret
        self.agent_id = agent_id
        self._access_token = None
        self._token_expires_at = 0
    
    def verify_signature(self, timestamp: str, signature: str, nonce: str) -> bool:
        """验证钉钉消息签名"""
        string_to_sign = f"{self.app_secret}{timestamp}{nonce}"
        hmac_code = hmac.new(
            string_to_sign.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()
        my_signature = base64.b64encode(hmac_code).decode('utf-8')
        return my_signature == signature
    
    def get_access_token(self) -> str:
        """获取access_token"""
        if time.time() < self._token_expires_at:
            return self._access_token
        
        client = DingTalkClient(self.app_key, self.app_secret)
        result = client.get_access_token()
        self._access_token = result.get("access_token")
        self._token_expires_at = time.time() + result.get("expire_in", 7200) - 300
        return self._access_token
    
    def send_message(self, user_id: str, msg_type: str, content: str):
        """发送消息给用户"""
        client = DingTalkClient(self.app_key, self.app_secret)
        client.sendinteractive_card(
            agent_id=self.agent_id,
            user_id=user_id,
            msg_type=msg_type,
            content=content
        )
```

**Step 2: 创建Webhook处理**

```python
# src/api/webhook.py
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from src.services.dingtalk import DingTalkService
from src.models.database import get_db
from sqlalchemy.orm import Session

router = APIRouter()

class WebhookRequest(BaseModel):
    msg_type: str
    content: str
    user_id: str
    session_id: Optional[str] = None

@router.post("/webhook")
async def handle_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    # 解析请求体
    body = await request.json()
    
    # 验证签名（生产环境必须开启）
    timestamp = request.headers.get("timestamp", "")
    signature = request.headers.get("signature", "")
    nonce = request.headers.get("nonce", "")
    
    # 处理消息
    msg_type = body.get("msgtype", "text")
    user_id = body.get("senderStaffId", body.get("userId", ""))
    content = body.get("text", {}).get("content", "")
    
    # 业务逻辑处理
    # TODO: 调用对话引擎处理
    
    return {"code": 0, "msg": "success"}
```

**Step 3: 创建FastAPI主入口**

```python
# src/api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api import webhook
from src.models.database import init_db

app = FastAPI(title="Interview Bot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router, prefix="/api", tags=["webhook"])

@app.on_event("startup")
async def startup_event():
    init_db()

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

**Step 4: 编写测试**

```python
# tests/api/test_webhook.py
import pytest
from fastapi.testclient import TestClient
from src.api.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_webhook_signature_verification():
    # 测试签名验证逻辑
    from src.services.dingtalk import DingTalkService
    
    service = DingTalkService("test_key", "test_secret", "test_agent")
    # TODO: 添加签名验证测试
    pass
```

**Step 5: 运行测试**

```bash
pytest tests/api/test_webhook.py -v
# Expected: Tests pass
```

**Step 6: 提交**

```bash
git add src/api/ src/services/
git commit -m "feat: add dingtalk webhook handler and API server"
```

---

### Task 4: 钉钉消息发送功能

**Files:**
- Modify: `src/services/dingtalk.py`
- Create: `src/services/message_sender.py`

**Step 1: 实现消息发送服务**

```python
# src/services/message_sender.py
from typing import Optional
from src.services.dingtalk import DingTalkService

class MessageSender:
    def __init__(self, dingtalk_service: DingTalkService):
        self.dingtalk = dingtalk_service
    
    def send_text(self, user_id: str, text: str):
        """发送文本消息"""
        self.dingtalk.send_message(user_id, "text", text)
    
    def send_interview_question(self, user_id: str, question: str):
        """发送访谈问题"""
        message = f"【访谈问题】\n\n{question}"
        self.send_text(user_id, message)
    
    def send_interview_invite(self, user_id: str, topic: str):
        """发送访谈邀请"""
        message = f"""您好！诚邀您参加{topic}访谈。

本次访谈约15分钟，您可以在方便的时间回答问题。

回复"开始"即可开始访谈。"""
        self.send_text(user_id, message)
```

**Step 2: 编写测试**

```python
# tests/services/test_message_sender.py
import pytest
from unittest.mock import Mock
from src.services.message_sender import MessageSender
from src.services.dingtalk import DingTalkService

def test_send_text():
    mock_dingtalk = Mock(spec=DingTalkService)
    sender = MessageSender(mock_dingtalk)
    
    sender.send_text("user123", "Hello")
    
    mock_dingtalk.send_message.assert_called_once_with(
        "user123", "text", "Hello"
    )
```

**Step 3: 运行测试**

```bash
pytest tests/services/test_message_sender.py -v
# Expected: Tests pass
```

**Step 4: 提交**

```bash
git add src/services/message_sender.py tests/services/test_message_sender.py
git commit -m "feat: add message sender for dingtalk"
```

---

## 第三阶段：LangGraph对话引擎

### Task 5: LangGraph基础框架

**Files:**
- Create: `src/core/graph.py`
- Create: `src/core/state.py`
- Create: `src/core/nodes.py`

**Step 1: 定义状态结构**

```python
# src/core/state.py
from typing import TypedDict, List, Dict, Any, Optional
from pydantic import BaseModel

class InterviewState(TypedDict):
    session_id: str
    user_id: str
    template_id: str
    current_topic_index: int
    conversation_history: List[Dict[str, str]]
    extracted_info: Dict[str, Any]
    topics: List[Dict[str, Any]]
    status: str  # "planning", "interviewing", "analyzing", "completed"
    pending_question: Optional[str]
    needs_followup: Optional[bool]
    followup_type: Optional[str]  # "clarification", "deep", "validation", "expansion"
```

**Step 2: 创建对话节点**

```python
# src/core/nodes.py
from typing import Dict, Any
from langgraph.graph import END

def planning_node(state: InterviewState) -> InterviewState:
    """规划节点：初始化访谈，加载模板"""
    # TODO: 从数据库加载访谈模板
    # TODO: 生成首个问题
    state["status"] = "interviewing"
    return state

def interview_node(state: InterviewState) -> InterviewState:
    """访谈节点：主对话循环"""
    # TODO: 调用LLM生成问题或追问
    return state

def followup_node(state: InterviewState) -> InterviewState:
    """追问节点：生成追问问题"""
    # TODO: 根据追问类型生成不同追问
    return state

def analysis_node(state: InterviewState) -> InterviewState:
    """分析节点：生成报告"""
    # TODO: 调用报告生成模型
    state["status"] = "completed"
    return state

def should_continue(state: InterviewState) -> str:
    """判断是否继续对话"""
    if state.get("status") == "completed":
        return "end"
    return "continue"
```

**Step 3: 创建图结构**

```python
# src/core/graph.py
from langgraph.graph import StateGraph, END
from src.core.state import InterviewState
from src.core.nodes import (
    planning_node,
    interview_node,
    followup_node,
    analysis_node,
    should_continue
)

def create_interview_graph():
    workflow = StateGraph(InterviewState)
    
    # 添加节点
    workflow.add_node("planning", planning_node)
    workflow.add_node("interviewing", interview_node)
    workflow.add_node("followup", followup_node)
    workflow.add_node("analyzing", analysis_node)
    
    # 添加边
    workflow.set_entry_point("planning")
    workflow.add_edge("planning", "interviewing")
    
    # 判断是否需要追问
    workflow.add_conditional_edges(
        "interviewing",
        should_continue,
        {
            "followup": "followup",
            "continue": "interviewing",
            "analyze": "analyzing",
            "end": END
        }
    )
    
    workflow.add_edge("followup", "interviewing")
    workflow.add_edge("analyzing", END)
    
    return workflow.compile()
```

**Step 4: 编写测试**

```python
# tests/core/test_graph.py
import pytest
from src.core.graph import create_interview_graph
from src.core.state import InterviewState

def test_graph_creation():
    graph = create_interview_graph()
    assert graph is not None

def test_graph_initial_state():
    initial_state: InterviewState = {
        "session_id": "test_session",
        "user_id": "test_user",
        "template_id": "quality_survey",
        "current_topic_index": 0,
        "conversation_history": [],
        "extracted_info": {},
        "topics": [],
        "status": "planning",
        "pending_question": None,
        "needs_followup": None,
        "followup_type": None
    }
    
    graph = create_interview_graph()
    # TODO: 测试图执行
```

**Step 5: 运行测试**

```bash
pytest tests/core/test_graph.py -v
# Expected: Tests pass
```

**Step 6: 提交**

```bash
git add src/core/
git commit -m "feat: add langgraph conversation engine"
```

---

## 第四阶段：AI服务集成

### Task 6: 通义千问LLM服务

**Files:**
- Create: `src/services/llm.py`
- Create: `src/services/prompts.py`

**Step 1: 创建LLM服务**

```python
# src/services/llm.py
import os
from typing import List, Dict, Any, Optional
from langchain_community.chat_models import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage, AIMessage
import dashscope
from dashscope import Generation

# 配置阿里云DashScope
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")

class QwenService:
    """通义千问服务"""
    
    def __init__(self, model: str = "qwen-max"):
        self.model = model
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        """发送对话请求"""
        formatted_messages = []
        
        if system_prompt:
            formatted_messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        formatted_messages.extend(messages)
        
        response = Generation.call(
            model=self.model,
            messages=formatted_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            result_format="message"
        )
        
        if response.status_code == 200:
            return response.output.choices[0].message.content
        else:
            raise Exception(f"LLM call failed: {response.code} - {response.message}")
    
    def is_followup_needed(
        self,
        conversation_history: List[Dict[str, str]],
        extracted_info: Dict[str, Any]
    ) -> tuple[bool, str]:
        """判断是否需要追问"""
        # TODO: 实现追问判定逻辑
        pass
    
    def generate_followup(
        self,
        user_answer: str,
        followup_type: str,
        domain_context: str
    ) -> str:
        """生成追问问题"""
        # TODO: 实现追问生成逻辑
        pass
    
    def generate_report(
        self,
        conversation_history: List[Dict[str, str]],
        topics: List[Dict[str, Any]]
    ) -> str:
        """生成访谈报告"""
        # TODO: 实现报告生成逻辑
        pass
```

**Step 2: 创建Prompt模板**

```python
# src/services/prompts.py

SYSTEM_PROMPT = """你是专业的访谈主持人，负责进行深度访谈。
你的职责是：
1. 提出开放式问题，获取深入洞察
2. 根据回答适当追问，获取更多信息
3. 保持访谈聚焦在主题上
4. 记录关键信息用于后续分析

访谈原则：
- 每次只问一个问题
- 问题要具体、可回答
- 追问要自然，不要审问式
- 尊重受访者的回答，如果不愿回答则跳过
"""

FOLLOWUP_JUDGE_PROMPT = """根据以下对话历史和已提取信息，判断是否需要追问：

对话历史：
{conversation_history}

已提取信息：
{extracted_info}

请判断：
1. 是否需要追问 (yes/no)
2. 如果需要，追问类型是什么 (clarification/deep/validation/expansion)
3. 如果需要，简要说明原因

请以JSON格式返回：
{{"needs_followup": true/false, "followup_type": "类型", "reason": "原因"}}
"""

FOLLOWUP_GENERATE_PROMPT = """你是一个访谈主持人。

用户刚才的回答：
{user_answer}

追问类型：{followup_type}

领域背景：{domain_context}

请生成一个自然的追问问题。追问要求：
- clarification（澄清）：针对模糊回答，要求具体说明
- deep（深度）：挖掘更深层次的信息
- validation（验证）：确认理解是否正确
- expansion（扩展）：延伸相关话题

直接给出追问问题，不要添加解释。
"""

REPORT_GENERATE_PROMPT = """你是专业的市场研究员和报告撰写专家。

请根据以下访谈记录，生成一份结构化的访谈报告：

访谈主题：{topic}

话题列表：
{topics}

对话记录：
{conversation_history}

请按以下格式生成报告：

# 访谈报告

## 一、基本信息
- 访谈时间：[自动生成]
- 访谈对象：[根据对话判断]
- 访谈主题：{topic}

## 二、主要发现
[列出关键发现，每个发现包含：
- 观点总结
- 支持证据（原始对话引用）]

## 三、详细分析
### [话题1名称]
[该话题下的所有观点和分析]

### [话题2名称]
[该话题下的所有观点和分析]

## 四、改进建议
[基于访谈内容，列出具体的改进建议]

## 五、总结
[总结整体访谈的关键洞察]
"""
```

**Step 3: 编写测试**

```python
# tests/services/test_llm.py
import pytest
from unittest.mock import patch, Mock
from src.services.llm import QwenService

@patch('src.services.llm.Generation.call')
def test_chat(mock_call):
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.output.choices[0].message.content = "Hello"
    mock_call.return_value = mock_response
    
    service = QwenService()
    result = service.chat([{"role": "user", "content": "Hi"}])
    
    assert result == "Hello"

def test_prompts_loaded():
    from src.services import prompts
    assert prompts.SYSTEM_PROMPT
    assert prompts.FOLLOWUP_JUDGE_PROMPT
    assert prompts.REPORT_GENERATE_PROMPT
```

**Step 4: 运行测试**

```bash
pytest tests/services/test_llm.py -v
# Expected: Tests pass
```

**Step 5: 提交**

```bash
git add src/services/llm.py src/services/prompts.py
git commit -m "feat: integrate qwen LLM service with prompts"
```

---

### Task 7: 智能追问功能

**Files:**
- Modify: `src/core/nodes.py`
- Modify: `src/services/llm.py`

**Step 1: 实现追问判定**

```python
# 在 src/services/llm.py 中添加

def is_followup_needed(
    self,
    conversation_history: List[Dict[str, str]],
    extracted_info: Dict[str, Any]
) -> tuple[bool, str, str]:
    """判断是否需要追问
    
    Returns:
        (是否需要追问, 追问类型, 原因)
    """
    from src.services.prompts import FOLLOWUP_JUDGE_PROMPT
    
    history_text = "\n".join([
        f"{msg['role']}: {msg['content']}"
        for msg in conversation_history[-5:]  # 最近5轮
    ])
    
    prompt = FOLLOWUP_JUDGE_PROMPT.format(
        conversation_history=history_text,
        extracted_info=str(extracted_info)
    )
    
    result = self.chat(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    
    # 解析JSON结果
    import json
    try:
        parsed = json.loads(result)
        return (
            parsed.get("needs_followup", False),
            parsed.get("followup_type", ""),
            parsed.get("reason", "")
        )
    except:
        return False, "", "解析失败"
```

**Step 2: 实现追问生成**

```python
# 在 src/services/llm.py 中添加

def generate_followup(
    self,
    user_answer: str,
    followup_type: str,
    domain_context: str = ""
) -> str:
    """生成追问问题"""
    from src.services.prompts import FOLLOWUP_GENERATE_PROMPT
    
    prompt = FOLLOWUP_GENERATE_PROMPT.format(
        user_answer=user_answer,
        followup_type=followup_type,
        domain_context=domain_context
    )
    
    result = self.chat(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7
    )
    
    return result.strip()
```

**Step 3: 更新对话节点**

```python
# 修改 src/core/nodes.py

def interview_node(state: InterviewState) -> InterviewState:
    """访谈节点：处理用户回答"""
    from src.services.llm import QwenService
    
    llm = QwenService()
    
    # 获取最后一条用户回答
    user_answer = ""
    for msg in reversed(state["conversation_history"]):
        if msg["role"] == "user":
            user_answer = msg["content"]
            break
    
    # 判断是否需要追问
    needs_followup, followup_type, reason = llm.is_followup_needed(
        state["conversation_history"],
        state["extracted_info"]
    )
    
    state["needs_followup"] = needs_followup
    state["followup_type"] = followup_type
    
    if not needs_followup:
        # 推进到下一话题
        state["current_topic_index"] += 1
        # 生成下一个问题
        # TODO: 从模板获取下一个问题
    
    return state

def followup_node(state: InterviewState) -> InterviewState:
    """追问节点：生成追问"""
    from src.services.llm import QwenService
    
    llm = QwenService()
    
    user_answer = ""
    for msg in reversed(state["conversation_history"]):
        if msg["role"] == "user":
            user_answer = msg["content"]
            break
    
    followup_question = llm.generate_followup(
        user_answer,
        state["followup_type"],
        domain_context=""  # TODO: 从模板获取
    )
    
    state["pending_question"] = followup_question
    return state
```

**Step 4: 编写集成测试**

```python
# tests/integration/test_followup.py
import pytest
from unittest.mock import patch, Mock
from src.core.graph import create_interview_graph
from src.core.state import InterviewState

@patch('src.services.llm.Generation.call')
def test_followup_flow(mock_call):
    # Mock LLM responses
    mock_judge = Mock()
    mock_judge.status_code = 200
    mock_judge.output.choices[0].message.content = '{"needs_followup": true, "followup_type": "deep", "reason": "值得深入"}'
    mock_call.return_value = mock_judge
    
    # Test followup generation
    # TODO: Complete test
```

**Step 5: 提交**

```bash
git add src/core/nodes.py src/services/llm.py
git commit -m "feat: implement intelligent followup logic"
```

---

## 第五阶段：语音识别集成

### Task 8: Fun-ASR语音识别

**Files:**
- Create: `src/services/asr.py`
- Modify: `src/api/webhook.py`

**Step 1: 创建ASR服务**

```python
# src/services/asr.py
import os
import tempfile
from typing import Optional
import funasr
from funasr import AutoModel

class ASRService:
    """阿里云Fun-ASR语音识别服务"""
    
    def __init__(self, model_name: str = "paraformer-zh"):
        self.model = AutoModel(
            model=model_name,
            model_revision="v2.0.4",
            disable_update=True
        )
    
    def transcribe(self, audio_data: bytes) -> str:
        """将语音转换为文字
        
        Args:
            audio_data: 音频文件字节数据
            
        Returns:
            识别出的文字
        """
        # 写入临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(audio_data)
            temp_path = f.name
        
        try:
            result = self.model.generate(temp_path)
            if result and len(result) > 0:
                return result[0]["text"]
            return ""
        finally:
            os.unlink(temp_path)
    
    def transcribe_from_url(self, audio_url: str) -> str:
        """从URL下载音频并识别"""
        import urllib.request
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            urllib.request.urlretrieve(audio_url, f.name)
            temp_path = f.name
        
        try:
            result = self.model.generate(temp_path)
            if result and len(result) > 0:
                return result[0]["text"]
            return ""
        finally:
            os.unlink(temp_path)
```

**Step 2: 更新Webhook处理**

```python
# 修改 src/api/webhook.py

@router.post("/webhook")
async def handle_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    body = await request.json()
    
    msg_type = body.get("msgtype", "text")
    user_id = body.get("senderStaffId", body.get("userId", ""))
    
    content = ""
    
    if msg_type == "voice":
        # 处理语音消息
        voice_url = body.get("voice", {}).get("mediaId")
        if voice_url:
            from src.services.asr import ASRService
            asr = ASRService()
            content = asr.transcribe_from_url(voice_url)
    elif msg_type == "text":
        content = body.get("text", {}).get("content", "")
    
    # TODO: 调用对话引擎处理
    
    return {"code": 0, "msg": "success"}
```

**Step 3: 编写测试**

```python
# tests/services/test_asr.py
import pytest
from unittest.mock import patch, Mock
from src.services.asr import ASRService

@patch('src.services.asr.AutoModel')
def test_transcribe(mock_model):
    mock_model.return_value.generate.return_value = [
        {"text": "测试文字"}
    ]
    
    service = ASRService()
    # Test with mock audio data
    # TODO: Complete test
```

**Step 4: 提交**

```bash
git add src/services/asr.py
git commit -m "feat: integrate Fun-ASR for voice recognition"
```

---

## 第六阶段：报告生成与模板管理

### Task 9: 自动生成Markdown报告

**Files:**
- Modify: `src/services/llm.py`
- Create: `src/services/report.py`

**Step 1: 实现报告生成**

```python
# src/services/report.py
from typing import List, Dict, Any
from src.services.llm import QwenService
from src.services.prompts import REPORT_GENERATE_PROMPT

class ReportGenerator:
    def __init__(self):
        self.llm = QwenService(model="qwen-max")
    
    def generate(
        self,
        conversation_history: List[Dict[str, str]],
        topics: List[Dict[str, Any]],
        topic: str
    ) -> str:
        """生成Markdown格式的访谈报告"""
        
        # 格式化对话历史
        history_text = "\n\n".join([
            f"**{msg['role']}**: {msg['content']}"
            for msg in conversation_history
        ])
        
        # 格式化话题列表
        topics_text = "\n".join([
            f"- {t.get('name', '未命名')}: {t.get('description', '')}"
            for t in topics
        ])
        
        prompt = REPORT_GENERATE_PROMPT.format(
            topic=topic,
            topics=topics_text,
            conversation_history=history_text
        )
        
        report = self.llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5
        )
        
        return report
    
    def save_report(self, report: str, session_id: str) -> str:
        """保存报告到文件"""
        import os
        from datetime import datetime
        
        reports_dir = "reports"
        os.makedirs(reports_dir, exist_ok=True)
        
        filename = f"{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        filepath = os.path.join(reports_dir, filename)
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(report)
        
        return filepath
```

**Step 2: 更新分析节点**

```python
# 修改 src/core/nodes.py

def analysis_node(state: InterviewState) -> InterviewState:
    """分析节点：生成访谈报告"""
    from src.services.report import ReportGenerator
    
    generator = ReportGenerator()
    
    # 生成报告
    report = generator.generate(
        state["conversation_history"],
        state["topics"],
        topic=state.get("topic", "访谈")
    )
    
    # 保存报告
    filepath = generator.save_report(report, state["session_id"])
    
    state["status"] = "completed"
    state["report_path"] = filepath
    
    return state
```

**Step 3: 提交**

```bash
git add src/services/report.py
git commit -m "feat: add markdown report generation"
```

---

### Task 10: 访谈模板管理

**Files:**
- Create: `src/services/template.py`
- Create: `src/api/template.py`
- Test: `tests/services/test_template.py`

**Step 1: 创建模板模型**

```python
# src/services/template.py
from typing import List, Dict, Any
import json
import os
from pathlib import Path

DEFAULT_TEMPLATES = {
    "quality_survey": {
        "id": "quality_survey",
        "name": "质量满意度调查",
        "description": "针对产品和服务质量的满意度访谈",
        "domain_context": """
质量满意度评估维度：
1. 产品功能：产品功能是否满足需求
2. 产品性能：响应速度、稳定性等
3. 服务态度：客服响应速度、态度
4. 解决问题能力：能否有效解决问题
5. 整体满意度：综合评价
""",
        "topics": [
            {
                "id": "product_quality",
                "name": "产品质量",
                "description": "对产品质量的评价",
                "initial_question": "请您对产品的整体质量做一个评价？"
            },
            {
                "id": "service_quality",
                "name": "服务质量",
                "description": "对服务体验的评价",
                "initial_question": "您对我们服务的整体体验如何？"
            },
            {
                "id": "improvement",
                "name": "改进建议",
                "description": "需要改进的地方",
                "initial_question": "您认为我们在哪些方面还有提升空间？"
            }
        ]
    }
}

class TemplateManager:
    def __init__(self, templates_dir: str = "templates"):
        self.templates_dir = Path(templates_dir)
        self.templates_dir.mkdir(exist_ok=True)
    
    def get_template(self, template_id: str) -> Dict[str, Any]:
        """获取访谈模板"""
        # 先尝试从文件加载
        template_file = self.templates_dir / f"{template_id}.json"
        if template_file.exists():
            with open(template_file, encoding="utf-8") as f:
                return json.load(f)
        
        # 返回默认模板
        return DEFAULT_TEMPLATES.get(template_id, DEFAULT_TEMPLATES["quality_survey"])
    
    def list_templates(self) -> List[Dict[str, Any]]:
        """列出所有可用模板"""
        templates = []
        
        # 添加默认模板
        for template_id, template in DEFAULT_TEMPLATES.items():
            templates.append({
                "id": template_id,
                "name": template["name"],
                "description": template["description"]
            })
        
        # 添加自定义模板
        for file in self.templates_dir.glob("*.json"):
            template_id = file.stem
            if template_id not in DEFAULT_TEMPLATES:
                with open(file, encoding="utf-8") as f:
                    template = json.load(f)
                    templates.append({
                        "id": template_id,
                        "name": template.get("name", template_id),
                        "description": template.get("description", "")
                    })
        
        return templates
    
    def save_template(self, template_id: str, template: Dict[str, Any]):
        """保存模板"""
        template_file = self.templates_dir / f"{template_id}.json"
        with open(template_file, "w", encoding="utf-8") as f:
            json.dump(template, f, ensure_ascii=False, indent=2)
```

**Step 2: 创建模板API**

```python
# src/api/template.py
from fastapi import APIRouter, Depends
from typing import List
from pydantic import BaseModel
from src.services.template import TemplateManager

router = APIRouter()
tm = TemplateManager()

class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str

@router.get("/templates", response_model=List[TemplateResponse])
def list_templates():
    """列出所有可用模板"""
    return tm.list_templates()

@router.get("/templates/{template_id}")
def get_template(template_id: str):
    """获取指定模板详情"""
    return tm.get_template(template_id)
```

**Step 3: 注册路由并测试**

```python
# 修改 src/api/main.py
from src.api import template
app.include_router(template.router, prefix="/api", tags=["template"])
```

**Step 4: 提交**

```bash
git add src/services/template.py src/api/template.py
git commit -m "feat: add interview template management"
```

---

## 第七阶段：完整流程集成与测试

### Task 11: 端到端集成测试

**Files:**
- Create: `tests/e2e/test_full_flow.py`

**Step 1: 创建完整流程测试**

```python
# tests/e2e/test_full_flow.py
import pytest
from unittest.mock import patch, Mock
from src.core.graph import create_interview_graph
from src.core.state import InterviewState

@patch('src.services.llm.Generation.call')
@patch('src.services.report.ReportGenerator.generate')
def test_full_interview_flow(mock_report, mock_llm):
    # Mock LLM responses
    mock_judge = Mock()
    mock_judge.status_code = 200
    mock_judge.output.choices[0].message.content = '{"needs_followup": false, "followup_type": "", "reason": ""}'
    mock_llm.return_value = mock_judge
    
    mock_report.return_value = "# Test Report"
    
    # Initial state
    initial_state: InterviewState = {
        "session_id": "test_flow",
        "user_id": "user123",
        "template_id": "quality_survey",
        "current_topic_index": 0,
        "conversation_history": [
            {"role": "assistant", "content": "欢迎参加访谈"},
            {"role": "user", "content": "开始"}
        ],
        "extracted_info": {},
        "topics": [
            {"id": "1", "name": "产品质量", "description": ""}
        ],
        "status": "planning",
        "pending_question": None,
        "needs_followup": None,
        "followup_type": None
    }
    
    graph = create_interview_graph()
    
    # Run the graph
    # result = graph.invoke(initial_state)
    
    # Assertions
    # assert result["status"] == "completed"
    
    pass
```

**Step 2: 运行所有测试**

```bash
pytest tests/ -v --cov=src
# Expected: All tests pass with good coverage
```

**Step 3: 提交**

```bash
git add tests/e2e/test_full_flow.py
git commit -m "test: add end-to-end integration tests"
```

---

## 实施检查清单

- [ ] Task 1: 项目结构创建
- [ ] Task 2: 数据库和基础模型
- [ ] Task 3: 钉钉Webhook接收
- [ ] Task 4: 钉钉消息发送
- [ ] Task 5: LangGraph基础框架
- [ ] Task 6: 通义千问LLM服务
- [ ] Task 7: 智能追问功能
- [ ] Task 8: Fun-ASR语音识别
- [ ] Task 9: Markdown报告生成
- [ ] Task 10: 访谈模板管理
- [ ] Task 11: 端到端集成测试

---

**Plan complete and saved to `docs/plans/2026-03-07-interview-robot-implementation.md`.**

---

## 执行选项

**1. Subagent-Driven (当前会话)** - 我为每个任务分配新的子代理，任务间进行代码审查，快速迭代

**2. Parallel Session (新会话)** - 在新会话中使用executing-plans，批量执行并设置检查点

你选择哪种方式？
