// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/schedule-run`
 * Purpose: Schedule run repository port for execution ledger.
 * Scope: Defines contract for run record persistence. Does not contain implementations.
 * Invariants:
 * - Every scheduled execution creates a run record with status progression
 * - UNIQUE(schedule_id, scheduled_for) prevents duplicate run records per slot
 * - Used by worker task, not by schedule CRUD adapter
 * - actorId required on all methods for RLS SET LOCAL / audit trail
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, types/scheduling.ts, DrizzleScheduleRunAdapter
 * @public
 */

import type { ActorId } from "@cogni/ids";

// Re-export types for adapter convenience
export type { ScheduleRun, ScheduleRunStatus } from "../types";

// Import for local use in interface
import type { ScheduleRun } from "../types";

/**
 * Schedule run repository for execution ledger.
 * Separate from ScheduleUserPort per P0 feedback.
 * Function properties (not methods) for contravariant param checking on branded types.
 */
export interface ScheduleRunRepository {
  /**
   * Creates a run record when job starts executing.
   * Status defaults to 'pending'.
   * @param actorId - Actor performing the operation (for RLS SET LOCAL / audit trail)
   */
  createRun: (
    actorId: ActorId,
    params: {
      scheduleId: string;
      runId: string;
      scheduledFor: Date;
    }
  ) => Promise<ScheduleRun>;

  /**
   * Marks run as started (status = 'running', sets startedAt).
   * @param actorId - Actor performing the operation (for RLS SET LOCAL / audit trail)
   */
  markRunStarted: (
    actorId: ActorId,
    runId: string,
    langfuseTraceId?: string
  ) => Promise<void>;

  /**
   * Marks run as completed with final status.
   * @param actorId - Actor performing the operation (for RLS SET LOCAL / audit trail)
   */
  markRunCompleted: (
    actorId: ActorId,
    runId: string,
    status: "success" | "error" | "skipped",
    errorMessage?: string
  ) => Promise<void>;
}
