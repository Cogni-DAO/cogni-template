// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/schedules.create.v1.contract`
 * Purpose: Defines operation contract for creating a schedule.
 * Scope: Provides Zod schema and types for schedule creation wire format. Does not contain business logic.
 * Invariants:
 *   - Contract remains stable; breaking changes require new version
 *   - All consumers use z.infer types
 *   - Cron must be valid 5-field expression
 *   - Timezone must be valid IANA timezone
 * Side-effects: none
 * Links: /api/v1/schedules route, docs/SCHEDULER_SPEC.md
 * @internal
 */

import { z } from "zod";

/**
 * Schedule creation input schema.
 */
export const ScheduleCreateInputSchema = z.object({
  /** Graph ID in format provider:name (e.g., "langgraph:poet") */
  graphId: z.string().min(1),
  /** Graph input payload (messages, model, etc.) */
  input: z.record(z.string(), z.unknown()),
  /** 5-field cron expression (e.g., "0 9 * * *" for 9am daily) */
  cron: z.string().min(1),
  /** IANA timezone (e.g., "UTC", "America/New_York") */
  timezone: z.string().min(1),
});

/**
 * Schedule response schema (returned after creation).
 */
export const ScheduleResponseSchema = z.object({
  id: z.string().uuid(),
  graphId: z.string(),
  input: z.record(z.string(), z.unknown()),
  cron: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.string().datetime().nullable(),
  lastRunAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const schedulesCreateOperation = {
  id: "schedules.create.v1",
  summary: "Create a new schedule",
  description:
    "Creates a cron-based schedule for recurring graph execution. Returns the created schedule with next run time.",
  input: ScheduleCreateInputSchema,
  output: ScheduleResponseSchema,
} as const;

// Export inferred types - all consumers MUST use these, never manual interfaces
export type ScheduleCreateInput = z.infer<typeof ScheduleCreateInputSchema>;
export type ScheduleResponse = z.infer<typeof ScheduleResponseSchema>;
