"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/NodeTokenomicsPanel`
 * Purpose: "This node's tokenomics" section of the Ownership page — total token supply, the distributor
 *   contract + its current (undistributed/in-flight) balance, total distributed via attribution to date,
 *   epochs completed, and Basescan links for the token + distributor contracts.
 * Scope: Client component. On-chain facts (totalSupply, distributor balance) come from useNodeTokenomics;
 *   attribution totals (distributed, epochs) are passed in from the page's existing useHoldings fetch — no
 *   duplicate off-chain fetch. Does not perform DB access or write transactions.
 * Invariants:
 *   - ALL_MATH_BIGINT: amounts stay bigint; formatted only at display via formatTokenAmount.
 *   - READ_ONLY: pure reads; never mutates chain/DB state.
 *   - HONEST_UNAVAILABLE: when the token/distributor isn't recorded on-chain yet, renders a quiet
 *     "not on-chain yet" state instead of implying zero.
 * Side-effects: blockchain read (via useNodeTokenomics).
 * Links: nodes/operator/app/src/features/governance/hooks/useNodeTokenomics.ts
 * @public
 */

import { getAddressExplorerUrl } from "@cogni/node-shared";
import type { ReactElement } from "react";

import { SectionCard } from "@/components";
import { useNodeTokenomics } from "@/features/governance/hooks/useNodeTokenomics";
import {
  formatTokenAmount,
  shortenAddress,
} from "@/features/governance/lib/format-token-amount";

export function NodeTokenomicsPanel({
  token,
  distributor,
  chainId,
  distributedCredits,
  epochsCompleted,
}: {
  /** Governance token address (from the latest claim leaf); null until on-chain. */
  token: `0x${string}` | null;
  /** CumulativeMerkleDrop address; null until recorded. */
  distributor: `0x${string}` | null;
  chainId: number | undefined;
  /** Total credits distributed via attribution to date (raw credit count). */
  distributedCredits: number;
  epochsCompleted: number;
}): ReactElement {
  const { totalSupply, distributorBalance, isLoading } = useNodeTokenomics({
    token,
    distributor,
    viewer: null,
    chainId,
  });

  const tokenLink =
    token && chainId ? getAddressExplorerUrl(chainId, token) : null;
  const distributorLink =
    distributor && chainId ? getAddressExplorerUrl(chainId, distributor) : null;

  return (
    <SectionCard title="This node's tokenomics">
      {!token ? (
        <p className="text-muted-foreground text-sm">
          This node&apos;s governance token isn&apos;t on-chain yet. Tokenomics
          appear once a distribution has been executed.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat
              label="Total token supply"
              value={
                totalSupply === undefined
                  ? isLoading
                    ? "…"
                    : "—"
                  : formatTokenAmount(totalSupply)
              }
              hint="On-chain ERC20 totalSupply"
            />
            <Stat
              label="Distributed via attribution"
              value={`${distributedCredits.toLocaleString()} credits`}
              hint="Contribution credits allocated to contributors to date"
            />
            <Stat
              label="Undistributed (held by distributor)"
              value={
                distributor === null
                  ? "—"
                  : distributorBalance === undefined
                    ? isLoading
                      ? "…"
                      : "—"
                    : formatTokenAmount(distributorBalance)
              }
              hint="Tokens in the distributor contract awaiting claims"
            />
            <Stat
              label="Epochs completed"
              value={epochsCompleted.toLocaleString()}
              hint="Finalized attribution epochs"
            />
          </dl>

          <div className="space-y-2 border-border border-t pt-4 text-sm">
            <ContractLink
              label="Token contract"
              address={token}
              href={tokenLink}
            />
            {distributor && (
              <ContractLink
                label="Distributor contract"
                address={distributor}
                href={distributorLink}
              />
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-border/50 p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-bold text-xl tracking-tight">{value}</dd>
      <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

function ContractLink({
  label,
  address,
  href,
}: {
  label: string;
  address: string;
  href: string | null;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono underline transition-colors hover:text-foreground"
        >
          {shortenAddress(address)}
        </a>
      ) : (
        <span className="font-mono">{shortenAddress(address)}</span>
      )}
    </div>
  );
}
