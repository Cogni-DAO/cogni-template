# Trigger.dev Adoption Analysis

> **Decision Date:** 2025-01-19
> **Status:** Rejected
> **Author:** Architecture Review
> **Stakeholders:** Platform Engineering, DAO Governance

---

## Executive Summary

**Recommendation: Don't Pivot.**

Trigger.dev solves a different problem than what CogniDAO needs. Its value proposition is simplifying background job infrastructure for teams without one—but Cogni already has Graphile Worker with carefully designed billing idempotency, execution grants, and a graph execution pipeline. Trigger.dev would introduce a new system-of-record that conflicts with our non-negotiable invariants around billing ledger atomicity and run identity. The migration cost and lock-in risk outweigh the marginal UX benefits.

---

## Context

### Current Stack

| Component             | Purpose                                                | Status      |
| --------------------- | ------------------------------------------------------ | ----------- |
| **LangGraph**         | AI graph orchestration (in-proc + server adapters)     | Production  |
| **GraphExecutorPort** | Canonical entrypoint for running graphs                | Production  |
| **Graphile Worker**   | Durable execution for scheduled runs + background jobs | Production  |
| **Scheduling System** | `schedules`, `schedule_runs`, `execution_grants`       | New         |
| **Tool System**       | Tool contracts + allowlists; deny-by-default           | In Progress |
| **LiteLLM Gateway**   | Model routing + usage/cost headers                     | Production  |
| **Langfuse**          | Observability/tracing                                  | Production  |
| **assistant-ui**      | UI streaming for chat/agent runs                       | Production  |

### Decision Question

Should we pivot and adopt Trigger.dev as our MVP node+operator foundation (i.e., the substrate for triggers, scheduling, background execution, and possibly UI/ops)?

---

## Capability Comparison

| Capability                             | Trigger.dev     | We Have         | Net Benefit  | Adoption Cost | Risk         | Notes                                                                |
| -------------------------------------- | --------------- | --------------- | ------------ | ------------- | ------------ | -------------------------------------------------------------------- |
| **Job Dashboard**                      | Yes             | No              | Med          | Med           | Low          | Only gains visibility; doesn't change execution                      |
| **SDK ergonomics (retries, batching)** | Yes             | Partial         | Low          | High          | Med          | Graphile has retries; batching is custom but works                   |
| **Webhook triggers**                   | Partial         | No              | Low          | Med           | Med          | Framework-level handlers, not built-in primitives                    |
| **Cron scheduling**                    | Yes             | Yes             | None         | High          | High         | We have `schedules` + Graphile `add_job()` with `job_key`            |
| **Realtime streaming**                 | Yes             | Yes             | None         | High          | High         | `RunEventRelay` + `assistant-stream` already handles this            |
| **OTel-first tracing**                 | Partial         | Yes (Langfuse)  | None         | Med           | Low          | Langfuse is deeper for LLM; Trigger.dev lacks AI observability       |
| **Multi-env management**               | Yes             | Yes             | None         | Low           | Low          | Already have preview/staging/prod via Docker+OpenTofu                |
| **Run replay**                         | Yes             | No (P1)         | Med          | Med           | Med          | Useful but can build on Graphile; Trigger.dev replay creates new run |
| **Idempotency**                        | Yes (TTL-based) | Yes (permanent) | **Negative** | High          | **Critical** | Trigger.dev's 30-day TTL conflicts with billing invariants           |
| **Integrations ecosystem**             | Yes             | No              | Low          | Low           | Low          | Mostly auth providers; not relevant to DAO/crypto billing            |
| **Long-running + checkpoint**          | Partial (cloud) | No              | Med          | High          | High         | Self-host doesn't have reliable checkpointing                        |
| **Permissions/RBAC**                   | No              | Yes             | **Negative** | -             | -            | We have `ExecutionGrant` with scope-based access                     |
| **Multi-tenancy**                      | Partial         | Yes             | None         | High          | High         | We use `node_id` + billing account isolation                         |
| **Self-host parity**                   | **No**          | N/A             | **Negative** | -             | **Critical** | Docs say self-host is "for evaluation purposes" only                 |

---

## Trigger.dev Value-Add Checklist

