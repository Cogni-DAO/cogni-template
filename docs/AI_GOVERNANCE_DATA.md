# AI Governance Data Design

> [!CRITICAL]
> Governance agents receive **bounded, cited briefs** — NOT raw data streams. SignalEvents flow through idempotent ingest; GovernanceBriefs are generated with strict budget caps and citation requirements. Every claim traces to source signals.

## Core Invariants

### Signal Ingestion

1. **CLOUDEVENTS_ENVELOPE**: All signals use CloudEvents 1.0 schema. Required fields: `id`, `source`, `type`, `specversion`, `time`, `data`. Non-conforming events rejected at ingest.

2. **IDEMPOTENT_INGEST**: `SignalEvent.id` is globally unique. Re-ingesting same ID = no-op. Ingest returns `{accepted, deduplicated, rejected}` counts.

3. **PROVENANCE_REQUIRED**: Every signal includes `producer`, `producerVersion`, `retrievedAt`. `authRef` is opaque (adapter-owned credential reference). Missing provenance = rejected.

4. **SOURCE_ADAPTER_PATTERN**: One adapter per system-of-record. Adapters define streams with cursor semantics. `collect()` is replay-safe (same cursor = same or superset events).

### Brief Generation

5. **BUDGET_ENFORCED**: GovernanceBrief generation enforces `maxItemsTotal` and per-domain caps. Over-budget items dropped with reason logged.

6. **DIFF_FIRST**: Briefs include `deltaFromBriefId` referencing previous brief. Items have stable IDs for change detection. Agents see what's new, not everything.

7. **CITATIONS_REQUIRED**: Every BriefItem cites one or more `SignalEvent.id`s. Claims without citations = generation bug.

8. **ACCOUNTABILITY**: Brief includes `dropped: { reason: count }` map. Agents know what was excluded and why.

### Metrics Access

9. **GOVERNED_METRICS**: MetricsQueryPort enforces per-metric policy: `maxLookbackDays`, `maxResultRows`, `allowedDimensions`. No unbounded queries.

10. **QUERY_PROVENANCE**: Metric query responses include `queryRef`, `executedAt`, `cached`. Audit trail for reproducibility.

### Agent Execution

11. **INCIDENT_GATES_AGENT**: LLM governance agent runs ONLY on `incident_open`, `severity_change`, or `incident_close`. Deterministic detector runs on timer; agent is gated.

12. **EDO_ONLY_ON_DECISION**: Event-Decision-Outcome records written ONLY when agent recommends action or requests approval. Silence is success.

13. **HUMAN_REVIEW_REQUIRED_MVP**: All proposed actions go to human review queue. No auto-execute in MVP.

14. **SYSTEM_TENANT_EXECUTION**: Governance runs execute as `cogni_system` tenant through `GraphExecutorPort`. Per SYSTEM_TENANT_DESIGN.md.

