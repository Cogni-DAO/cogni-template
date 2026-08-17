"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/EpochReviewAction`
 * Purpose: Present the UI-only open/continue-review action with accessible async feedback.
 * Scope: Presentational component; callers own clocks, authorization resolution, mutation, and navigation.
 * Invariants: No action before period end; pending disables repeat submission; errors use an alert role.
 * Side-effects: none beyond invoking callbacks
 * Links: src/features/governance/hooks/useOpenEpochReview.ts, work item bug.5042
 * @public
 */

import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import type { ReactElement } from "react";

import { Alert, AlertDescription, Button } from "@/components";

export interface EpochReviewActionProps {
  readonly status: "open" | "review" | "finalized";
  readonly reviewReady: boolean;
  readonly isApprover: boolean;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onOpen: () => void;
  readonly onContinue: () => void;
}

export function EpochReviewAction({
  status,
  reviewReady,
  isApprover,
  isPending,
  error,
  onOpen,
  onContinue,
}: EpochReviewActionProps): ReactElement | null {
  if (!reviewReady && status !== "review") return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">
              {status === "review"
                ? "Epoch review is ready"
                : "This epoch is ready for review"}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {isApprover
                ? "Review the final contribution set, then sign to finalize it."
                : "Waiting for an authorized ledger approver to continue."}
            </p>
          </div>
        </div>

        {isApprover && (
          <Button
            className="min-h-11 shrink-0"
            disabled={isPending}
            onClick={status === "review" ? onContinue : onOpen}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Opening review&hellip;
              </>
            ) : (
              <>
                {status === "review" ? "Continue review" : "Open for review"}
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
