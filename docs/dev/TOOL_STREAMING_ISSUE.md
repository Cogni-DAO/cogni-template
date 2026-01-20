# Tool Streaming Issue — Deferred to P1

**Status**: Deferred
**Branch with WIP**: `feat/langgraph-tool-streaming`
**Date**: 2025-01-14

## Summary

Tool event streaming (`tool_call_start`, `tool_call_result`) was implemented in `stream-translator.ts` but exposed a fundamental architecture mismatch. The fix is non-trivial and has been deferred.

## The Problem

### Three Message Systems, One Lie

We're mixing three different message systems and pretending they're compatible:

| Layer               | Format                                         | Purpose           |
| ------------------- | ---------------------------------------------- | ----------------- |
| UI chat history     | Events (`tool_call_start`, `tool_call_result`) | Rendering         |
| Core `Message[]`    | `{ role, content, toolCallId? }`               | Internal domain   |
| LangGraph/LangChain | `{ type, content, tool_call_id, tool_calls }`  | Provider protocol |

### Provider Constraints

LLM providers enforce strict rules our UI history doesn't guarantee:

1. **Exact roles/types**: `user|assistant|tool|system`
2. **Exact field names**: `tool_call_id` (snake_case), not `toolCallId`
3. **Exact ordering**: `assistant` with `tool_calls` MUST precede `tool` message
4. **Pairing**: Every `tool` message needs a matching `tool_call` ID

### What Broke

When we started emitting tool events:

1. UI stored them in history
2. User sent follow-up message
3. API sent history WITH tool messages to LangGraph
4. LangGraph choked because:
   - `toolCallId` (camelCase) vs `tool_call_id` (snake_case)
   - Tool messages appeared after user messages (orphaned)
   - Missing preceding assistant `tool_calls`

Error:

```
"Unexpected role 'tool' after role 'user'"
```

### Root Cause

```
Assumption: "If it streamed out, I can just shove it back in next turn."
Reality: Streaming output is an event protocol; next-turn input is a strict message protocol.
```

The thread identity resets every run (`stateKey = runId`), forcing us to replay history. Replaying history is where format/order mismatches cut us.

## Why InProc Works

InProc doesn't store tool events and resend them. It either:

- Keeps messages in graph state (stable thread)
- Uses LC-native message objects produced in-process (correct shape/ordering)

**Key invariant**: "Where does tool context live between turns?"

- InProc: inside the executor/graph state
- Dev-server (broken): UI history → replay → provider rejects

## Attempted Fixes

1. **Message normalizer** — `toolCallId` → `tool_call_id` conversion
2. **Orphan filter** — Drop tool messages without preceding assistant `tool_calls`

Both are band-aids. The real issue is architectural.

## Correct Fix (P1)

### Option A: Stable Thread Identity (Recommended)

Derive `threadId` from stable `conversationId`, not `runId`. Stop replaying tool messages. Send only human/ai messages and rely on thread state.

### Option B: Proper Message Reconstruction

Build a layer that reconstructs valid `messages[]` from UI event history:

- Pair `tool_call_start` with `tool_call_result`
- Emit proper `assistant` message with `tool_calls` array
- Emit proper `tool` message with `tool_call_id`
- Validate ordering before sending

### Option C: Don't Persist Tool Events

UI renders tool events ephemerally. Don't persist to history. Next turn only sends user/assistant text.

## Current State

**Shipping without tool event streaming.** WIP code is preserved:

- **Branch `feat/langgraph-tool-streaming`** — `stream-translator.ts` with `extractToolEvents()` that emits `tool_call_start`/`tool_call_result`
- **Stash `stash@{0}`** — `provider.ts` normalizer (toolCallId → tool_call_id, orphan filtering)

## Files Involved

- `src/adapters/server/ai/langgraph/dev/stream-translator.ts` — Tool event extraction
- `src/adapters/server/ai/langgraph/dev/provider.ts` — Message normalization attempts
- `src/core/chat/model.ts` — Core `Message` type

## Diagnostic Check

Compare `input.messages` at the boundary:

- InProc: What do messages look like at LC boundary?
- Dev-server: What do messages look like at `client.runs.stream()`?

If InProc doesn't send `{ role:"tool", toolCallId:"..." }`, dev-server shouldn't either.

## References

- LangChain message format: https://js.langchain.com/docs/concepts/messages/
- LangGraph thread persistence: https://langchain-ai.github.io/langgraph/concepts/persistence/
