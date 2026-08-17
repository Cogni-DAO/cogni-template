// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/wizard/WizardRail`
 * Purpose: Node-status adapter for the shared horizontal lifecycle progress rail.
 * Scope: Maps the canonical node state-machine ordering into presentational checkpoint state.
 *   The shared kit component owns semantics and styling; this wrapper owns node-domain mapping only.
 * Side-effects: none
 * Links: src/features/nodes/state-machine.ts (ordering SSOT)
 * @public
 */

import type { ReactElement } from "react";

import { LifecycleProgress, type LifecycleProgressStep } from "@/components";
import {
  NODE_PROGRESS_STEPS,
  progressIndexForStatus,
} from "@/features/nodes/state-machine";
import type { NodeStatus } from "@/shared/db/nodes";

interface Props {
  readonly status: NodeStatus;
}

export function WizardRail({ status }: Props): ReactElement {
  const currentIndex = progressIndexForStatus(status);
  const failed = status === "failed";

  const steps = NODE_PROGRESS_STEPS.map<LifecycleProgressStep>(
    (step, index) => {
      if (failed) {
        return index === 0
          ? {
              label: step.label,
              state: "unknown",
              description: "Setup failed; progress cannot be determined.",
            }
          : { label: step.label, state: "pending" };
      }
      return {
        label: step.label,
        state:
          index < currentIndex
            ? "complete"
            : index === currentIndex
              ? "current"
              : "pending",
      };
    }
  );

  return <LifecycleProgress ariaLabel="Node setup progress" steps={steps} />;
}