15. **WORK_ITEM_VIA_MCP**: Agents create/update work items in Plane exclusively through MCP tools. Provider-portable.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL SYSTEMS (Systems of Record)                                     │
│ - GitHub (PRs, issues, actions)                                          │
│ - Prometheus/Mimir (metrics)                                             │
│ - Loki (log aggregates, NOT raw logs)                                    │
│ - LiteLLM (spend data)                                                   │
│ - Plane (work items)                                                     │
│ - Slack (messages in governance channels)                                │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SOURCE ADAPTERS (packages/data-sources/<source>/)                        │
│ ─────────────────────────────────────────────────                        │
│ - One adapter per system-of-record                                       │
│ - Multiple streams per adapter (e.g., github: prs, issues, actions)      │
│ - Cursor-based collection (time watermark OR provider token)             │
│ - Transforms raw data → CloudEvents SignalEvent                          │
│ - collect() is replay-safe: same cursor → same/superset events           │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SIGNAL INGEST (SignalIngestPort)                                         │
│ ───────────────────────────────                                          │
│ - Validates CloudEvents envelope                                         │
│ - Idempotent write to signal_events table                                │
│ - Returns {accepted, deduplicated, rejected} counts                      │
│ - Indexes: source, type, time, domain, severity                          │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BRIEF GENERATION (GovernanceBriefPort)                                   │
│ ─────────────────────────────────────                                    │
│ - Queries SignalEvents by window + domains                               │
│ - Optionally queries MetricsQueryPort for KPI deltas                     │
│ - Applies budget caps (total + per-domain)                               │
│ - Computes diff from previous brief                                      │
│ - Outputs GovernanceBrief with citations + dropped counts                │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ GOVERNANCE AGENT                                                         │
│ ─────────────────                                                        │
│ - Triggered by incident lifecycle event (NOT timer)                      │
│ - Receives: GovernanceBrief (bounded, cited)                             │
│ - Can drill down via MetricsQueryPort (governed)                         │
│ - Outputs: IncidentBrief + RecommendedAction                             │
│ - Writes EDO only if action recommended                                  │
│ - Posts to human review queue (Plane via MCP)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Metrics Layer (Orthogonal)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SEMANTIC LAYER (Cube Core or equivalent)                                 │
│ ─────────────────────────────────────────                                │
│ - Pre-defined metrics with business logic                                │
│ - Consistent calculations across consumers                               │
│ - Access control per metric                                              │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ METRICS QUERY PORT                                                       │
│ ──────────────────                                                       │
│ - listMetrics(): available metrics for caller                            │
│ - describeMetric(id): dimensions, granularity, policy                    │
│ - query(q): governed execution with caps                                 │
│ - Optional: emit metrics.query.executed SignalEvent for audit            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Relationship:** MetricsQueryPort is orthogonal to signal flow. Brief generation MAY query metrics for KPI deltas. Governance agent MAY query metrics for drill-down. All governed, all auditable.

---

## Schema

### signal_events

CloudEvents-compliant signal storage.

| Column             | Type        | Constraints       | Notes                                            |
| ------------------ | ----------- | ----------------- | ------------------------------------------------ |
| `id`               | text        | PK                | CloudEvents `id` (globally unique)               |
| `source`           | text        | NOT NULL, indexed | CloudEvents `source`                             |
| `type`             | text        | NOT NULL, indexed | CloudEvents `type` (e.g., `dev.cogni.pr.merged`) |
| `specversion`      | text        | NOT NULL          | `1.0`                                            |
| `time`             | timestamptz | NOT NULL, indexed | CloudEvents `time`                               |
| `data`             | jsonb       | NOT NULL          | Event payload                                    |
| `datacontenttype`  | text        | NOT NULL          | `application/json`                               |
| `domain`           | text        | indexed           | `engineering`, `product`, `finance`              |
| `severity`         | text        | indexed           | `info`, `warning`, `critical`                    |
| `producer`         | text        | NOT NULL          | Adapter name + stream                            |
| `producer_version` | text        | NOT NULL          | Adapter version                                  |
| `retrieved_at`     | timestamptz | NOT NULL          | When adapter fetched from source                 |
| `auth_ref`         | text        | NULL              | Opaque credential reference                      |
| `created_at`       | timestamptz | NOT NULL          | Ingest timestamp                                 |

**Indexes:** `idx_signals_source_type`, `idx_signals_time`, `idx_signals_domain_severity`
**Retention:** 90 days hot, then archive.

### governance_briefs

Generated briefs with budget enforcement.

| Column                | Type        | Constraints                | Notes                        |
| --------------------- | ----------- | -------------------------- | ---------------------------- |
| `id`                  | uuid        | PK                         |                              |
| `window_start`        | timestamptz | NOT NULL                   | Brief coverage start         |
| `window_end`          | timestamptz | NOT NULL                   | Brief coverage end           |
| `domains`             | text[]      | NOT NULL                   | Domains included             |
| `delta_from_brief_id` | uuid        | FK governance_briefs, NULL | Previous brief for diff      |
| `budget_config`       | jsonb       | NOT NULL                   | `{maxItemsTotal, perDomain}` |
| `items`               | jsonb       | NOT NULL                   | Array of BriefItem           |
| `dropped`             | jsonb       | NOT NULL                   | `{reason: count}` map        |
| `metrics_snapshot`    | jsonb       | NULL                       | KPI values at generation     |
| `generated_at`        | timestamptz | NOT NULL                   |                              |
| `created_at`          | timestamptz | NOT NULL                   |                              |

