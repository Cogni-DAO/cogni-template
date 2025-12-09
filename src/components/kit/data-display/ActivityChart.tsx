// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/data-display/ActivityChart`
 * Purpose: Reusable area chart component for activity metrics.
 * Scope: Renders a single metric chart. Does not fetch data.
 * Invariants: Uses Recharts and shadcn/chart.
 * Side-effects: none
 * Links: [ActivityView](../../../app/(app)/activity/view.tsx)
 * @public
 */

"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/vendor/shadcn/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/vendor/shadcn/chart";
export interface ActivityChartProps {
  title: string;
  description: string;
  data: {
    date: string;
    value: number;
  }[];
  config: ChartConfig;
  color?: string;
  /** Bucket granularity: "5m" | "15m" | "1h" | "6h" | "1d" */
  effectiveStep?: string;
}

export function ActivityChart({
  title,
  description,
  data,
  config,
  color = "hsl(var(--chart-1))",
  effectiveStep,
}: ActivityChartProps) {
  // Format ticks based on granularity: show time for sub-day steps
  const formatTick = (value: string) => {
    const date = new Date(value);
    // If step is sub-day (5m, 15m, 1h, 6h), show time
    if (effectiveStep && effectiveStep !== "1d") {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    // Otherwise show date
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Tooltip shows full date + time for sub-day, date only for daily
  const formatTooltipLabel = (value: string) => {
    const date = new Date(value);
    if (effectiveStep && effectiveStep !== "1d") {
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient
                id={`fill${title.replaceAll(/\s+/g, "")}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                <stop offset="95%" stopColor={color} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatTick}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={formatTooltipLabel}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="value"
              type="natural"
              fill={`url(#fill${title.replaceAll(/\s+/g, "")})`}
              stroke={color}
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
