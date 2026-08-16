// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/governance/claim-surface-state`
 * Purpose: Verifies the Ownership claim-surface state machine (story.5003) — every "empty"
 *   rendering must be the MOST specific state the readable ground truth proves.
 * Scope: Unit tests for the pure deriveClaimSurfaceState only. Does not test hooks, HTTP
 *   routes, or chain reads.
 * Invariants:
 * - HONEST_EMPTY: not-activated ≠ not-published ≠ no-allocation ≠ fully-claimed.
 * - LEAF_BEATS_STALE_SPEC: a real leaf outranks a lagging repo-spec activation record.
 * - ROOT_GATED_CTA: claimable only when the leaf root equals the live on-chain root.
 * Side-effects: none
 * Links: src/features/governance/lib/claim-surface-state.ts
 * @internal
 */

import type { LatestDistributionClaimDto } from "@cogni/node-contracts";
import { describe, expect, it } from "vitest";

import {
  type ClaimSurfaceInput,
  deriveClaimSurfaceState,
  ZERO_MERKLE_ROOT,
} from "@/features/governance/lib/claim-surface-state";

const DISTRIBUTOR = "0x6666666666666666666666666666666666666666";
const ROOT = `0x${"ab".repeat(32)}`;
const NEWER_ROOT = `0x${"cd".repeat(32)}`;

function leaf(
  overrides: Partial<LatestDistributionClaimDto> = {}
): LatestDistributionClaimDto {
  return {
    epochId: "17",
    root: ROOT,
    distributor: DISTRIBUTOR,
    chainId: 8453,
    tokenAddress: "0x2222222222222222222222222222222222222222",
    account: "0x1111111111111111111111111111111111111111",
    amount: (12000n * 10n ** 18n).toString(),
    proof: [],
    ...overrides,
  };
}

/** Baseline: activated node, distributor recorded, published root, connected wallet. */
function input(overrides: Partial<ClaimSurfaceInput> = {}): ClaimSurfaceInput {
  return {
    walletConnected: true,
    configLoading: false,
    distributionsActive: true,
    configDistributor: DISTRIBUTOR,
    claim: null,
    claimLoading: false,
    claimError: null,
    onChainRoot: ROOT,
    cumulativeClaimed: undefined,
    claimedLoading: false,
    ...overrides,
  };
}

describe("deriveClaimSurfaceState — empty states are first-class", () => {
  it("not_activated when repo-spec distributions.status is not active", () => {
    expect(
      deriveClaimSurfaceState(
        input({
          distributionsActive: false,
          configDistributor: null,
          onChainRoot: undefined,
        })
      )
    ).toEqual({ kind: "not_activated" });
  });

  it("not_activated even without a wallet (state is wallet-independent)", () => {
    expect(
      deriveClaimSurfaceState(
        input({
          walletConnected: false,
          distributionsActive: false,
          configDistributor: null,
          onChainRoot: undefined,
        })
      )
    ).toEqual({ kind: "not_activated" });
  });

  it("not_published when activated but no distributor is recorded", () => {
    expect(
      deriveClaimSurfaceState(
        input({ configDistributor: null, onChainRoot: undefined })
      )
    ).toEqual({ kind: "not_published", pendingAllocation: null });
  });

  it("not_published when the on-chain root is still zero", () => {
    expect(
      deriveClaimSurfaceState(input({ onChainRoot: ZERO_MERKLE_ROOT }))
    ).toEqual({ kind: "not_published", pendingAllocation: null });
  });

  it("no_allocation ONLY when a published root exists and the wallet has no leaf", () => {
    expect(deriveClaimSurfaceState(input())).toEqual({
      kind: "no_allocation",
    });
  });

  it("wallet_disconnected when a published distribution may apply", () => {
    expect(deriveClaimSurfaceState(input({ walletConnected: false }))).toEqual({
      kind: "wallet_disconnected",
    });
  });

  it("wallet_disconnected (not loading) while the root is still reading and no wallet", () => {
    expect(
      deriveClaimSurfaceState(
        input({ walletConnected: false, onChainRoot: undefined })
      )
    ).toEqual({ kind: "wallet_disconnected" });
  });

  it("loading while the connected wallet's claim fetch is in flight", () => {
    expect(deriveClaimSurfaceState(input({ claimLoading: true }))).toEqual({
      kind: "loading",
    });
  });

  it("chain_unavailable when the root read failed — never a fake empty", () => {
    expect(deriveClaimSurfaceState(input({ onChainRoot: null }))).toEqual({
      kind: "chain_unavailable",
    });
  });
});

