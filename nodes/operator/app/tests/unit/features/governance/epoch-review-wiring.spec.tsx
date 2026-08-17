// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `epoch-review-wiring.spec`
 * Purpose: Prove epoch state/authority is wired to the review action and review page.
 * Scope: App-view composition with child visuals and IO hooks mocked.
 * Invariants: current authority opens review; pinned authority owns review; success navigates to review.
 * Side-effects: none
 * Links: src/app/(app)/gov/epoch/view.tsx, src/app/(app)/gov/review/view.tsx, work item bug.5042
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EpochView } from "@/features/governance/types";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  epochsPage: { data: undefined, isLoading: false, error: null } as unknown,
  reviewEpochs: { data: undefined, isLoading: false, error: null } as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/features/governance/hooks/useEpochsPage", () => ({
  useEpochsPage: () => mocks.epochsPage,
}));

vi.mock("@/features/governance/hooks/useReviewEpochs", () => ({
  useReviewEpochs: () => mocks.reviewEpochs,
}));

vi.mock("@/features/governance/hooks/useOpenEpochReview", () => ({
  useEpochReviewReadiness: () => true,
  useOpenEpochReview: () => ({
    error: null,
    isPending: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock("@/features/governance/components/EpochReviewAction", () => ({
  EpochReviewAction: ({
    status,
    isApprover,
    onOpen,
    onContinue,
  }: {
    status: EpochView["status"];
    isApprover: boolean;
    onOpen: () => void;
    onContinue: () => void;
  }) => (
    <div data-testid="review-action" data-authorized={String(isApprover)}>
      {isApprover && (
        <button
          type="button"
          onClick={status === "review" ? onContinue : onOpen}
        >
          {status === "review" ? "Continue review" : "Open for review"}
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/features/governance/components/EpochCountdown", () => ({
  EpochCountdown: () => null,
}));

vi.mock("@/features/governance/components/EpochDetail", () => ({
  EpochDetail: () => null,
}));

vi.mock("@/features/governance/components/ExecuteDistributionPanel", () => ({
  ExecuteDistributionPanel: () => null,
}));

vi.mock("@/components", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  PieChart: () => null,
}));

import { CurrentEpochView } from "@/app/(app)/gov/epoch/view";
import { ReviewView } from "@/app/(app)/gov/review/view";

const WALLET = "0xabc";

function epoch(
  status: EpochView["status"],
  approvers: readonly string[] | null
): EpochView {
  return {
    id: "epoch-7",
    status,
    periodStart: "2026-08-10T00:00:00.000Z",
    periodEnd: "2026-08-17T00:00:00.000Z",
    poolTotalCredits: null,
    approvers,
    contributors: [],
    unresolvedCount: 0,
    unresolvedActivities: [],
  };
}

function showCurrent(
  current: EpochView,
  props: { walletAddress: string | null; isCurrentApprover: boolean }
): void {
  mocks.epochsPage = {
    data: { current, pastEpochs: [] },
    isLoading: false,
    error: null,
  };
  render(<CurrentEpochView nodeId="operator" {...props} />);
}

describe("epoch review wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses current policy to open an ended epoch, then navigates on success", () => {
    showCurrent(epoch("open", null), {
      walletAddress: WALLET,
      isCurrentApprover: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Open for review" }));
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate.mock.calls[0]?.[0]).toBe("epoch-7");

    const options = mocks.mutate.mock.calls[0]?.[1] as {
      onSuccess: () => void;
    };
    options.onSuccess();
    expect(mocks.push).toHaveBeenCalledWith("/gov/review");
  });

  it("uses pinned authority after review opens, not current policy", () => {
    showCurrent(epoch("review", [WALLET]), {
      walletAddress: WALLET,
      isCurrentApprover: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue review" }));
    expect(mocks.push).toHaveBeenCalledWith("/gov/review");
  });

  it("does not grant review access to a current approver absent from the pin", () => {
    showCurrent(epoch("review", ["0xother"]), {
      walletAddress: WALLET,
      isCurrentApprover: true,
    });

    expect(screen.getByTestId("review-action")).toHaveAttribute(
      "data-authorized",
      "false"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("filters the review page by epoch-pinned authority", () => {
    mocks.reviewEpochs = {
      data: [epoch("review", ["0xother"])],
      isLoading: false,
      error: null,
    };

    render(<ReviewView walletAddress={WALLET} />);

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
    expect(
      screen.getByText(/only an approver pinned to this epoch/i)
    ).toBeInTheDocument();
  });
});
