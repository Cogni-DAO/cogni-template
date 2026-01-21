# Temporal Patterns

> [!CRITICAL]
> All I/O, LLM calls, and external API calls run in **Activities only**. Workflow code is deterministic replay-safe logic. Violating this breaks Temporal's durable execution guarantees.

## Core Invariants

1. **TEMPORAL_DETERMINISM**: No I/O, network calls, or LLM invocations inside Workflow code. All external calls (DB, LLM, APIs) run in Activities only. Violating this breaks replay on deploy/restart.

2. **ACTIVITY_IDEMPOTENCY**: All Activities must be idempotent. Temporal retries Activities on failure. Use idempotency keys for side effects: `${workflowId}/${activityId}/${attempt}`.

3. **SCHEDULES_OVER_CRON**: Use Temporal Schedules for recurring work. Not cron jobs, not external schedulers. Schedules provide pause/resume, backfill, and operational visibility.

4. **WORKFLOW_ID_STABILITY**: Use stable, meaningful workflowIds derived from business keys (e.g., `scheduleId`, `incidentKey:timeBucket`). Enables idempotent workflow starts and prevents duplicates.

5. **SCHEDULED_TIME_FROM_TEMPORAL**: Activities derive `scheduledFor` from `TemporalScheduledStartTime` search attribute (authoritative source), never from workflow input or wall clock.

6. **OVERLAP_SKIP_DEFAULT**: Schedules use `overlap: 'SKIP'` by default. Only one workflow instance per schedule runs at a time.

7. **CATCHUP_WINDOW_ZERO**: P0 does not backfill missed runs. Set `catchupWindow: 0` to skip missed slots.

---

## Workflow Boundaries

### What Goes in Workflows (Deterministic)

- Conditionals and loops over workflow state
- Calling Activities and child Workflows
- Waiting for signals and timers
- State machine transitions
- Parsing Activity results (deterministic transforms)

### What Goes in Activities (I/O)

- Database reads and writes
- HTTP/API calls
- LLM invocations (via GraphExecutorPort)
- File system operations
- External service calls (MCP, webhooks)
- Metrics emission

---

## Common Patterns

### 1. Scheduled Collection Workflow

```typescript
// Workflow: deterministic orchestration only
export async function CollectSourceStreamWorkflow(
  source: string,
  streamId: string
): Promise<void> {
  // Activity: load cursor from DB
  const cursor = await loadCursorActivity(source, streamId);

  // Activity: collect signals (I/O to external system)
  const { events, nextCursor } = await collectSignalsActivity(
    source,
    streamId,
    cursor
  );

  // Activity: ingest signals (DB write)
  await ingestSignalsActivity(events);

  // Activity: save cursor (DB write)
  await saveCursorActivity(source, streamId, nextCursor);
}
```

### 2. Incident-Gated Agent Workflow

```typescript
// Triggered by incident lifecycle event, not timer
export async function GovernanceAgentWorkflow(
  incidentId: string,
  eventType: IncidentLifecycleEvent["type"]
): Promise<void> {
  // Activity: check cooldown
  const shouldRun = await checkCooldownActivity(incidentId, COOLDOWN_MINUTES);
  if (!shouldRun) return;

  // Activity: generate brief (DB read + aggregation)
  const brief = await generateBriefActivity(incidentId);

  // Activity: run LLM agent (via GraphExecutorPort)
  const result = await runGovernanceGraphActivity(brief);

  // Workflow: deterministic decision based on result
  if (result.hasRecommendation) {
    // Activity: write EDO record
    await appendEdoActivity(result.edo);
    // Activity: create work item via MCP
    await createWorkItemActivity(result.workItem);
  }

  // Activity: mark incident as briefed
  await markBriefedActivity(incidentId);
}
```

### 3. Router with Fast-Path Kick

