// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tests/fixtures`
 * Purpose: Reusable test fixtures for scheduler-worker unit tests.
 * Scope: Provides mock data for schedule, grant, and task payloads. Does not import from src/.
 * Invariants: All UUIDs are valid; all data matches expected schemas.
 * Side-effects: none (pure functions)
 * Links: tests/*.test.ts
 * @internal
 */

import { randomUUID } from "node:crypto";

/**
 * Fixed UUIDs for deterministic tests.
 * Use these when you need stable IDs across test assertions.
 */
export const FIXED_IDS = {
  scheduleId: "00000000-0000-0000-0000-000000000001",
  graphId: "00000000-0000-0000-0000-000000000002",
  grantId: "00000000-0000-0000-0000-000000000003",
  userId: "00000000-0000-0000-0000-000000000004",
  billingAccountId: "00000000-0000-0000-0000-000000000005",
  runId: "00000000-0000-0000-0000-000000000006",
} as const;

/**
 * Creates a mock schedule with valid UUIDs.
 */
export function createMockSchedule(overrides?: {
  id?: string;
  enabled?: boolean;
  cron?: string;
  timezone?: string;
  graphId?: string;
  executionGrantId?: string;
}) {
  return {
    id: overrides?.id ?? FIXED_IDS.scheduleId,
    enabled: overrides?.enabled ?? true,
    cron: overrides?.cron ?? "0 * * * *",
    timezone: overrides?.timezone ?? "UTC",
    graphId: overrides?.graphId ?? FIXED_IDS.graphId,
    executionGrantId: overrides?.executionGrantId ?? FIXED_IDS.grantId,
  };
}

/**
 * Creates a mock execution grant with valid UUIDs.
 */
export function createMockGrant(overrides?: {
  id?: string;
  userId?: string;
  billingAccountId?: string;
  scopes?: readonly string[];
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  createdAt?: Date;
}) {
  const graphId = FIXED_IDS.graphId;
  return {
    id: overrides?.id ?? FIXED_IDS.grantId,
    userId: overrides?.userId ?? FIXED_IDS.userId,
    billingAccountId: overrides?.billingAccountId ?? FIXED_IDS.billingAccountId,
    scopes:
      overrides?.scopes ?? ([`graph:execute:${graphId}`] as readonly string[]),
    expiresAt: overrides?.expiresAt ?? null,
    revokedAt: overrides?.revokedAt ?? null,
    createdAt: overrides?.createdAt ?? new Date("2025-01-01T00:00:00.000Z"),
  };
}

/**
 * Creates a valid execute_scheduled_run payload.
 */
export function createExecuteRunPayload(overrides?: {
  scheduleId?: string;
  scheduledFor?: string;
}) {
  return {
    scheduleId: overrides?.scheduleId ?? FIXED_IDS.scheduleId,
    scheduledFor: overrides?.scheduledFor ?? "2025-01-15T10:00:00.000Z",
  };
}

/**
 * Creates a list of stale schedules for reconciliation tests.
 */
export function createStaleSchedulesList(count = 2) {
  return Array.from({ length: count }, () => ({
    id: randomUUID(),
    cron: "0 * * * *",
    timezone: "UTC",
  }));
}
