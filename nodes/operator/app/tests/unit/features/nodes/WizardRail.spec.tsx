// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/features/nodes/WizardRail.spec`
 * Purpose: Prove NodeStatus maps onto the shared rail without changing canonical milestones.
 * Scope: Pure feature-to-presentation mapping; no IO, time, navigation, or state-machine changes.
 * Invariants: NODE_PROGRESS_STEPS remains ordering SSOT; active is terminal; failed progress is unknown.
 * Side-effects: none
 * Links: src/features/nodes/wizard/WizardRail.tsx, src/features/nodes/state-machine.ts
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WizardRail } from "@/features/nodes/wizard/WizardRail";

function checkpointText(
  status: Parameters<typeof WizardRail>[0]["status"]
): string[] {
  render(<WizardRail status={status} />);
  const navigation = screen.getByRole("navigation", {
    name: "Node setup progress",
  });
  return within(navigation)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("WizardRail", () => {
  it("maps an in-progress node onto the canonical five milestones", () => {
    expect(checkpointText("dao_formed")).toEqual([
      "RegisterComplete",
      "DAOComplete",
      "RepoCurrent",
      "HandoffPending",
      "PaymentsPending",
    ]);
  });

  it("maps active to terminal completion", () => {
    expect(checkpointText("active")).toEqual([
      "RegisterComplete",
      "DAOComplete",
      "RepoComplete",
      "HandoffComplete",
      "PaymentsComplete",
    ]);
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("keeps failed progress honest instead of guessing a completed stage", () => {
    const labels = checkpointText("failed");

    expect(labels[0]).toContain("RegisterUnknown");
    expect(labels.slice(1)).toEqual([
      "DAOPending",
      "RepoPending",
      "HandoffPending",
      "PaymentsPending",
    ]);
    expect(
      screen.getByText(/Setup failed; progress cannot be determined/)
    ).toHaveClass("sr-only");
  });
});
