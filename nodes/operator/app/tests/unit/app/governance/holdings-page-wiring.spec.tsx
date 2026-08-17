// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `holdings-page-wiring.spec`
 * Purpose: Prove Ownership composes the token model independently from epochs and keeps credit totals semantic.
 * Scope: Holdings page composition with data hooks mocked; no HTTP, wallet, or chain IO.
 * Invariants: RENDERS_WITH_ZERO_EPOCHS, TOKENS_ARE_NOT_CREDITS, SEMANTIC_TOTALS_TABLE.
 * Side-effects: none
 * Links: src/app/(app)/gov/holdings/view.tsx, story.5006
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HoldingsData } from "@/features/governance/types";

const mocks = vi.hoisted(() => ({
  holdings: {
    data: undefined,
    isLoading: false,
    error: null,
  } as {
    data: HoldingsData | undefined;
    isLoading: boolean;
    error: Error | null;
  },
}));

vi.mock("@/features/governance/hooks/useHoldings", () => ({
  useHoldings: () => mocks.holdings,
}));

vi.mock("@/features/governance/hooks/useNodeTokenomics", () => ({
  useNodeTokenomicsConfig: () => ({
    data: {
      tokenAddress: null,
      distributorAddress: null,
      chainId: 8453,
      distributionsActive: false,
      epochsCompleted: 0,
    },
    isLoading: false,
    error: null,
  }),
  useNodeTokenomics: () => ({
    totalSupply: undefined,
    distributorBalance: undefined,
    viewerBalance: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/governance/components/YourPositionPanel", () => ({
  YourPositionPanel: () => <section aria-label="Your position" />,
}));

import { HoldingsView } from "@/app/(app)/gov/holdings/view";

const EMPTY: HoldingsData = {
  holdings: [],
  totalCreditsIssued: "0",
  totalContributors: 0,
  epochsCompleted: 0,
};

describe("Ownership page composition", () => {
  beforeEach(() => {
    mocks.holdings = { data: EMPTY, isLoading: false, error: null };
  });

  it("keeps the token distribution model visible with no token and zero finalized epochs", () => {
    render(<HoldingsView />);

    expect(screen.getByText("This node's token issuance")).toBeVisible();
    expect(screen.getByText("Finalize")).toBeInTheDocument();
    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.getByText("Claim")).toBeInTheDocument();
    expect(screen.getByText(/no proposal or vote/i)).toBeInTheDocument();
    expect(screen.getByText("No token configured yet")).toBeInTheDocument();
    expect(
      screen.getByText(/contributor credit allocations appear/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("wires exact finalized credit allocations into a captioned totals table", () => {
    mocks.holdings = {
      data: {
        holdings: [
          {
            claimantKey: "user:ada",
            claimantKind: "user",
            isLinked: true,
            displayName: "Ada",
            claimantLabel: "Contributor",
            avatar: "A",
            color: "blue",
            totalCredits: "1200",
            ownershipPercent: 100,
            epochsContributed: 2,
          },
        ],
        totalCreditsIssued: "1200",
        totalContributors: 1,
        epochsCompleted: 2,
      },
      isLoading: false,
      error: null,
    };

    render(<HoldingsView />);

    const table = screen.getByRole("table", {
      name: "Exact finalized credit totals for every contributor",
    });
    expect(
      within(table).getByRole("columnheader", { name: "Credits" })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Share of credits" })
    ).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: /Ada/ });
    expect(row).toHaveTextContent("1,200");
    expect(row).toHaveTextContent("100%");
    expect(row).toHaveTextContent("2");
  });
});
