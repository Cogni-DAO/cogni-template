// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

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
  dataKey: string;
  color?: string;
}

export function ActivityChart({
  title,
  description,
  data,
  config,
  color = "hsl(var(--chart-1))",
}: ActivityChartProps) {
  // Filter data based on timeRange if needed, or assume data is already filtered
  // For this implementation, we'll assume the parent handles data fetching/filtering
  // but we keep the UI control for future client-side filtering if needed.
  // Actually, the requirement says "SQL Aggregation", so the parent should pass the correct data.
  // We might want to expose an onTimeRangeChange prop.

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {/* Time range selector could go here if we want client-side control */}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient
                id={`fill${title.replace(/\s+/g, "")}`}
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
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value: string) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="value"
              type="natural"
              fill={`url(#fill${title.replace(/\s+/g, "")})`}
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
