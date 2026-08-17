// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/components/LifecycleProgress.spec`
 * Purpose: Prove the shared lifecycle rail's semantic, responsive, and non-interactive contract.
 * Scope: Presentational component only; no IO, time, animation, or domain-state derivation.
 * Invariants: status is text, current is announced, five columns shrink equally, descriptions add context.
 * Side-effects: none
 * Links: src/components/kit/data-display/LifecycleProgress.tsx
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LifecycleProgress, type LifecycleProgressStep } from "@/components";

const steps: readonly LifecycleProgressStep[] = [
  { label: "Collect", state: "complete" },
  { label: "Review", state: "current" },
  { label: "Finalize", state: "pending" },
  {
    label: "Publish",
    state: "locked",
    description: "An authorized publisher must complete this stage.",
  },
  {
    label: "Claims open",
    state: "unknown",
    description: "On-chain publication evidence is unavailable.",
  },
];

const unavailableStep: readonly LifecycleProgressStep[] = [
  {
    label: "Publish",
    state: "unavailable",
    description: "No cumulative distribution manifest was built.",
  },
];

describe("LifecycleProgress", () => {
  it("renders ordered checkpoint semantics with visible text states", () => {
    render(<LifecycleProgress ariaLabel="Epoch lifecycle" steps={steps} />);

    const navigation = screen.getByRole("navigation", {
      name: "Epoch lifecycle",
    });
    const list = within(navigation).getByRole("list");
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("CollectComplete");
    expect(items[1]).toHaveTextContent("ReviewCurrent");
    expect(items[2]).toHaveTextContent("FinalizePending");
    expect(items[3]).toHaveTextContent("PublishLocked");
    expect(items[4]).toHaveTextContent("Claims openUnknown");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(
      items.filter((item) => item.hasAttribute("aria-current"))
    ).toHaveLength(1);
  });

  it("announces descriptions without turning checkpoints into actions", () => {
    render(<LifecycleProgress ariaLabel="Epoch lifecycle" steps={steps} />);

    expect(
      screen.getByText(/An authorized publisher must complete this stage/)
    ).toHaveClass("sr-only");
    expect(
      screen.getByText(/On-chain publication evidence is unavailable/)
    ).toHaveClass("sr-only");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("distinguishes unavailable from locked and unknown", () => {
    render(
      <LifecycleProgress
        ariaLabel="Unavailable lifecycle"
        steps={unavailableStep}
      />
    );

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("PublishUnavailable");
    expect(item).not.toHaveTextContent("Locked");
    expect(item).not.toHaveTextContent("Unknown");
    expect(item.querySelector("svg")).not.toBeNull();
  });

  it("uses equal shrinking columns and contains no animated presentation", () => {
    const { container } = render(
      <LifecycleProgress ariaLabel="Epoch lifecycle" steps={steps} />
    );

    const navigation = screen.getByRole("navigation", {
      name: "Epoch lifecycle",
    });
    const list = within(navigation).getByRole("list");

    expect(navigation).toHaveClass("max-w-full", "overflow-hidden");
    expect(list).toHaveClass(
      "w-full",
      "min-w-0",
      "grid-flow-col",
      "auto-cols-fr"
    );
    for (const item of within(list).getAllByRole("listitem")) {
      expect(item).toHaveClass("min-w-0");
    }
    expect(
      container.querySelector('[class*="animate-"], [class*="transition-"]')
    ).toBeNull();
  });
});
