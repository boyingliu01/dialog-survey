# Core Layer - Agent Knowledge Base

**Domain**: LangGraph.js conversation graph, state machine, nodes

## Overview

Core layer defines the interview conversation flow via LangGraph.js StateGraph. State persists across turns via MemorySaver checkpointer.

## Structure

```
core/
├── graph.ts    # StateGraph definition with method chaining
├── state.ts    # InterviewState Annotation.Root
├── nodes.ts    # Node functions (planning, interviewing, followup, analyzing)
├── edges.ts    # Conditional edge functions
├── prompts.ts  # LLM prompt templates
└── types.ts    # Shared type definitions
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Modify conversation flow | `graph.ts` | StateGraph construction |
| Change state shape | `state.ts` | Annotation.Root |
| Add new node | `nodes.ts` + `graph.ts` | Define + register |
| Conditional branching | `edges.ts` | `shouldContinue` function |
| Prompt templates | `prompts.ts` | Interview/followup/analysis prompts |

## LangGraph Patterns

### State Definition

```typescript
const InterviewStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesReducer }),
  currentNode: Annotation<string>({ default: () => 'planning' }),
  // ...
});
```

### Graph Construction (Method Chaining)

```typescript
const workflow = new StateGraph(InterviewStateAnnotation)
  .addNode('planning', planningNode)
  .addNode('interviewing', interviewingNode)
  .addEdge(START, 'planning')
  .addConditionalEdges('interviewing', shouldContinue)
  .compile({ checkpointer: new MemorySaver() });
```

### Node Function Signature

```typescript
async function planningNode(state: typeof InterviewStateAnnotation.State) {
  // Return partial state update
  return { currentNode: 'interviewing', ... };
}
```

## Anti-Patterns (THIS PROJECT)

- Never modify state directly - return partial updates
- Never skip checkpointer in compile()
- Never use sync nodes for LLM calls
- Never hardcode node names - use constants

## Conversation Flow

```
START → planning → interviewing → [conditional]
  → followup → interviewing → ... → analyzing → END
```

Conditional edge `shouldContinue` checks follow-up needs.