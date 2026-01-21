// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tests/reconcile`
 * Purpose: Unit tests for reconcile_schedules task.
 * Scope: Tests reconciliation logic with mocked dependencies. Does not require database or network.
 * Invariants: All deps are mocked; tests verify RECONCILER_GUARANTEES_CHAIN invariants.
 * Side-effects: none
 * Links: src/tasks/reconcile.ts, docs/SCHEDULER_SPEC.md
 * @internal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReconcileSchedulesTask } from "../src/tasks/reconcile";
import { createStaleSchedulesList } from "./fixtures";

// Helper to create mock deps with defaults
function createMockDeps() {
  return {
    findStaleSchedules: vi.fn(),
    enqueueJob: vi.fn(),
    updateNextRunAt: vi.fn(),
    logger: {
      info: vi.fn(),
    },
  };
}

describe("reconcile_schedules task", () => {
  const MOCK_DATE = new Date("2025-01-15T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("stale schedule reconciliation", () => {
    it("enqueues jobs for stale schedules", async () => {
      const staleSchedules = createStaleSchedulesList(2);
      const deps = createMockDeps();
      deps.findStaleSchedules.mockResolvedValue(staleSchedules);

      const task = createReconcileSchedulesTask(deps);
      await task({});

      // Should enqueue job for each stale schedule
      expect(deps.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "execute_scheduled_run",
          payload: expect.objectContaining({
            scheduleId: staleSchedules[0].id,
          }),
          queueName: staleSchedules[0].id,
        })
      );
      expect(deps.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "execute_scheduled_run",
          payload: expect.objectContaining({
            scheduleId: staleSchedules[1].id,
          }),
          queueName: staleSchedules[1].id,
        })
      );

      // Should update nextRunAt for each
      expect(deps.updateNextRunAt).toHaveBeenCalledTimes(2);
    });

    it("handles empty stale list gracefully", async () => {
      const deps = createMockDeps();
      deps.findStaleSchedules.mockResolvedValue([]);

      const task = createReconcileSchedulesTask(deps);
      await task({});

      // Should log completion with count=0
      expect(deps.logger.info).toHaveBeenCalledWith(
        { count: 0 },
        "Reconciliation complete"
      );
    });
  });

  describe("self-rescheduling (RECONCILER_GUARANTEES_CHAIN)", () => {
    it("schedules next reconciliation in 5 minutes", async () => {
      const deps = createMockDeps();
      deps.findStaleSchedules.mockResolvedValue([]);

      const task = createReconcileSchedulesTask(deps);
      await task({});

      // Should enqueue self with 5-minute delay
      expect(deps.enqueueJob).toHaveBeenCalledWith({
        taskId: "reconcile_schedules",
        payload: {},
        runAt: new Date(MOCK_DATE.getTime() + 5 * 60 * 1000),
        jobKey: "reconciler",
      });
    });

    it("uses fixed jobKey for idempotency", async () => {
      const deps = createMockDeps();
      deps.findStaleSchedules.mockResolvedValue([]);

      const task = createReconcileSchedulesTask(deps);
      await task({});

      // jobKey should always be "reconciler" to prevent duplicates
      const selfRescheduleCall = deps.enqueueJob.mock.calls.find(
        (call) => call[0].taskId === "reconcile_schedules"
      );
      expect(selfRescheduleCall?.[0].jobKey).toBe("reconciler");
    });
  });

  describe("job idempotency", () => {
    it("uses schedule-specific job keys", async () => {
      const staleSchedules = createStaleSchedulesList(1);
      const deps = createMockDeps();
      deps.findStaleSchedules.mockResolvedValue(staleSchedules);

      const task = createReconcileSchedulesTask(deps);
      await task({});

      // Job key should be scheduleId:nextRunAt for deduplication
      const executeCall = deps.enqueueJob.mock.calls.find(
        (call) => call[0].taskId === "execute_scheduled_run"
      );
      expect(executeCall?.[0].jobKey).toMatch(
        new RegExp(`^${staleSchedules[0].id}:`)
      );
    });
  });
});
