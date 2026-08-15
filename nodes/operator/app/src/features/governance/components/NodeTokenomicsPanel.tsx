"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/NodeTokenomicsPanel`
 * Purpose: "This node's tokenomics" VISUAL HERO of the Ownership page — the node's total token supply
 *   (on-chain totalSupply), how much of it sits in the distributor vs. is held elsewhere (on-chain
 *   distributor balance), the token + distributor contract links (Basescan), and epochs completed.
 *   Renders whenever the node HAS a token, whether or not any distribution has ever executed.
 * Scope: Client component. Sources token/distributor/chain from repo-spec via useNodeTokenomicsConfig
 *   (the public tokenomics route) — NOT from a claim manifest — then reads on-chain facts (totalSupply,
 *   distributor balance) via useNodeTokenomics. Attribution totals (distributed credits) are passed in
 *   from the page's existing useHoldings fetch. Does not perform DB access or write transactions.
 * Invariants:
 *   - CONFIG_NOT_MANIFEST: token/distributor/chain come from repo-spec, never a claim leaf.
 *   - RENDERS_WITH_ZERO_EPOCHS: the hero renders on a node with a token even before any distribution.
 *   - ALL_MATH_BIGINT: amounts stay bigint; formatted only at display via formatTokenAmount.
 *   - READ_ONLY: pure reads; never mutates chain/DB state.
 * Side-effects: IO (config fetch); blockchain read (via useNodeTokenomics).
 * Links: nodes/operator/app/src/features/governance/hooks/useNodeTokenomics.ts
 * @public
 */

import { getAddressExplorerUrl } from "@cogni/node-shared";
import { Coins } from "lucide-react";
import type { ReactElement } from "react";

import { SectionCard } from "@/components";
import {
  useNodeTokenomics,
  useNodeTokenomicsConfig,
} from "@/features/governance/hooks/useNodeTokenomics";
import {
  formatTokenAmount,
  shortenAddress,
} from "@/features/governance/lib/format-token-amount";

export function NodeTokenomicsPanel({
  distributedCredits,
}: {
  /** Total credits distributed via attribution to date (raw credit count). */
  distributedCredits: number;
}): ReactElement {
  const { data: config, isLoading: isConfigLoading } =
    useNodeTokenomicsConfig();

  const token = config?.tokenAddress ?? null;
  const distributor = config?.distributorAddress ?? null;
  const chainId = config?.chainId;
  const epochsCompleted = config?.epochsCompleted ?? 0;

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

  // "Held elsewhere" = totalSupply − distributor balance, clamped ≥ 0. The distributor
  // holds tokens awaiting claims; everything else lives in wallets / the emissions holder.
  const heldElsewhere =
    totalSupply === undefined || distributorBalance === undefined
      ? undefined
      : totalSupply > distributorBalance
        ? totalSupply - distributorBalance
        : 0n;

  if (!token) {
    return (
      <SectionCard title="This node's tokenomics">
        <p className="text-muted-foreground text-sm">
          {isConfigLoading
            ? "Loading tokenomics…"
            : "This node has no governance token configured yet. Once a DAO token is set in the node's governance config, its supply and distributor appear here."}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="This node's tokenomics">
      <div className="space-y-6">
        {/* HERO: total supply */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Coins className="h-4 w-4 text-primary" />
            Total token supply
          </div>
          <div className="mt-2 font-bold text-4xl tabular-nums tracking-tight sm:text-5xl">
            {totalSupply === undefined
              ? isLoading
                ? "…"
                : "—"
              : formatTokenAmount(totalSupply)}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            On-chain ERC20 totalSupply of this node&apos;s governance token
          </p>
        </div>

        {/* Distributor split + epochs */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="In distributor"
            value={
              distributor === null
                ? "—"
                : distributorBalance === undefined
                  ? isLoading
                    ? "…"
                    : "—"
                  : formatTokenAmount(distributorBalance)
            }
            hint="Tokens held by the distributor awaiting claims"
          />
          <Stat
            label="Held elsewhere"
            value={
              heldElsewhere === undefined
                ? isLoading
                  ? "…"
                  : "—"
                : formatTokenAmount(heldElsewhere)
            }
            hint="Supply outside the distributor (wallets, emissions holder)"
          />
          <Stat
            label="Epochs completed"
            value={epochsCompleted.toLocaleString()}
            hint={`Finalized attribution epochs · ${distributedCredits.toLocaleString()} credits distributed`}
          />
        </dl>

        {/* Contract links */}
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
      </div>
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
      <dd className="mt-1 font-bold text-xl tabular-nums tracking-tight">
        {value}
      </dd>
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
