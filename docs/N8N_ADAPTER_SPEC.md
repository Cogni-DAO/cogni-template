# n8n Workflow Execution Adapter Design

> [!CRITICAL]
> This adapter triggers n8n workflows via webhook/REST API and streams results back through `GraphExecutorPort`. n8n provides workflow orchestration; Cogni provides billing/telemetry wrapper. LLM calls within n8n workflows should route through our LiteLLM gateway for billing parity.

## Core Invariants

1. **WEBHOOK_TRIGGER_PATTERN**: n8n workflows are invoked via HTTP POST to their production webhook URL. Adapter waits for `Respond to Webhook` node response or polls for completion.

2. **LLM_VIA_GATEWAY**: n8n AI nodes (OpenAI, Anthropic) must be configured to route through Cogni's LiteLLM gateway. This enables per-request billing via LiteLLM spend logs, not n8n-internal billing.

3. **EXTERNAL_BILLING_RECONCILIATION**: Unlike in-proc adapters, n8n workflows don't emit real-time `UsageFact`. Billing is reconciled via:
   - LiteLLM spend logs (if LLM routed through gateway)
   - n8n-provided cost metadata (if available in webhook response)
   - Manual reconciliation flag for unmetered workflows

4. **GRAPH_ID_AS_WORKFLOW_REFERENCE**: `graphId` format: `n8n:<workflow_id>` or `n8n:<workflow_name>`. Adapter resolves to webhook URL from catalog.

---

## Implementation Checklist

### P0: MVP Critical - Webhook Execution

- [ ] Create `N8nWorkflowExecutor` implementing `GraphExecutorPort` in `src/adapters/server/ai/n8n/`
- [ ] Implement webhook trigger: POST to n8n production URL with `GraphRunRequest` payload
- [ ] Support two response modes: immediate (fire-and-forget) and wait-for-completion
- [ ] Map n8n webhook response to `GraphFinal`
- [ ] Emit synthetic `UsageReportEvent` with `reconciled: true` flag for manual billing

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: LiteLLM Gateway Integration

- [ ] Document n8n workflow configuration: point AI nodes to `LITELLM_BASE_URL`
- [ ] Query LiteLLM `/spend/logs` for requests matching `runId` metadata
- [ ] Reconcile spend logs into `UsageFact` with `source: 'litellm'`
- [ ] Emit accurate `usage_report` events post-execution

### P2: Streaming Support (Optional/Future)

- [ ] Evaluate n8n SSE/WebSocket support for real-time streaming
- [ ] If supported: implement streaming webhook consumer
- [ ] **Do NOT build this preemptively** — webhook polling is MVP-sufficient

---

## File Pointers (P0 Scope)

| File                                           | Change                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `src/adapters/server/ai/n8n/executor.ts`       | New: `N8nWorkflowExecutor` implementing `GraphExecutorPort` |
| `src/adapters/server/ai/n8n/catalog.ts`        | New: `N8N_WORKFLOW_CATALOG` type and static config          |
| `src/adapters/server/ai/n8n/webhook-client.ts` | New: HTTP client for n8n webhook invocation                 |
| `src/adapters/server/ai/n8n/index.ts`          | New: Barrel export                                          |
| `src/adapters/server/index.ts`                 | Export N8nWorkflowExecutor                                  |
| `src/bootstrap/graph-executor.factory.ts`      | Wire N8nWorkflowExecutor into aggregator                    |
| `packages/ai-core/src/usage/usage.ts`          | Add `n8n` to `ExecutorType` union                           |

---

## Schema (Billing)

**Source System:** `'external'` (generic external executor)

**ExecutorType:** `'n8n'`

**UsageFact mapping (reconciled mode):**

| Field                 | Source                                          |
| --------------------- | ----------------------------------------------- |
| `usageUnitId`         | `n8n_execution_id` from webhook response        |
| `costUsd`             | `undefined` (reconciled later via LiteLLM logs) |
| `inputTokens`         | From LiteLLM reconciliation                     |
| `outputTokens`        | From LiteLLM reconciliation                     |
| `model`               | From LiteLLM reconciliation                     |
| `runId`               | `GraphRunRequest.runId`                         |
| `attempt`             | `0` (P0 frozen)                                 |
| `usageRaw.reconciled` | `true`                                          |

**Idempotency key:** `${runId}/${attempt}/${n8n_execution_id}`

---

## Design Decisions

### 1. Execution Pattern

| Mode         | n8n Configuration                  | Adapter Behavior                          |
| ------------ | ---------------------------------- | ----------------------------------------- |
| **Sync**     | Respond: "When Last Node Finishes" | Single POST, wait for response            |
| **Async**    | Respond: "Immediately" + callback  | POST → poll status endpoint               |
| **Callback** | Custom webhook callback            | POST with callback URL, wait for callback |

**MVP:** Sync mode only. Async/callback for P1 if needed.

---