**Indexes:** `idx_briefs_window`, `idx_briefs_domains`

### incidents

Tracks incident lifecycle for governance gating.

| Column                | Type        | Constraints      | Notes                             |
| --------------------- | ----------- | ---------------- | --------------------------------- |
| `id`                  | uuid        | PK               |                                   |
| `incident_key`        | text        | UNIQUE, NOT NULL | `{scope}:{signal}:{window_start}` |
| `scope`               | text        | NOT NULL         |                                   |
| `signal`              | text        | NOT NULL         | `error_rate_high`, `p95_breach`   |
| `severity`            | text        | NOT NULL         | `warning`, `critical`             |
| `status`              | text        | NOT NULL         | `open`, `resolved`                |
| `opened_at`           | timestamptz | NOT NULL         |                                   |
| `resolved_at`         | timestamptz | NULL             |                                   |
| `last_brief_at`       | timestamptz | NULL             | For cooldown enforcement          |
| `evidence_signal_ids` | text[]      | NOT NULL         | SignalEvent IDs that triggered    |
| `created_at`          | timestamptz | NOT NULL         |                                   |
| `updated_at`          | timestamptz | NOT NULL         |                                   |

**Indexes:** `idx_incidents_key`, `idx_incidents_scope_status`

### governance_edos

Event-Decision-Outcome records with full provenance.

| Column               | Type        | Constraints                    | Notes                                   |
| -------------------- | ----------- | ------------------------------ | --------------------------------------- |
| `id`                 | uuid        | PK                             |                                         |
| `incident_id`        | uuid        | FK incidents, NOT NULL         |                                         |
| `brief_id`           | uuid        | FK governance_briefs, NOT NULL | Brief agent received                    |
| `event_type`         | text        | NOT NULL                       | `incident_open`, `severity_change`, etc |
| `event_summary`      | text        | NOT NULL                       |                                         |
| `decision_type`      | text        | NOT NULL                       | `notify`, `recommend_action`, etc       |
| `decision_rationale` | text        | NOT NULL                       |                                         |
| `cited_signals`      | text[]      | NOT NULL                       | SignalEvent IDs supporting decision     |
| `recommended_action` | jsonb       | NULL                           |                                         |
| `work_item_id`       | text        | NULL                           | Plane issue ID                          |
| `expected_outcome`   | jsonb       | NULL                           |                                         |
| `actual_outcome`     | jsonb       | NULL                           | Backfilled on close                     |
| `langfuse_trace_id`  | text        | NULL                           |                                         |
| `created_at`         | timestamptz | NOT NULL                       |                                         |

**Key additions:** `brief_id` and `cited_signals` for full provenance chain.

### guardrail_thresholds

Configurable thresholds for incident detection.

| Column               | Type        | Constraints            | Notes              |
| -------------------- | ----------- | ---------------------- | ------------------ |
| `id`                 | uuid        | PK                     |                    |
| `scope`              | text        | NOT NULL               | `*` for global     |
| `signal`             | text        | NOT NULL               | `error_rate`, etc. |
| `warning_threshold`  | numeric     | NOT NULL               |                    |
| `critical_threshold` | numeric     | NOT NULL               |                    |
| `enabled`            | boolean     | NOT NULL, default true |                    |
| `created_at`         | timestamptz | NOT NULL               |                    |
| `updated_at`         | timestamptz | NOT NULL               |                    |

**Unique:** `(scope, signal)`

---

## Ports

### SignalIngestPort

```typescript
// src/ports/governance/signal-ingest.port.ts

export interface SignalEvent {
  // CloudEvents required
  id: string;
  source: string;
  type: string;
  specversion: "1.0";
  time: Date;
  data: Record<string, unknown>;
  datacontenttype: "application/json";

  // Governance extensions
  domain: "engineering" | "product" | "finance" | "operations";
  severity: "info" | "warning" | "critical";

  // Provenance (required)
  producer: string;
  producerVersion: string;
  retrievedAt: Date;
  authRef?: string;
}

export interface IngestResult {
  accepted: number;
  deduplicated: number;
  rejected: number;
  errors: Array<{ id: string; reason: string }>;
}

export interface SignalIngestPort {
  ingest(events: SignalEvent[]): Promise<IngestResult>;
  query(params: {
    domains?: string[];
    types?: string[];
    severities?: string[];
    after: Date;
    before: Date;
    limit: number;
  }): Promise<SignalEvent[]>;
}
```

