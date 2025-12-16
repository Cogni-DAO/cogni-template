// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/cogni-contracts/tests/abi-integrity`
 * Purpose: Validates ABI function selectors match expected Solidity signatures.
 * Scope: Integrity check only; does not test on-chain behavior.
 * Invariants: Function selectors must match keccak256 of canonical signatures.
 * Side-effects: none
 * Links: packages/cogni-contracts/src/cogni-signal/abi.ts
 * @public
 */

import { COGNI_SIGNAL_ABI } from "@cogni/cogni-contracts";
import { keccak256, stringToBytes, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

describe("CogniSignal ABI integrity", () => {
  /**
   * Verify DAO() function selector matches expected value.
   * Selector = first 4 bytes of keccak256("DAO()")
   */
  it("DAO() function selector is 0x98fabd3a", () => {
    const signature = "DAO()";
    const expectedSelector = "0x98fabd3a";

    // Compute selector from signature
    const computedHash = keccak256(stringToBytes(signature));
    const computedSelector = computedHash.slice(0, 10); // 0x + 8 hex chars

    expect(computedSelector).toBe(expectedSelector);

    // Also verify using viem's helper
    const viemSelector = toFunctionSelector(signature);
    expect(viemSelector).toBe(expectedSelector);
  });

  it("ABI DAO function matches expected signature", () => {
    const daoFn = COGNI_SIGNAL_ABI[1];

    // Reconstruct signature from ABI
    expect(daoFn?.name).toBe("DAO");
    expect(daoFn?.inputs).toHaveLength(0);

    // The signature should be "DAO()" with no parameters
    const reconstructedSignature = `${daoFn?.name}()`;
    expect(reconstructedSignature).toBe("DAO()");
  });

  it("constructor signature matches expected pattern", () => {
    const ctor = COGNI_SIGNAL_ABI[0];

    // Verify constructor takes single address param
    expect(ctor?.type).toBe("constructor");
    expect(ctor?.inputs).toHaveLength(1);
    expect(ctor?.inputs[0]?.type).toBe("address");

    // Constructor doesn't have a selector, but we verify the structure
    // matches what Solidity expects: constructor(address dao)
  });
});

describe("Bytecode integrity", () => {
  /**
   * The bytecode should contain the DAO() function selector.
   * This is a sanity check that the bytecode matches the ABI.
   */
  it("bytecode contains DAO() selector in deployed code section", async () => {
    const { COGNI_SIGNAL_BYTECODE } = await import("@cogni/cogni-contracts");

    // The function selector 98fabd3a should appear in the bytecode
    // (after the constructor, in the deployed runtime code)
    const selectorWithout0x = "98fabd3a";

    // Note: The selector appears in the runtime bytecode portion
    // This is a basic sanity check
    expect(COGNI_SIGNAL_BYTECODE.toLowerCase()).toContain(selectorWithout0x);
  });
});
