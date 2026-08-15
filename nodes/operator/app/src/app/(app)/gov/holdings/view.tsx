// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/holdings/view`
 * Purpose: Client component for the Ownership page — accurately separates THIS NODE'S TOKENOMICS
 *   (token supply, distributor + its undistributed balance, distributed-via-attribution, epochs, contract
 *   links) from YOUR POSITION (full on-chain wallet balance, split into earned-via-contributions vs the
 *   rest, plus the claim affordance), then the attribution ownership distribution table.
 * Scope: Renders on-chain reads (via the child panels' useNodeTokenomics/useCumulativeClaim) and
 *   attribution data (via useHoldings). The child panels source the node's token/distributor/chain from
 *   repo-spec (public tokenomics route), NOT a claim manifest — so tokenomics render with zero epochs.
 *   Does not perform server-side logic or direct DB access.
 * Invariants:
 *   - ALL_MATH_BIGINT: token amounts stay bigint; formatted only at display.
 *   - THREE_NUMBER_MODEL: total holdings ≠ earned-via-attribution ≠ claimable-now — all three are shown, labeled plainly.
 *   - CLAIM_UNCHANGED: the Claim affordance is the untouched CumulativeClaimPanel, embedded via YourPositionPanel.
 * Side-effects: IO (useHoldings), blockchain read (via child panels)
 * Links: docs/spec/epoch-ledger.md, src/features/governance/types.ts
 * @public
 */

"use client";

import { Coins, TrendingUp, Users } from "lucide-react";
import type { ReactElement } from "react";
import { useMemo } from "react";

import {
  Card,
  CardContent,
  PieChart,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components";
import { HoldingRow } from "@/features/governance/components/HoldingCard";
import { NodeTokenomicsPanel } from "@/features/governance/components/NodeTokenomicsPanel";
import { YourPositionPanel } from "@/features/governance/components/YourPositionPanel";
import { useHoldings } from "@/features/governance/hooks/useHoldings";
import { buildPieChartData } from "@/features/governance/lib/build-pie-data";

export function HoldingsView(): ReactElement {
  const { data, isLoading, error } = useHoldings();

  const { chartData, chartConfig, legendEntries } = useMemo(() => {
    if (!data?.holdings.length)
      return { chartData: [], chartConfig: {}, legendEntries: [] };
    return buildPieChartData(
      data.holdings.map((h) => ({
        key: h.displayName ?? h.claimantLabel,
        value: h.ownershipPercent,
      }))
    );
  }, [data]);

  if (error) {
    return (
      <div className="flex flex-col gap-8">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <h2 className="font-semibold text-destructive text-lg">
            Error loading holdings data
          </h2>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 rounded-md bg-muted" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="h-20 rounded-lg bg-muted" />
            <div className="h-20 rounded-lg bg-muted" />
            <div className="h-20 rounded-lg bg-muted" />
          </div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Attribution credits are a raw COUNT (e.g. "12000"), not token base units — the
  // per-epoch token allocation is a proportional share of each epoch's distribution
  // amount, so there's no fixed credits→tokens multiplier. Keep this figure in its
  // true unit (credits) and let the token-scale numbers (supply, balances) stand on
  // their own 18-decimal footing.
  const totalCredits = Number(data.totalCreditsIssued);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 font-bold text-3xl tracking-tight">Ownership</h1>
        <p className="text-muted-foreground">
          This node&apos;s tokenomics and your token position
        </p>
      </div>

      <NodeTokenomicsPanel distributedCredits={totalCredits} />

      <YourPositionPanel />

      <div>
        <h2 className="mb-3 font-semibold text-lg">
          Attribution ownership distribution
        </h2>
        <p className="mb-3 text-muted-foreground text-sm">
          A subset of total supply — excludes formation / genesis holdings.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="border-border/50 bg-card/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-bold text-2xl">
                  {totalCredits.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">
                  Distributed via attribution
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="font-bold text-2xl">
                  {data.totalContributors}
                </div>
                <div className="text-muted-foreground text-xs">
                  Total Contributors
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="font-bold text-2xl">{data.epochsCompleted}</div>
                <div className="text-muted-foreground text-xs">
                  Epochs Completed
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.holdings.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <p className="text-muted-foreground">No holdings data</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="hidden items-center gap-3 sm:flex">
              <PieChart
                data={chartData}
                config={chartConfig}
                innerRadius={50}
                innerLabel={`${data.holdings.length}`}
                className="aspect-square h-48 shrink-0"
              />
              <div className="flex flex-col gap-1.5">
                {legendEntries.map((e) => (
                  <div
                    key={e.label}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: e.color }}
                    />
                    <span className="text-muted-foreground">{e.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border lg:col-span-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Contributor</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Ownership</TableHead>
                    <TableHead className="text-right">Epochs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.holdings.map((h, i) => (
                    <HoldingRow key={h.claimantKey} holding={h} rank={i + 1} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