```typescript
// IncidentRouterWorkflow: can be started by schedule OR webhook fast-path
// workflowId = `router:${scope}:${timeBucket}` for idempotency
export async function IncidentRouterWorkflow(scope: string): Promise<void> {
  // Activity: query recent signals
  const signals = await querySignalsActivity(scope);

  // Activity: query metrics for threshold checks
  const metrics = await queryMetricsActivity(scope);

  // Workflow: deterministic threshold evaluation (NO I/O)
  const incidents = evaluateThresholds(signals, metrics);

  for (const incident of incidents) {
    // Activity: upsert incident, get lifecycle event
    const event = await upsertIncidentActivity(incident);

    // Workflow: if lifecycle event, start child workflow
    if (event) {
      await startChild(GovernanceAgentWorkflow, {
        args: [incident.id, event.type],
        workflowId: `agent:${incident.id}:${event.type}`,
      });
    }
  }
}
```

---

## Schedule Configuration

### Standard Schedule Setup

```typescript
await temporalClient.schedule.create({
  scheduleId: dbRecord.id, // Use DB ID for correlation
  spec: {
    cronExpressions: [cronExpression],
    timezone: "UTC",
  },
  action: {
    type: "startWorkflow",
    workflowType: "CollectSourceStreamWorkflow",
    workflowId: dbRecord.id, // workflowId = scheduleId
    args: [source, streamId],
    taskQueue: "governance-tasks",
  },
  policies: {
    overlap: ScheduleOverlapPolicy.SKIP,
    catchupWindow: "0s", // No backfill in P0
  },
});
```

### CRUD Authority

Schedule lifecycle (create/update/pause/delete) is owned by CRUD endpoints, not workers:

| Operation    | Authority           | Worker Role   |
| ------------ | ------------------- | ------------- |
| Create       | `POST /schedules`   | None          |
| Update/Pause | `PATCH /schedules`  | None          |
| Delete       | `DELETE /schedules` | None          |
| Execute      | Temporal fires      | Runs workflow |
| Reconcile    | Admin CLI only      | None          |

---

## Anti-Patterns

| Anti-Pattern                | Why Forbidden                                            |
| --------------------------- | -------------------------------------------------------- |
| I/O in Workflow code        | Breaks Temporal replay; all I/O must be in Activities    |
| LLM calls in Workflow code  | Non-deterministic; LLM must run in Activities only       |
| `Date.now()` in Workflow    | Non-deterministic; use `workflow.now()` or Activity      |
| Random/UUID in Workflow     | Non-deterministic; generate in Activity or pass as input |
| Worker modifies schedules   | CRUD endpoints are single authority                      |
| Always-on reconciliation    | Creates authority split; use admin CLI                   |
| Wall clock for scheduledFor | Use `TemporalScheduledStartTime` search attribute        |

---

## Infrastructure

### Namespaces

| Namespace          | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `cogni-governance` | Governance workflows (signal collection, routing, agents) |
| `cogni-scheduler`  | User-created scheduled graph executions                   |

### Task Queues

| Queue              | Workers             | Workflows                 |
| ------------------ | ------------------- | ------------------------- |
| `governance-tasks` | `governance-worker` | Collection, Router, Agent |
| `scheduler-tasks`  | `scheduler-worker`  | ScheduledGraphRun         |

### Search Attributes

| Attribute                    | Type     | Purpose                              |
| ---------------------------- | -------- | ------------------------------------ |
| `TemporalScheduledStartTime` | DateTime | Authoritative scheduled time         |
| `scope`                      | Keyword  | Filter workflows by governance scope |
| `incidentKey`                | Keyword  | Correlate workflows to incidents     |

---

## Related Documents

- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — Scheduled graph execution (user-created)
- [AI_GOVERNANCE_DATA.md](AI_GOVERNANCE_DATA.md) — Governance signal collection and agent workflows
- [SERVICES_ARCHITECTURE.md](SERVICES_ARCHITECTURE.md) — Worker service structure

---

**Last Updated**: 2026-01-21
**Status**: Draft