| Item                          | Value to Us      | Already Have?                        | Build Otherwise?     | Irrelevant? |
| ----------------------------- | ---------------- | ------------------------------------ | -------------------- | ----------- |
| Built-in dashboard            | Med (visibility) | No                                   | Yes (P1 operator UX) |             |
| Developer SDK ergonomics      | Low              | Yes (Graphile DSL is simple)         |                      |             |
| Webhook triggers + schedules  | Low              | Yes (schedules); No (webhook)        | Yes (Next.js routes) |             |
| Realtime streaming            | None             | Yes (`RunEventRelay`)                |                      | Yes         |
| OTel tracing/export           | None             | Yes (Langfuse + Pino)                |                      | Yes         |
| Multi-environment             | None             | Yes (Docker+OpenTofu)                |                      | Yes         |
| Run replay/idempotency        | Med              | Partial (idempotency yes, replay no) | Yes (P1)             |             |
| Integrations ecosystem        | Low              | No                                   | Not needed for MVP   |             |
| Long-running + checkpoint     | Med              | No                                   | Not needed for MVP   |             |
| Permissions/RBAC/multi-tenant | None             | Yes (`ExecutionGrant`, `node_id`)    |                      | Yes         |

---

## Architecture Options Analysis

### Option 1: Trigger.dev as System-of-Record for Runs

**What we keep:** LangGraph, LiteLLM, Langfuse

**What we delete:** Graphile Worker, `JobQueuePort`, `ScheduleManagerPort`, all scheduling adapters, `schedule_runs` table

**What we must build:**

- Billing ledger bridge (Trigger.dev run → our `charge_receipts`)
- Run ID mapping (Trigger.dev run IDs → our `runId` format)
- Grant validation hooks (Trigger.dev has no auth model)
- Tool policy enforcement outside Trigger.dev

**Impact on invariants:**

- :x: **BILLING_VIA_GRANT**: Broken. Trigger.dev has no billing account concept.
- :x: **IDEMPOTENT_CHARGES**: Broken. TTL-based idempotency expires after 30 days—billing must be permanent.
- :x: **RUN_SCOPED_USAGE**: Partially broken. `runId` becomes external; need stable mapping.
- :x: **GRANT_SCOPES_CONSTRAIN_GRAPHS**: Broken. No equivalent in Trigger.dev.

**Verdict:** Non-starter. Breaks multiple non-negotiable invariants.

---

### Option 2: Trigger.dev as Trigger/Scheduler Facade Only

**What we keep:** GraphExecutorPort, billing pipeline, Graphile Worker for internal jobs

**What we delete:** Our schedule creation API, cron computation

**What we must build:**

