---
work_item_id: ini.n8n-integration
work_item_type: initiative
title: n8n Workflow Execution Adapter
state: Paused
priority: 2
estimate: 4
summary: Integrate n8n workflow execution into Cogni via webhook adapter with LiteLLM billing reconciliation
outcome: n8n workflows callable through GraphExecutorPort with unified auth, billing, and observability
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs, billing]
---

# n8n Workflow Execution Adapter

> Source: docs/N8N_ADAPTER_SPEC.md — Spec: [n8n-adapter.md](../../docs/spec/n8n-adapter.md)

## Goal

When a developer chooses to implement their agent/workflow in n8n, this adapter standardizes it into Cogni's auth + billing pipeline. Developer's choice of environment, Cogni's unified metering. The adapter triggers n8n workflows via webhook/REST API and streams results back through `GraphExecutorPort`.

## Roadmap

### Crawl (P0) — Webhook Execution MVP

**Goal:** Sync webhook invocation with billing correlation setup.

| Deliverable                                                                                    | Status      | Est | Work Item |
| ---------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `N8nWorkflowExecutor` implementing `GraphExecutorPort` in `src/adapters/server/ai/n8n/` | Not Started | 2   | —         |
| Implement webhook trigger: POST to n8n production URL with `GraphRunRequest` payload           | Not Started | 1   | —         |
| Include `user: ${runId}/${attempt}` in payload for n8n to forward to LiteLLM                   | Not Started | 1   | —         |
| Support sync response mode (wait for completion)                                               | Not Started | 1   | —         |
| Map n8n webhook response to `GraphFinal`                                                       | Not Started | 1   | —         |
| Emit synthetic `UsageReportEvent` as UX hint (not authoritative)                               | Not Started | 1   | —         |
| Trigger reconciliation after stream completes (invariant 44)                                   | Not Started | 1   | —         |
| Observability instrumentation                                                                  | Not Started | 1   | —         |
| Documentation updates                                                                          | Not Started | 1   | —         |

### Walk (P1) — LiteLLM Gateway Reconciliation

**Goal:** Full billing reconciliation via LiteLLM spend logs.

| Deliverable                                                                | Status      | Est | Work Item            |
| -------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Document n8n workflow configuration: set `user` param when calling LiteLLM | Not Started | 1   | (create at P1 start) |
| Reuse `reconcileRun()` from `external-reconciler.ts`                       | Not Started | 1   | (create at P1 start) |
| Query `/spend/logs?end_user=${runId}/${attempt}`                           | Not Started | 1   | (create at P1 start) |
| `commitUsageFact()` per spend log entry with `usageUnitId = request_id`    | Not Started | 1   | (create at P1 start) |

### Run (P2+) — Streaming Support

**Goal:** Real-time streaming from n8n workflows. Do NOT build preemptively — webhook polling is MVP-sufficient.

| Deliverable                                                | Status      | Est | Work Item            |
| ---------------------------------------------------------- | ----------- | --- | -------------------- |
| Evaluate n8n SSE/WebSocket support for real-time streaming | Not Started | 1   | (create at P2 start) |
| If supported: implement streaming webhook consumer         | Not Started | 2   | (create at P2 start) |

## Constraints

- **No real-time streaming in P0** — n8n webhooks are request/response, not SSE
- **Billing is reconciled** — per invariant 45, stream events are UX hints only
- **Tool execution in n8n** — tools run inside n8n, not through our ToolRunner
- **Workflow must forward `user`** — billing correlation requires proper n8n configuration

## Dependencies

- [ ] n8n instance with webhook-enabled workflows
- [ ] LiteLLM gateway configured for n8n routing
- [ ] `external-reconciler.ts` billing reconciliation infrastructure (P1)

## As-Built Specs

- [n8n-adapter.md](../../docs/spec/n8n-adapter.md) — webhook invocation, payload contract, billing schema, error mapping (draft)

## Design Notes

Content extracted from `docs/N8N_ADAPTER_SPEC.md` during docs migration. All design content (invariants, schemas, flow diagrams, TypeScript interfaces) preserved in the spec. Implementation checklists routed here.
