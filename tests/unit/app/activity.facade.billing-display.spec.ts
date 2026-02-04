// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/activity.facade.billing-display`
 * Purpose: Regression tests for USD billing display in Activity facade.
 * Scope: Ensures chargedCredits are properly converted to USD for display (prevents #184 regression). Does not test database integration.
 * Invariants:
 * - Activity rows must show responseCostUsd (USD), not chargedCredits (raw credits)
 * - 10M credits = $1 USD (CREDITS_PER_USD constant)
 * - Test uses realistic charge_receipts data (chargedCredits as bigint, responseCostUsd as decimal string)
 * Side-effects: none (pure unit test with mocks)
 * Links: src/app/_facades/ai/activity.server.ts, src/core/billing/pricing.ts
 * @internal
 */

import {
  TEST_SESSION_USER_1,
  TEST_SESSION_USER_2,
  TEST_SESSION_USER_3,
} from "@tests/_fakes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CREDITS_PER_USD } from "@/core/billing/pricing";

// Mock the dependencies before importing getActivity
const mockListUsageLogsByRange = vi.fn();
const mockListChargeReceipts = vi.fn();
const mockGetOrCreateBillingAccountForUser = vi.fn();

vi.mock("@/bootstrap/container", () => ({
  resolveActivityDeps: () => ({
    usageService: {
      listUsageLogsByRange: mockListUsageLogsByRange,
    },
    accountService: {
      listChargeReceipts: mockListChargeReceipts,
    },
  }),
}));

vi.mock("@/lib/auth/mapping", () => ({
  getOrCreateBillingAccountForUser: mockGetOrCreateBillingAccountForUser,
}));

// Import after mocks are set up
const { getActivity } = await import("@/app/_facades/ai/activity.server");

describe("Activity Facade - Billing Display Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateBillingAccountForUser.mockResolvedValue({
      id: "billing-test-123",
    });
  });
  it("should display responseCostUsd (USD), not chargedCredits (raw credits)", async () => {
    // Realistic scenario: $0.001023 charge = 10,230 credits
    const providerCostUsd = 0.0005115; // LiteLLM provider cost
    const markupFactor = 2.0; // 100% markup
    const userCostUsd = providerCostUsd * markupFactor; // = 0.001023 USD
    const chargedCredits = Math.ceil(userCostUsd * CREDITS_PER_USD); // = 10,230 credits

    const mockLog = {
      id: "litellm-call-123",
      timestamp: new Date("2024-01-01T12:00:00Z"),
      model: "anthropic/claude-sonnet-4.5",
      tokensIn: 298,
      tokensOut: 340,
      metadata: {
        app: "test-app",
        speed: 45.2,
        finishReason: "stop",
      },
    };

    const mockReceipt = {
      litellmCallId: "litellm-call-123",
      chargedCredits: chargedCredits.toString(), // "10230" (credits)
      responseCostUsd: userCostUsd.toFixed(6), // "0.001023" (USD)
      sourceSystem: "litellm" as const,
      createdAt: new Date("2024-01-01T12:00:00Z"),
    };

    mockListUsageLogsByRange.mockResolvedValue({
      logs: [mockLog],
    });
    mockListChargeReceipts.mockResolvedValue([mockReceipt]);

    const input = {
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
      limit: 10,
      sessionUser: TEST_SESSION_USER_1,
    };

    const result = await getActivity(input);

    // CRITICAL: Cost must be in USD (responseCostUsd), NOT raw credits (chargedCredits)
    // Before fix: would display "$10230.000000" (raw credits)
    // After fix: displays "$0.001023" (USD)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.cost).toBe("0.001023"); // USD string, not credits

    // Validate spend totals are also in USD
    const expectedSpend = Number.parseFloat(mockReceipt.responseCostUsd);
    expect(result.totals.spend.total).toBe(expectedSpend.toFixed(6));

    // Ensure chartSeries spend is also in USD
    const bucketWithSpend = result.chartSeries.find(
      (s) => Number.parseFloat(s.spend) > 0
    );
    expect(bucketWithSpend).toBeDefined();
    if (bucketWithSpend) {
      expect(Number.parseFloat(bucketWithSpend.spend)).toBeCloseTo(
        expectedSpend,
        6
      );
    }
  });

  it("should handle missing responseCostUsd gracefully (show '—')", async () => {
    const mockLog = {
      id: "litellm-call-no-cost",
      timestamp: new Date("2024-01-01T12:00:00Z"),
      model: "anthropic/claude-sonnet-4.5",
      tokensIn: 100,
      tokensOut: 150,
      metadata: {
        app: "test-app",
        speed: 42,
        finishReason: "stop",
      },
    };

    // Mock receipt with chargedCredits but NULL responseCostUsd (edge case: degraded billing)
    const mockReceipt = {
      litellmCallId: "litellm-call-no-cost",
      chargedCredits: "5000", // Has credits but no USD value recorded
      responseCostUsd: null, // NULL in DB
      sourceSystem: "litellm" as const,
      createdAt: new Date("2024-01-01T12:00:00Z"),
    };

    mockListUsageLogsByRange.mockResolvedValue({
      logs: [mockLog],
    });
    mockListChargeReceipts.mockResolvedValue([mockReceipt]);

    const input = {
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
      limit: 10,
      sessionUser: TEST_SESSION_USER_2,
    };

    const result = await getActivity(input);

    // When responseCostUsd is NULL, display should show "—" (not attempt credits conversion)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.cost).toBe("—");

    // Totals should be zero (no valid cost data)
    expect(result.totals.spend.total).toBe("0.000000");
  });

  it("should aggregate multiple charges correctly in USD", async () => {
    const logs = [
      {
        id: "call-1",
        timestamp: new Date("2024-01-01T12:00:00Z"),
        model: "gpt-4",
        tokensIn: 100,
        tokensOut: 150,
        metadata: {},
      },
      {
        id: "call-2",
        timestamp: new Date("2024-01-01T12:15:00Z"),
        model: "gpt-4",
        tokensIn: 200,
        tokensOut: 250,
        metadata: {},
      },
      {
        id: "call-3",
        timestamp: new Date("2024-01-01T12:30:00Z"),
        model: "gpt-4",
        tokensIn: 50,
        tokensOut: 75,
        metadata: {},
      },
    ];

    const receipts = [
      {
        litellmCallId: "call-1",
        chargedCredits: "12340", // 0.001234 USD in credits
        responseCostUsd: "0.001234",
        sourceSystem: "litellm" as const,
        createdAt: new Date("2024-01-01T12:00:00Z"),
      },
      {
        litellmCallId: "call-2",
        chargedCredits: "56780", // 0.005678 USD in credits
        responseCostUsd: "0.005678",
        sourceSystem: "litellm" as const,
        createdAt: new Date("2024-01-01T12:15:00Z"),
      },
      {
        litellmCallId: "call-3",
        chargedCredits: "9100", // 0.00091 USD in credits
        responseCostUsd: "0.000910",
        sourceSystem: "litellm" as const,
        createdAt: new Date("2024-01-01T12:30:00Z"),
      },
    ];

    mockListUsageLogsByRange.mockResolvedValue({
      logs,
    });
    mockListChargeReceipts.mockResolvedValue(receipts);

    const input = {
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
      limit: 10,
      sessionUser: TEST_SESSION_USER_3,
    };

    const result = await getActivity(input);

    // Verify individual row costs are in USD
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.cost).toBe("0.000910"); // call-3 (sorted desc by timestamp)
    expect(result.rows[1]?.cost).toBe("0.005678"); // call-2
    expect(result.rows[2]?.cost).toBe("0.001234"); // call-1

    // Verify total is sum of USD values, NOT sum of credits
    const expectedTotal = 0.001234 + 0.005678 + 0.00091; // = 0.007822 USD
    expect(result.totals.spend.total).toBe(expectedTotal.toFixed(6)); // "0.007822"

    // If we had mistakenly summed credits: 12340 + 56780 + 9100 = 78220 credits = $0.007822
    // But displaying as raw would show "$78220.000000" - the bug we're preventing
  });
});
