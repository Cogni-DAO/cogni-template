# features/ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-12-17
- **Status:** draft

## Purpose

AI feature owns all LLM interaction endpoints, runtimes, and services. Provides completion services, chat integration (assistant-ui), and model selection UI for the application.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [Chat subfeature](./chat/AGENTS.md)
- **Related:** [../payments/](../payments/) (credits), [../../contracts/](../../contracts/) (ai.completion.v1, ai.chat.v1, ai.models.v1)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["core", "ports", "shared", "types", "components", "contracts"],
  "must_not_import": ["app", "adapters"]
}
```

## Public Surface

- **Exports (via public.ts):**
  - `ChatRuntimeProvider` (chat runtime state)
  - `ModelPicker` (model selection dialog)
  - `ChatComposerExtras` (composer toolbar with model selection)
  - `useModels` (React Query hook for models list)
  - `getPreferredModelId`, `setPreferredModelId`, `validatePreferredModel` (localStorage preferences)
- **Routes:**
  - `/api/v1/ai/completion` (POST) - text completion with credits metering
  - `/api/v1/ai/chat` (POST) - chat endpoint (streaming support via SSE)
  - `/api/v1/ai/models` (GET) - list available models with tier info
  - `/api/v1/activity` (GET) - usage statistics and logs
- **Env/Config keys:** `LITELLM_BASE_URL`, `DEFAULT_MODEL` (via serverEnv)
- **Files considered API:** public.ts, chat/providers/ChatRuntimeProvider.client.tsx, components/\*, hooks/\*

## Ports

- **Uses ports:** LlmService (completion, completionStream), AccountService (recordChargeReceipt), AiTelemetryPort (recordInvocation), LangfusePort (createTrace, recordGeneration)
- **Implements ports:** none
- **Contracts:** ai.completion.v1, ai.chat.v1, ai.models.v1, ai.activity.v1

## Responsibilities

- **This feature does:**
  - Provide AI completion services with preflight credit gating and non-blocking post-call billing
  - Apply pricing policy (markup factor from env) via llmPricingPolicy service
  - Provide chat UI integration via assistant-ui
  - Expose model selection UI with localStorage persistence
  - Fetch and cache available models list (server-side cache with SWR)
  - Validate selected models against server-side allowlist
  - Transform between wire formats and domain DTOs
  - Delegate to LlmCaller port for actual LLM calls
  - Record charge receipts via AccountService.recordChargeReceipt (per ACTIVITY_METRICS.md)
  - Record AI invocation telemetry via AiTelemetryPort (per AI_SETUP_SPEC.md)
  - Create Langfuse traces for observability (optional, env-gated)

- **This feature does not:**
  - Implement LLM adapters (owned by adapters/server/ai)
  - Manage credits/billing (owned by features/accounts)
  - Persist chat messages to database (planned for v2)
  - Implement streaming (supported in v1 via SSE)

## Usage

```typescript
// Chat page with model selection
import { ChatRuntimeProvider, ChatComposerExtras } from "@/features/ai/public";
import { Thread } from "@/components/kit/chat";

<ChatRuntimeProvider onAuthExpired={() => signOut()}>
  <Thread
    composerLeft={
      <ChatComposerExtras
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        defaultModelId={defaultModelId}
      />
    }
  />
</ChatRuntimeProvider>
```

## Standards

- Contract types via z.infer only - no manual interfaces
- Zod runtime validation on route input/output
- All exports via public.ts barrel (stable API surface)
- Server-side cache for models list (5min TTL, SWR)
- Client-side localStorage with SSR guards and graceful degradation
- 409 retry logic when selected model not in server allowlist

## Dependencies

- **Internal:** @/contracts/ai._, @/ports/llm.port, @/shared/env/server, @/components/kit/_, @/components/vendor/assistant-ui, @/components/vendor/shadcn
- **External:** @assistant-ui/react, @assistant-ui/react-markdown, @tanstack/react-query, zod, lucide-react

## Change Protocol

- On wire format change: Update contract (ai.completion.v1, ai.chat.v1, ai.models.v1)
- On public API change: Update public.ts exports and this AGENTS.md
- Breaking changes: Bump contract version
- Keep old versions until callers migrate

## Notes

- Model list fetched from LiteLLM /model/info (cached)
- Chat supports streaming via SSE (v1)
- Message persistence planned for v2 with smart windowing
- Model validation implements UX-001 (graceful fallback to default)
- Server cache implements PERF-001 (no per-request network calls)
- Post-call billing is non-blocking per ACTIVITY_METRICS.md design
