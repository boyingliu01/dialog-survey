# Multi-Turn Interview Conversation Flow Analysis

**Generated:** 2026-04-02
**Purpose:** Technical documentation of multi-turn interview session management

---

## Executive Summary

The interview-bot uses a **dual persistence architecture**:

1. **LangGraph MemorySaver** - In-memory checkpointer (NON-PERSISTENT)
2. **PostgreSQL via ConversationEngine** - Database persistence (PERSISTENT)

**Critical Finding:** MemorySaver is recreated on each server restart, making it unreliable for session persistence. The actual session continuity relies entirely on PostgreSQL state serialization/deserialization.

---

## 1. Interview Start Flow (访谈开始)

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant DingTalk
    participant Webhook as /api/webhook
    participant Engine as ConversationEngine
    participant Graph as LangGraph
    participant Repo as InterviewRepository
    participant DB as PostgreSQL

    User->>DingTalk: Send "开始"
    DingTalk->>Webhook: POST /api/webhook<br/>(signature headers)

    Note over Webhook: 1. Signature Verification
    Webhook->>Webhook: verifySignature(timestamp, signature, nonce)

    Note over Webhook: 2. Parse Message
    Webhook->>Webhook: parseWebhookMessage(body)
    Webhook->>Webhook: Extract user_id, content

    Note over Webhook: 3. Check Existing Sessions
    Webhook->>Repo: findByUserId(user_id, IN_PROGRESS)
    Repo->>DB: SELECT * FROM interviews<br/>WHERE user_id = ? AND status = 'IN_PROGRESS'
    DB-->>Repo: [] (empty for new user)
    Repo-->>Webhook: []

    Note over Webhook: 4. Generate Session ID
    Webhook->>Webhook: sessionId = `interview_${randomBytes(6)}`

    Note over Webhook: 5. Load Template
    Webhook->>Webhook: templateService.getTemplate("quality_survey")

    Note over Webhook: 6. Initialize Engine
    Webhook->>Engine: getConversationEngine({ useLlm: true })
    Engine-->>Webhook: ConversationEngine instance

    Note over Engine: 7. Start Interview
    Webhook->>Engine: startInterview(sessionId, userId, templateId, template)

    Engine->>Graph: runInterviewTurn(sessionId, templateId, template, null, llm)

    Note over Graph: 8. Create Initial State
    Graph->>Graph: initialState = {<br/>  sessionId,<br/>  conversationHistory: [],<br/>  currentTopicIndex: 0,<br/>  currentQuestionIndex: 0,<br/>  interviewStatus: 'planning'<br/>}

    Note over Graph: 9. Execute Graph
    Graph->>Graph: graph.invoke(initialState, {<br/>  configurable: { thread_id: sessionId }<br/>})

    Note over Graph: MemorySaver stores state<br/>(IN-MEMORY ONLY - LOST ON RESTART)

    Note over Graph: Node: planning → interviewing
    Graph->>Graph: planningNode(state, llm)
    Graph->>Graph: Return: { conversationHistory: [...],<br/>  interviewStatus: 'interviewing' }

    Graph-->>Engine: InterviewState (result)

    Note over Engine: 10. Persist State to PostgreSQL
    Engine->>Engine: saveState(sessionId, userId, templateId, result, null)

    Engine->>Engine: Serialize state to JSON:<br/>conversationHistory = {<br/>  template,<br/>  messages,<br/>  currentTopicIndex,<br/>  currentQuestionIndex,<br/>  completedTopics<br/>}<br/>extractedInfo = { answers }

    Engine->>Repo: create({ sessionId, userId, templateId,<br/>  conversationHistory, extractedInfo })

    Repo->>DB: INSERT INTO interviews<br/>(session_id, user_id, template_id,<br/> conversation_history, extracted_info)<br/>VALUES (?, ?, ?, ?::jsonb, ?::jsonb)

    DB-->>Repo: Interview record created
    Repo-->>Engine: Interview

    Engine-->>Webhook: greetingMessage = "欢迎参加访谈！"

    Note over Webhook: 11. Store User Message
    Webhook->>Repo: create({ interviewId, role: USER, content: "开始" })
    Repo->>DB: INSERT INTO messages<br/>(interview_id, role, content)

    Webhook-->>DingTalk: { code: 0, session_id, message }
    DingTalk-->>User: Display greeting message
