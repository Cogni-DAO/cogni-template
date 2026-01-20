// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/schemas/payloads`
 * Purpose: Zod schemas for Graphile Worker task payloads.
 * Scope: Validates payloads at task entry. Does not contain task logic.
 * Invariants:
 * - All tasks call Schema.parse(payload) before processing
 * - No `payload as X` casts allowed in tasks
 * Side-effects: none
 * Links: docs/SCHEDULER_SPEC.md
 * @internal
 */

import { z } from "zod";

/**
 * Payload schema for execute_scheduled_run task.
 */
export const ExecuteScheduledRunPayloadSchema = z.object({
  scheduleId: z.string().uuid(),
  scheduledFor: z.string().datetime(), // ISO 8601 timestamp
});

export type ExecuteScheduledRunPayload = z.infer<
  typeof ExecuteScheduledRunPayloadSchema
>;

/**
 * Payload schema for reconcile_schedules task.
 * Empty object - reconciler takes no payload.
 */
export const ReconcileSchedulesPayloadSchema = z.object({});

export type ReconcileSchedulesPayload = z.infer<
  typeof ReconcileSchedulesPayloadSchema
>;
