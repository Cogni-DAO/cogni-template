// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tests/cron`
 * Purpose: Unit tests for cron utilities.
 * Scope: Tests computeNextCronTime with various cron expressions and timezones. Does not test invalid cron validation.
 * Invariants: Deterministic tests with mocked system time.
 * Side-effects: none
 * Links: src/utils/cron.ts
 * @internal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeNextCronTime } from "../src/utils/cron";

describe("computeNextCronTime", () => {
  const MOCK_DATE = new Date("2025-01-15T10:30:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes next run for hourly cron", () => {
    // "0 * * * *" = at minute 0 of every hour
    const next = computeNextCronTime("0 * * * *", "UTC");

    // At 10:30, next :00 is 11:00
    expect(next.getUTCHours()).toBe(11);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it("computes next run for every-15-minutes cron", () => {
    // "*/15 * * * *" = every 15 minutes
    const next = computeNextCronTime("*/15 * * * *", "UTC");

    // At 10:30, next 15-min mark is 10:45
    expect(next.getUTCHours()).toBe(10);
    expect(next.getUTCMinutes()).toBe(45);
  });

  it("respects timezone", () => {
    // "0 9 * * *" = 9:00 AM daily
    // Current time: 2025-01-15T10:30:00.000Z (UTC)
    // In America/New_York (EST = UTC-5), that's 5:30 AM
    // Next 9:00 AM EST = 14:00 UTC same day
    const next = computeNextCronTime("0 9 * * *", "America/New_York");

    expect(next.getUTCHours()).toBe(14); // 9 AM EST = 14:00 UTC
    expect(next.getUTCMinutes()).toBe(0);
  });

  it("returns future date (never past)", () => {
    const next = computeNextCronTime("*/5 * * * *", "UTC");
    expect(next.getTime()).toBeGreaterThan(MOCK_DATE.getTime());
  });

  it("throws for invalid cron expression", () => {
    expect(() => computeNextCronTime("invalid", "UTC")).toThrow();
  });
});