### SourceAdapter (Interface)

```typescript
// packages/data-sources/types.ts

export interface SourceAdapter {
  readonly source: string;
  streams(): StreamDefinition[];
  collect(
    streamId: string,
    cursor: StreamCursor | null
  ): Promise<{ events: SignalEvent[]; nextCursor: StreamCursor }>;
  handleWebhook?(payload: unknown): Promise<SignalEvent[]>;
}

export interface StreamDefinition {
  id: string;
  name: string;
  cursorType: "timestamp" | "token";
  defaultPollInterval: number;
}

export interface StreamCursor {
  streamId: string;
  value: string;
  retrievedAt: Date;
}
```

### GovernanceBriefPort

```typescript
// src/ports/governance/brief.port.ts

export interface BriefItem {
  id: string;
  domain: string;
  severity: "info" | "warning" | "critical";
  summary: string;
  details: Record<string, unknown>;
  citedSignals: string[]; // REQUIRED
  isNew: boolean;
}

export interface BriefBudget {
  maxItemsTotal: number;
  perDomain: Record<string, number>;
}

export interface GovernanceBrief {
  id: string;
  windowStart: Date;
  windowEnd: Date;
  domains: string[];
  deltaFromBriefId: string | null;
  items: BriefItem[];
  dropped: Record<string, number>;
  metricsSnapshot: Record<string, unknown> | null;
  generatedAt: Date;
}

export interface GovernanceBriefPort {
  generate(params: {
    windowStart: Date;
    windowEnd: Date;
    domains: string[];
    budget: BriefBudget;
    deltaFromBriefId?: string;
    includeMetrics?: string[];
  }): Promise<GovernanceBrief>;
  get(briefId: string): Promise<GovernanceBrief | null>;
  list(params: {
    domains?: string[];
    after?: Date;
    limit: number;
  }): Promise<GovernanceBrief[]>;
}
```

### MetricsQueryPort

```typescript
// src/ports/governance/metrics-query.port.ts

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  unit: string;
  dimensions: string[];
  granularities: ("hour" | "day" | "week" | "month")[];
  maxLookbackDays: number;
  maxResultRows: number;
  allowedDimensions: string[];
}

export interface MetricQuery {
  metricId: string;
  dimensions?: Record<string, string>;
  granularity: "hour" | "day" | "week" | "month";
  from: Date;
  to: Date;
}

export interface MetricQueryResult {
  queryRef: string;
  executedAt: Date;
  cached: boolean;
  data: Array<{
    timestamp: Date;
    value: number;
    dimensions: Record<string, string>;
  }>;
}

export interface MetricsQueryPort {
  listMetrics(): Promise<MetricDefinition[]>;
  describeMetric(metricId: string): Promise<MetricDefinition | null>;
  query(q: MetricQuery): Promise<MetricQueryResult>;
}
```

### IncidentStorePort

```typescript
// src/ports/governance/incident-store.port.ts

export interface Incident {
  id: string;
  incidentKey: string;
  scope: string;
  signal: string;
  severity: "warning" | "critical";
  status: "open" | "resolved";
  openedAt: Date;
  resolvedAt: Date | null;
  lastBriefAt: Date | null;
  evidenceSignalIds: string[];
}

export type IncidentLifecycleEvent =
  | { type: "incident_open"; incident: Incident }
  | { type: "severity_change"; incident: Incident; previousSeverity: string }
  | { type: "incident_close"; incident: Incident };

export interface IncidentStorePort {
  openOrUpdate(
    incidentKey: string,
    severity: "warning" | "critical",
    evidenceSignalIds: string[]
  ): Promise<IncidentLifecycleEvent | null>;
  close(
    incidentKey: string,
    evidenceSignalIds: string[]
  ): Promise<IncidentLifecycleEvent | null>;
  getOpenByScope(scope: string): Promise<Incident[]>;
  getRecent(scope: string, limit: number): Promise<Incident[]>;
  shouldRunAgent(incidentId: string, cooldownMinutes: number): Promise<boolean>;
  markBriefed(incidentId: string): Promise<void>;
}
```

