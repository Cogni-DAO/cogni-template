// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `epoch-finish-wiring.spec`
 * Purpose: Prove page ownership and action-level authority in the unified epoch journey.
 * Scope: App-view composition with visual children and IO hooks mocked.
 * Invariants: EPOCH_OVERVIEW_READ_ONLY, ACTIONS_GATED_NOT_STATE, PUBLISH_ONLY_IN_FINISH.
 * Side-effects: none
 * Links: src/app/(app)/gov/epoch/view.tsx, src/app/(app)/gov/review/view.tsx, bug.5042
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EpochView } from "@/features/governance/types";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  epochsPage: { data: undefined, isLoading: false, error: null } as unknown,
}));

vi.mock("@/features/governance/hooks/useEpochsPage", () => ({
  useEpochsPage: () => ({ ...mocks.epochsPage, refetch: mocks.refetch }),
}));

vi.mock("@/features/governance/hooks/useOpenEpochReview", () => ({
  useEpochReviewReadiness: () => true,
  useOpenEpochReview: () => ({
    error: null,
    isPending: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock("@/features/governance/hooks/useSignEpoch", () => ({
  useSignEpoch: () => ({
    state: {
      phase: "IDLE",
      isInFlight: false,
      statementId: null,
      errorMessage: null,
    },
    sign: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/features/governance/hooks/useReviewSubjectOverrides", () => ({
  useReviewSubjectOverrides: () => ({
    overridesByRef: new Map(),
    isLoading: false,
    loadError: null,
    retryLoad: vi.fn(),
    saveOverride: vi.fn(),
    removeOverride: vi.fn(),
    isSaving: false,
    mutationError: null,
    clearMutationError: vi.fn(),
  }),
}));

vi.mock("@/features/governance/components/EpochCountdown", () => ({
  EpochCountdown: () => null,
}));
vi.mock("@/features/governance/components/EpochDetail", () => ({
  EpochDetail: ({ epoch }: { epoch: EpochView }) => (
    <div data-testid={`detail-${epoch.id}`}>Epoch detail</div>
  ),
}));
vi.mock("@/features/governance/components/EpochLifecycleProgress", () => ({
  EpochLifecycleProgress: ({ epoch }: { epoch: EpochView }) => (
    <div data-testid={`rail-${epoch.id}`}>Lifecycle rail</div>
  ),
}));
vi.mock("@/features/governance/components/ExecuteDistributionPanel", () => ({
  ExecuteDistributionPanel: () => (
    <div data-testid="publish-panel">Publish distribution</div>
  ),
}));

vi.mock("@/components", () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ExpandableTableRow: ({
    cells,
    expandedContent,
  }: {
    cells: ReactNode[];
    expandedContent: ReactNode;
  }) => (
    <div>
      {cells}
      {expandedContent}
    </div>
  ),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  PieChart: () => null,
  Table: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TableBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TableCell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TableHead: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TableHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TableRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { CurrentEpochView } from "@/app/(app)/gov/epoch/view";
import { ReviewView } from "@/app/(app)/gov/review/view";

const WALLET = "0xabc";
const EVIDENCE = {
  foldedEpochIds: [] as string[],
  latestFoldedEpochId: null,
  publishedThroughEpochId: null,
  publicationEvidence: "not_published" as const,
};

function epoch(
  id: string,
  status: EpochView["status"],
  approvers: readonly string[] | null
): EpochView {
  return {
    id,
    status,
    periodStart: "2026-08-10T00:00:00.000Z",
    periodEnd: "2026-08-17T00:00:00.000Z",
    poolTotalCredits: status === "finalized" ? "100" : null,
    approvers,
    contributors: [],
    unresolvedCount: 0,
    unresolvedActivities: [],
  };
}

function setEpochs(allEpochs: EpochView[]): void {
  const current = allEpochs.find((item) => item.status === "open") ?? null;
  mocks.epochsPage = {
    data: {
      current,
      pastEpochs: allEpochs.filter((item) => item !== current),
      allEpochs,
      distributionLifecycle: EVIDENCE,
    },
    isLoading: false,
    error: null,
  };
}

describe("unified epoch page wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the epoch overview read-only while showing rails for current and closed epochs", () => {
    setEpochs([epoch("8", "open", null), epoch("7", "finalized", [WALLET])]);
    render(<CurrentEpochView />);

    expect(screen.getByTestId("rail-8")).toBeInTheDocument();
    expect(screen.getByTestId("rail-7")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-panel")).not.toBeInTheDocument();
  });

  it("uses current policy to open an ended epoch in the finish workspace", () => {
    setEpochs([epoch("8", "open", null)]);
    render(
      <ReviewView nodeId="operator" walletAddress={WALLET} isCurrentApprover />
    );

    fireEvent.click(screen.getByRole("button", { name: /open for review/i }));
    expect(mocks.mutate).toHaveBeenCalledWith("8");
  });

  it("keeps review visible but locks edits and signing for a wallet absent from the pin", () => {
    setEpochs([epoch("7", "review", ["0xother"])]);
    render(
      <ReviewView nodeId="operator" walletAddress={WALLET} isCurrentApprover />
    );

    expect(screen.getByTestId("detail-7")).toBeInTheDocument();
    expect(screen.getByText(/only an approver pinned/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign & finalize/i })
    ).not.toBeInTheDocument();
  });

  it("uses epoch-pinned authority for signing, not current policy", () => {
    setEpochs([epoch("7", "review", [WALLET])]);
    render(
      <ReviewView
        nodeId="operator"
        walletAddress={WALLET}
        isCurrentApprover={false}
      />
    );

    expect(
      screen.getByRole("button", { name: /sign & finalize/i })
    ).toBeInTheDocument();
  });

  it("places publish only in Finish Epoch for the latest folded manifest", () => {
    const finalized = epoch("7", "finalized", [WALLET]);
    setEpochs([finalized]);
    mocks.epochsPage = {
      ...(mocks.epochsPage as object),
      data: {
        current: null,
        pastEpochs: [finalized],
        allEpochs: [finalized],
        distributionLifecycle: {
          ...EVIDENCE,
          foldedEpochIds: ["7"],
          latestFoldedEpochId: "7",
        },
      },
    };

    render(
      <ReviewView
        nodeId="operator"
        walletAddress={WALLET}
        isCurrentApprover={false}
      />
    );
    expect(screen.getByTestId("publish-panel")).toBeInTheDocument();
  });
});
