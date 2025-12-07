// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/activity/unavailable-view`
 * Purpose: Error state view when usage telemetry is unavailable.
 * Scope: Renders error message when LiteLLM is down. Does not fetch data.
 * Invariants: P1 - explicit error state, no fallback to partial data.
 * Side-effects: none
 * Links: docs/ACTIVITY_METRICS.md (P1 invariants - no fallback)
 * @public
 */

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components";

export function ActivityUnavailableView() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="font-bold text-3xl tracking-tight">Activity</h1>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Usage data unavailable</AlertTitle>
        <AlertDescription>
          Unable to load usage telemetry at this time. This is a temporary
          issue. Please try again later.
        </AlertDescription>
      </Alert>
    </div>
  );
}
