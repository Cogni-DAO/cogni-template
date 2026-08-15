// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/LifecycleStepper`
 * Purpose: Shared, presentational stepper primitives for guided ordered-lifecycle surfaces (numbered
 *   badge + collapsible step shell). Extracted verbatim from the node-page distribution SETUP sequence
 *   (`DistributionsCard.client`) so the same visual idiom can drive any multi-step lifecycle (setup,
 *   sign→publish, etc.) without re-implementing the badge/row styling.
 * Scope: Pure presentation — no wallet, no IO, no data. Each step's done/current/pending state is
 *   passed in by the caller (which owns the domain state that derives it).
 * Invariants:
 *   - PRESENTATIONAL_ONLY: no hooks, no side-effects — state is a prop, never derived here.
 *   - STATE_DRIVEN_STYLING: `done` → green check; `current` → filled number + emphasized shell;
 *     `pending` → dashed badge + muted title + collapsed body.
 * Side-effects: none.
 * Links: nodes/operator/app/src/features/nodes/DistributionsCard.client.tsx (original home / first consumer)
 * @public
 */

"use client";

import { Check, CircleDashed } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

/** Step display state — drives the numbered badge + label styling. */
export type StepState = "done" | "current" | "pending";

/** A numbered/step-state badge: green check (done), filled number (current), dashed (pending). */
export function StepBadge({
  n,
  state,
}: {
  n: number;
  state: StepState;
}): ReactElement {
  if (state === "done") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
        {n}
      </span>
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
      <CircleDashed className="size-5" />
    </span>
  );
}

/** Shared step shell: badge + title + (collapsed when pending/done) body. */
export function StepRow({
  n,
  state,
  title,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div
      className={
        state === "current"
          ? "rounded-lg border border-border bg-muted/30 p-4"
          : "rounded-lg border border-border/50 p-4"
      }
    >
      <div className="flex items-center gap-3">
        <StepBadge n={n} state={state} />
        <p
          className={
            state === "pending"
              ? "font-medium text-muted-foreground text-sm"
              : "font-medium text-sm"
          }
        >
          {title}
        </p>
      </div>
      {children ? <div className="mt-3 space-y-3 pl-9">{children}</div> : null}
    </div>
  );
}
