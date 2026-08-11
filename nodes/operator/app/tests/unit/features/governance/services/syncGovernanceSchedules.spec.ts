// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/governance/services/syncGovernanceSchedules`
 * Purpose: Unit tests for governance schedule sync logic (multi-node, story.5001).
 * Scope: Tests sync function with mocked ScheduleControlPort; verifies node-scoped schedule ids,
 *   create/update/resume/skip/prune behavior, and the LEDGER_INGEST → NodeTaskWorkflow(/collect)
 *   dispatch swap (route + payload + node-task grant scope). Does not test Temporal integration or DB.
 * Invariants: Prune pauses (never deletes); conflict = update or skip or resume; idempotent on repeat;
 *   LEDGER_INGEST dispatches NodeTaskWorkflow, never CollectEpochWorkflow.
 * Side-effects: none (all deps mocked)
 * Links: packages/scheduler-core/src/services/syncGovernanceSchedules.ts
 * @public
 */

import {
  nodeTaskScope,
  ScheduleControlConflictError,
  ScheduleControlNotFoundError,
  type ScheduleDescription,
} from "@cogni/scheduler-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GovernanceScheduleSyncDeps,
  governanceScheduleId,
  isLegacyGovernanceScheduleId,
  syncGovernanceSchedules,
} from "@/features/governance/services/syncGovernanceSchedules";
import type { GovernanceConfig } from "@/shared/config";

const GRANT_ID = "test-grant-id-001";
const COLLECT_GRANT_ID = "test-collect-grant-id-001";
const SYSTEM_USER_ID = "00000000-0000-4000-a000-000000000001";
const MOCK_DB_SCHEDULE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NODE_ID = "node-abc-123";
const COLLECT_ROUTE = "/api/internal/attribution/collect";

/** Counter-based mock to return unique dbScheduleIds per call */
let upsertCallCount = 0;