### 2. Webhook Invocation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ N8nWorkflowExecutor.runGraph(request)                               │
│ ─────────────────────────────────────                               │
│ 1. Resolve graphId → webhook URL from N8N_WORKFLOW_CATALOG          │
│ 2. Build webhook payload from GraphRunRequest                       │
│ 3. POST to n8n webhook with headers (API key, trace ID)             │
│ 4. Await response (sync mode)                                       │
│ 5. Return { stream, final }                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ n8n Workflow Execution                                              │
│ ───────────────────────                                             │
│ - Webhook trigger receives request                                  │
│ - Workflow nodes execute (including AI nodes → LiteLLM gateway)     │
│ - "Respond to Webhook" node returns result                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Response Processing                                                 │
│ ───────────────────                                                 │
│ - Parse n8n webhook response JSON                                   │
│ - Extract execution_id, result, error                               │
│ - Emit UsageReportEvent (reconciled=true, usageUnitId=execution_id) │
│ - Emit AssistantFinalEvent + DoneEvent                              │
│ - Construct GraphFinal                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Why reconciled billing?** n8n doesn't expose real-time token/cost data. Billing accuracy requires:

1. Routing AI calls through LiteLLM (captures actual usage)
2. Post-execution reconciliation via LiteLLM spend logs
3. Flagging unreconciled workflows for manual review

---

### 3. Webhook Payload Contract

**Request to n8n:**

```typescript
interface N8nWebhookRequest {
  // Pass-through from GraphRunRequest
  runId: string;
  ingressRequestId: string;
  messages: Message[];
  model: string;

  // Cogni-specific metadata
  cogni: {
    billingAccountId: string;
    virtualKeyId: string;
    traceId?: string;
    // n8n workflow should forward this to LiteLLM for correlation
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

---

### 4. Catalog Configuration

```typescript
// src/adapters/server/ai/n8n/catalog.ts
export interface N8nWorkflowEntry {
  readonly workflowId: string;
  readonly displayName: string;
  readonly description: string;
  readonly webhookUrl: string;
  readonly responseMode: "sync" | "async";
  readonly requiresLitellmRouting: boolean;
}

export type N8nWorkflowCatalog = Record<string, N8nWorkflowEntry>;

// Static config (env-injected URLs)
export const N8N_WORKFLOW_CATALOG: N8nWorkflowCatalog = {
  // Example entries - actual config via env/settings
};
```

**Configuration sources:**

1. Environment variables: `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`
2. Catalog file or DB for workflow registry
3. Runtime discovery endpoint (P2)

---

### 5. LiteLLM Gateway Routing

**n8n workflow configuration requirement:**

For billing parity, n8n AI nodes must be configured:

```
OpenAI Node → Base URL: ${LITELLM_BASE_URL}
            → API Key: ${LITELLM_API_KEY}
            → Headers: x-cogni-run-id: {{$json.runId}}
                       x-cogni-billing-account: {{$json.cogni.billingAccountId}}
```

**Post-execution reconciliation:**

```typescript
// Query LiteLLM for usage
const spendLogs = await litellm.get("/spend/logs", {
  params: {
    request_tags: JSON.stringify({ runId: request.runId }),
    start_date: executionStartTime,
    end_date: executionEndTime,
  },
});

// Aggregate into UsageFact
const reconciled = spendLogs.reduce(
  (acc, log) => ({
    inputTokens: acc.inputTokens + log.prompt_tokens,
    outputTokens: acc.outputTokens + log.completion_tokens,
    costUsd: acc.costUsd + log.spend,
  }),
  { inputTokens: 0, outputTokens: 0, costUsd: 0 }
);
```

---

### 6. Error Mapping

| n8n Error                       | `AiExecutionErrorCode` |
| ------------------------------- | ---------------------- |
| HTTP 4xx                        | `invalid_request`      |
| HTTP 5xx                        | `internal`             |
| Timeout                         | `timeout`              |
| `error.code: 'WORKFLOW_FAILED'` | `internal`             |
| `error.code: 'TIMEOUT'`         | `timeout`              |

---

## Constraints

### P0 Limitations

1. **No real-time streaming** — n8n webhooks are request/response, not SSE
2. **Billing is reconciled** — not real-time like in-proc adapters
3. **Tool execution in n8n** — tools run inside n8n, not through our ToolRunner (unless custom nodes)

### When to Use n8n Adapter

**Good fit:**

- Complex multi-step workflows with conditional logic
- Integrations with external services (Slack, email, databases)
- Visual workflow design by non-developers
- Scheduled/cron-triggered AI tasks

**Not a good fit:**

- Real-time streaming chat
- Low-latency (<500ms) responses
- Tight billing precision requirements
- Complex multi-turn conversations with state

---

## Non-Goals

1. **Do NOT build n8n workflow editor integration** — use n8n's native UI
2. **Do NOT implement n8n-internal billing** — route through LiteLLM gateway
3. **Do NOT build custom n8n nodes** in P0 — use standard nodes + webhook patterns

---

## Sources

- [n8n Webhook Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
- [n8n Workflow Manager API Template](https://n8n.io/workflows/4166-n8n-workflow-manager-api/)
- [n8n Community: API Workflow Execution](https://community.n8n.io/t/how-to-use-an-api-to-execute-a-workflow/29656)

---

**Last Updated**: 2026-01-29
**Status**: Draft
