// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/jobs/syncGovernanceSchedules.job`
 * Purpose: Job module that wires governance schedule sync to the application container.
 * Scope: Acquires advisory lock, resolves dependencies from container, and syncs governance schedules
 *   for the operator's OWN node AND for every OTHER routable node (their epoch-collect NodeTaskWorkflow
 *   dispatch). Does not contain business logic (the pure orchestration lives in scheduler-core).
 * Invariants:
 *   - SINGLE_WRITER: pg_advisory_lock on a reserved (pinned) pool connection prevents concurrent sync runs
 *   - GRANT_VIA_PORT: Uses ensureGrant on ExecutionGrantUserPort, no raw SQL
 *   - SYSTEM_PRINCIPAL: Grant created for COGNI_SYSTEM_PRINCIPAL_USER_ID
 *   - MULTI_NODE_SCHEDULE_ID: each node's sync prunes only ITS OWN `governance:{nodeId}:` schedules.
 *   - OPERATOR_NOT_DOUBLE_COLLECTED (story.5001): the operator's own node is EXCLUDED from the
 *     NodeTaskWorkflow(/collect) dispatch loop — it keeps collecting via its own governance sync
 *     (CollectEpochWorkflow path is untouched by this job; see REGRESSION_BAR note in the loop below).
 * Side-effects: IO (database advisory lock, Temporal RPC, grant creation)
 * Links: packages/scheduler-core/src/services/syncGovernanceSchedules.ts,
 *   nodes/operator/app/src/bootstrap/jobs/resolveRoutableNodeGovernanceConfigs.ts,
 *   docs/spec/substrate-temporal.md, docs/spec/governance-scheduling.md
 * @public
 */

import { toUserId } from "@cogni/ids";
import {
  COGNI_SYSTEM_BILLING_ACCOUNT_ID,
  COGNI_SYSTEM_PRINCIPAL_USER_ID,
} from "@cogni/node-shared";
import {
  governancePrunePrefix,
  syncGovernanceSchedules,
} from "@cogni/scheduler-core";
import cronParser from "cron-parser";
import { and, eq } from "drizzle-orm";
import { getServiceDb } from "@/adapters/server/db/drizzle.service-client";
import { getContainer } from "@/bootstrap/container";
import { resolveRoutableNodeGovernanceConfigs } from "@/bootstrap/jobs/resolveRoutableNodeGovernanceConfigs";
import { getGovernanceConfig, getNodeId } from "@/shared/config";
import { schedules } from "@/shared/db/schema";
import { serverEnv } from "@/shared/env/server-env";

const GOVERNANCE_GRANT_SCOPES = ["graph:execute:sandbox:openclaw"] as const;

function computeNextRun(cron: string, timezone: string): Date {
  const interval = cronParser.parseExpression(cron, {
    currentDate: new Date(),
    tz: timezone,
  });
  return interval.next().toDate();
}

export interface GovernanceScheduleSyncSummary {
  created: number;
  updated: number;
  resumed: number;
  skipped: number;
  paused: number;
}

/**
 * Run the governance schedules sync job.
 *
 * 1. Acquires a PostgreSQL advisory lock (single-writer)
 * 2. Resolves deps from the application container
 * 3. Calls syncGovernanceSchedules with repo-spec config
 */
