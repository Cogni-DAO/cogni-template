"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/YourPositionPanel`
 * Purpose: "Your position" section of the Ownership page — the connected viewer's current on-chain
 *   wallet balance shown independently from lifetime attribution allocation and the existing
 *   claimable-now affordance. Fungible token provenance is never inferred by subtraction.
 * Scope: Client component. Sources the node's token/chain from repo-spec via useNodeTokenomicsConfig
 *   (so the on-chain wallet balance reads even with NO claim leaf), the viewer's earned-via-attribution
 *   allocation from useCumulativeClaim, and the viewer's on-chain token balance via useNodeTokenomics.
 *   Reuses CumulativeClaimPanel for the claim UX (embedded `bare` — chrome only; no claim-math changes). Does not perform DB access.
 * Invariants:
 *   - CONFIG_NOT_MANIFEST: the node token whose balance we read comes from repo-spec, never the claim leaf.
 *   - ALL_MATH_BIGINT: balances/allocations stay bigint; formatted only at display.
 *   - BALANCE_IS_NOT_PROVENANCE: current wallet balance and lifetime allocation are independent facts;
 *     transfers mean neither may be subtracted from the other to infer where tokens came from.
 *   - CLAIM_UNCHANGED: the Claim affordance is the untouched CumulativeClaimPanel; this panel only frames it.
 * Side-effects: IO (config fetch); blockchain read (viewer balance via useNodeTokenomics; claim state via useCumulativeClaim).
 * Links: nodes/operator/app/src/features/governance/components/CumulativeClaimPanel.tsx, nodes/operator/app/src/features/governance/hooks/useCumulativeClaim.ts
 * @public
 */

import type { ReactElement } from "react";
import { useAccount } from "wagmi";

import { SectionCard } from "@/components";
import { CumulativeClaimPanel } from "@/features/governance/components/CumulativeClaimPanel";
import { useCumulativeClaim } from "@/features/governance/hooks/useCumulativeClaim";
import {
  useNodeTokenomics,
  useNodeTokenomicsConfig,
} from "@/features/governance/hooks/useNodeTokenomics";
import { formatTokenAmount } from "@/features/governance/lib/format-token-amount";

export function YourPositionPanel(): ReactElement {
  const { address, isConnected } = useAccount();

  return (
    <SectionCard title="Your position">
      {!isConnected || !address ? (
        <p className="text-muted-foreground text-sm">
          Connect your wallet below to see your full token holdings.
        </p>
      ) : (
        <ConnectedPosition account={address} />
      )}
      {/* Claim affordance — embedded bare (no nested Card) so it reads as a flat section. */}
      <CumulativeClaimPanel bare />
    </SectionCard>
  );
}

function ConnectedPosition({
  account,
}: {
  account: `0x${string}`;
}): ReactElement {
  const {
    claim,
    isLoading: isAllocationLoading,
    error: allocationError,
  } = useCumulativeClaim(account);

  // CONFIG_NOT_MANIFEST: read the node token from repo-spec so the on-chain wallet
  // balance resolves even when this viewer has no claim leaf (e.g. a pure formation
  // holder, or a freshly seeded node with zero finalized epochs).
  const { data: config, isLoading: isConfigLoading } =
    useNodeTokenomicsConfig();
  const token = config?.tokenAddress ?? null;
  const chainId = config?.chainId;

  const {
    viewerBalance,
    isLoading: isBalanceLoading,
    error: balanceError,
  } = useNodeTokenomics({
    token,
    distributor: null,
    viewer: account,
    chainId,
  });

  const balanceValue = (() => {
    if (viewerBalance !== undefined) return formatTokenAmount(viewerBalance);
    if (isBalanceLoading || isConfigLoading) return "…";
    if (balanceError) return "unavailable";
    if (!token) return "No token configured";
    return "unavailable";
  })();

  const lifetimeAllocationValue = (() => {
    if (claim) return formatTokenAmount(BigInt(claim.amount));
    if (isAllocationLoading) return "…";
    if (allocationError) return "unavailable";
    return "No allocation yet";
  })();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="font-semibold text-sm">Two independent facts</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Your wallet balance changes with claims and transfers. Lifetime
          attribution records what this node allocated to you over time; it is
          not a breakdown of the tokens currently in your wallet.
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PositionStat
          label="Current wallet balance"
          value={balanceValue}
          hint="Live balanceOf for the connected wallet"
          emphasis
        />
        <PositionStat
          label="Lifetime attribution allocation"
          value={lifetimeAllocationValue}
          hint="Cumulative allocation across published and pending claim data"
        />
      </dl>
      <p className="text-muted-foreground text-xs">
        Claimable now is shown below only when the allocation root matches the
        distributor&apos;s live on-chain root.
      </p>
    </div>
  );
}

function PositionStat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}): ReactElement {
  return (
    <div
      className={
        emphasis
          ? "rounded-lg border border-primary/40 bg-primary/5 p-4"
          : "rounded-lg border border-border/50 p-4"
      }
    >
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-bold text-xl tracking-tight">{value}</dd>
      <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
