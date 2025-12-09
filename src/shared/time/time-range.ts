// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/time/time-range`
 * Purpose: Date utility helpers for time range calculations.
 * Scope: Pure date math. Does not perform I/O, access server time, or import from other layers.
 * Invariants: All functions are pure, UTC-based. No external dependencies.
 * Side-effects: none
 * Links: [activity.route](../../app/api/v1/activity/route.ts)
 * @public
 */

/**
 * Time range presets for rolling windows.
 * Contracts and UI import from here to maintain dependency direction.
 */
export const TIME_RANGE_PRESETS = ["1d", "1w", "1m"] as const;
export type TimeRange = (typeof TIME_RANGE_PRESETS)[number];

/**
 * Compute date range from preset using a reference date.
 * Used by both client (display) and server (data fetch).
 *
 * @param range - Time range preset (1d, 1w, 1m)
 * @param now - Reference date (typically server or client now)
 * @returns {from, to} where to is exclusive
 */
export function deriveTimeRange(
  range: TimeRange,
  now: Date = new Date()
): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);

  switch (range) {
    case "1d":
      from.setDate(from.getDate() - 1);
      break;
    case "1w":
      from.setDate(from.getDate() - 7);
      break;
    case "1m":
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from, to };
}
