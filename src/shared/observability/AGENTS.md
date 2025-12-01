# observability · AGENTS.md

> Scope: this directory only. Keep ≤150 lines.

## Metadata

- **Owners:** @cogni-dao
- **Last reviewed:** 2025-12-01
- **Status:** stable

## Purpose

Cross-cutting observability concerns: structured logging, request context, and event schemas for correlation across HTTP routes and features.

## Pointers

- [OBSERVABILITY.md](../../../docs/OBSERVABILITY.md) - V1/V2 implementation plan
- [Logger factory](logging/logger.ts) - Pino configuration
- [RequestContext](context/types.ts) - Request-scoped context type
- [Event schemas](logging/events.ts) - AI + Payments event types

## Boundaries

```json
{
  "layer": "shared",
  "may_import": ["shared"],
  "must_not_import": ["ports", "bootstrap", "core", "features", "adapters"]
}
```

## Public Surface

- **Exports:**
  - `makeLogger(bindings?)` - Pino logger factory
  - `makeNoopLogger()` - Silent logger for tests
  - `createRequestContext({ baseLog, clock }, request, { routeId, session })` - Request context factory
  - `logRequestStart/End/Error/Warn(log, ...)` - Standardized helpers
  - `Logger`, `RequestContext`, `Clock` - Types
  - `AiLlmCallEvent`, `PaymentsEvent` - Event schemas
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** Uses `PINO_LOG_LEVEL`, `NODE_ENV`, `SERVICE_NAME` from serverEnv()
- **Files considered API:** `index.ts`, `logging/index.ts`, `context/index.ts`

## Ports

- **Uses ports:** none (structural Clock interface only)
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**:
  - Provide Pino logger factory emitting JSON to stdout (no worker transports)
  - Define RequestContext for request-scoped logging
  - Provide standardized log helpers (start/end/error/warn)
  - Define event schemas for AI and Payments domains
  - Validate reqId from `x-request-id` header (max 64 chars, alphanumeric + `_-`)
  - Redact sensitive fields (tokens, headers, wallet keys)
  - Set stable base fields (app, service) - env label added by Alloy

- This directory **does not**:
  - Depend on Container or port interfaces
  - Implement log collection or aggregation
  - Define domain business logic
  - Handle HTTP routing or responses

## Usage

**Route handler:**

```typescript
import { getContainer } from "@/bootstrap/container";
import {
  createRequestContext,
  logRequestStart,
  logRequestEnd,
} from "@/shared/observability";

const container = getContainer();
const ctx = createRequestContext(
  { baseLog: container.log, clock: container.clock },
  request,
  { routeId: "ai.completion", session }
);

logRequestStart(ctx.log);
```

**Feature service:**

```typescript
import type { RequestContext, AiLlmCallEvent } from "@/shared/observability";

export async function execute(..., ctx: RequestContext) {
  const log = ctx.log.child({ feature: "ai.completion" });
  const llmEvent: AiLlmCallEvent = { ... };
  log.info(llmEvent, "LLM response received");
}
```

## Standards

- All console.log/warn/error prohibited in src/ - use logger
- JSON-only logs to stdout (formatting via external pipe: `pnpm dev:pretty`)
- Test silence: makeLogger() checks `VITEST=true || NODE_ENV=test`
- Security: reqId validation prevents injection attacks
- Stable event schemas with typed fields
- Bindings cannot override reserved keys (app, service)

## Dependencies

- **Internal:** `@/shared/auth` (SessionUser), `@/shared/env` (serverEnv)
- **External:** pino, pino-pretty (dev)

## Change Protocol

- Update this file when exports, event schemas, or boundaries change
- Update docs/OBSERVABILITY.md for architecture changes
- Ensure arch:check passes after boundary changes

## Notes

- Structural Clock interface `{ now(): string }` - ports/Clock satisfies this
- RequestContext decoupled from Container (takes `{ baseLog, clock }` only)
- V2 implementation: Alloy + local Loki (dev) + Grafana Cloud (preview/prod)
- Logging architecture: JSON stdout → Alloy → Loki (env label from DEPLOY_ENVIRONMENT)
