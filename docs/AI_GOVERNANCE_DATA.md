# AI Governance Data Design

> [!CRITICAL]
> Governance agents receive **bounded, cited briefs** — NOT raw data streams. SignalEvents flow through idempotent ingest; GovernanceBriefs are generated with strict budget caps and citation requirements. Every claim traces to source signals.

## MVP Stack

| Layer                   | Tool                                         | Notes                                      |
| ----------------------- | -------------------------------------------- | ------------------------------------------ |
| Orchestrator            | Temporal OSS                                 | Schedules + Workflows + Activities         |
| Metrics                 | Prometheus/Mimir + existing MetricsQueryPort | Governed template queries (no Cube in MVP) |
| Log Aggregates          | Grafana Loki                                 | Fingerprints only, not raw logs            |
| Work Items              | Plane + MCP Server                           | Human review queue                         |
| Storage                 | Postgres                                     | Primary data store                         |
| Semantic Retrieval (P1) | pgvector extension                           | Embeddings over briefs/EDOs for recall     |

---

## Core Invariants

### Orchestration (Temporal)

> See [TEMPORAL_PATTERNS.md](TEMPORAL_PATTERNS.md) for canonical Temporal patterns, anti-patterns, and code examples.

1. **TEMPORAL_DETERMINISM**: No I/O in Workflow code. All external calls run in Activities. (See TEMPORAL_PATTERNS.md)

2. **TEMPORAL_SCHEDULES_DEFAULT**: Use Temporal Schedules for recurring collection and detection. (See TEMPORAL_PATTERNS.md)

3. **ACTIVITY_IDEMPOTENCY**: All Activities must be idempotent. (See TEMPORAL_PATTERNS.md)

### Trigger Model

4. **TRIGGERS_ARE_SIGNALS**: All external triggers (webhooks, human updates, CI events) MUST normalize to CloudEvents SignalEvents via SignalWritePort. No trigger directly runs an agent. Triggers → Signals → Router → Incidents → Agent.

5. **DUAL_PATH_ROUTING**: IncidentRouterWorkflow can be started by (a) Temporal Schedule (backstop, every 1-5m) OR (b) webhook fast-path (immediate after ingest). Same workflow, two initiation modes.

6. **TRIGGER_PRIORITY_POLICY**: Immediate path ONLY for alert lifecycle signals (`prometheus.alert.firing`, `prometheus.alert.resolved`). All other signals use scheduled sweep. No arbitrary (source, type) → immediate mappings.

7. **ROUTER_IDEMPOTENCY**: IncidentRouterWorkflow uses stable workflowId = `router:${scope}:${timeBucket}`. Concurrent starts dedupe via Temporal. Router processes signals since last cursor.

### Signal Ingestion

8. **CLOUDEVENTS_1_0_PLUS_GOVERNANCE**: All signals use CloudEvents 1.0 envelope. Required: `id`, `source`, `type`, `specversion`. Governance extensions require: `time`, `data`, `domain`, `severity`, plus provenance fields. Non-conforming events rejected at ingest.

9. **IDEMPOTENT_INGEST**: `SignalEvent.id` is globally unique. Re-ingesting same ID = no-op. Ingest returns `{accepted, deduplicated, rejected}` counts.

10. **PROVENANCE_REQUIRED**: Every signal includes `producer`, `producerVersion`, `retrievedAt`. `authRef` is opaque (adapter-owned credential reference). Missing provenance = rejected.

11. **SOURCE_ADAPTER_PATTERN**: One adapter per system-of-record. Adapters define streams with cursor semantics. `collect()` is replay-safe (same cursor = same or superset events). Activities call adapters; adapters never call Activities.

12. **WEBHOOK_IDEMPOTENCY**: Webhook-derived SignalEvent.id = `{source}:{delivery_id}:{entity_id}` when delivery_id exists. If no delivery_id: `{source}:{entity_id}:{hash(canonical_payload)}`.

### Brief Generation

13. **BUDGET_ENFORCED**: GovernanceBrief generation enforces `maxItemsTotal` and per-domain caps. Over-budget items dropped with reason logged.

14. **DIFF_FIRST**: Briefs include `deltaFromBriefId` referencing previous brief. Items have stable IDs for change detection. Agents see what's new, not everything.

15. **CITATIONS_REQUIRED**: Every BriefItem cites one or more `SignalEvent.id`s. Claims without citations = generation bug.

16. **ACCOUNTABILITY**: Brief includes `dropped: { reason: count }` map. Agents know what was excluded and why.