function makeMockDeps(
  overrides?: Partial<GovernanceScheduleSyncDeps>
): GovernanceScheduleSyncDeps {
  upsertCallCount = 0;
  return {
    ensureGovernanceGrant: vi.fn().mockResolvedValue(GRANT_ID),
    ensureNodeCollectGrant: vi.fn().mockResolvedValue(COLLECT_GRANT_ID),
    upsertGovernanceScheduleRow: vi.fn().mockImplementation(() => {
      upsertCallCount++;
      return Promise.resolve(`${MOCK_DB_SCHEDULE_ID}-${upsertCallCount}`);
    }),
    systemUserId: SYSTEM_USER_ID,
    nodeId: NODE_ID,
    scheduleControl: {
      createSchedule: vi.fn().mockResolvedValue(undefined),
      updateSchedule: vi.fn().mockResolvedValue(undefined),
      pauseSchedule: vi.fn().mockResolvedValue(undefined),
      resumeSchedule: vi.fn().mockResolvedValue(undefined),
      deleteSchedule: vi.fn().mockResolvedValue(undefined),
      describeSchedule: vi.fn().mockResolvedValue(null),
      listScheduleIds: vi.fn().mockResolvedValue([]),
    },
    listGovernanceScheduleIds: vi.fn().mockResolvedValue([]),
    disableSchedule: vi.fn().mockResolvedValue(undefined),
    log: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

function makeConfig(
  charters: Array<{
    charter: string;
    cron: string;
    entrypoint: string;
    timezone?: string;
  }>
): GovernanceConfig {
  return {
    schedules: charters.map((c) => ({
      charter: c.charter,
      cron: c.cron,
      timezone: c.timezone ?? "UTC",
      entrypoint: c.entrypoint,
    })),
  };
}

/** Node-scoped schedule id for the mock's NODE_ID (`governance:{nodeId}:{charter}`). */
function sid(charter: string): string {
  return governanceScheduleId(NODE_ID, charter);
}

/** Helper: build a ScheduleDescription matching the desired config (no drift) */
function makeMatchingDesc(
  scheduleId: string,
  cron: string,
  entrypoint: string,
  opts?: { isPaused?: boolean; timezone?: string; dbScheduleId?: string | null }
): ScheduleDescription {
  return {
    scheduleId,
    nextRunAtIso: "2026-02-15T06:00:00Z",
    lastRunAtIso: null,
    isPaused: opts?.isPaused ?? false,
    cron,
    timezone: opts?.timezone ?? "UTC",
    input: { message: entrypoint, model: "kimi-k2.5" },
    dbScheduleId:
      "dbScheduleId" in (opts ?? {})
        ? (opts?.dbScheduleId ?? null)
        : `${MOCK_DB_SCHEDULE_ID}-1`,
  };
}

/** Helper: build a ScheduleDescription with stale config (drift) */
function makeDriftedDesc(
  scheduleId: string,
  cron: string,
  entrypoint: string,
  opts?: { isPaused?: boolean; dbScheduleId?: string | null }
): ScheduleDescription {
  return {
    scheduleId,
    nextRunAtIso: "2026-02-15T06:00:00Z",
    lastRunAtIso: null,
    isPaused: opts?.isPaused ?? false,
    cron,
    timezone: "UTC",
    // Stale: missing model field (the bug we're fixing)
    input: { message: entrypoint },
    dbScheduleId:
      "dbScheduleId" in (opts ?? {})
        ? (opts?.dbScheduleId ?? null)
        : `${MOCK_DB_SCHEDULE_ID}-1`,
  };
}

describe("syncGovernanceSchedules", () => {
  let deps: GovernanceScheduleSyncDeps;

  beforeEach(() => {
    deps = makeMockDeps();
  });

  it("creates node-scoped schedules for each charter in config", async () => {
    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
      { charter: "GOVERN", cron: "0 * * * *", entrypoint: "GOVERN" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    // MULTI_NODE_SCHEDULE_ID: ids carry the nodeId segment.
    expect(result.created).toEqual([sid("COMMUNITY"), sid("GOVERN")]);
    expect(result.created).toEqual([
      "governance:node-abc-123:community",
      "governance:node-abc-123:govern",
    ]);
    // Upsert called for each schedule before Temporal creation
    expect(deps.upsertGovernanceScheduleRow).toHaveBeenCalledTimes(2);
    expect(deps.upsertGovernanceScheduleRow).toHaveBeenCalledWith(
      expect.objectContaining({
        temporalScheduleId: sid("COMMUNITY"),
        ownerUserId: SYSTEM_USER_ID,
        graphId: "sandbox:openclaw",
      })
    );
    expect(deps.scheduleControl.createSchedule).toHaveBeenCalledTimes(2);
    expect(deps.scheduleControl.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: sid("COMMUNITY"),
        nodeId: NODE_ID,
        dbScheduleId: `${MOCK_DB_SCHEDULE_ID}-1`,
        cron: "0 */6 * * *",
        timezone: "UTC",
        graphId: "sandbox:openclaw",
        executionGrantId: GRANT_ID,
        input: { message: "COMMUNITY", model: "kimi-k2.5" },
        overlapPolicy: "skip",
        catchupWindowMs: 0,
      })
    );
    // Governance-agent charters do NOT dispatch — no collect grant, no NodeTaskWorkflow.
    expect(deps.ensureNodeCollectGrant).not.toHaveBeenCalled();
  });

  it("ensures governance grant before creating schedules", async () => {
    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    await syncGovernanceSchedules(config, deps);

    expect(deps.ensureGovernanceGrant).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // LEDGER_INGEST → NodeTaskWorkflow(/collect) dispatch swap (story.5001 core change)
  // ---------------------------------------------------------------------------
  describe("LEDGER_INGEST dispatch (story.5001)", () => {
    it("targets NodeTaskWorkflow with the /collect route + { nodeId } payload", async () => {
      const config = makeConfig([
        {
          charter: "LEDGER_INGEST",
          cron: "0 0 * * *",
          entrypoint: "LEDGER_INGEST",
        },
      ]);

      const result = await syncGovernanceSchedules(config, deps);

      expect(result.created).toEqual([sid("LEDGER_INGEST")]);
      expect(deps.scheduleControl.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: sid("LEDGER_INGEST"),
          nodeId: NODE_ID,
          // Swap: NodeTaskWorkflow, NOT CollectEpochWorkflow.
          workflowType: "NodeTaskWorkflow",
          // `task:{route}` graphId tunnel drives the adapter's route fallback.
          graphId: `task:${COLLECT_ROUTE}`,
          executionGrantId: COLLECT_GRANT_ID,
          // The adapter reads input.route + input.payload → NodeTaskInput { nodeId, route, payload }.
          input: {
            route: COLLECT_ROUTE,
            payload: { nodeId: NODE_ID },
          },
          overlapPolicy: "skip",
          catchupWindowMs: 0,
        })
      );
    });

    it("does NOT target CollectEpochWorkflow or the ledger task queue", async () => {
      const config = makeConfig([
        {
          charter: "LEDGER_INGEST",
          cron: "0 0 * * *",
          entrypoint: "LEDGER_INGEST",
        },
      ]);

      await syncGovernanceSchedules(config, deps);

      const call = vi
        .mocked(deps.scheduleControl.createSchedule)
        .mock.calls.find(([p]) => p.scheduleId === sid("LEDGER_INGEST"));
      expect(call).toBeDefined();
      const params = call?.[0];
      expect(params?.workflowType).not.toBe("CollectEpochWorkflow");
      // No ledger task-queue override — the shared operator worker + its default queue run it.
      expect(params?.taskQueueOverride).toBeUndefined();
    });

    it("mints the node-bound task:dispatch grant scope for the /collect route", async () => {
      const config = makeConfig([
        {
          charter: "LEDGER_INGEST",
          cron: "0 0 * * *",
          entrypoint: "LEDGER_INGEST",
        },
      ]);

      await syncGovernanceSchedules(config, deps);

      const expectedScope = nodeTaskScope(NODE_ID, COLLECT_ROUTE);
      expect(expectedScope).toBe(`task:dispatch:${NODE_ID}:${COLLECT_ROUTE}`);
      expect(deps.ensureNodeCollectGrant).toHaveBeenCalledWith(expectedScope);
    });
  });

  it("skips when schedule exists, is running, and config matches", async () => {
    const matchingDesc = makeMatchingDesc(
      sid("COMMUNITY"),
      "0 */6 * * *",
      "COMMUNITY"
    );

    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi
      .fn()
      .mockResolvedValue(matchingDesc);

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.skipped).toEqual([sid("COMMUNITY")]);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(deps.scheduleControl.updateSchedule).not.toHaveBeenCalled();
    expect(deps.scheduleControl.resumeSchedule).not.toHaveBeenCalled();
  });

  it("updates schedule when config has changed (model drift)", async () => {
    const driftedDesc = makeDriftedDesc(
      sid("COMMUNITY"),
      "0 */6 * * *",
      "COMMUNITY"
    );

    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi
      .fn()
      .mockResolvedValue(driftedDesc);

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.updated).toEqual([sid("COMMUNITY")]);
    expect(result.skipped).toEqual([]);
    expect(deps.scheduleControl.updateSchedule).toHaveBeenCalledWith(
      sid("COMMUNITY"),
      expect.objectContaining({
        input: { message: "COMMUNITY", model: "kimi-k2.5" },
      })
    );
    // Running schedule — should not be resumed
    expect(deps.scheduleControl.resumeSchedule).not.toHaveBeenCalled();
  });

  it("updates schedule when dbScheduleId link drift detected", async () => {
    // Temporal schedule has dbScheduleId: null (legacy), DB row returns a UUID
    const descWithNullLink = makeMatchingDesc(
      sid("COMMUNITY"),
      "0 */6 * * *",
      "COMMUNITY",
      { dbScheduleId: null }
    );

    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi
      .fn()
      .mockResolvedValue(descWithNullLink);

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.updated).toEqual([sid("COMMUNITY")]);
    expect(deps.scheduleControl.updateSchedule).toHaveBeenCalledWith(
      sid("COMMUNITY"),
      expect.objectContaining({
        dbScheduleId: `${MOCK_DB_SCHEDULE_ID}-1`,
      })
    );
  });

  it("updates and resumes a paused schedule with changed config", async () => {
    const driftedPaused = makeDriftedDesc(
      sid("COMMUNITY"),
      "0 */6 * * *",
      "COMMUNITY",
      { isPaused: true }
    );

    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi
      .fn()
      .mockResolvedValue(driftedPaused);

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.updated).toEqual([sid("COMMUNITY")]);
    expect(deps.scheduleControl.updateSchedule).toHaveBeenCalledOnce();
    expect(deps.scheduleControl.resumeSchedule).toHaveBeenCalledWith(
      sid("COMMUNITY")
    );
  });

  it("resumes paused schedule when config matches", async () => {
    const pausedDesc = makeMatchingDesc(
      sid("COMMUNITY"),
      "0 */6 * * *",
      "COMMUNITY",
      { isPaused: true }
    );

    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi
      .fn()
      .mockResolvedValue(pausedDesc);

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.resumed).toEqual([sid("COMMUNITY")]);
    expect(deps.scheduleControl.resumeSchedule).toHaveBeenCalledWith(
      sid("COMMUNITY")
    );
    expect(deps.scheduleControl.updateSchedule).not.toHaveBeenCalled();
  });

  it("pauses stale governance schedules not in config", async () => {
    deps = makeMockDeps({
      listGovernanceScheduleIds: vi
        .fn()
        .mockResolvedValue([sid("COMMUNITY"), sid("OLD-CHARTER")]),
    });

    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.paused).toEqual([sid("OLD-CHARTER")]);
    expect(deps.scheduleControl.pauseSchedule).toHaveBeenCalledWith(
      sid("OLD-CHARTER")
    );
  });

  it("handles externally deleted schedules during prune gracefully", async () => {
    deps = makeMockDeps({
      listGovernanceScheduleIds: vi
        .fn()
        .mockResolvedValue([sid("DELETED-CHARTER")]),
    });
    deps.scheduleControl.pauseSchedule = vi
      .fn()
      .mockRejectedValue(
        new ScheduleControlNotFoundError(sid("DELETED-CHARTER"))
      );

    const config = makeConfig([]);

    const result = await syncGovernanceSchedules(config, deps);

    // Should not throw, and should not list as paused
    expect(result.paused).toEqual([]);
  });

  it("is idempotent: no-op on repeat call with same config", async () => {
    // Use a stable dbScheduleId for both calls
    const stableDbId = "stable-db-id-for-idempotency";
    deps.upsertGovernanceScheduleRow = vi.fn().mockResolvedValue(stableDbId);

    // First call: all schedules created
    const config = makeConfig([
      { charter: "COMMUNITY", cron: "0 */6 * * *", entrypoint: "COMMUNITY" },
    ]);

    const result1 = await syncGovernanceSchedules(config, deps);
    expect(result1.created).toEqual([sid("COMMUNITY")]);

    // Second call: schedule exists now with matching config + same dbScheduleId
    deps.scheduleControl.createSchedule = vi
      .fn()
      .mockRejectedValue(new ScheduleControlConflictError(sid("COMMUNITY")));
    deps.scheduleControl.describeSchedule = vi.fn().mockResolvedValue(
      makeMatchingDesc(sid("COMMUNITY"), "0 */6 * * *", "COMMUNITY", {
        dbScheduleId: stableDbId,
      })
    );

    const result2 = await syncGovernanceSchedules(config, deps);
    expect(result2.skipped).toEqual([sid("COMMUNITY")]);
    expect(result2.created).toEqual([]);
    expect(result2.updated).toEqual([]);
  });

  it("returns empty result for config with no schedules", async () => {
    const config = makeConfig([]);

    const result = await syncGovernanceSchedules(config, deps);

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.resumed).toEqual([]);
    expect(result.paused).toEqual([]);
  });
});