```

### Key Points (访谈开始关键点)

1. **Session ID Generation**: `interview_${randomBytes(6).toString('hex')}`
2. **State Initialization**:
   - `currentTopicIndex: 0`
   - `currentQuestionIndex: 0`
   - `conversationHistory: []`
   - `interviewStatus: 'planning'`
3. **Dual Persistence**:
   - MemorySaver stores state in RAM (thread_id = sessionId)
   - PostgreSQL stores serialized state in `conversation_history` and `extracted_info` JSONB fields
4. **Template Loading**: Falls back through `quality_survey` → `customer_feedback` → `default`

---

## 2. Interview Continue Flow (访谈接续)

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant DingTalk
    participant Webhook as /api/webhook
    participant Engine as ConversationEngine
    participant Graph as LangGraph
    participant Repo as InterviewRepository
    participant DB as PostgreSQL

    User->>DingTalk: Send answer "产品质量很好"
    DingTalk->>Webhook: POST /api/webhook<br/>session_id: "interview_xxx"

    Note over Webhook: 1. Signature Verification
    Webhook->>Webhook: verifySignature()

    Note over Webhook: 2. Extract Session ID
    Webhook->>Webhook: sessionId = request.body.session_id

    alt No session_id in request
        Webhook->>Repo: findByUserId(user_id, IN_PROGRESS)
        Repo->>DB: SELECT * FROM interviews<br/>WHERE user_id = ? AND status = 'IN_PROGRESS'
        DB-->>Repo: [activeInterview]
        Repo-->>Webhook: sessionId = activeInterview[0].sessionId
    end

    Note over Webhook: 3. Load Existing Interview
    Webhook->>Repo: findBySessionId(sessionId)
    Repo->>DB: SELECT * FROM interviews<br/>WHERE session_id = ?
    DB-->>Repo: Interview record<br/>(with conversation_history, extracted_info)
    Repo-->>Webhook: interview

    Note over Webhook: 4. Store User Message
    Webhook->>Repo: create({ interviewId, role: USER, content })
    Repo->>DB: INSERT INTO messages

    Note over Webhook: 5. Load Template
    Webhook->>Webhook: templateService.getTemplate(interview.templateId)

    Note over Engine: 6. Process Message
    Webhook->>Engine: processMessage(sessionId, userId, templateId, template, userMessage)

    Note over Engine: 7. Retry Loop (Optimistic Locking)
    loop Attempt 0-2 (maxRetries=3)
        Engine->>Engine: processMessageWithTransaction()

        Note over Repo: 8. Start Transaction
        Engine->>Repo: withTransaction(async () => { ... })

        Note over Engine: 9. Load Current State
        Engine->>Repo: findBySessionId(sessionId)
        Repo->>DB: SELECT * FROM interviews<br/>WHERE session_id = ?<br/>(FOR UPDATE - implicit)
        DB-->>Repo: Interview with version=N
        Repo-->>Engine: existingInterview

        Note over Engine: 10. Deserialize State from PostgreSQL
        Engine->>Engine: deserializeState(existingInterview)

        Note over Engine: Extract from conversation_history JSONB:<br/>- messages<br/>- currentTopicIndex<br/>- currentQuestionIndex<br/>- completedTopics<br/><br/>Extract from extracted_info JSONB:<br/>- answers

        Engine-->>Engine: currentState: InterviewState

        Note over Graph: 11. Resume Interview
        Engine->>Graph: resumeInterview(sessionId, currentState, userMessage, llm)

        Graph->>Graph: stateWithMessage = {<br/>  ...currentState,<br/>  conversationHistory: [<br/>    ...currentState.conversationHistory,<br/>    { role: 'user', content: userMessage }<br/>  ]<br/>}

        Note over Graph: 12. Execute Graph (NO MemorySaver restore)<br/>MemorySaver is FRESH instance<br/>thread_id is passed but ignored

        Graph->>Graph: graph.invoke(stateWithMessage, {<br/>  configurable: { thread_id: sessionId }<br/>})

        Note over Graph: Nodes executed:<br/>interviewing → [conditional] → followup/interviewing/END

        Graph->>Graph: interviewNode(state, llm)
        Note over Graph: - Extract user answer<br/>- Store in answers[`q${topic}_${question}`]<br/>- Increment currentQuestionIndex<br/>- Check if LLM needs followup<br/>- Update conversationHistory

        Graph-->>Engine: result: InterviewState

        Note over Engine: 13. Save State to PostgreSQL
        Engine->>Engine: saveState(sessionId, userId, templateId, result, existingInterview)

        Engine->>Engine: Serialize state:<br/>conversationHistory = JSON.parse(JSON.stringify({<br/>  template, messages, indices<br/>}))<br/>extractedInfo = JSON.parse(JSON.stringify({<br/>  answers<br/>}))

        Engine->>Repo: updateWithVersion(existingInterview.id, {<br/>  version: existingInterview.version,<br/>  conversationHistory,<br/>  extractedInfo,<br/>  status: 'IN_PROGRESS'<br/>})

        Repo->>DB: UPDATE interviews<br/>SET conversation_history = ?::jsonb,<br/>    extracted_info = ?::jsonb,<br/>    version = version + 1<br/>WHERE id = ? AND version = ?<br/>(Optimistic Lock Check)

        alt Version mismatch (concurrent update)
            DB-->>Repo: 0 rows affected
            Repo-->>Engine: throw OptimisticLockError
            Engine->>Engine: Retry with exponential backoff<br/>(50ms * attempt)
        else Success
            DB-->>Repo: 1 row updated
            Repo-->>Engine: Interview updated
        end

        Engine-->>Engine: Transaction committed
    end

    Engine-->>Webhook: responseMessage = "下一个问题..."

    Note over Webhook: 14. Store Assistant Message
    Webhook->>Repo: create({ interviewId, role: ASSISTANT, content: responseMessage })
    Repo->>DB: INSERT INTO messages

    Webhook-->>DingTalk: { code: 0, session_id, message }
    DingTalk-->>User: Display next question
```