### Metrics Access

17. **GOVERNED_METRICS**: MetricsQueryPort enforces per-metric policy: `maxLookbackDays`, `maxResultRows`, `allowedDimensions`. No unbounded queries.

18. **QUERY_PROVENANCE**: Metric query responses include `queryRef`, `executedAt`, `cached`. Audit trail for reproducibility.

19. **TOOLS_TEMPLATE_ONLY**: Governance tools (`core__metrics_query`) may ONLY use `queryTemplate`. Raw methods (`queryRange`, `queryInstant`) are adapter/internal only. Runtime guard: throw `METRICS_RAW_QUERY_FORBIDDEN` if governance context attempts raw query.

20. **QUERY_TEMPLATE_REQUIRED**: `queryTemplate` is mandatory on MetricsQueryPort (not optional). All adapters must implement it. Build fails if missing.

### Event Time Semantics

21. **TIME_IS_TRUTH**: CloudEvents `time` (event time) is semantic truth for diff/brief windows. `retrievedAt` and `created_at` are operational metadata only.

22. **SKEW_REJECTION**: Events with `time > now + 5m` are rejected at ingest (future timestamps invalid). Late arrivals (`retrievedAt > time + 24h`) are logged but processed normally.

23. **BRIEF_WINDOWS_USE_EVENT_TIME**: Brief generation queries `time BETWEEN windowStart AND windowEnd`, not `created_at` or `retrievedAt`.

### Agent Execution

24. **INCIDENT_GATES_AGENT**: LLM governance agent runs ONLY on `incident_open`, `severity_change`, or `incident_close`. Deterministic router workflow runs on Schedule + fast-path; agent workflow is triggered by incident lifecycle events only.

25. **EDO_ONLY_ON_DECISION**: Event-Decision-Outcome records written ONLY when agent recommends action or requests approval. Silence is success.

26. **HUMAN_REVIEW_REQUIRED_MVP**: All proposed actions go to human review queue (Plane via MCP). No auto-execute in MVP.

27. **SYSTEM_TENANT_EXECUTION**: Governance runs execute as `cogni_system` tenant through `GraphExecutorPort`. Per SYSTEM_TENANT_DESIGN.md.

28. **COOLDOWN_PER_INCIDENT**: Enforce cooldown (e.g., 15m) per `incident_key` to prevent repeated agent runs on flappy signals.

---

## Architecture

### Trigger Flow (MVP)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIGGER SOURCES                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ WEBHOOKS (Push)              │ ADAPTERS (Poll)                           │
│ - GitHub Actions webhooks    │ - Prometheus alerts (every 5m)            │
│ - GitLab CI webhooks         │ - LiteLLM spend (every 5m)                │
│ - Plane work item updates    │ - Loki error fingerprints (every 5m)     │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SIGNAL INGEST (SignalWritePort)                                          │
│ ─────────────────────────────────                                        │
│ - ALL triggers normalize to CloudEvents SignalEvents                     │
│ - Idempotent write (same ID = no-op)                                     │
│ - Webhook handler checks TriggerPriorityPolicy after ingest              │
└─────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────┐
│ IMMEDIATE PATH               │ │ SCHEDULED PATH (Backstop)              │
│ ────────────────             │ │ ─────────────────────────              │
│ ONLY for alert lifecycle:    │ │ Temporal Schedule fires                │
│ prometheus.alert.firing      │ │ every 1-5m per scope                   │
│ prometheus.alert.resolved    │ │ → Start IncidentRouterWF               │
│ → Start IncidentRouterWF     │ │   (same workflow, scheduled start)     │
└──────────────────────────────┘ └────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ INCIDENT ROUTER WORKFLOW (Deterministic)                                 │
│ ────────────────────────────────────────                                 │
│ - workflowId = router:${scope}:${timeBucket} (idempotent)               │
│ - Queries alert signals since last cursor (prometheus.alert.*)          │
│ - Correlates alert state → incident lifecycle (NO internal thresholds)  │
│ - Opens/updates/closes incidents via Activity                            │
│ - On lifecycle event → starts GovernanceAgentWorkflow                    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (incident_open | severity_change | incident_close)
┌─────────────────────────────────────────────────────────────────────────┐
│ GOVERNANCE AGENT WORKFLOW                                                │
│ ─────────────────────────────                                            │
│ - Triggered ONLY by incident lifecycle events                            │
│ - Generates brief, runs LLM agent, writes EDO                            │
│ - Posts to human review queue (Plane via MCP)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

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
│ SOURCE ADAPTERS (src/adapters/server/governance/sources/)                │
│ ─────────────────────────────────────────────────────────                │
│ - One adapter per system-of-record                                       │
│ - Multiple streams per adapter (e.g., github: prs, issues, actions)      │
│ - Cursor-based collection (time watermark OR provider token)             │
│ - Transforms raw data → CloudEvents SignalEvent                          │
│ - collect() is replay-safe: same cursor → same/superset events           │
│ - handleWebhook() for push sources (idempotent via delivery_id)          │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SIGNAL INGEST (SignalWritePort)                                          │
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
│ EXISTING METRICSQUERYPORT (src/ports/metrics-query.port.ts)              │
│ ─────────────────────────────────────────────────────────                │
│ - Template-only queries (no raw PromQL)                                  │
│ - Fixed windows, max datapoints, max series enforced                     │
│ - MimirMetricsAdapter handles auth + timeout                             │
│ - Governance adds: per-run rate limits at capability layer               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Relationship:** MetricsQueryPort is orthogonal to signal flow. Brief generation MAY query metrics for KPI deltas. Governance agent MAY query metrics for drill-down via `core__metrics_query` tool. All governed, all auditable.

