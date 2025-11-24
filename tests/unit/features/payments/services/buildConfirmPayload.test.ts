// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/payments/utils/buildConfirmPayload`
 * Purpose: Validates payment confirmation payload builder with pure function tests.
 * Scope: Tests USD to cents conversion, clientPaymentId derivation, metadata construction. Does NOT test network calls or database operations.
 * Invariants: txHash becomes clientPaymentId; amountUsd converts to cents; metadata preserves all fields
 * Side-effects: none (pure function tests)
 * Notes: Critical tests for idempotency key generation and payment amount precision
 * Links: src/features/payments/services/buildConfirmPayload.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { buildConfirmPayload } from "@/features/payments/services/buildConfirmPayload";

describe("buildConfirmPayload", () => {
  it("should convert USD amount to cents correctly", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 25.0);

    expect(payload.amountUsdCents).toBe(2500);
  });

  it("should handle floating point precision with rounding", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    // Test edge cases that could cause floating point errors
    expect(buildConfirmPayload(txInfo, 10.01).amountUsdCents).toBe(1001);
    expect(buildConfirmPayload(txInfo, 0.1).amountUsdCents).toBe(10);
    expect(buildConfirmPayload(txInfo, 99.99).amountUsdCents).toBe(9999);

    // Edge case: 19.995 should round to 2000 cents ($20.00)
    expect(buildConfirmPayload(txInfo, 19.995).amountUsdCents).toBe(2000);
  });

  it("should use txHash as clientPaymentId for idempotency", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 10.0);

    expect(payload.clientPaymentId).toBe("0xabcdef1234567890");
  });

  it("should fallback to UUID when txHash is 'unknown'", () => {
    const txInfo = {
      txHash: "unknown",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 10.0);

    // Should be a valid UUID format
    expect(payload.clientPaymentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(payload.clientPaymentId).not.toBe("unknown");
  });

  it("should fallback to UUID when txHash is empty string", () => {
    const txInfo = {
      txHash: "",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 10.0);

    expect(payload.clientPaymentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should include all metadata fields", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 25.0);

    expect(payload.metadata).toEqual({
      provider: "depay",
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
      timestamp: expect.any(String),
    });
  });

  it("should allow overriding provider metadata", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 10.0, "custom-provider");

    expect(payload.metadata?.provider).toBe("custom-provider");
  });

  it("should generate ISO timestamp in metadata", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload = buildConfirmPayload(txInfo, 10.0);

    // Should be valid ISO 8601 format
    expect(payload.metadata).toBeDefined();
    if (!payload.metadata) throw new Error("metadata should be defined");
    const timestamp = payload.metadata.timestamp;
    expect(timestamp).toBeDefined();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("should preserve blockchain and token from txInfo", () => {
    const txInfo = {
      txHash: "0xabcdef1234567890",
      blockchain: "polygon",
      token: "USDT",
    };

    const payload = buildConfirmPayload(txInfo, 10.0);

    expect(payload.metadata?.blockchain).toBe("polygon");
    expect(payload.metadata?.token).toBe("USDT");
  });

  it("should generate unique UUIDs for multiple calls with unknown hash", () => {
    const txInfo = {
      txHash: "unknown",
      blockchain: "ethereum",
      token: "USDC",
    };

    const payload1 = buildConfirmPayload(txInfo, 10.0);
    const payload2 = buildConfirmPayload(txInfo, 10.0);

    // Each call should generate a different UUID
    expect(payload1.clientPaymentId).not.toBe(payload2.clientPaymentId);
  });
});