### Key Points (访谈接续关键点)

1. **Session Lookup Priority**:
   - First: `request.body.session_id` (from DingTalk callback)
   - Fallback: `findByUserId(user_id, IN_PROGRESS)` (active sessions)

2. **State Deserialization** (from PostgreSQL):

   ```typescript
   // From conversation_history JSONB:
   - messages: conversationHistory
   - currentTopicIndex
   - currentQuestionIndex
   - completedTopics

   // From extracted_info JSONB:
   - answers
   ```

3. **MemorySaver Issue**:
   - MemorySaver is created FRESH in `createInterviewGraph()`
   - `thread_id` is passed but state is NOT restored from MemorySaver
   - State comes entirely from PostgreSQL deserialization

4. **Optimistic Locking**:
   - Each update checks `WHERE version = expected_version`
   - On conflict: retry up to 3 times with exponential backoff
   - Prevents lost updates from concurrent requests

5. **State Update Flow**:
   ```
   PostgreSQL → deserialize → Graph execution → serialize → PostgreSQL
   ```

---

## 3. Interview End Flow (访谈结束)

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant DingTalk
    participant Webhook as /api/webhook
    participant Engine as ConversationEngine
    participant Graph as LangGraph
    participant Node as analyzeNode
    participant Repo as InterviewRepository
    participant DB as PostgreSQL

    User->>DingTalk: Send final answer
    DingTalk->>Webhook: POST /api/webhook

    Note over Webhook: Same flow as Continue<br/>up to Graph execution

    Webhook->>Engine: processMessage(...)
    Engine->>Repo: findBySessionId(sessionId)
    Repo->>DB: SELECT
    DB-->>Engine: existingInterview

    Engine->>Engine: deserializeState(existingInterview)
    Engine->>Graph: resumeInterview(sessionId, currentState, userMessage, llm)

    Note over Graph: Check completion condition
    Graph->>Graph: interviewNode(state, llm)

    Note over Graph: All topics completed?<br/>completedTopics.length === topics.length<br/>OR isInterviewComplete(state) === true

    Graph->>Graph: Conditional edge: interviewStatus === 'analyzing'

    Note over Graph: Transition to analyzing node
    Graph->>Node: analyzeNode(state, llm)

    Note over Node: Generate final report
    Node->>Node: Call LLM with ANALYZE_PROMPT<br/>Pass all answers and conversation history

    Node-->>Graph: {<br/>  report: "# 访谈报告\n\n...",<br/>  interviewStatus: 'completed',<br/>  endTime: new Date()<br/>}

    Graph-->>Engine: result: InterviewState<br/>(with status='completed')

    Note over Engine: Save final state
    Engine->>Engine: saveState(sessionId, userId, templateId, result, existingInterview)

    Engine->>Repo: updateWithVersion(id, {<br/>  version,<br/>  conversationHistory,<br/>  extractedInfo,<br/>  status: 'COMPLETED',<br/>  report: result.report<br/>})

    Repo->>DB: UPDATE interviews<br/>SET status = 'COMPLETED',<br/>    report = ?,<br/>    version = version + 1<br/>WHERE id = ? AND version = ?

    DB-->>Repo: Updated
    Repo-->>Engine: Interview

    Engine-->>Webhook: responseMessage = "感谢您的参与！"

    Webhook->>Repo: create({ interviewId, role: ASSISTANT, content })
    Repo->>DB: INSERT INTO messages

    Webhook-->>DingTalk: { code: 0, session_id, message }
    DingTalk-->>User: Display completion message

    Note over User, DB: Interview session ended<br/>Status: COMPLETED<br/>Report generated
