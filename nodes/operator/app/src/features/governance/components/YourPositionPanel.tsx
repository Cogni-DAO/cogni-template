"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/YourPositionPanel`
 * Purpose: "Your position" section of the Ownership page — the connected viewer's FULL on-chain wallet
 *   balance of the node token, broken into EARNED-VIA-CONTRIBUTIONS (cumulative attribution allocation)
 *   vs the REST (formation / other), plus the existing claim affordance for CLAIMABLE-NOW. Makes the
 *   distinction unmistakable: total holdings ≠ earned-via-attribution ≠ claimable-now.
 * Scope: Client component. Sources the viewer's cumulative claim leaf via useCumulativeClaim (react-query
 *   dedupes with the embedded claim panel) and the viewer's on-chain token balance via useNodeTokenomics.
 *   Reuses CumulativeClaimPanel AS-IS for the claim UX (no claim-math changes). Does not perform DB access.
 * Invariants:
 *   - ALL_MATH_BIGINT: balances/allocations stay bigint; formatted only at display.
 *   - EARNED_IS_SUBSET: earned-via-attribution (cumulativeAmount) ≤ total holdings; "other" = holdings − earned, clamped ≥ 0.
 *   - CLAIM_UNCHANGED: the Claim affordance is the untouched CumulativeClaimPanel; this panel only frames it.
 * Side-effects: blockchain read (viewer balance via useNodeTokenomics; claim state via useCumulativeClaim).
 * Links: nodes/operator/app/src/features/governance/components/CumulativeClaimPanel.tsx, nodes/operator/app/src/features/governance/hooks/useCumulativeClaim.ts
 * @public
 */

import type { ReactElement } from "react";
import { useAccount } from "wagmi";

import { SectionCard } from "@/components";
import { CumulativeClaimPanel } from "@/features/governance/components/CumulativeClaimPanel";
import { useCumulativeClaim } from "@/features/governance/hooks/useCumulativeClaim";
import { useNodeTokenomics } from "@/features/governance/hooks/useNodeTokenomics";
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
      {/* Claim affordance — reused unchanged. */}
      <CumulativeClaimPanel />
    </SectionCard>
  );
}

function ConnectedPosition({
  account,
}: {
  account: `0x${string}`;
}): ReactElement {
  const { claim, cumulativeClaimed, claimable } = useCumulativeClaim(account);

  const token = (claim?.tokenAddress ?? null) as `0x${string}` | null;
  const distributor = (claim?.distributor ?? null) as `0x${string}` | null;
  const chainId = claim?.chainId;

  const { viewerBalance, isLoading } = useNodeTokenomics({
    token,
    distributor,
    viewer: account,
    chainId,
  });

  // earned-via-attribution = cumulative allocation (claimed + still-claimable).
  const earned = claim ? BigInt(claim.amount) : 0n;
  // total holdings = full on-chain wallet balance of the node token.
  const total = viewerBalance;
  // the rest = holdings − earned (formation/genesis/other), clamped ≥ 0.
  const other =
    total === undefined ? undefined : total > earned ? total - earned : 0n;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PositionStat
          label="Total holdings"
          value={
            total === undefined
              ? isLoading
                ? "…"
                : "—"
              : formatTokenAmount(total)
          }
          hint="Your full on-chain balance of this node's token"
          emphasis
        />
        <PositionStat
          label="Earned via contributions"
          value={formatTokenAmount(earned)}
          hint="Cumulative attribution allocation (claimed + claimable)"
        />
        <PositionStat
          label="Formation / other"
          value={other === undefined ? "…" : formatTokenAmount(other)}
          hint="Holdings not earned via attribution (genesis, transfers)"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Claimable now:{" "}
        <span className="font-medium text-foreground">
          {claimable === undefined ? "…" : formatTokenAmount(claimable)}
        </span>{" "}
        — the unclaimed slice of your earned allocation
        {cumulativeClaimed !== undefined && (
          <> ({formatTokenAmount(cumulativeClaimed)} already claimed)</>
        )}
        .
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
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-bold text-xl tracking-tight">{value}</div>
      <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
