// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `EpochReviewAction.spec`
 * Purpose: Prove the human-facing epoch review action's authorization and async states.
 * Scope: Presentational component only; clock and mutation behavior have separate hook tests.
 * Invariants: no early action, no unauthorized action, pending blocks repeat clicks, failures are accessible.
 * Side-effects: none
 * Links: src/features/governance/components/EpochReviewAction.tsx, work item bug.5042
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EpochReviewAction } from "@/features/governance/components/EpochReviewAction";

const baseProps = {
  status: "open" as const,
  reviewReady: true,
  isApprover: true,
  isPending: false,
  error: null,
  onOpen: vi.fn(),
  onContinue: vi.fn(),
};

describe("EpochReviewAction", () => {
  it("renders no action before an open epoch ends", () => {
    const { container } = render(
      <EpochReviewAction {...baseProps} reviewReady={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a waiting state without exposing an unauthorized action", () => {
    render(<EpochReviewAction {...baseProps} isApprover={false} />);
    expect(
      screen.getByText("Waiting for an authorized ledger approver to continue.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens review through the explicit action", () => {
    const onOpen = vi.fn();
    render(<EpochReviewAction {...baseProps} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /open for review/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("continues an already-open review", () => {
    const onContinue = vi.fn();
    render(
      <EpochReviewAction
        {...baseProps}
        status="review"
        reviewReady={false}
        onContinue={onContinue}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /continue review/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("disables repeat submission while opening", () => {
    const onOpen = vi.fn();
    render(
      <EpochReviewAction {...baseProps} isPending={true} onOpen={onOpen} />
    );
    const button = screen.getByRole("button", { name: /opening review/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("announces mutation failures", () => {
    render(
      <EpochReviewAction
        {...baseProps}
        error={new Error("Unable to open review")}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to open review"
    );
  });
});