### Temporal Workflow Blueprint

> See [TEMPORAL_PATTERNS.md](TEMPORAL_PATTERNS.md) for canonical patterns and code examples.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ COLLECTION WORKFLOWS (Temporal Schedules, every 5m)                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ CollectSourceStreamWorkflow(source, streamId)                            │
│ ──────────────────────────────────────────────                           │
│ Activity: loadCursor(source, streamId)                                   │
│ Activity: adapter.collect(streamId, cursor) → events[]                   │
│ Activity: SignalWritePort.ingest(events) → result                        │
│ Activity: saveCursor(source, streamId, nextCursor)                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ INCIDENT ROUTER (Dual-Path: Schedule Backstop + Webhook Fast-Path)       │
└─────────────────────────────────────────────────────────────────────────┘

Started by: Schedule (every 1-5m) OR Webhook handler (immediate)
workflowId: router:${scope}:${timeBucket} (idempotent start)
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ IncidentRouterWorkflow(scope)                                            │
│ ─────────────────────────────                                            │
│ Activity: queryAlertSignals(scope, since lastCursor) → alertEvents[]     │
│ Workflow: correlateAlertState(alertEvents) → incidentUpdates[] (NO I/O)  │
│ for each incidentUpdate:                                                 │
│   Activity: upsertIncident(update) → lifecycleEvent | null               │
│   Workflow: if lifecycleEvent → startChild(GovernanceAgentWorkflow)      │
│ Activity: advanceCursor(scope)                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ GOVERNANCE AGENT (Triggered by incident lifecycle event ONLY)            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ GovernanceAgentWorkflow(incidentId, eventType)                           │
│ ──────────────────────────────────────────────                           │
│ Activity: checkCooldown(incidentId) → shouldRun                          │
│ Workflow: if !shouldRun → return early                                   │
│ Activity: generateBrief(preset: "incident_brief", incidentId)            │
│ Activity: runGovernanceGraph(brief) → agentOutput (via GraphExecutorPort)│
│ Workflow: parseOutput(agentOutput) (deterministic)                       │
│ Activity: if hasAction → appendEdo(edo)                                  │
│ Activity: if hasAction → createWorkItem(item) via Plane MCP              │
│ Activity: markBriefed(incidentId)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key rules:**

- Workflows contain only deterministic logic (conditionals, loops, state)
- All I/O (DB, LLM, API calls) happens in Activities
- Activities are idempotent and retryable
- IncidentRouterWorkflow uses stable workflowId for idempotent concurrent starts
- GovernanceAgentWorkflow triggered ONLY by incident lifecycle events

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

| Column          | Type        | Constraints | Notes                                                        |
| --------------- | ----------- | ----------- | ------------------------------------------------------------ |
| `id`            | uuid        | PK          |                                                              |
| `incident_key`  | text        | NOT NULL    | `{scope}:{signal}:{fingerprint}` (derived, for display/logs) |
| `scope`         | text        | NOT NULL    |                                                              |
| `signal`        | text        | NOT NULL    | `error_rate_high`, `p95_breach`                              |
| `fingerprint`   | text        | NOT NULL    | Alertmanager fingerprint or labelset hash                    |
| `severity`      | text        | NOT NULL    | `warning`, `critical`                                        |
| `status`        | text        | NOT NULL    | `open`, `resolved`                                           |
| `opened_at`     | timestamptz | NOT NULL    |                                                              |
| `resolved_at`   | timestamptz | NULL        |                                                              |
| `last_brief_at` | timestamptz | NULL        | For cooldown enforcement                                     |
| `created_at`    | timestamptz | NOT NULL    |                                                              |
| `updated_at`    | timestamptz | NOT NULL    |                                                              |