describe("governanceScheduleId", () => {
  it("is node-scoped and lowercases the charter name", () => {
    expect(governanceScheduleId("node-x", "COMMUNITY")).toBe(
      "governance:node-x:community"
    );
    expect(governanceScheduleId("node-x", "ENGINEERING")).toBe(
      "governance:node-x:engineering"
    );
    expect(governanceScheduleId("node-y", "LEDGER_INGEST")).toBe(
      "governance:node-y:ledger_ingest"
    );
  });

  it("gives distinct ids to two nodes' same charter (no clobber)", () => {
    // MULTI_NODE_SCHEDULE_ID: this is the whole point — two nodes' LEDGER_INGEST
    // must NOT collapse onto one Temporal schedule id.
    expect(governanceScheduleId("node-a", "LEDGER_INGEST")).not.toBe(
      governanceScheduleId("node-b", "LEDGER_INGEST")
    );
  });
});

describe("isLegacyGovernanceScheduleId", () => {
  it("classifies the flat operator id as legacy (2 segments), node-scoped as not", () => {
    // The operator's live single-tenant epoch runs on this flat id — classified legacy,
    // but NOT pruned by this job (REGRESSION_BAR, story.5001).
    expect(isLegacyGovernanceScheduleId("governance:ledger_ingest")).toBe(true);
    expect(
      isLegacyGovernanceScheduleId("governance:node-abc-123:ledger_ingest")
    ).toBe(false);
    expect(isLegacyGovernanceScheduleId("node-task:x:y")).toBe(false);
  });
});
