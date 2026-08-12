// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/governance/governance-sync-job.stack`
 * Purpose: End-to-end test for governance schedule sync job.
 * Scope: Verifies job runs, creates grant, creates schedules in Temporal, and is idempotent. Does not test concurrent lock behavior (requires parallel processes).
 * Invariants: SINGLE_WRITER (via advisory lock), GRANT_VIA_PORT (no raw SQL), IDEMPOTENT (safe to re-run)
 * Side-effects: IO
 * Links: src/bootstrap/jobs/syncGovernanceSchedules.job.ts
 * @public
 */

import { createHash } from "node:crypto";
import { executionGrants } from "@cogni/db-schema";
import {
  COGNI_SYSTEM_BILLING_ACCOUNT_ID,
  COGNI_SYSTEM_PRINCIPAL_USER_ID,
} from "@cogni/node-shared";
import { getSeedDb } from "@tests/_fixtures/db/seed-client";
import { getExecutionRequestsByPrefix } from "@tests/_fixtures/scheduling/db-helpers";
import {
  getTestTemporalClient,
  getTestTemporalConfig,
  triggerSchedule,
} from "@tests/_fixtures/temporal/client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TemporalScheduleControlAdapter } from "@/adapters/server/temporal/schedule-control.adapter";
import { runGovernanceSchedulesSyncJob } from "@/bootstrap/jobs/syncGovernanceSchedules.job";
import { getNodeId } from "@/shared/config";

// OPERATOR_STAYS_ON_COLLECT_EPOCH (story.5001 REGRESSION_BAR): the operator syncs its OWN
// charters on the FLAT legacy id (`governance:{charter}`) so its live single-tenant
// `governance:ledger_ingest` CollectEpochWorkflow schedule is matched/updated in place, never
// forked into a node-scoped ghost. Only OTHER routable nodes use the node-scoped
// (`governance:{nodeId}:{charter}`) MULTI_NODE_SCHEDULE_ID form.
const OPERATOR_NODE_ID = getNodeId();
const govSid = (charter: string): string =>
  `governance:${charter.toLowerCase()}`;
/** Node-scoped id for a NON-operator routable node (the multi-node dispatch form). */
const nodeScopedSid = (nodeId: string, charter: string): string =>
  `governance:${nodeId}:${charter.toLowerCase()}`;