- Adapter that receives Trigger.dev task invocation → calls `GraphExecutorPort.runGraph()`
- Grant resolution at the boundary
- Custom idempotency enforcement (Trigger.dev's is insufficient)

**Impact on invariants:**

- :warning: **JOB_KEY_PER_SLOT**: Compromised. Trigger.dev's idempotency key != our `scheduleId:scheduledFor` pattern.
- :warning: **PRODUCER_ENQUEUES_NEXT**: Lost. Trigger.dev owns scheduling; we can't enqueue-next from task.
- :white_check_mark: **BILLING_VIA_GRANT**: Preserved if we resolve grant at adapter boundary.

**What we gain:** Dashboard, SDK sugar

**What we lose:** Control over scheduling internals, queue serialization guarantee

**Verdict:** Marginal benefit, high integration cost. Not recommended.

---

### Option 3: No Trigger.dev (Current Stack) — RECOMMENDED

**What we keep:** Everything

**What we delete:** Nothing

**What we must build:**

- Operator dashboard for run visibility (P1)
- Replay functionality (P1)
- Better dev UX for task authoring (optional)

**Impact on invariants:** All preserved.

**Verdict:** Recommended. Close gaps incrementally.

---

### Option 4: Hybrid (Trigger.dev for External Webhooks Only)

**What we keep:** Graphile Worker for scheduled runs, `GraphExecutorPort`, billing

**What we delete:** Nothing

**What we build:**

- Trigger.dev tasks that simply `POST` to our internal API
- Webhook handlers for GitHub/Stripe/etc that forward to Trigger.dev
- Trigger.dev then calls our `POST /api/internal/graphs/{graphId}:run`

**Impact on invariants:** All preserved (Trigger.dev is just a webhook proxy)

**What we gain:** Trigger.dev's webhook framework handlers

**What we lose:** Added operational complexity for marginal webhook convenience

**Verdict:** Possible but not compelling. We can receive webhooks directly in Next.js API routes.

---

## Risk Register

| #   | Risk                                              | Likelihood | Impact   | Mitigation                                                                                                                                                 |
| --- | ------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Trigger.dev self-host is not production-ready** | High       | Critical | Their docs say "for evaluation purposes." No ARM support, no multi-worker, security concerns.                                                              |
| 2   | **TTL-based idempotency breaks billing**          | High       | Critical | Our billing requires permanent idempotency (`UNIQUE(source_system, source_reference)`). Trigger.dev's 30-day TTL means duplicate charges after TTL expiry. |
| 3   | **Run ID sovereignty lost**                       | Med        | High     | Trigger.dev generates run IDs. Our `runId` is canonical for billing, telemetry, and audit. Mapping introduces complexity and failure modes.                |
| 4   | **No grant/scope enforcement**                    | High       | High     | Trigger.dev has no auth model. We'd need to bolt on grant validation at every boundary—error-prone and defeats the purpose.                                |
| 5   | **Lock-in to Trigger.dev cloud**                  | Med        | Med      | Self-host is second-class. If Trigger.dev pivots pricing or deprecates self-host, we're trapped.                                                           |

---

## Implementation Plan

### Recommended Path: Close Gaps Incrementally (No Trigger.dev)

#### Days 1-30: Close Dashboard Gap

- Build `/app/(app)/admin/runs` page showing `schedule_runs` table
- Add basic filtering (status, schedule, date range)
- Add run detail view with `langfuse_trace_id` link-out
- Wire up `POST /api/internal/graphs/{graphId}:run` for worker execution

#### Days 31-60: Close Replay Gap

- Add `replay` action in dashboard (creates new run with same input)
- Implement P1 run persistence (`graph_runs` table)
- Add attempt semantics (unfreeze `attempt` from 0)

#### Days 61-90: External Triggers

- Build webhook receiver endpoints for GitHub/Stripe
- Implement OAuth connection routing (connection references, no secrets in jobs)
- Add trigger audit log

---

## Kill Criteria (If Pivoting Were Attempted)

Measurable signs within 2-4 weeks that adoption would be failing:

1. **Cannot achieve billing idempotency parity** — If we cannot prevent duplicate charges with Trigger.dev's TTL-based keys, stop immediately.

2. **Self-host instability** — Any production failure (worker crash, lost jobs, data loss) in self-hosted mode → revert.

3. **Grant validation overhead >2x** — If wiring grant validation at Trigger.dev boundaries requires more code than our current adapter layer, value prop is negative.

4. **Run ID mapping failures** — Any case where Trigger.dev run ID cannot be reliably mapped to our `runId` for billing/telemetry.

5. **Cloud-only features required** — If we hit a feature only available in Trigger.dev Cloud (e.g., checkpointing), stop and reassess.

---

## Non-Negotiable Invariants (Reference)

These invariants informed the decision and must not be compromised:

| Invariant                        | Description                             | Trigger.dev Compatible?     |
| -------------------------------- | --------------------------------------- | --------------------------- |
| **Run identity canonical**       | `runId` must be stable across systems   | No (generates own IDs)      |
| **Billing ledger single writer** | Usage facts are idempotent, permanent   | No (TTL-based idempotency)  |
| **No raw secrets in configs**    | Only opaque connection/grant references | Yes (not relevant)          |
| **Deny-by-default tool access**  | Enforced at invocation                  | No (no tool model)          |
| **EDO chain auditability**       | Decisions/outcomes preserved            | Partial (no native support) |

---

## Conclusion

Trigger.dev is a well-designed product for teams that:

- Don't have existing job infrastructure
- Want a turnkey cloud solution
- Don't have strict billing/accounting invariants
- Don't need custom auth/scoping per run

CogniDAO is **none of these**. We have:

- Graphile Worker with carefully designed idempotency
- Billing invariants that require permanent (not TTL) idempotency
- ExecutionGrant-based auth that Trigger.dev cannot replicate
- A graph execution pipeline that is our competitive moat

The dashboard and SDK ergonomics are nice-to-have, but:

1. Dashboard is a P1 build anyway
2. SDK ergonomics don't justify re-architecting billing
3. Self-host mode is explicitly not production-ready

**Final Decision: Stay the course.** Close gaps incrementally. Our current architecture is purpose-built for crypto-first billing and DAO sovereignty. Trigger.dev would require compromising on invariants that matter.

---

## References

- [Trigger.dev Introduction](https://trigger.dev/docs/introduction)
- [Trigger.dev Self-Hosting](https://trigger.dev/docs/open-source-self-hosting)
- [Trigger.dev Triggering](https://trigger.dev/docs/triggering)
- [Trigger.dev Realtime](https://trigger.dev/docs/realtime)
- [Trigger.dev Idempotency](https://trigger.dev/docs/idempotency)
- [Trigger.dev Scheduled Tasks](https://trigger.dev/docs/tasks/scheduled)
- [Trigger.dev Webhook Guides](https://trigger.dev/docs/guides/frameworks/webhooks-guides-overview)

### Internal Documents

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)
- [SCHEDULER_SPEC.md](../SCHEDULER_SPEC.md)
- [NODE_FORMATION_SPEC.md](../NODE_FORMATION_SPEC.md)
- [TOOL_USE_SPEC.md](../TOOL_USE_SPEC.md)