```

### Key Points (访谈结束关键点)

1. **Completion Trigger**:
   - `isInterviewComplete(state)` returns true
   - OR all topics have been covered: `completedTopics.length === template.topics.length`

2. **Report Generation**:
   - `analyzeNode` calls LLM with all collected answers
   - Uses `ANALYZE_PROMPT` template
   - Generates Markdown report

3. **Final State Update**:
   - `interviewStatus: 'completed'`
   - `endTime: new Date()`
   - `report: string` (Markdown content)
   - Database `status: 'COMPLETED'`

---

## 4. Session Persistence Mechanism (会话保持机制)

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Webhook Request                              │
│                   POST /api/webhook                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ConversationEngine                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  processMessage() / startInterview()                      │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Transaction (Optimistic Lock Retry Loop)          │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  1. findBySessionId() → PostgreSQL            │  │  │  │
│  │  │  │  2. deserializeState()                        │  │  │  │
│  │  │  │  3. resumeInterview() / runInterviewTurn()    │  │  │  │
│  │  │  │  4. saveState() → PostgreSQL                  │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌──────────────────────┐          ┌──────────────────────┐
│   LangGraph Graph    │          │   PostgreSQL DB      │
│  ┌────────────────┐  │          │  ┌────────────────┐  │
│  │ MemorySaver    │  │          │  │ interviews     │  │
│  │ (IN-MEMORY)    │  │          │  │ ├─ id          │  │
│  │ ├─ thread_id   │  │          │  │ ├─ session_id  │  │
│  │ └─ state       │  │          │  │ ├─ user_id     │  │
│  │                │  │          │  │ ├─ version     │  │
│  │ ⚠️ LOST ON     │  │          │  │ ├─ status      │  │
│  │    RESTART!    │  │          │  │ ├─ conversation│  │
│  │                │  │          │  │ │  _history    │  │
│  │                │  │          │  │ │  (JSONB)     │  │
│  │                │  │          │  │ ├─ extracted_  │  │
│  │                │  │          │  │ │  info (JSONB)│  │
│  │                │  │          │  │ └─ report      │  │
│  └────────────────┘  │          │  └────────────────┘  │
└──────────────────────┘          └──────────────────────┘
        ❌ NOT USED                      ✅ ACTUAL SOURCE
        FOR RECOVERY                     OF TRUTH
```

### PostgreSQL Schema (数据模型)

```sql
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR UNIQUE NOT NULL,
    user_id VARCHAR NOT NULL,
    template_id VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, CANCELLED
    topic VARCHAR,

    -- State Persistence (JSONB)
    conversation_history JSONB,  -- { template, messages, currentTopicIndex, currentQuestionIndex, completedTopics }
    extracted_info JSONB,        -- { answers: { q0_0: "answer1", q0_1: "answer2", ... } }

    report TEXT,
    report_path VARCHAR,

    version INT DEFAULT 0,       -- Optimistic locking
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    role VARCHAR NOT NULL,      -- USER, ASSISTANT, SYSTEM
    content TEXT NOT NULL,
    message_type VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_interview_id (interview_id),
    INDEX idx_role (role)
);
```

### State Serialization Format (状态序列化格式)

**conversation_history JSONB:**

```json
{
  "template": {
    "id": "quality_survey",
    "name": "产品质量调查",
    "topics": [...],
    "questions": [...],
    "domain_context": "..."
  },
  "messages": [
    { "role": "assistant", "content": "欢迎参加访谈！" },
    { "role": "user", "content": "产品质量很好" },
    { "role": "assistant", "content": "下一个问题..." }
  ],
  "currentTopicIndex": 0,
  "currentQuestionIndex": 1,
  "completedTopics": []
}
```

**extracted_info JSONB:**

```json
{
  "answers": {
    "q0_0": "产品质量很好",
    "q0_1": "服务响应很快",
    "q1_0": "希望能增加更多功能"
  }
}
```

---

