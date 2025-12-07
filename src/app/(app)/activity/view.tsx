// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/activity/view`
 * Purpose: Client-side view for Activity dashboard.
 * Scope: Renders charts and table. Does not fetch data directly (receives initialData).
 * Invariants: Uses shadcn components.
 * Side-effects: none
 * Links: [ActivityChart](../../../components/kit/data-display/ActivityChart.tsx)
 * @public
 */

"use client";

import { useState } from "react";
import type { z } from "zod";
import { type TimeRange, TimeRangeSelector } from "@/components";
import { ActivityChart } from "@/components/kit/data-display/ActivityChart";
import { ActivityTable } from "@/components/kit/data-display/ActivityTable";
import type { aiActivityOperation } from "@/contracts/ai.activity.v1.contract";

type ActivityData = z.infer<typeof aiActivityOperation.output>;

interface ActivityViewProps {
  initialData: ActivityData;
}

export function ActivityView({ initialData }: ActivityViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1d");

  // In a real implementation, we would use useQuery or similar to fetch data
  // based on selected time range. For now, we just display initialData.
  // TODO: Implement data fetching based on timeRange

  const { chartSeries, totals, rows } = initialData;

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
          value={timeRange}
          onValueChange={setTimeRange}
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
