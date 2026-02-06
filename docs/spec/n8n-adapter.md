---
id: n8n-adapter-spec
type: spec
title: n8n Workflow Execution Adapter
status: draft
spec_state: draft
trust: draft
summary: Webhook-based adapter integrating n8n workflow execution into Cogni's GraphExecutorPort with LiteLLM billing reconciliation.
read_when: You are implementing or modifying the n8n workflow execution adapter.
implements: ini.n8n-integration
owner: derekg1729
created: 2026-02-07
verified: 2026-02-07
tags: [ai-graphs, billing]
---

# n8n Workflow Execution Adapter

## Context

This adapter triggers n8n workflows via webhook/REST API and streams results back through `GraphExecutorPort`. n8n is an **external executor** — follows invariants 41-47 with async reconciliation via LiteLLM `end_user` correlation. `usageUnitId = spend_logs.request_id` per LLM call.

When a developer chooses to implement their agent/workflow in n8n, this adapter standardizes it into Cogni's auth + billing pipeline. Developer's choice of environment, Cogni's unified metering.

## Goal

Provide a `GraphExecutorPort` implementation that invokes n8n workflows via webhook, correlates billing through LiteLLM `end_user`, and reconciles usage via spend logs — enabling n8n-authored agents to participate in Cogni's unified auth and billing pipeline.

## Non-Goals

1. **Do NOT build n8n workflow editor integration** — use n8n's native UI
2. **Do NOT implement n8n-internal billing** — route through LiteLLM gateway
3. **Do NOT build custom n8n nodes** in P0 — use standard nodes + webhook patterns
4. **Do NOT use custom headers for correlation** — use `user` parameter for `end_user`

## Core Invariants

1. **WEBHOOK_TRIGGER_PATTERN**: n8n workflows are invoked via HTTP POST to their production webhook URL. Adapter waits for `Respond to Webhook` node response or polls for completion.

2. **LLM_VIA_GATEWAY_WITH_END_USER**: n8n AI nodes must route through Cogni's LiteLLM gateway AND set `user = ${runId}/${attempt}`. This enables reconciliation via `end_user` correlation (invariant 41).

3. **EXTERNAL_EXECUTOR_RECONCILIATION**: Per invariants 41-47, billing is reconciled via `GET /spend/logs?end_user=${runId}/${attempt}`. Stream events emitted by adapter are UX hints only (invariant 45).

4. **USAGE_UNIT_IS_LITELLM_REQUEST_ID**: `usageUnitId = spend_logs.request_id` (invariant 42). Multiple charge_receipts per run expected for multi-step workflows.

5. **GRAPH_ID_AS_WORKFLOW_REFERENCE**: `graphId` format: `n8n:<workflow_id>` or `n8n:<workflow_name>`. Adapter resolves to webhook URL from catalog.

### External Executor Billing Checklist

Per [external-executor-billing.md](./external-executor-billing.md) §New Executor Integration:

| Question                                     | n8n Answer                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| **Authoritative billing source?**            | LiteLLM `/spend/logs` API                                                |
| **Correlation key we control?**              | `end_user` (n8n workflow sets `user = ${runId}/${attempt}` in LLM calls) |
| **Provider call ID for usageUnitId?**        | `spend_logs.request_id` (unique per LLM call)                            |
| **Idempotent flow through commitUsageFact?** | `source_reference = ${runId}/${attempt}/${request_id}`                   |

## Schema

**Source System:** `'litellm'` (via reconciliation)

**ExecutorType:** `'n8n'`

**UsageFact mapping (from LiteLLM spend_logs):**

| Field          | Source                                                    |
| -------------- | --------------------------------------------------------- |
| `usageUnitId`  | `spend_logs.request_id`                                   |
| `costUsd`      | `spend_logs.spend`                                        |
| `inputTokens`  | `spend_logs.prompt_tokens`                                |
| `outputTokens` | `spend_logs.completion_tokens`                            |
| `model`        | `spend_logs.model`                                        |
| `runId`        | Extracted from `end_user` (format: `${runId}/${attempt}`) |
| `attempt`      | Extracted from `end_user`                                 |

**Idempotency key:** `${runId}/${attempt}/${request_id}`

**Note:** Multiple `UsageFact` per run is expected — each LLM call in the workflow creates a separate spend log entry.

## Design

### Key Decisions

### 1. Execution Pattern

| Mode         | n8n Configuration                  | Adapter Behavior                          |
| ------------ | ---------------------------------- | ----------------------------------------- |
| **Sync**     | Respond: "When Last Node Finishes" | Single POST, wait for response            |
| **Async**    | Respond: "Immediately" + callback  | POST → poll status endpoint               |
| **Callback** | Custom webhook callback            | POST with callback URL, wait for callback |

**MVP:** Sync mode only. Async/callback for P1 if needed.

