// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/governance/components/EpochLifecycleProgress`
 * Purpose: Governance adapter from epoch evidence to the shared horizontal lifecycle rail.
 * Scope: Read-only presentation. All mutations live in the finish workspace below the rail.
 * Invariants: SAME_RAIL_EVERY_EPOCH, STATUS_IS_TEXT, UNKNOWN_NEVER_COMPLETE.
 * Side-effects: hydration-safe period-boundary timer only
 * Links: src/features/governance/lib/epoch-lifecycle-state.ts, bug.5042
 * @public
 */

"use client";

import type { DistributionLifecycleOutput } from "@cogni/node-contracts";
import type { ReactElement } from "react";

import { LifecycleProgress, type LifecycleProgressStep } from "@/components";
import { useEpochReviewReadiness } from "@/features/governance/hooks/useOpenEpochReview";
import { deriveEpochLifecycle } from "@/features/governance/lib/epoch-lifecycle-state";
import type { EpochView } from "@/features/governance/types";

export function EpochLifecycleProgress({
  epoch,
  evidence,
}: {
  readonly epoch: EpochView;
  readonly evidence: DistributionLifecycleOutput;
}): ReactElement {
  const periodEnded = useEpochReviewReadiness(epoch.status, epoch.periodEnd);
  const lifecycle = deriveEpochLifecycle(epoch, evidence, periodEnded);
  const steps: readonly LifecycleProgressStep[] = lifecycle.steps.map(
    (step) => ({
      label: step.label,
      state: step.state,
      description: step.description,
    })
  );

  return (
    <LifecycleProgress
      ariaLabel={`Epoch ${epoch.id} lifecycle`}
      steps={steps}
    />
  );
}