**Indexes:** `idx_incidents_scope_status`
**Unique Constraint:** `UNIQUE(scope, signal, fingerprint)` — DB-level source of truth. `incident_key` is derived string for display/logging only (no separate index needed).

**Incident Key Fingerprint:** The `fingerprint` derives from the alerting source:

- Alertmanager alerts: use `fingerprint` from alert payload (stable hash of alertname + labels)
- Custom signals: use `sha256(canonical_json(labelset))` of identifying labels

This ensures a persistent condition (e.g., high error rate) creates ONE incident that accumulates evidence over time, not a new incident per time window.

### incident_evidence

Normalized evidence storage with hard cap (N=100 most recent per incident, enforced at app layer in IncidentStorePort).

| Column        | Type        | Constraints                | Notes                   |
| ------------- | ----------- | -------------------------- | ----------------------- |
| `incident_id` | uuid        | FK incidents, NOT NULL     |                         |
| `signal_id`   | text        | FK signal_events, NOT NULL |                         |
| `created_at`  | timestamptz | NOT NULL                   | When evidence was added |

**Primary Key:** `(incident_id, signal_id)`
**Indexes:** `idx_incident_evidence_incident_id`

**Retention (app-layer only, no DB triggers):** `IncidentStorePort.openOrUpdate()` enforces N=100 cap: after inserting new evidence, SELECT oldest rows over cap and DELETE. No database triggers.

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

---

> **MVP Detection Decision:** Prometheus/Alertmanager is the single source of truth for detection in MVP. The router correlates `prometheus.alert.firing` and `prometheus.alert.resolved` SignalEvents into incident lifecycle transitions. **No internal threshold evaluation.** Internal threshold rules (guardrail_thresholds table) moved to P1 backlog.

---

## Ports

### SignalEvent (Shared Type)

```typescript
// src/ports/governance/signal-event.ts

export interface SignalEvent {
  // CloudEvents 1.0 required
  id: string;
  source: string;
  type: string;
  specversion: "1.0";

  // Governance-required extensions
  time: Date;
  data: Record<string, unknown>;
  datacontenttype: "application/json";
  domain: "engineering" | "product" | "finance" | "operations";
  severity: "info" | "warning" | "critical";

  // Provenance (required)
  producer: string;
  producerVersion: string;
  retrievedAt: Date;
  authRef?: string;
}
```

### SignalWritePort

Adapters depend on this port only. Write path is separate from read path.

```typescript
// src/ports/governance/signal-write.port.ts

export interface IngestResult {
  accepted: number;
  deduplicated: number;
  rejected: number;
  errors: Array<{ id: string; reason: string }>;
}

export interface SignalWritePort {
  /**
   * Idempotent batch ingest. Same ID = no-op.
   * Validates CloudEvents envelope + provenance.
   */
  ingest(events: SignalEvent[]): Promise<IngestResult>;
}
```

### SignalReadPort

Brief generation and queries depend on this port only.

```typescript
// src/ports/governance/signal-read.port.ts

export interface SignalReadPort {
  query(params: {
    domains?: string[];
    types?: string[];
    severities?: string[];
    after: Date;
    before: Date;
    limit: number;
  }): Promise<SignalEvent[]>;

  getById(id: string): Promise<SignalEvent | null>;
}
```

### SourceAdapter (Interface)

```typescript
// packages/data-sources/types.ts

export interface SourceAdapter {
  readonly source: string;
  readonly version: string; // Bump on schema changes

  streams(): StreamDefinition[];

  /**
   * Collect signals from a stream starting at cursor.
   * MUST be replay-safe: same cursor → same or superset events.
   * MUST generate deterministic event IDs (see eventIdScheme).
   */
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
  /**
   * How event IDs are constructed. Must be deterministic.
   * Examples: "github:pr:{repo}:{pr_number}:{updated_at}"
   *           "prometheus:alert:{alertname}:{fingerprint}:{startsAt}"
   */
  eventIdScheme: string;
}

export interface StreamCursor {
  streamId: string;
  value: string;
  retrievedAt: Date;
}
```