describe("deriveClaimSurfaceState — leaf-bearing states", () => {
  it("claimable when leaf root matches the live root and a remainder exists", () => {
    const claim = leaf();
    const state = deriveClaimSurfaceState(
      input({ claim, cumulativeClaimed: 2000n * 10n ** 18n })
    );
    expect(state).toEqual({
      kind: "claimable",
      claim,
      cumulativeAmount: 12000n * 10n ** 18n,
      cumulativeClaimed: 2000n * 10n ** 18n,
      claimable: 10000n * 10n ** 18n,
    });
  });

  it("fully_claimed (never an empty state) when cumulativeClaimed covers the leaf", () => {
    const amount = 12000n * 10n ** 18n;
    expect(
      deriveClaimSurfaceState(
        input({ claim: leaf(), cumulativeClaimed: amount })
      )
    ).toEqual({
      kind: "fully_claimed",
      cumulativeAmount: amount,
      cumulativeClaimed: amount,
    });
  });

  it("root_pending (no CTA) when the leaf targets a root that is not live on-chain", () => {
    expect(
      deriveClaimSurfaceState(
        input({
          claim: leaf({ root: NEWER_ROOT }),
          cumulativeClaimed: 3n,
        })
      )
    ).toEqual({
      kind: "root_pending",
      cumulativeAmount: 12000n * 10n ** 18n,
      cumulativeClaimed: 3n,
    });
  });

  it("root comparison is case-insensitive (no false root_pending)", () => {
    const state = deriveClaimSurfaceState(
      input({
        claim: leaf({ root: ROOT.toUpperCase().replace("0X", "0x") }),
        cumulativeClaimed: 0n,
      })
    );
    expect(state.kind).toBe("claimable");
  });

  it("not_published with the pending allocation when the leaf exists but root is zero", () => {
    expect(
      deriveClaimSurfaceState(
        input({ claim: leaf(), onChainRoot: ZERO_MERKLE_ROOT })
      )
    ).toEqual({
      kind: "not_published",
      pendingAllocation: 12000n * 10n ** 18n,
    });
  });

  it("not_published with the pending allocation when no distributor is recorded anywhere", () => {
    expect(
      deriveClaimSurfaceState(
        input({
          claim: leaf({ distributor: null }),
          configDistributor: null,
          onChainRoot: undefined,
        })
      )
    ).toEqual({
      kind: "not_published",
      pendingAllocation: 12000n * 10n ** 18n,
    });
  });

  it("LEAF_BEATS_STALE_SPEC: a live leaf renders claimable even if repo-spec lags inactive", () => {
    const state = deriveClaimSurfaceState(
      input({
        distributionsActive: false,
        claim: leaf(),
        cumulativeClaimed: 0n,
      })
    );
    expect(state.kind).toBe("claimable");
  });

  it("chain_unavailable when a leaf exists but the root read failed", () => {
    expect(
      deriveClaimSurfaceState(input({ claim: leaf(), onChainRoot: null }))
    ).toEqual({ kind: "chain_unavailable" });
  });

  it("loading while cumulativeClaimed is unread for a matching root", () => {
    expect(
      deriveClaimSurfaceState(input({ claim: leaf(), claimedLoading: true }))
    ).toEqual({ kind: "loading" });
  });
});

describe("deriveClaimSurfaceState — errors", () => {
  it("surfaces the off-chain claim fetch error", () => {
    const error = new Error("boom");
    expect(deriveClaimSurfaceState(input({ claimError: error }))).toEqual({
      kind: "error",
      error,
    });
  });
});
