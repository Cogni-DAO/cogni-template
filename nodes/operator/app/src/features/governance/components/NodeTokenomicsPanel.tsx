"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/NodeTokenomicsPanel`
 * Purpose: Visual token-issuance model for the Ownership page — the invariant finalize→mint→claim
 *   flow plus an exact current totalSupply split between the distributor and wallets/elsewhere.
 *   The static model remains visible before a token is configured, without fabricated figures.
 * Scope: Client component. Sources token/distributor/chain from repo-spec via useNodeTokenomicsConfig
 *   (the public tokenomics route) — NOT from a claim manifest — then reads on-chain facts (totalSupply,
 *   distributor balance) via useNodeTokenomics. Attribution totals (finalized credits) are passed in
 *   from the page's existing useHoldings fetch. Does not perform DB access or write transactions.
 * Invariants:
 *   - CONFIG_NOT_MANIFEST: token/distributor/chain come from repo-spec, never a claim leaf.
 *   - RENDERS_WITH_ZERO_EPOCHS: the model renders before any distribution.
 *   - ISSUED_IS_NOT_POLICY_CAP: totalSupply is labeled as current issuance, never planned supply.
 *   - ALL_MATH_BIGINT: amounts stay bigint; formatted only at display via formatTokenAmount.
 *   - READ_ONLY: pure reads; never mutates chain/DB state.
 * Side-effects: IO (config fetch); blockchain read (via useNodeTokenomics).
 * Links: nodes/operator/app/src/features/governance/hooks/useNodeTokenomics.ts
 * @public
 */

import { getAddressExplorerUrl } from "@cogni/node-shared";
import { Coins } from "lucide-react";
import type { ReactElement } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Progress,
  SectionCard,
} from "@/components";
import { DistributionModelFlow } from "@/features/governance/components/DistributionModelFlow";
import {
  useNodeTokenomics,
  useNodeTokenomicsConfig,
} from "@/features/governance/hooks/useNodeTokenomics";
import {
  formatTokenAmount,
  shortenAddress,
} from "@/features/governance/lib/format-token-amount";
import {
  buildIssuanceSplit,
  formatCreditAmount,
  type IssuanceSplit,
} from "@/features/governance/lib/tokenomics-visuals";

export function NodeTokenomicsPanel({
  finalizedCredits,
}: {
  /** Total credits finalized via attribution to date (raw credit count). */
  finalizedCredits: string;
}): ReactElement {
  const {
    data: config,
    isLoading: isConfigLoading,
    error: configError,
  } = useNodeTokenomicsConfig();

  const token = config?.tokenAddress ?? null;
  const distributor = config?.distributorAddress ?? null;
  const chainId = config?.chainId;
  const epochsCompleted = config?.epochsCompleted ?? 0;

  const {
    totalSupply,
    distributorBalance,
    isLoading,
    error: readError,
  } = useNodeTokenomics({
    token,
    distributor,
    viewer: null,
    chainId,
  });

  // Honest three-way display: a value, a pending read ("…"), a FAILED read
  // ("unavailable" — NOT "—"), so an on-chain read error never masquerades as a
  // genuine zero (the "token is on-chain but shows —" false-empty bug).
  const display = (v: bigint | undefined): string => {
    if (v !== undefined) return formatTokenAmount(v);
    if (isLoading) return "…";
    if (readError) return "unavailable";
    return "—";
  };

  const tokenLink =
    token && chainId ? getAddressExplorerUrl(chainId, token) : null;
  const distributorLink =
    distributor && chainId ? getAddressExplorerUrl(chainId, distributor) : null;
  const issuanceSplit = buildIssuanceSplit(totalSupply, distributorBalance);

  if (!token) {
    return (
      <SectionCard title="This node's token issuance">
        <DistributionModelFlow />
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <p className="font-semibold text-sm">
            {isConfigLoading
              ? "Loading token configuration…"
              : configError
                ? "Token configuration unavailable"
                : "No token configured yet"}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {isConfigLoading
              ? "Checking this node's governance configuration."
              : configError
                ? "The node configuration could not be read, so no supply figures are assumed. Refresh to retry."
                : "The flow above explains the distribution model, but this node has no governance token address to read. No supply figures are assumed."}
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="This node's token issuance">
      <div className="space-y-6">
        <DistributionModelFlow />

        {/* HERO: current issued supply, never the unpersisted policy cap. */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Coins className="h-4 w-4 text-primary" />
            Current issued supply
          </div>
          <div className="mt-2 font-bold text-4xl tabular-nums tracking-tight sm:text-5xl">
            {display(totalSupply)}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Live on-chain ERC20 totalSupply — not a planned policy cap
          </p>
          {readError && totalSupply === undefined ? (
            <p className="mt-2 text-destructive text-xs">
              Couldn&apos;t read on-chain state (RPC error). This is a read
              failure, not a zero balance — retry shortly.
            </p>
          ) : null}
        </div>

        {distributor === null ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="font-semibold text-sm">Distributor not configured</p>
            <p className="mt-1 text-muted-foreground text-sm">
              There is no recorded distributor address, so the current supply
              cannot be split into awaiting-claim and elsewhere balances.
            </p>
          </div>
        ) : issuanceSplit?.kind === "available" ? (
          <IssuanceGraphic split={issuanceSplit} />
        ) : issuanceSplit?.kind === "inconsistent" ? (
          <Alert variant="destructive">
            <AlertTitle>Supply split temporarily unavailable</AlertTitle>
            <AlertDescription>
              The distributor balance read higher than total supply. These
              separate chain reads may be from different blocks; refresh before
              relying on the split.
            </AlertDescription>
          </Alert>
        ) : readError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t read the current supply split</AlertTitle>
            <AlertDescription>
              This is an RPC read failure, not a zero distributor balance.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm">
            Reading current distributor and wallet balances…
          </p>
        )}

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Stat
            label="Finalized epochs"
            value={epochsCompleted.toLocaleString()}
            hint="Epochs with signed, frozen attribution"
          />
          <Stat
            label="Finalized attribution credits"
            value={formatCreditAmount(finalizedCredits)}
            hint="Off-chain credits — not an ERC20 token balance"
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

function IssuanceGraphic({
  split,
}: {
  split: Extract<IssuanceSplit, { kind: "available" }>;
}): ReactElement {
  const total = formatTokenAmount(split.totalSupply);
  const distributor = formatTokenAmount(split.distributorBalance);
  const elsewhere = formatTokenAmount(split.walletsElsewhereBalance);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
          <div>
            <p className="font-semibold text-sm">Where issued tokens are now</p>
            <p className="text-muted-foreground text-xs">
              An exact split of current supply, not lifetime issuance history
            </p>
          </div>
          <p className="font-mono text-muted-foreground text-xs">
            {total} total
          </p>
        </div>
        <Progress
          value={split.distributorPercent}
          aria-label={`${split.distributorPercent.toLocaleString()} percent in the distributor awaiting claims; ${split.walletsElsewherePercent.toLocaleString()} percent in wallets or elsewhere`}
          className="mt-3"
        />
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Awaiting claims in distributor"
          value={distributor}
          hint={`${split.distributorPercent.toLocaleString()}% of issued supply`}
        />
        <Stat
          label="In wallets / elsewhere"
          value={elsewhere}
          hint={`${split.walletsElsewherePercent.toLocaleString()}% of issued supply`}
        />
      </dl>
    </div>
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