**Adapter Contract Rules:**

| Rule                          | Description                                                               |
| ----------------------------- | ------------------------------------------------------------------------- |
| ONE_ADAPTER_PER_SYSTEM        | One adapter per system-of-record; multiple streams inside                 |
| DETERMINISTIC_EVENT_IDS       | Event ID must be derivable from source data; same source record = same ID |
| VERSION_BUMP_ON_SCHEMA_CHANGE | `adapter.version` must increment when payload schema changes              |
| BACKWARDS_COMPAT_N_VERSIONS   | Parsers must handle N-1 schema versions gracefully                        |
| REPLAY_SAFE_COLLECT           | `collect(cursor)` with same cursor must return same or superset events    |
| ACTIVITIES_CALL_ADAPTERS      | Adapters are called from Temporal Activities, never from Workflows        |

**Event Type Naming Convention:**

Pattern: `{source}.{entity}.{action}` or `{source}.{category}.{signal}`

| Source           | Example Types                                                        | Notes                              |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------- |
| `github.webhook` | `github.webhook.pull_request`, `github.webhook.workflow_run`         | Webhook-delivered events           |
| `github.poll`    | `github.poll.pr.updated`, `github.poll.issue.created`                | Polled events                      |
| `gitlab.webhook` | `gitlab.webhook.pipeline`, `gitlab.webhook.merge_request`            |                                    |
| `ci`             | `ci.e2e.failed`, `ci.e2e.passed`, `ci.build.failed`                  | CI system events (source-agnostic) |
| `deploy`         | `deploy.preview.failed`, `deploy.prod.failed`, `deploy.prod.healthy` | Deployment events                  |
| `prometheus`     | `prometheus.alert.firing`, `prometheus.alert.resolved`               |                                    |
| `litellm`        | `litellm.spend.threshold_exceeded`                                   |                                    |
| `plane`          | `plane.work_item.updated`, `plane.work_item.label_changed`           |                                    |

**MVP Trigger Sources (P0):** Limit to 3 sources: (1) CI e2e fail, (2) prod error-rate alert, (3) LiteLLM spend spike OR Plane `needs-governance` label.

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

/**
 * Brief presets define budget/domains/metrics server-side.
 * Agent cannot tune these parameters arbitrarily.
 */
export type BriefPreset = "incident_brief" | "weekly_review" | "daily_digest";

export interface GovernanceBriefPort {
  /**
   * Generate brief using server-side preset.
   * Presets define window calculation, domains, budget, and included metrics.
   */
  generate(params: {
    preset: BriefPreset;
    incidentId?: string; // For incident_brief: incident context
    reviewWindowDays?: 1 | 7; // For weekly_review/daily_digest
  }): Promise<GovernanceBrief>;
  get(briefId: string): Promise<GovernanceBrief | null>;
  list(params: {
    domains?: string[];
    after?: Date;
    limit: number;
  }): Promise<GovernanceBrief[]>;
}
```

### Metrics Access (Governance)

> **No new port.** Governance uses the existing `MetricsQueryPort` (`src/ports/metrics-query.port.ts`) and `MimirMetricsAdapter` (`src/adapters/server/metrics/mimir.adapter.ts`). Hard budgets already enforced server-side.

**Existing Enforcement (in `src/adapters/server/metrics/mimir.adapter.ts`):**

| Budget             | Lines            | Implementation                                       |
| ------------------ | ---------------- | ---------------------------------------------------- |
| Fixed windows      | 46-59            | `WINDOW_SECONDS` + `WINDOW_STEP` (5m/15m/1h/6h only) |
| Max datapoints     | 62, 211-212      | `MAX_POINTS = 100`, `series.slice(0, MAX_POINTS)`    |
| Max series         | 202-207          | Fails closed: `MULTI_SERIES_RESULT` error if > 1     |
| Timeout            | 284-288, 315-316 | `timeoutMs` via AbortController                      |
| Service allowlist  | 36, 175-179      | `ALLOWED_SERVICES`, rejects unknown                  |
| Template allowlist | 37-43, 167-172   | `ALLOWED_TEMPLATES`, no raw PromQL                   |

**P0 Additions for Governance (capability layer):**

| Budget             | Where to enforce            | Implementation                                |
| ------------------ | --------------------------- | --------------------------------------------- |
| Rate limit per run | `MetricsCapability` wrapper | Max N queries per governance run              |
| Max wall time      | `GovernanceAgentWorkflow`   | Activity timeout on graph execution           |
| Max tool calls     | Tool runner config          | Cap `core__metrics_query` calls per graph run |

### IncidentStorePort

```typescript
// src/ports/governance/incident-store.port.ts