export async function runGovernanceSchedulesSyncJob(): Promise<GovernanceScheduleSyncSummary> {
  const container = getContainer();
  const { log } = container;

  // Skip if governance schedules disabled (e.g., in preview environments)
  if (!serverEnv().GOVERNANCE_SCHEDULES_ENABLED) {
    log.info({}, "Governance schedules disabled, skipping sync");
    return { created: 0, updated: 0, resumed: 0, skipped: 0, paused: 0 };
  }

  log.info({}, "Starting governance schedule sync job");

  // Advisory lock: non-blocking single-writer guard.
  // Pin a single pool connection so lock + unlock use the same session
  // (session-scoped advisory locks only release on the connection that acquired them).
  const serviceDb = getServiceDb();
  const reservedConn = await serviceDb.$client.reserve();
  const [lockRow] =
    await reservedConn`SELECT pg_try_advisory_lock(hashtext('governance_sync')) AS acquired`;
  const acquired = (lockRow as { acquired: boolean } | undefined)?.acquired;
  if (!acquired) {
    reservedConn.release();
    log.info({}, "Governance sync already running, skipping");
    return { created: 0, updated: 0, resumed: 0, skipped: 0, paused: 0 };
  }

  try {
    const systemUserId = toUserId(COGNI_SYSTEM_PRINCIPAL_USER_ID);

    // Pause a schedule DB row (Temporal pause is handled by the sync service's prune step).
    const disableSchedule = async (
      temporalScheduleId: string
    ): Promise<void> => {
      await serviceDb
        .update(schedules)
        .set({ enabled: false, nextRunAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(schedules.ownerUserId, COGNI_SYSTEM_PRINCIPAL_USER_ID),
            eq(schedules.temporalScheduleId, temporalScheduleId)
          )
        );
    };

    // Sync ONE node's governance schedules. Deps are identical across nodes except
    // `nodeId` + the prune scope (MULTI_NODE_SCHEDULE_ID): a node prunes only its
    // own `governance:{nodeId}:` schedules, never a sibling node's.
    const syncFor = (
      nodeId: string,
      cfg: Parameters<typeof syncGovernanceSchedules>[0]
    ) =>
      syncGovernanceSchedules(cfg, {
        ensureGovernanceGrant: async () => {
          const grant = await container.executionGrantPort.ensureGrant({
            userId: systemUserId,
            billingAccountId: COGNI_SYSTEM_BILLING_ACCOUNT_ID,
            scopes: GOVERNANCE_GRANT_SCOPES,
          });
          return grant.id;
        },
        // LEDGER_INGEST → NodeTaskWorkflow(/collect): mint the node-task-dispatch grant
        // (`task:dispatch:{nodeId}:/api/internal/attribution/collect`) so the shared operator
        // worker is authorized to POST into THIS node (M1 grant↔node binding, structural).
        ensureNodeCollectGrant: async (scope: string) => {
          const grant = await container.executionGrantPort.ensureGrant({
            userId: systemUserId,
            billingAccountId: COGNI_SYSTEM_BILLING_ACCOUNT_ID,
            scopes: [scope],
          });
          return grant.id;
        },
        upsertGovernanceScheduleRow: async (params) => {
          const nextRunAt = computeNextRun(params.cron, params.timezone);

          // Scope lookup to system tenant to avoid cross-tenant collisions
          const existingRows = await serviceDb
            .select({ id: schedules.id })
            .from(schedules)
            .where(
              and(
                eq(schedules.ownerUserId, params.ownerUserId),
                eq(schedules.temporalScheduleId, params.temporalScheduleId)
              )
            )
            .limit(1);
          const existing = existingRows[0];

          if (existing) {
            await serviceDb
              .update(schedules)
              .set({
                executionGrantId: params.executionGrantId,
                input: params.input,
                cron: params.cron,
                timezone: params.timezone,
                enabled: true,
                nextRunAt,
                updatedAt: new Date(),
              })
              .where(eq(schedules.id, existing.id));
            return existing.id;
          }

          const [row] = await serviceDb
            .insert(schedules)
            .values({
              temporalScheduleId: params.temporalScheduleId,
              ownerUserId: params.ownerUserId,
              executionGrantId: params.executionGrantId,
              graphId: params.graphId,
              input: params.input,
              cron: params.cron,
              timezone: params.timezone,
              enabled: true,
              nextRunAt,
            })
            .returning();
          if (!row) throw new Error("Insert returned no row");
          return row.id;
        },
        systemUserId: COGNI_SYSTEM_PRINCIPAL_USER_ID,
        nodeId,
        scheduleControl: container.scheduleControl,
        // MULTI_NODE_SCHEDULE_ID: prune scoped to THIS node's schedules only.
        listGovernanceScheduleIds: () =>
          container.scheduleControl.listScheduleIds(
            governancePrunePrefix(nodeId)
          ),
        disableSchedule,
        log,
      });

    const totals = {
      created: 0,
      updated: 0,
      resumed: 0,
      skipped: 0,
      paused: 0,
    };
    const add = (
      r: Awaited<ReturnType<typeof syncGovernanceSchedules>>
    ): void => {
      totals.created += r.created.length;
      totals.updated += r.updated.length;
      totals.resumed += r.resumed.length;
      totals.skipped += r.skipped.length;
      totals.paused += r.paused.length;
    };

    // 1) Operator's OWN governance (from its mounted repo-spec). This runs the operator's
    //    own governance-agent charters + its LEDGER_INGEST epoch-collect dispatch under the
    //    node-scoped `governance:{operatorNodeId}:...` ids.
    //
    //    REGRESSION_BAR (story.5001): this job does NOT touch the operator's live single-tenant
    //    epoch running on the FLAT `governance:ledger_ingest` CollectEpochWorkflow schedule — its
    //    prune is node-scoped (`governance:{operatorNodeId}:`), so the flat id is never listed,
    //    never pruned, never repointed. That schedule keeps collecting the operator's own ledger.
    const operatorNodeId = getNodeId();
    add(await syncFor(operatorNodeId, getGovernanceConfig()));

    // 2) Every OTHER routable node — read its git-authoritative governance config and sync its
    //    epoch-collect NodeTaskWorkflow(/collect) dispatch. THIS is what gives spawned nodes
    //    multi-node epochs (previously the operator scheduled only its own — single-tenant).
    //
    //    OPERATOR_NOT_DOUBLE_COLLECTED: skip the operator's own node — it already collects via
    //    step (1) / its flat CollectEpochWorkflow schedule; a NodeTaskWorkflow(/collect) here
    //    would double-collect it.
    const nodeConfigs = await resolveRoutableNodeGovernanceConfigs();
    for (const { nodeId, slug, config } of nodeConfigs) {
      if (nodeId === operatorNodeId) continue; // OPERATOR_NOT_DOUBLE_COLLECTED
      try {
        add(await syncFor(nodeId, config));
      } catch (err) {
        log.warn(
          {
            event: "governance.node_sync_failed",
            nodeId,
            slug,
            err: String(err),
          },
          "governance sync failed for a routable node — continuing with the rest"
        );
      }
    }

    log.info(totals, "Governance schedule sync complete (multi-node)");
    return totals;
  } finally {
    // Release advisory lock on the same connection that acquired it
    await reservedConn`SELECT pg_advisory_unlock(hashtext('governance_sync'))`;
    reservedConn.release();
  }
}
