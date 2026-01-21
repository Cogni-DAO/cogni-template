// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/utils/cron`
 * Purpose: Cron expression parsing utilities.
 * Scope: Computes next run time from cron+timezone. Does not validate cron syntax.
 * Invariants: Always returns a future date (after now).
 * Side-effects: none
 * Links: docs/SCHEDULER_SPEC.md
 * @internal
 */

import cronParser from "cron-parser";

/**
 * Computes the next run time from a cron expression and timezone.
 * Returns a future date (after now).
 */
export function computeNextCronTime(cron: string, timezone: string): Date {
  const interval = cronParser.parseExpression(cron, {
    currentDate: new Date(),
    tz: timezone,
  });
  return interval.next().toDate();
}