## 5. Critical Issues Identified (识别的关键问题)

### Issue 1: MemorySaver is Non-Persistent (关键问题)

**Problem:**

```typescript
// src/core/graph.ts:80
const checkpointer = new MemorySaver();
return workflow.compile({ checkpointer });
```

- MemorySaver stores state in RAM only
- On server restart, all checkpointer state is lost
- `thread_id` parameter is passed but ignored for recovery

**Impact:**

- State recovery relies 100% on PostgreSQL
- MemorySaver provides NO benefit for multi-turn persistence
- If ConversationEngine deserialization fails, session is lost

**Evidence:**

```typescript
// src/services/conversation/engine.ts:82-88
if (existingInterview) {
  const currentState = this.deserializeState(existingInterview); // ← From PostgreSQL
  result = await resumeInterview(
    sessionId,
    currentState, // ← Pass deserialized state
    userMessage,
    this.useLlm ? getDashScopeProvider() : undefined,
  );
}
```

### Issue 2: Unbounded Conversation History Growth

**Problem:**

```typescript
// src/core/nodes.ts:99 (interviewNode)
conversationHistory: [
  ...state.conversationHistory,
  { role: "assistant", content: llmResponse },
],
```

- `conversationHistory` always appends, never truncates
- Stored in PostgreSQL JSONB field
- Long interviews (50+ turns) will create large JSONB documents

**Mitigation (partial):**

```typescript
// src/core/nodes.ts:13
function buildHistory(state: InterviewState): Message[] {
  return state.conversationHistory.slice(-6); // Only last 6 messages to LLM
}
```

But full history is still stored in database!

### Issue 3: No Session Cleanup

**Problem:**

- No automatic cleanup of completed interviews
- No TTL (time-to-live) for abandoned sessions
- `CANCELLED` status exists but is never set automatically

### Issue 4: Version Field Not in InterviewState

**Problem:**

- `InterviewState` type doesn't include `version` field
- Optimistic locking happens at repository level only
- If state schema changes, old serialized states may fail

---

## 6. Recommendations (改进建议)

### High Priority

1. **Remove MemorySaver or Replace with PostgresSaver**

   ```typescript
   // Option A: Remove MemorySaver (state comes from DB anyway)
   return workflow.compile({}); // No checkpointer

   // Option B: Implement PostgresSaver
   import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
   const checkpointer = new PostgresSaver(connection);
   ```

2. **Add Conversation History Truncation**

   ```typescript
   // Keep last N messages in state
   const MAX_HISTORY = 20;
   conversationHistory: state.conversationHistory.slice(-MAX_HISTORY);
   ```

3. **Add Session Timeout**
   ```typescript
   // Auto-cancel sessions inactive for > 24 hours
   UPDATE interviews
   SET status = 'CANCELLED'
   WHERE status = 'IN_PROGRESS'
   AND updated_at < NOW() - INTERVAL '24 hours'
   ```

### Medium Priority

4. **Add Version to InterviewState**

   ```typescript
   interface InterviewState {
     // ... existing fields
     version: number; // For migration support
   }
   ```

5. **Implement Health Checks**

   ```typescript
   // Periodic check for orphaned sessions
   // Cleanup old completed interviews
   // Monitor conversation_history size
   ```

6. **Add Circuit Breaker for LLM Calls**
   ```typescript
   // Prevent cascading failures
   // Fallback to default responses on LLM errors
   ```

---

## 7. Testing Recommendations (测试建议)

### Missing Test Coverage

1. **Multi-turn conversation tests** (0 tests found)
   - Test `resumeInterview` execution
   - Verify state persistence across turns
   - Test optimistic locking retries

2. **State serialization tests**
   - Test `deserializeState()` with various data formats
   - Test edge cases (empty history, missing fields)

3. **Concurrent session tests**
   - Two requests for same session simultaneously
   - Verify optimistic locking behavior

4. **Performance tests**
   - Long conversation history (100+ messages)
   - Concurrent sessions (100+ users)
   - Database query performance with large JSONB

---

## Conclusion

The multi-turn interview system relies entirely on **PostgreSQL for session persistence**. The MemorySaver checkpointer provides no actual persistence benefit and should be removed or replaced with a database-backed checkpointer.

Key risks:

1. **MemorySaver is misleading** - suggests persistence but provides none
2. **Unbounded history growth** - could impact performance
3. **No automatic cleanup** - completed sessions remain indefinitely

The architecture is sound for basic multi-turn conversations, but needs the above improvements for production readiness.