### GovernanceEdoPort

```typescript
// src/ports/governance/edo-store.port.ts

export interface EdoRecord {
  id: string;
  incidentId: string;
  briefId: string;
  eventType: "incident_open" | "severity_change" | "incident_close";
  eventSummary: string;
  decisionType: "notify" | "recommend_action" | "request_approval";
  decisionRationale: string;
  citedSignals: string[];
  recommendedAction: Record<string, unknown> | null;
  workItemId: string | null;
  expectedOutcome: {
    metricTargets: Array<{ name: string; target: string; horizon: string }>;
  } | null;
  actualOutcome: Record<string, unknown> | null;
  langfuseTraceId: string | null;
}

export interface GovernanceEdoPort {
  append(edo: Omit<EdoRecord, "id">): Promise<EdoRecord>;
  getByIncident(incidentId: string): Promise<EdoRecord[]>;
  getRecent(limit: number): Promise<EdoRecord[]>;
  backfillOutcome(
    edoId: string,
    outcome: Record<string, unknown>
  ): Promise<void>;
}
```

### WorkItemPort

```typescript
// src/ports/governance/work-item.port.ts

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "pending_review" | "approved" | "rejected" | "completed";
  labels: string[];
  externalId: string | null;
}

export interface WorkItemPort {
  create(
    item: Omit<WorkItem, "id" | "status" | "externalId">
  ): Promise<WorkItem>;
  updateStatus(id: string, status: WorkItem["status"]): Promise<void>;
  getByExternalId(externalId: string): Promise<WorkItem | null>;
}
```

---

## Implementation Checklist

### P0: Signal Infrastructure Foundation

**Schema & Migrations:**

- [ ] Create `signal_events` table with CloudEvents schema
- [ ] Create `governance_briefs` table
- [ ] Create `incidents` table with `evidence_signal_ids`
- [ ] Create `governance_edos` table with `brief_id`, `cited_signals`
- [ ] Create `guardrail_thresholds` table with defaults

**SignalIngestPort:**

- [ ] Create port interface
- [ ] Implement `DrizzleSignalIngestAdapter`
- [ ] Idempotent upsert on `id`
- [ ] CloudEvents envelope validation
- [ ] Provenance validation (reject if missing)

**First SourceAdapter:**

- [ ] Create `packages/data-sources/` structure
- [ ] Implement `PrometheusAdapter` with `alerts` stream
- [ ] Integration test: collect → ingest → query

#### Chores

- [ ] Add `governance.*` events to EVENT_NAMES
- [ ] Document SourceAdapter pattern in `packages/data-sources/README.md`

### P1: Brief Generation + Metrics Layer

**GovernanceBriefPort:**

- [ ] Create port interface
- [ ] Implement brief generation with budget enforcement
- [ ] Diff computation from previous brief
- [ ] Citation requirement enforcement
- [ ] Dropped reason accounting

**MetricsQueryPort:**

- [ ] Create port interface
- [ ] Define MVP metrics (error_rate, p95, llm_cost, queue_depth)
- [ ] Per-metric access policy enforcement
- [ ] Query provenance in response

**Additional SourceAdapters:**

- [ ] `GitHubAdapter` (prs, issues, actions streams)
- [ ] `LiteLLMAdapter` (spend stream)
- [ ] `LokiAdapter` (error fingerprints only)

### P2: Incident-Gated Agent Execution

**Deterministic Detector:**

- [ ] Create `GuardrailDetectorService` (threshold checks)
- [ ] Wire to job queue task (runs every 1-5m)
- [ ] On incident lifecycle event → queue agent run

**Governance Agent Task:**

- [ ] Check cooldown before running
- [ ] Generate GovernanceBrief for context
- [ ] Execute graph via `GraphExecutorPort` (system tenant)
- [ ] Write EDO with `brief_id` + `cited_signals`
- [ ] Post to human review queue (Plane via MCP)