export interface Incident {
  id: string;
  incidentKey: string; // {scope}:{signal}:{fingerprint}
  scope: string;
  signal: string;
  fingerprint: string; // Alertmanager fingerprint or labelset hash
  severity: "warning" | "critical";
  status: "open" | "resolved";
  openedAt: Date;
  resolvedAt: Date | null;
  lastBriefAt: Date | null;
  // Evidence via incident_evidence join table (N=100 cap)
}

export type IncidentLifecycleEvent =
  | { type: "incident_open"; incident: Incident }
  | { type: "severity_change"; incident: Incident; previousSeverity: string }
  | { type: "incident_close"; incident: Incident };

export interface IncidentStorePort {
  /**
   * Open or update incident. Adds evidence to join table (N=100 cap enforced here).
   */
  openOrUpdate(
    incidentKey: string, // {scope}:{signal}:{fingerprint}
    severity: "warning" | "critical",
    evidenceSignalIds: string[] // Added to incident_evidence, capped at N=100
  ): Promise<IncidentLifecycleEvent | null>;
  /**
   * Close incident. Adds final evidence to join table.
   */
  close(
    incidentKey: string,
    evidenceSignalIds: string[]
  ): Promise<IncidentLifecycleEvent | null>;
  getOpenByScope(scope: string): Promise<Incident[]>;
  getRecent(scope: string, limit: number): Promise<Incident[]>;
  getEvidence(incidentId: string, limit?: number): Promise<string[]>; // Query join table
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

**Temporal Setup:**

- [x] Deploy Temporal OSS (dev: docker-compose, prod: managed)
- [ ] Create `governance` namespace
- [ ] Configure worker with task queue `governance-tasks`

**Schema & Migrations:**

- [ ] Create `signal_events` table with CloudEvents schema
- [ ] Create `stream_cursors` table (adapter cursor persistence)
- [ ] Create `governance_briefs` table
- [ ] Create `incidents` table with fingerprint-based `incident_key`
- [ ] Create `incident_evidence` join table (N=100 cap)
- [ ] Create `governance_edos` table with `brief_id`, `cited_signals`

**Signal Ports (Split):**

- [ ] Create `SignalWritePort` interface
- [ ] Create `SignalReadPort` interface
- [ ] Implement `DrizzleSignalWriteAdapter`
- [ ] Implement `DrizzleSignalReadAdapter`
- [ ] Idempotent upsert on `id`
- [ ] CloudEvents envelope validation
- [ ] Provenance validation (reject if missing)

**First SourceAdapter + Workflow:**

- [ ] Create `packages/data-sources/` structure
- [ ] Implement `PrometheusAdapter` with `alerts` stream
- [ ] Deterministic event ID scheme for Prometheus alerts
- [ ] Create `CollectSourceStreamWorkflow`
- [ ] Create `collectSignalsActivity` (calls adapter.collect → SignalWritePort.ingest)
- [ ] Create Temporal Schedule for Prometheus collection (every 5m)
- [ ] Integration test: Schedule → Workflow → Activity → ingest → query

#### Chores

- [ ] Add `governance.*` events to EVENT_NAMES
- [ ] Document SourceAdapter pattern in `packages/data-sources/README.md`
- [ ] Document Temporal workflow patterns in `packages/governance-workflows/README.md`

### P1: Brief Generation + Metrics Layer

**GovernanceBriefPort:**

- [ ] Create port interface
- [ ] Implement brief generation with budget enforcement
- [ ] Diff computation from previous brief
- [ ] Citation requirement enforcement
- [ ] Dropped reason accounting

**Metrics (uses existing port):**

- [ ] Add governance rate limits to `MetricsCapability` wrapper
- [ ] Add per-run tool call budget to graph executor config
- [ ] Extend templates if needed (MVP: error_rate, latency_p95 already exist)

**Additional SourceAdapters:**

- [ ] `GitHubAdapter` (prs, issues, actions streams)
- [ ] `LiteLLMAdapter` (spend stream)
- [ ] `LokiAdapter` (error fingerprints only)
- [ ] Temporal Schedules for each adapter

**Semantic Retrieval (pgvector):**

- [ ] Enable pgvector extension
- [ ] Add `embedding` column to governance_briefs
- [ ] Add `embedding` column to governance_edos
- [ ] Implement similarity search for "similar past incidents"

### P2: Incident-Gated Agent Execution

**IncidentRouterWorkflow:**

- [ ] Create `IncidentRouterWorkflow` (correlates alert signals → incidents)
- [ ] Create `queryAlertSignalsActivity` (SignalReadPort, filter `prometheus.alert.*`)
- [ ] Create `upsertIncidentActivity` (IncidentStorePort)
- [ ] Temporal Schedule: every 1-5m per scope
- [ ] On incident lifecycle event → start child GovernanceAgentWorkflow

**GovernanceAgentWorkflow:**

- [ ] Create `GovernanceAgentWorkflow`
- [ ] Create `checkCooldownActivity`
- [ ] Create `generateBriefActivity` (GovernanceBriefPort, preset-based)
- [ ] Create `runGovernanceGraphActivity` (GraphExecutorPort, system tenant)
- [ ] Create `appendEdoActivity` (GovernanceEdoPort)
- [ ] Create `createWorkItemActivity` (WorkItemPort, Plane MCP)
- [ ] Create `markBriefedActivity` (IncidentStorePort)

### P3: Future (Do NOT Build Preemptively)

- [ ] Approval-to-execute pipeline
- [ ] KPI governance loop (weekly Schedule)
- [ ] Baseline deviation detection (replace static thresholds)

---

## File Pointers (P0 Scope)

**Schema & Ports:**

| File                                          | Change                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/shared/db/schema.governance.ts`          | New: signal_events, stream_cursors, briefs, incidents, incident_evidence, edos |
| `src/ports/governance/signal-event.ts`        | New: SignalEvent type                                                          |
| `src/ports/governance/signal-write.port.ts`   | New: SignalWritePort                                                           |
| `src/ports/governance/signal-read.port.ts`    | New: SignalReadPort                                                            |
| `src/ports/governance/brief.port.ts`          | New: GovernanceBriefPort                                                       |
| `src/ports/governance/incident-store.port.ts` | New: IncidentStorePort                                                         |
| `src/bootstrap/capabilities/metrics.ts`       | Existing: Add governance rate limit config                                     |
| `src/ports/governance/edo-store.port.ts`      | New: GovernanceEdoPort                                                         |

**Adapters:**

| File                                                             | Change                       |
| ---------------------------------------------------------------- | ---------------------------- |
| `src/adapters/server/governance/drizzle-signal-write.adapter.ts` | New                          |
| `src/adapters/server/governance/drizzle-signal-read.adapter.ts`  | New                          |
| `packages/data-sources/types.ts`                                 | New: SourceAdapter interface |
| `packages/data-sources/prometheus/adapter.ts`                    | New: first adapter           |
| `packages/data-sources/README.md`                                | New: adapter dev guide       |

**Temporal Workflows & Activities:**

| File                                                                   | Change                            |
| ---------------------------------------------------------------------- | --------------------------------- |
| `packages/governance-workflows/src/workflows/collect-source-stream.ts` | New: CollectSourceStreamWorkflow  |
| `packages/governance-workflows/src/workflows/incident-router.ts`       | New: IncidentRouterWorkflow (P2)  |
| `packages/governance-workflows/src/workflows/governance-agent.ts`      | New: GovernanceAgentWorkflow (P2) |
| `packages/governance-workflows/src/activities/collect-signals.ts`      | New: collectSignalsActivity       |
| `packages/governance-workflows/src/activities/ingest-signals.ts`       | New: ingestSignalsActivity        |
| `packages/governance-workflows/src/worker.ts`                          | New: Temporal worker entry        |
| `packages/governance-workflows/README.md`                              | New: workflow patterns            |

**Infrastructure:**

| File                                                     | Change                      |
| -------------------------------------------------------- | --------------------------- |
| `platform/infra/services/runtime/docker-compose.dev.yml` | Add: Temporal server        |
| `platform/infra/temporal/`                               | New: Temporal configuration |

---

## Design Decisions

### 1. Why Temporal for Orchestration?

| Approach         | Pros                                                    | Cons                                            | Verdict |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------- | ------- |
| Cron + job queue | Simple, familiar                                        | No visibility, no retry semantics, manual state | Reject  |
| Prefect          | Good UI, Python-native                                  | Less mature, weaker durability guarantees       | Reject  |
| Temporal OSS     | Durable execution, Schedules, versioning, replay safety | Learning curve                                  | **Use** |

**Rule:** Temporal provides durable execution with built-in retry, Schedules for recurring work, and replay safety. Workflows are deterministic code; Activities handle I/O.

### 2. Why Split SignalWritePort / SignalReadPort?

| Approach      | Pros                                                    | Cons                                                 | Verdict |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------- | ------- |
| Combined port | Fewer files                                             | God-port; adapters pull in read deps they don't need | Reject  |
| Split ports   | Clean deps; adapters → write-only, curators → read-only | Two interfaces                                       | **Use** |

**Rule:** Adapters depend on `SignalWritePort`. Brief generation depends on `SignalReadPort`. No cross-contamination.

### 3. Why CloudEvents Envelope?

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

| Anti-Pattern                  | Why Forbidden                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| I/O in Workflow code          | Breaks Temporal replay; all I/O must be in Activities               |
| LLM calls in Workflow code    | Non-deterministic; LLM must run in Activities only                  |
| Cron jobs for scheduling      | Use Temporal Schedules for operational visibility                   |
| Non-idempotent Activities     | Temporal retries; must be safe to re-execute                        |
| Combined read/write port      | Dependency bloat; adapters need write-only, curators need read-only |
| Non-deterministic event IDs   | Duplicate events on re-collection; ID must derive from source data  |
| Raw logs in context           | Context explosion                                                   |
| Unbounded signal queries      | Use budget-enforced briefs                                          |
| Claims without citations      | Unauditable                                                         |
| Per-endpoint adapters         | Use per-system                                                      |
| Direct metric queries         | No governance                                                       |
| Agent on fixed timer          | Use incident-gated via Temporal signals                             |
| EDO without brief reference   | Can't reproduce context                                             |
| Missing provenance            | Reject at ingest                                                    |
| Briefs without dropped counts | Agent doesn't know what's missing                                   |

---

## P1 Backlog (Post-MVP)

The following items were identified during architecture review and are deferred from MVP:

### P1-ADAPTER-VERSIONING

- Define N=1 compatibility (current + previous version only)
- `producer_version` already stored on events
- Migration strategy: admin CLI command for reprocessing, not automatic

### P1-TRIGGER-PRIORITY

- Refine priority based on incident lifecycle transitions (open/escalate/resolve)
- Current: immediate path for high-severity signals
- Future: immediate only for state transitions, not raw signal ingestion

### P1-THRESHOLDS-INTERNAL

- Internal threshold rules via `guardrail_thresholds` table (if external alerts insufficient)
- Removed from MVP per P0-DETECTION-SOURCE decision
- Only implement if Prometheus/Alertmanager rules prove inadequate

### P1-PORT-UNIFICATION

- Unify metrics querying behind single MetricsQueryPort via policy catalogs
- Public analytics catalog vs governance catalog (same port, different policies)
- No parallel ports; use policy wrappers on existing `src/ports/metrics-query.port.ts`

### P1-RATE-LIMITING

- Add per caller/tenant rate limiting to MetricsQueryPort
- Gap identified in P0-METRICS-BUDGETS; other budgets already enforced

### P1-METRICS-PORT-REFACTOR

- [ ] Split `MetricsQueryPort` into `InternalPrometheusQueryPort` (raw, adapter-only) and `GovernedMetricsQueryPort` (template-only, tools/agents)
- [ ] Normalize timestamp types (Date vs ISO string) across port interfaces
- [ ] Normalize error contract: return domain errors or Result type, not adapter-specific exceptions
- Currently mitigated by P0 runtime guard (TOOLS_TEMPLATE_ONLY invariant)

---

## Known Issues

- [ ] Rate limiting per run/tenant not yet implemented in MimirMetricsAdapter (P1-RATE-LIMITING)

---

## Related Documents

- [GOV_DATA_COLLECTORS.md](GOV_DATA_COLLECTORS.md) — SourceAdapter registry (Prometheus, OpenRouter, etc.)
- [TEMPORAL_PATTERNS.md](TEMPORAL_PATTERNS.md) — Canonical Temporal patterns and anti-patterns
- [SYSTEM_TENANT_DESIGN.md](SYSTEM_TENANT_DESIGN.md) — System tenant foundation
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — Scheduled graph execution
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort
- [OBSERVABILITY.md](OBSERVABILITY.md) — Prometheus, Loki
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — MCP tool contracts

---

**Last Updated**: 2026-02-02
**Status**: Draft — P0 Fixes Applied (incident_key, detection-source, evidence, time-semantics, brief-presets, metrics-budgets)
