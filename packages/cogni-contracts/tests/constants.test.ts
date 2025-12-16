// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/cogni-contracts/tests/constants`
 * Purpose: Validates CogniSignal ABI and bytecode constants have expected structure.
 * Scope: Tests constant shape and format; does not test on-chain behavior.
 * Invariants: ABI must have constructor + DAO function; bytecode must be valid hex.
 * Side-effects: none
 * Links: packages/cogni-contracts/src/cogni-signal/
 * @public
 */

import {
  COGNI_SIGNAL_ABI,
  COGNI_SIGNAL_BYTECODE,
} from "@cogni/cogni-contracts";
import { describe, expect, it } from "vitest";

describe("COGNI_SIGNAL_ABI structure", () => {
  it("is an array with exactly 2 elements", () => {
    expect(Array.isArray(COGNI_SIGNAL_ABI)).toBe(true);
    expect(COGNI_SIGNAL_ABI).toHaveLength(2);
  });

  it("has constructor as first element", () => {
    const ctor = COGNI_SIGNAL_ABI[0];
    expect(ctor).toBeDefined();
    expect(ctor?.type).toBe("constructor");
    expect(ctor?.stateMutability).toBe("nonpayable");
  });

  it("constructor has single 'dao' address input", () => {
    const ctor = COGNI_SIGNAL_ABI[0];
    expect(ctor?.inputs).toHaveLength(1);
    expect(ctor?.inputs[0]?.name).toBe("dao");
    expect(ctor?.inputs[0]?.type).toBe("address");
  });

  it("has DAO function as second element", () => {
    const daoFn = COGNI_SIGNAL_ABI[1];
    expect(daoFn).toBeDefined();
    expect(daoFn?.type).toBe("function");
    expect(daoFn?.name).toBe("DAO");
    expect(daoFn?.stateMutability).toBe("view");
  });

  it("DAO function takes no inputs and returns address", () => {
    const daoFn = COGNI_SIGNAL_ABI[1];
    expect(daoFn?.inputs).toHaveLength(0);
    expect(daoFn?.outputs).toHaveLength(1);
    expect(daoFn?.outputs[0]?.type).toBe("address");
  });
});

describe("COGNI_SIGNAL_BYTECODE format", () => {
  it("is a string starting with 0x", () => {
    expect(typeof COGNI_SIGNAL_BYTECODE).toBe("string");
    expect(COGNI_SIGNAL_BYTECODE.startsWith("0x")).toBe(true);
  });

  it("is valid hexadecimal", () => {
    const hexPattern = /^0x[0-9a-fA-F]+$/;
    expect(hexPattern.test(COGNI_SIGNAL_BYTECODE)).toBe(true);
  });

  it("has reasonable length (compiled contract bytecode)", () => {
    // CogniSignal compiled bytecode should be ~1700+ chars (850+ bytes)
    // This catches accidental truncation or placeholder values
    expect(COGNI_SIGNAL_BYTECODE.length).toBeGreaterThan(500);
    // But not absurdly large
    expect(COGNI_SIGNAL_BYTECODE.length).toBeLessThan(10000);
  });

  it("is not a placeholder value", () => {
    // Catch common placeholder patterns
    expect(COGNI_SIGNAL_BYTECODE).not.toBe("0x");
    expect(COGNI_SIGNAL_BYTECODE).not.toBe("0x00");
    expect(COGNI_SIGNAL_BYTECODE).not.toMatch(/^0x0+$/);
  });
});