### P3: Future (Do NOT Build Preemptively)

- [ ] Approval-to-execute pipeline
- [ ] KPI governance loop (weekly)
- [ ] Baseline deviation detection

---

## File Pointers (P0 Scope)

| File                                                              | Change                       |
| ----------------------------------------------------------------- | ---------------------------- |
| `src/shared/db/schema.governance.ts`                              | New: all governance tables   |
| `src/ports/governance/signal-ingest.port.ts`                      | New                          |
| `src/ports/governance/brief.port.ts`                              | New                          |
| `src/ports/governance/metrics-query.port.ts`                      | New                          |
| `src/ports/governance/incident-store.port.ts`                     | New                          |
| `src/ports/governance/edo-store.port.ts`                          | New                          |
| `src/adapters/server/governance/drizzle-signal-ingest.adapter.ts` | New                          |
| `packages/data-sources/types.ts`                                  | New: SourceAdapter interface |
| `packages/data-sources/prometheus/adapter.ts`                     | New: first adapter           |
| `packages/data-sources/README.md`                                 | New: adapter dev guide       |

---

## Design Decisions

### 1. Why CloudEvents Envelope?

| Approach        | Pros                     | Cons               | Verdict |
| --------------- | ------------------------ | ------------------ | ------- |
| Custom schema   | Tailored                 | Yet another schema | Reject  |
| CloudEvents 1.0 | Standard, tooling exists | Slight overhead    | **Use** |
| Raw formats     | No transform             | Inconsistent       | Reject  |

### 2. Why Budget Enforcement on Briefs?

Without budgets: context explosion, unbounded token costs, degraded agent quality.

**Rule:** `maxItemsTotal` + per-domain caps strictly enforced. `dropped` map tells agent what was excluded.

### 3. Why Citations Required?

Without citations: can't trace decisions, can't audit, can't learn from mistakes.

**Rule:** Every BriefItem cites SignalEvent IDs. Every EDO cites supporting signals.

### 4. Why Diff-First Briefs?

Agents need: what changed? what's new? what escalated? Not everything.

**Rule:** Briefs include `deltaFromBriefId`. Items marked `isNew`.

### 5. Why Governed Metrics?

| Approach       | Pros                | Cons            | Verdict |
| -------------- | ------------------- | --------------- | ------- |
| Raw queries    | Flexible            | Unbounded       | Reject  |
| Semantic layer | Governed, auditable | Extra component | **Use** |

### 6. Why One Adapter per System?

| Approach     | Pros                   | Cons                  | Verdict |
| ------------ | ---------------------- | --------------------- | ------- |
| Per-endpoint | Granular               | Explosion of adapters | Reject  |
| Per-system   | Coherent auth, cursors | More complex          | **Use** |

### 7. Why Incident-Gated?

| Approach       | Pros            | Cons         | Verdict |
| -------------- | --------------- | ------------ | ------- |
| Fixed 15m runs | Simple          | Noise, cost  | Reject  |
| Incident-gated | Bounded, signal | More complex | **Use** |

---

## Anti-Patterns

| Anti-Pattern                  | Why Forbidden                     |
| ----------------------------- | --------------------------------- |
| Raw logs in context           | Context explosion                 |
| Unbounded signal queries      | Use budget-enforced briefs        |
| Claims without citations      | Unauditable                       |
| Per-endpoint adapters         | Use per-system                    |
| Direct metric queries         | No governance                     |
| Agent on fixed timer          | Use incident-gated                |
| EDO without brief reference   | Can't reproduce context           |
| Missing provenance            | Reject at ingest                  |
| Briefs without dropped counts | Agent doesn't know what's missing |

---

## Related Documents

- [SYSTEM_TENANT_DESIGN.md](SYSTEM_TENANT_DESIGN.md) — System tenant foundation
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — Job queue patterns
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort
- [OBSERVABILITY.md](OBSERVABILITY.md) — Prometheus, Loki
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — MCP tool contracts

---

**Last Updated**: 2026-01-20
**Status**: Draft — Pending Architecture Review
