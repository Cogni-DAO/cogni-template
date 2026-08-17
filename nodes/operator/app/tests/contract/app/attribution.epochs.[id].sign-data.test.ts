// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/app/attribution.epochs.[id].sign-data`
 * Purpose: Contract test for EIP-712 sign-data endpoint output schema.
 * Scope: Validates Zod output schema against representative data shapes. Does not test runtime behavior.
 * Invariants: SIGNATURE_SCOPE_BOUND, EIP712_DETERMINISTIC.
 * Side-effects: none
 * Links: packages/node-contracts/src/attribution.sign-data.v2.contract, app/api/v1/attribution/epochs/[id]/sign-data/route
 * @public
 */

import { signDataV2Operation } from "@cogni/node-contracts";
import { describe, expect, it } from "vitest";

const VALID_SIGN_DATA = {
  domain: {
    name: "Cogni Attribution",
    version: "2",
    chainId: 8453,
  },
  types: {
    AttributionStatement: [
      { name: "nodeId", type: "string" },
      { name: "scopeId", type: "string" },
      { name: "epochId", type: "string" },
      { name: "deploymentEnvironment", type: "string" },
      { name: "finalAllocationSetHash", type: "string" },
      { name: "poolTotalCredits", type: "string" },
    ],
  },
  primaryType: "AttributionStatement",
  message: {
    nodeId: "4ff8eac1-4eba-4ed0-931b-b1fe4f64713d",
    scopeId: "a28a8b1e-1f9d-5cd5-9329-569e4819feda",
    epochId: "42",
    deploymentEnvironment: "candidate-a",
    finalAllocationSetHash: "abc123def456",
    poolTotalCredits: "10000",
  },
};

describe("ledger.sign-data.v2 contract", () => {
  it("validates a well-formed EIP-712 typed data response", () => {
    expect(() =>
      signDataV2Operation.output.parse(VALID_SIGN_DATA)
    ).not.toThrow();
  });

  it("includes all SIGNATURE_SCOPE_BOUND fields in message", () => {
    const parsed = signDataV2Operation.output.parse(VALID_SIGN_DATA);
    expect(parsed.message).toHaveProperty("nodeId");
    expect(parsed.message).toHaveProperty("scopeId");
    expect(parsed.message).toHaveProperty("epochId");
    expect(parsed.message).toHaveProperty("deploymentEnvironment");
    expect(parsed.message).toHaveProperty("finalAllocationSetHash");
    expect(parsed.message).toHaveProperty("poolTotalCredits");
  });

  it("requires primaryType to be AttributionStatement", () => {
    const invalid = { ...VALID_SIGN_DATA, primaryType: "WrongType" };
    const result = signDataV2Operation.output.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing domain", () => {
    const { domain: _, ...rest } = VALID_SIGN_DATA;
    const result = signDataV2Operation.output.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing message fields", () => {
    const invalid = {
      ...VALID_SIGN_DATA,
      message: { nodeId: "test" }, // missing other fields
    };
    const result = signDataV2Operation.output.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects legacy v1 domain and a missing deployment environment", () => {
    const { deploymentEnvironment: _, ...legacyMessage } =
      VALID_SIGN_DATA.message;
    const legacy = {
      ...VALID_SIGN_DATA,
      domain: { ...VALID_SIGN_DATA.domain, version: "1" },
      message: legacyMessage,
    };
    expect(signDataV2Operation.output.safeParse(legacy).success).toBe(false);
  });

  it("rejects unsupported deployment environments", () => {
    const invalid = {
      ...VALID_SIGN_DATA,
      message: {
        ...VALID_SIGN_DATA.message,
        deploymentEnvironment: "candidate-b",
      },
    };
    expect(signDataV2Operation.output.safeParse(invalid).success).toBe(false);
  });
});
