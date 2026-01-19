# features/ai/chat · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2026-01-20
- **Status:** draft
- **Parent:** [features/ai](../AGENTS.md)

## Purpose

Chat subfeature of AI - provides assistant-ui integration for conversational AI interface. Chat is owned by AI feature, not a separate domain.

## Pointers

- [Root AGENTS.md](../../../../AGENTS.md)
- [Parent: AI Feature](../AGENTS.md)
- [Architecture](../../../../docs/ARCHITECTURE.md)
- [UI Implementation Guide](../../../../docs/UI_IMPLEMENTATION_GUIDE.md)
- **Related:** [../services/](../services/) (completion, AI logic), [../../payments/](../../payments/) (credits)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["core", "ports", "shared", "types", "components", "contracts"],
  "must_not_import": ["app", "adapters"]
}
```

## Ownership

**AI feature owns all LLM interaction endpoints and runtimes:**

- Chat is an AI subfeature: assistant-ui integration, runtime provider, chat UI composition
- No separate sibling feature may implement AI chat logic
- All chat behavior routes through AI services layer

## Public Surface

- **Exports:** ChatRuntimeProvider, ChatCreditsHint, mapHttpError, toErrorAlertProps
- **Routes:** /api/v1/ai/chat (POST) - routes to AI completion services
- **Env/Config keys:** none
- **Files considered API:** providers/ChatRuntimeProvider.client.tsx, components/ChatCreditsHint.tsx, utils/mapHttpError.ts, utils/toErrorAlertProps.ts

## Ports

- **Uses ports:** none (delegates to AI completion services via API route)
- **Implements ports:** none
- **Contracts:** ai.chat.v1 (wire format)

## Responsibilities

- **This subfeature does:**
  - Provide chat UI using assistant-ui components
  - Manage chat runtime state with useExternalStoreRuntime
  - Transform wire format (assistant-ui) ↔ DTO format in API route
  - Show conditional credits hint when balance is zero
  - Handle abort/cancellation without state corruption

- **This subfeature does not:**
  - Persist messages to database (v2)
  - Implement streaming (v1)
  - Handle authentication (enforced by (app) layout)
  - Manage billing (delegated to AI completion services)
  - Contain AI business logic (owned by features/ai/services)

## Implementation Status

**v1 (Current):**

- ✅ assistant-ui integration with useDataStreamRuntime
- ✅ /api/v1/ai/chat endpoint with SSE streaming
- ✅ Token-by-token rendering via assistant-stream
- ✅ Multi-turn conversation state via threadId
- ✅ Tool call visualization (tool_call_start/tool_call_result events)
- ✅ Custom welcome copy with 3 suggestions
- ✅ Conditional credits hint
- ✅ Zod runtime validation (route input + client output)

**v2 (Planned):**

- ⏳ Database persistence
- ⏳ Thread routing /chat/[threadId]
- ⏳ Thread list/history
- ⏳ Context window optimization
- ⏳ Stop/abort generating

**Critical v2 Note:** Message storage + context optimization required. Current implementation sends all messages on every request (unbounded growth). v2 needs smart windowing, summarization, or embedding-based retrieval.

## Thread State Management

### P0 Design (Current)

**Contract:**

- Request: `threadId?: string` in JSON body (optional)
- Response: `X-Thread-Id` header (always returned)
- Server generates `threadId` if absent; client reuses for multi-turn

**UI State Pattern:**

```typescript
// Future-safe: keyed by stateKey for thread switching/forks
const [threadIdByStateKey, setThreadIdByStateKey] = useState<Record<string, string>>({});
const activeStateKey = "default"; // Placeholder for future state/thread selection
const threadId = threadIdByStateKey[activeStateKey];

// body MUST be object (assistant-ui limitation), not function
body: { model, graphName, ...(threadId ? { threadId } : {}) }

// onResponse captures server-generated threadId
setThreadIdByStateKey(prev => ({ ...prev, [activeStateKey]: newThreadId }));
```

**Why `threadIdByStateKey` map (not single state)?**

- Trivially migrates when thread list/switching added
- Supports forks/reruns (multiple states per session)
- No refactor needed for v2 state store

### Naming Convention

| Layer        | Field       | Notes                                               |
| ------------ | ----------- | --------------------------------------------------- |
| UI State     | `stateKey`  | App-level key for state/thread selection            |
| API/Contract | `threadId`  | Client-facing identifier sent to server             |
| Port/Adapter | `threadKey` | Internal; derive UUIDv5 from (accountId, threadKey) |
| LangGraph    | `thread_id` | UUID format required by LangGraph API               |

**TODO(P1):** Consider unifying port/adapter to `threadId` to reduce translation.

### Progression

| Phase  | Capability                          | threadId Ownership                   |
| ------ | ----------------------------------- | ------------------------------------ |
| **P0** | Single conversation, no persistence | ChatRuntimeProvider local state      |
| **P1** | Thread list UI, URL routing         | Lift to page-level state or context  |
| **P2** | Persistence, forks, history         | Conversation store (Zustand/context) |

## Usage

```typescript
// In chat page
import { ChatRuntimeProvider } from "@/features/ai/chat/providers/ChatRuntimeProvider.client";
import { Thread } from "@/components";

<ChatRuntimeProvider onAuthExpired={() => signOut()}>
  <Thread welcomeMessage={<CustomWelcome />} />
</ChatRuntimeProvider>
```

## Standards

- Contract types via z.infer only - no manual interfaces
- Zod runtime validation on route input and client output
- Ref-based state management to avoid stale closures
- AbortController wiring for v1 streaming readiness

## Dependencies

- **Internal:** @/contracts/ai.chat.v1.contract, @/features/payments/public, @/components/vendor/assistant-ui, @/components/vendor/shadcn
- **External:** @assistant-ui/react, @assistant-ui/react-markdown, @tanstack/react-query, next-auth

## Change Protocol

- On wire format change: Update ai.chat.v1 contract, transform functions in route
- Breaking changes: Bump to ai.chat.v2
- Keep message shape compatible with assistant-ui ThreadMessageLike

## Notes

- Components in `src/components/vendor/assistant-ui/` are exact copies from assistant-ui starter
- ThreadWelcome customized with Cogni-specific copy
- ChatCreditsHint integrated into welcome screen
- All types from contract via z.infer - no manual interfaces
