// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/activity/view`
 * Purpose: Client-side view for Activity dashboard with URL-driven time range.
 * Scope: Manages time range in URL, fetches data via React Query, renders charts and table. Does not implement business logic.
 * Invariants: Time range persists in URL searchParams, refetches on change
 * Side-effects: IO
 * Links: [ActivityChart](../../../components/kit/data-display/ActivityChart.tsx), [fetchActivity](./_api/fetchActivity.ts)
 * @public
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components";
import { ActivityChart } from "@/components/kit/data-display/ActivityChart";
import { ActivityTable } from "@/components/kit/data-display/ActivityTable";
import type { TimeRange } from "@/contracts/ai.activity.v1.contract";
import { fetchActivity } from "./_api/fetchActivity";

export function ActivityView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = (searchParams.get("range") as TimeRange) || "1m";

  // Fetch activity data keyed by range
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", range],
    queryFn: () => fetchActivity({ range }),
    staleTime: 30_000, // Consider data fresh for 30s
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
    retry: 2,
  });

  const handleRangeChange = (newRange: TimeRange) => {
    // Update URL - React Query will auto-refetch due to queryKey change
    router.replace(`/activity?range=${newRange}`, { scroll: false });
  };

  if (error) {
    return (
      <div className="mx-auto flex max-w-[var(--max-width-container-screen)] flex-col gap-8 p-4 md:p-8 lg:px-16">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <h2 className="font-semibold text-destructive text-lg">
            Error loading activity data
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
      <div className="mx-auto flex max-w-[var(--max-width-container-screen)] flex-col gap-8 p-4 md:p-8 lg:px-16">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 rounded-md bg-muted" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-64 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const { chartSeries, totals, rows, effectiveStep } = data;

  const spendData = chartSeries.map((d) => ({
    date: d.bucketStart,
    value: Number.parseFloat(d.spend),
  }));

  const tokenData = chartSeries.map((d) => ({
    date: d.bucketStart,
    value: d.tokens,
  }));

  const requestData = chartSeries.map((d) => ({
    date: d.bucketStart,
    value: d.requests,
  }));

  return (
    <div className="mx-auto flex max-w-[var(--max-width-container-screen)] flex-col gap-8 p-4 md:p-8 lg:px-16">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-3xl tracking-tight">Your Activity</h1>
        <TimeRangeSelector
          value={range}
          onValueChange={handleRangeChange}
          className="w-40 rounded-lg"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ActivityChart
          title="Total Spend"
          description={`$${totals.spend.total} total`}
          data={spendData}
          config={{
            value: {
              label: "Spend ($)",
              color: "hsl(var(--chart-1))",
            },
          }}
          color="hsl(var(--chart-1))"
          effectiveStep={effectiveStep}
        />
        <ActivityChart
          title="Total Tokens"
          description={`${totals.tokens.total.toLocaleString()} tokens`}
          data={tokenData}
          config={{
            value: {
              label: "Tokens",
              color: "hsl(var(--chart-2))",
            },
          }}
          color="hsl(var(--chart-2))"
          effectiveStep={effectiveStep}
        />
        <ActivityChart
          title="Total Requests"
          description={`${totals.requests.total.toLocaleString()} requests`}
          data={requestData}
          config={{
            value: {
              label: "Requests",
              color: "hsl(var(--chart-3))",
            },
          }}
          color="hsl(var(--chart-3))"
          effectiveStep={effectiveStep}
        />
      </div>

      <div className="space-y-4">
        <h2 className="font-semibold text-xl tracking-tight">
          Recent Activity
        </h2>
        <ActivityTable logs={rows} />
        {/* Load More button would go here */}
      </div>
    </div>
  );
}
