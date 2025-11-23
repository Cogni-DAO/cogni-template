// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/auth/wallet-session`
 * Purpose: Unit tests for wallet-session consistency helper.
 * Scope: Tests computeWalletSessionAction pure function that determines when to sign out based on wallet state. Does not test React hooks or signOut side effects.
 * Invariants: Disconnected wallet returns sign_out; mismatched addresses return sign_out; matching addresses return none.
 * Side-effects: none
 * Notes: Tests the decision logic used by WalletConnectButton to enforce wallet-session consistency.
 * Links: src/shared/auth/wallet-session.ts, src/components/kit/auth/WalletConnectButton.tsx
 * @public
 */

import { describe, expect, it } from "vitest";

import type {
  NormalizedAddress,
  WalletSessionAction,
  WalletSessionState,
} from "@/shared/auth/wallet-session";
import {
  computeWalletSessionAction,
  normalizeWalletAddress,
} from "@/shared/auth/wallet-session";

// Test fixtures - all lowercase (normalized)
const ADDRESSES = {
  alice: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as NormalizedAddress,
  bob: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as NormalizedAddress,
} as const;

interface TestCase {
  name: string;
  state: WalletSessionState;
  expected: WalletSessionAction;
}

function runTestCases(cases: TestCase[]): void {
  cases.forEach(({ name, state, expected }) => {
    it(name, () => {
      expect(computeWalletSessionAction(state)).toBe(expected);
    });
  });
}

describe("computeWalletSessionAction", () => {
  describe("sign_out scenarios", () => {
    runTestCases([
      {
        name: "returns sign_out when wallet is disconnected",
        state: {
          isConnected: false,
          connectedAddress: null,
          sessionAddress: ADDRESSES.alice,
        },
        expected: "sign_out",
      },
      {
        name: "returns sign_out when no wallet address available",
        state: {
          isConnected: true,
          connectedAddress: null,
          sessionAddress: ADDRESSES.alice,
        },
        expected: "sign_out",
      },
      {
        name: "returns sign_out when wallet address doesn't match session",
        state: {
          isConnected: true,
          connectedAddress: ADDRESSES.bob,
          sessionAddress: ADDRESSES.alice,
        },
        expected: "sign_out",
      },
      {
        name: "returns sign_out when disconnected with null addresses",
        state: {
          isConnected: false,
          connectedAddress: null,
          sessionAddress: null,
        },
        expected: "sign_out",
      },
    ]);
  });

  describe("none scenarios - valid states", () => {
    runTestCases([
      {
        name: "returns none when wallet and session match",
        state: {
          isConnected: true,
          connectedAddress: ADDRESSES.alice,
          sessionAddress: ADDRESSES.alice,
        },
        expected: "none",
      },
      {
        name: "returns none when wallet connected but no session address yet",
        state: {
          isConnected: true,
          connectedAddress: ADDRESSES.alice,
          sessionAddress: null,
        },
        expected: "none",
      },
    ]);
  });
});

describe("normalizeWalletAddress", () => {
  it("returns null for undefined", () => {
    expect(normalizeWalletAddress(undefined)).toBe(null);
  });

  it("returns null for null", () => {
    expect(normalizeWalletAddress(null)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(normalizeWalletAddress("")).toBe(null);
  });

  it("lowercases valid address", () => {
    expect(
      normalizeWalletAddress("0X70997970C51812DC3A010C7D01B50E0D17DC79C8")
    ).toBe("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
  });

  it("returns already lowercase address unchanged", () => {
    expect(
      normalizeWalletAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8")
    ).toBe("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
  });

  it("lowercases mixed case address", () => {
    expect(normalizeWalletAddress("0xAbCdEf123456")).toBe("0xabcdef123456");
  });
});