### 2. Webhook Invocation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ N8nWorkflowExecutor.runGraph(request)                               │
│ ─────────────────────────────────────                               │
│ 1. Resolve graphId → webhook URL from N8N_WORKFLOW_CATALOG          │
│ 2. Build webhook payload with user: ${runId}/${attempt}             │
│ 3. POST to n8n webhook                                              │
│ 4. Await response (sync mode)                                       │
│ 5. Return { stream, final }                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ n8n Workflow Execution                                              │
│ ───────────────────────                                             │
│ - Webhook trigger receives request                                  │
│ - AI nodes call LiteLLM with user: ${runId}/${attempt}              │
│ - LiteLLM stores end_user for each call                             │
│ - "Respond to Webhook" node returns result                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Response + Reconciliation (invariant 44)                            │
│ ─────────────────────────────────────────                           │
│ 1. Parse n8n webhook response                                       │
│ 2. Emit synthetic AssistantFinalEvent + DoneEvent (UX hints)        │
│ 3. Construct GraphFinal                                             │
│ 4. After stream: reconcileRun(runId, attempt)                       │
│    └─ GET /spend/logs?end_user=${runId}/${attempt}                  │
│    └─ commitUsageFact() per entry                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Why reconciliation?** n8n doesn't expose real-time token/cost data. Per invariant 45, stream events from external executors are UX hints only. Authoritative billing flows through LiteLLM spend logs reconciliation.

### 3. Webhook Payload Contract

**Request to n8n:**

```typescript
interface N8nWebhookRequest {
  // Pass-through from GraphRunRequest
  runId: string;
  ingressRequestId: string;
  messages: Message[];
  model: string;

  // CRITICAL: n8n must forward this to LiteLLM AI nodes
  // as the 'user' parameter for end_user correlation
  user: string; // Format: ${runId}/${attempt}

  // Additional context
  cogni: {
    billingAccountId: string;
    virtualKeyId: string;
    traceId?: string;
  };
}
```

**Response from n8n:**

```typescript
interface N8nWebhookResponse {
  // Required
  success: boolean;
  execution_id: string;

  // Content (if successful)
  result?: string;
  data?: unknown;

  // Error (if failed)
  error?: {
    code: string;
    message: string;
  };

  // Optional: workflow-reported metrics
  metrics?: {
    duration_ms?: number;
    node_count?: number;
  };
}
```

### 4. n8n Workflow Configuration

**CRITICAL:** n8n workflows must be configured to forward `user` to LiteLLM:

```
Webhook Trigger Node
    ↓
Set Node (extract user from webhook payload)
    ↓
OpenAI/AI Node
    → Base URL: ${LITELLM_BASE_URL}
    → API Key: ${LITELLM_API_KEY}
    → Additional Parameters:
        user: {{ $json.user }}  ← REQUIRED for billing correlation
```

**Anti-pattern:** Do NOT use custom headers (`x-cogni-*`). LiteLLM does not support header-based filtering. Use `user` parameter for `end_user` correlation.

### 5. Catalog Configuration

```typescript
// src/adapters/server/ai/n8n/catalog.ts
export interface N8nWorkflowEntry {
  readonly workflowId: string;
  readonly displayName: string;
  readonly description: string;
  readonly webhookUrl: string;
  readonly responseMode: "sync" | "async";
  readonly requiresLitellmRouting: boolean; // Must be true for billing
}

export type N8nWorkflowCatalog = Record<string, N8nWorkflowEntry>;
```

**Configuration sources:**

1. Environment variables: `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`
2. Catalog file or DB for workflow registry
3. Runtime discovery endpoint (P2)

### 6. Error Mapping

| n8n Error                       | `AiExecutionErrorCode` |
| ------------------------------- | ---------------------- |
| HTTP 4xx                        | `invalid_request`      |
| HTTP 5xx                        | `internal`             |
| Timeout                         | `timeout`              |
| `error.code: 'WORKFLOW_FAILED'` | `internal`             |
| `error.code: 'TIMEOUT'`         | `timeout`              |

### 7. When to Use n8n Adapter

Use this adapter when the developer **chooses to implement their agent/workflow in n8n**. The adapter's purpose is to standardize n8n execution into Cogni's auth + billing pipeline — not to prescribe when n8n is "appropriate."

**Developer's choice, Cogni's pipeline.**

### File Pointers

| File                                           | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `src/adapters/server/ai/n8n/executor.ts`       | New: `N8nWorkflowExecutor` implementing `GraphExecutorPort` |
| `src/adapters/server/ai/n8n/catalog.ts`        | New: `N8N_WORKFLOW_CATALOG` type and static config          |
| `src/adapters/server/ai/n8n/webhook-client.ts` | New: HTTP client for n8n webhook invocation                 |
| `src/adapters/server/ai/n8n/index.ts`          | New: Barrel export                                          |
| `src/adapters/server/index.ts`                 | Export N8nWorkflowExecutor                                  |
| `src/bootstrap/graph-executor.factory.ts`      | Wire N8nWorkflowExecutor into aggregator                    |
| `packages/ai-core/src/usage/usage.ts`          | Add `n8n` to `ExecutorType` union                           |

## Acceptance Checks

**Manual (not yet implemented):**

1. `N8nWorkflowExecutor` invokes n8n webhook and returns `GraphFinal`
2. `user` field is forwarded through n8n to LiteLLM for billing correlation
3. Reconciliation queries `/spend/logs?end_user=${runId}/${attempt}` and commits usage facts
4. Error mapping produces correct `AiExecutionErrorCode` for each n8n error class

## Open Questions

- [ ] Should async/callback mode be P1 or P2?
- [ ] Should catalog be config-file-based or DB-backed?

## Related

- [external-executor-billing.md](./external-executor-billing.md) — Invariants 41-47, reconciliation pattern
- [Initiative: ini.n8n-integration](../../work/initiatives/ini.n8n-integration.md)
- [n8n Webhook Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
