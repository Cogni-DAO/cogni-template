// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/credits/credits-page-client`
 * Purpose: Ensure CreditsPageClient passes repo-spec-derived widgetConfig into the DePay widget (no env or literals).
 * Scope: Renders client component with mocked DePayWidget and react-query hooks; asserts props wiring only; does not perform network requests or env access.
 * Invariants: chainId and receiverAddress come from widgetConfig props.
 * Side-effects: none
 * Links: src/app/(app)/credits/CreditsPage.client.tsx
 * @public
 */

// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDePayWidget = vi.fn<(props: unknown) => ReactElement>(() => (
  <div data-testid="depay-widget" />
));

vi.mock("@/components/vendor/depay", () => ({
  DePayWidget: (props: unknown) => {
    mockDePayWidget(props);
    return <div data-testid="depay-widget" />;
  },
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: ({ children }: { children?: ReactElement }) => <>{children}</>,
  RainbowKitProvider: ({ children }: { children?: ReactElement }) => (
    <>{children}</>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { balanceCredits: 0, ledger: [] },
    isLoading: false,
    isError: false,
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

describe("CreditsPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes widgetConfig values into DePayWidget", async () => {
    const widgetConfig = {
      chainId: 8453,
      receivingAddress: "0x1111111111111111111111111111111111111111",
      provider: "depay",
    };

    const { CreditsPageClient } = await import(
      "@/app/(app)/credits/CreditsPage.client"
    );

    render(<CreditsPageClient widgetConfig={widgetConfig} />);

    expect(mockDePayWidget).toHaveBeenCalledTimes(1);
    const [firstCall] = mockDePayWidget.mock.calls;
    if (!firstCall) {
      throw new Error("DePayWidget mock was not called");
    }
    const props = firstCall[0] as { chainId: number; receiverAddress: string };

    expect(props.chainId).toBe(widgetConfig.chainId);
    expect(props.receiverAddress).toBe(widgetConfig.receivingAddress);
  });
});
