// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tests/execute-run`
 * Purpose: Unit tests for execute_scheduled_run task.
 * Scope: Tests task logic with mocked dependencies. Does not require database or network.
 * Invariants: All deps are mocked; tests cover happy path and error cases.
 * Side-effects: none
 * Links: src/tasks/execute-run.ts, docs/SCHEDULER_SPEC.md
 * @internal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExecuteScheduledRunTask } from "../src/tasks/execute-run";
import {
  createExecuteRunPayload,
  createMockGrant,
  createMockSchedule,
  FIXED_IDS,
} from "./fixtures";

// Helper to create mock deps with defaults
function createMockDeps() {
  return {
    getSchedule: vi.fn(),
    validateGrantForGraph: vi.fn(),
    createRun: vi.fn(),
    markRunStarted: vi.fn(),
    markRunCompleted: vi.fn(),
    enqueueJob: vi.fn(),
    updateNextRunAt: vi.fn(),
    updateLastRunAt: vi.fn(),
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe("execute_scheduled_run task", () => {
  const MOCK_DATE = new Date("2025-01-15T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("happy path", () => {
    it("creates run, validates grant, marks complete, enqueues next", async () => {
      const mockSchedule = createMockSchedule();
      const mockGrant = createMockGrant();
      const payload = createExecuteRunPayload();

      const deps = createMockDeps();
      deps.getSchedule.mockResolvedValue(mockSchedule);
      deps.validateGrantForGraph.mockResolvedValue(mockGrant);

      const task = createExecuteScheduledRunTask(deps);
      await task(payload);

      // 1. Should load schedule
      expect(deps.getSchedule).toHaveBeenCalledWith(FIXED_IDS.scheduleId);

      // 2. Should create run record
      expect(deps.createRun).toHaveBeenCalledWith({
        scheduleId: FIXED_IDS.scheduleId,
        runId: expect.any(String),
        scheduledFor: new Date(payload.scheduledFor),
      });

      // 3. Should validate grant
      expect(deps.validateGrantForGraph).toHaveBeenCalledWith(
        FIXED_IDS.grantId,
        FIXED_IDS.graphId
      );

      // 4. Should mark started
      expect(deps.markRunStarted).toHaveBeenCalled();

      // 5. Should update lastRunAt
      expect(deps.updateLastRunAt).toHaveBeenCalledWith(
        FIXED_IDS.scheduleId,
        expect.any(Date)
      );

      // 6. Should mark complete (v0 stub marks as success)
      expect(deps.markRunCompleted).toHaveBeenCalledWith(
        expect.any(String),
        "success"
      );

      // 7. Should enqueue next run (PRODUCER_ENQUEUES_NEXT)
      expect(deps.enqueueJob).toHaveBeenCalledWith({
        taskId: "execute_scheduled_run",
        payload: expect.objectContaining({ scheduleId: FIXED_IDS.scheduleId }),
        runAt: expect.any(Date),
        jobKey: expect.stringContaining(`${FIXED_IDS.scheduleId}:`),
        queueName: FIXED_IDS.scheduleId,
      });

      // 8. Should update nextRunAt
      expect(deps.updateNextRunAt).toHaveBeenCalled();
    });
  });

  describe("schedule disabled or deleted", () => {
    it("skips execution when schedule not found", async () => {
      const payload = createExecuteRunPayload();
      const deps = createMockDeps();
      deps.getSchedule.mockResolvedValue(null);

      const task = createExecuteScheduledRunTask(deps);
      await task(payload);

      expect(deps.createRun).not.toHaveBeenCalled();
      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: FIXED_IDS.scheduleId }),
        expect.stringContaining("disabled or deleted")
      );
    });

    it("skips execution when schedule disabled", async () => {
      const payload = createExecuteRunPayload();
      const deps = createMockDeps();
      deps.getSchedule.mockResolvedValue(
        createMockSchedule({ enabled: false })
      );

      const task = createExecuteScheduledRunTask(deps);
      await task(payload);

      expect(deps.createRun).not.toHaveBeenCalled();
    });
  });

  describe("grant validation failure", () => {
    it("marks run as skipped when grant invalid", async () => {
      const payload = createExecuteRunPayload();
      const deps = createMockDeps();
      deps.getSchedule.mockResolvedValue(createMockSchedule());
      deps.validateGrantForGraph.mockRejectedValue(new Error("Grant expired"));

      const task = createExecuteScheduledRunTask(deps);
      await task(payload);

      // Should create run record first
      expect(deps.createRun).toHaveBeenCalled();

      // Should mark as skipped (not success/error)
      expect(deps.markRunCompleted).toHaveBeenCalledWith(
        expect.any(String),
        "skipped",
        "Grant expired"
      );

      // Should NOT mark as started
      expect(deps.markRunStarted).not.toHaveBeenCalled();

      // Should still enqueue next run (schedule keeps ticking)
      expect(deps.enqueueJob).toHaveBeenCalled();
    });
  });

  describe("payload validation", () => {
    it("throws on missing scheduleId", async () => {
      const deps = createMockDeps();
      const task = createExecuteScheduledRunTask(deps);

      await expect(
        task({ scheduledFor: "2025-01-15T10:00:00.000Z" })
      ).rejects.toThrow();
    });

    it("throws on missing scheduledFor", async () => {
      const deps = createMockDeps();
      const task = createExecuteScheduledRunTask(deps);

      await expect(
        task({ scheduleId: FIXED_IDS.scheduleId })
      ).rejects.toThrow();
    });
  });
});