describe("Governance Schedule Sync Job (Stack)", () => {
  const createdScheduleIds: string[] = [];
  let adapter: TemporalScheduleControlAdapter;

  beforeEach(async () => {
    // Initialize adapter
    adapter = new TemporalScheduleControlAdapter(getTestTemporalConfig());

    // Clean up any existing governance schedules from previous runs
    const client = await getTestTemporalClient();
    for await (const summary of client.schedule.list()) {
      if (summary.scheduleId.startsWith("governance:")) {
        try {
          await client.schedule.getHandle(summary.scheduleId).delete();
        } catch {
          // Schedule may have running execution or already deleted
        }
      }
    }

    // Clean up any existing grants
    const db = getSeedDb();
    await db
      .delete(executionGrants)
      .where(eq(executionGrants.userId, COGNI_SYSTEM_PRINCIPAL_USER_ID));
  });

  afterEach(async () => {
    // Clean up created schedules
    const client = await getTestTemporalClient();
    for (const scheduleId of createdScheduleIds) {
      try {
        await client.schedule.getHandle(scheduleId).delete();
      } catch {
        // Schedule may have been deleted already
      }
    }
    createdScheduleIds.length = 0;

    // Clean up grants
    const db = getSeedDb();
    await db
      .delete(executionGrants)
      .where(eq(executionGrants.userId, COGNI_SYSTEM_PRINCIPAL_USER_ID));
  });

  it("creates governance grant and schedules in Temporal", async () => {
    // Run the job
    await runGovernanceSchedulesSyncJob();

    // Verify grant was created
    const db = getSeedDb();
    const grants = await db
      .select()
      .from(executionGrants)
      .where(eq(executionGrants.userId, COGNI_SYSTEM_PRINCIPAL_USER_ID));

    expect(grants).toHaveLength(1);
    expect(grants[0]?.billingAccountId).toBe(COGNI_SYSTEM_BILLING_ACCOUNT_ID);
    expect(grants[0]?.scopes).toContain("graph:execute:sandbox:openclaw");
    expect(grants[0]?.revokedAt).toBeNull();

    // Verify schedule was created in Temporal (use getHandle directly —
    // schedule.list() has eventual consistency and may lag after create)
    const client = await getTestTemporalClient();
    const handle = client.schedule.getHandle(govSid("heartbeat"));
    const rawDesc = await handle.describe();
    expect(rawDesc).toBeDefined();
    createdScheduleIds.push(govSid("heartbeat"));

    // Verify schedule details using adapter
    const desc = await adapter.describeSchedule(govSid("heartbeat"));
    expect(desc).toBeDefined();
    expect(desc?.isPaused).toBe(false);
    expect(desc?.nextRunAtIso).toBeDefined();

    // Verify raw Temporal schedule has correct policies (flat structure, not nested)
    expect(rawDesc.spec.timezone).toBe("UTC");
    expect(rawDesc.policies.overlap).toBe("SKIP");
    // Note: catchupWindow defaults to 1 year (31536000000ms) - tracked as separate issue
    expect(rawDesc.policies.pauseOnFailure).toBe(false);
  });

  it("is idempotent: running twice produces same result", async () => {
    // Run job first time
    await runGovernanceSchedulesSyncJob();

    const db = getSeedDb();
    const grantsAfterFirst = await db
      .select()
      .from(executionGrants)
      .where(eq(executionGrants.userId, COGNI_SYSTEM_PRINCIPAL_USER_ID));

    const firstGrantId = grantsAfterFirst[0]?.id;
    expect(firstGrantId).toBeDefined();

    // Collect schedule IDs
    const client = await getTestTemporalClient();
    for await (const summary of client.schedule.list()) {
      if (summary.scheduleId.startsWith("governance:")) {
        createdScheduleIds.push(summary.scheduleId);
      }
    }

    // Run job second time
    await runGovernanceSchedulesSyncJob();

    // Grant should be the same (not duplicated)
    const grantsAfterSecond = await db
      .select()
      .from(executionGrants)
      .where(eq(executionGrants.userId, COGNI_SYSTEM_PRINCIPAL_USER_ID));

    expect(grantsAfterSecond).toHaveLength(1);
    expect(grantsAfterSecond[0]?.id).toBe(firstGrantId);

    // Collect the operator's own FLAT charter ids after the second run (idempotency).
    // OPERATOR_STAYS_ON_COLLECT_EPOCH: the operator's charters live on the flat legacy
    // ids, NOT node-scoped. We assert the two exact ids rather than a prefix count,
    // because a bare `governance:` prefix would also catch OTHER routable nodes'
    // node-scoped `/collect` dispatch schedules (MULTI_NODE).
    const operatorFlatIds = new Set([
      govSid("heartbeat"),
      govSid("ledger_ingest"),
    ]);
    const operatorSchedulesAfterSecond: string[] = [];
    for await (const summary of client.schedule.list()) {
      if (operatorFlatIds.has(summary.scheduleId)) {
        operatorSchedulesAfterSecond.push(summary.scheduleId);
      }
    }

    // Operator's own charters: flat heartbeat + ledger_ingest, not duplicated on re-run.
    // No node-scoped `governance:{operatorNodeId}:` ghost is created for the operator.
    expect(operatorSchedulesAfterSecond.sort()).toEqual(
      [govSid("heartbeat"), govSid("ledger_ingest")].sort()
    );
    const operatorNodeScopedGhost: string[] = [];
    for await (const summary of client.schedule.list()) {
      if (summary.scheduleId.startsWith(`governance:${OPERATOR_NODE_ID}:`)) {
        operatorNodeScopedGhost.push(summary.scheduleId);
      }
    }
    expect(operatorNodeScopedGhost).toEqual([]);
  });

  it("pauses an operator charter removed from config (flat prune)", async () => {
    // OPERATOR_STAYS_ON_COLLECT_EPOCH: the operator prunes its OWN flat
    // (`governance:{charter}`) schedules. Create a flat legacy id NOT in the current
    // config — it must be paused. (A node-scoped `governance:{otherNodeId}:...` id is
    // NOT a prune candidate here — the operator never touches a sibling's dispatch.)
    const staleId = govSid("old-charter");
    const client = await getTestTemporalClient();
    await client.schedule.create({
      scheduleId: staleId,
      spec: {
        cronExpressions: ["0 * * * *"],
        timezone: "UTC",
      },
      action: {
        type: "startWorkflow",
        workflowType: "GraphRunWorkflow",
        workflowId: staleId,
        args: [{ scheduleId: staleId, input: { message: "OLD" } }],
        taskQueue: "scheduler-worker",
      },
    });
    createdScheduleIds.push(staleId);

    // A sibling node's node-scoped schedule must NOT be pruned by the operator's flat
    // prune (MULTI_NODE_SCHEDULE_ID isolation is preserved).
    const siblingId = nodeScopedSid("sibling-node-xyz", "ledger_ingest");
    await client.schedule.create({
      scheduleId: siblingId,
      spec: { cronExpressions: ["0 0 * * *"], timezone: "UTC" },
      action: {
        type: "startWorkflow",
        workflowType: "NodeTaskWorkflow",
        workflowId: siblingId,
        args: [
          {
            scheduleId: siblingId,
            input: {
              route: "/api/internal/attribution/collect",
              payload: { nodeId: "sibling-node-xyz" },
            },
          },
        ],
        taskQueue: "scheduler-worker",
      },
    });
    createdScheduleIds.push(siblingId);

    // Run sync job
    await runGovernanceSchedulesSyncJob();

    // Verify the operator's stale flat charter was paused using adapter
    const desc = await adapter.describeSchedule(staleId);
    expect(desc).toBeDefined();
    expect(desc?.isPaused).toBe(true);

    // Verify the sibling node's node-scoped schedule was left running (not clobbered).
    const siblingDesc = await adapter.describeSchedule(siblingId);
    expect(siblingDesc).toBeDefined();
    expect(siblingDesc?.isPaused).toBe(false);
  });

  it("executes a governance schedule end-to-end", async () => {
    await runGovernanceSchedulesSyncJob();
    const temporalScheduleId = govSid("heartbeat");
    createdScheduleIds.push(temporalScheduleId);

    const before = await getExecutionRequestsByPrefix(`${temporalScheduleId}:`);
    await triggerSchedule(temporalScheduleId);

    const client = await getTestTemporalClient();
    const start = Date.now();
    let created = before;
    while (Date.now() - start < 8_000) {
      created = await getExecutionRequestsByPrefix(`${temporalScheduleId}:`);
      if (created.length > before.length) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (created.length <= before.length) {
      const desc = await client.schedule
        .getHandle(temporalScheduleId)
        .describe();
      const recentActionCount = desc.info.recentActions.length;
      const lastAction = desc.info.recentActions.at(-1);
      const lastScheduledAt =
        lastAction?.scheduledAt?.toISOString?.() ?? "unknown";
      throw new Error(
        `No execution_requests row observed for ${temporalScheduleId} after trigger. ` +
          `recentActions=${recentActionCount}, lastScheduledAt=${lastScheduledAt}. ` +
          "Likely worker backlog or stale scheduler-worker process."
      );
    }

    const latest = created.sort((a, b) => {
      return b.createdAt.getTime() - a.createdAt.getTime();
    })[0];
    expect(latest).toBeDefined();
    if (!latest) {
      throw new Error("Missing execution_request row for governance run");
    }

    expect(latest.idempotencyKey.startsWith(`${temporalScheduleId}:`)).toBe(
      true
    );
    // Regression guard: before stateKey wiring, governance runs would finalize
    // as internal errors almost immediately from gateway execution.
    if (latest.ok === false && latest.errorCode === "internal") {
      throw new Error(
        "Governance run finalized with internal error (possible stateKey regression)"
      );
    }

    const expectedRequestHash = createHash("sha256")
      .update(
        JSON.stringify({
          graphId: "sandbox:openclaw",
          input: { message: "HEARTBEAT", model: "kimi-k2.5" },
        }),
        "utf8"
      )
      .digest("hex");
    expect(latest.requestHash).toBe(expectedRequestHash);
  });
});
