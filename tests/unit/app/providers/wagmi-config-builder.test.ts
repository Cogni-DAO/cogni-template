// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@unit/app/providers/wagmi-config-builder`
 * Purpose: Unit tests for wagmi config builder pure function.
 * Scope: Tests chain configuration and conditional connector logic with simple TestConnector type. Does not test React or dynamic imports.
 * Invariants: Sepolia hardcoded for MVP; WalletConnect conditional on projectId; injected always present.
 * Side-effects: none (unit tests with mocks)
 * Notes: Uses generic ConnectorsLib<TestConnector> for fully-typed test fakes. No any casts needed.
 * Links: Tests @app/providers/wagmi-config-builder
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildWagmiConfigOptions,
  type ConnectorsLib,
  type WalletEnv,
} from "@/app/providers/wagmi-config-builder";
import { CHAIN } from "@/shared/web3";

interface TestConnector {
  kind: "injected" | "wc";
}

describe("buildWagmiConfigOptions", () => {
  it("should include configured chain only (Base)", () => {
    const env: WalletEnv = {
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: undefined,
    };

    const connectorsLib: ConnectorsLib<TestConnector> = {
      injected: vi.fn(() => ({ kind: "injected" as const })),
      walletConnect: vi.fn(() => ({ kind: "wc" as const })),
    };

    const result = buildWagmiConfigOptions(env, connectorsLib);

    expect(result.chains).toEqual([CHAIN]);
    expect(result.transports).toHaveProperty(CHAIN.id.toString());
  });

  it("should include WalletConnect connector when projectId is present", () => {
    const env: WalletEnv = {
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test-project-id",
    };

    const connectorsLib: ConnectorsLib<TestConnector> = {
      injected: vi.fn(() => ({ kind: "injected" as const })),
      walletConnect: vi.fn(() => ({ kind: "wc" as const })),
    };

    const result = buildWagmiConfigOptions(env, connectorsLib);

    // Both connectors should be called
    expect(connectorsLib.injected).toHaveBeenCalledOnce();
    expect(connectorsLib.walletConnect).toHaveBeenCalledOnce();
    expect(connectorsLib.walletConnect).toHaveBeenCalledWith({
      projectId: "test-project-id",
    });

    // Result should have 2 connectors
    expect(result.connectors).toHaveLength(2);
    expect(result.connectors[0]).toEqual({ kind: "injected" });
    expect(result.connectors[1]).toEqual({ kind: "wc" });
  });

  it("should use injected-only fallback when projectId is missing", () => {
    const env: WalletEnv = {
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: undefined,
    };

    const connectorsLib: ConnectorsLib<TestConnector> = {
      injected: vi.fn(() => ({ kind: "injected" as const })),
      walletConnect: vi.fn(() => ({ kind: "wc" as const })),
    };

    const result = buildWagmiConfigOptions(env, connectorsLib);

    // Only injected should be called
    expect(connectorsLib.injected).toHaveBeenCalledOnce();
    expect(connectorsLib.walletConnect).not.toHaveBeenCalled();

    // Result should have 1 connector
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0]).toEqual({ kind: "injected" });
  });
});
