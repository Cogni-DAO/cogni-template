// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/app-layout-auth-guard`
 * Purpose: Unit tests for (app)/layout auth guard invariant enforcement.
 * Scope: Tests that AppLayout enforces authenticated sessions must have walletAddress. Does not test routing or actual NextAuth integration.
 * Invariants: loading shows UI; unauthenticated redirects; authenticated without wallet calls signOut; authenticated with wallet renders children.
 * Side-effects: none (mocked hooks)
 * Notes: Uses React Testing Library with mocked useSession, signOut, and useRouter. DOM environment via test-level override.
 * Links: src/app/(app)/layout.tsx, docs/SECURITY_AUTH_SPEC.md
 * @public
 */

// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Next.js navigation hooks
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// Mock next-auth/react hooks
const mockSignOut = vi.fn();
let mockSessionData: {
  status: "loading" | "authenticated" | "unauthenticated";
  data: { user?: { walletAddress?: string } } | null;
};

vi.mock("next-auth/react", () => ({
  useSession: () => mockSessionData,
  signOut: mockSignOut,
}));

// Mock RainbowKit (causes Vanilla Extract CommonJS errors in happy-dom)
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  RainbowKitProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

describe("AppLayout Auth Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading UI when status is loading", async () => {
    mockSessionData = {
      status: "loading",
      data: null,
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should show loading state
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Should not render children
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();

    // Should not call navigation or signOut
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("redirects to home when status is unauthenticated", async () => {
    mockSessionData = {
      status: "unauthenticated",
      data: null,
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    const { container } = render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should call router.replace('/') via useEffect
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });

    // Should render null (container should be empty)
    expect(container.firstChild).toBeNull();

    // Should not render children
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();

    // Should not call signOut
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("renders children when authenticated with valid walletAddress", async () => {
    mockSessionData = {
      status: "authenticated",
      data: {
        user: {
          walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        },
      },
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should render children
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    // Should not call router.replace or signOut
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("calls signOut when authenticated but walletAddress is missing", async () => {
    mockSessionData = {
      status: "authenticated",
      data: {
        user: {}, // No walletAddress
      },
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should call signOut via useEffect
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    // Should render children initially (before signOut completes)
    // The layout renders children when status='authenticated' in the sync render,
    // but triggers signOut in useEffect
    expect(screen.getByTestId("children")).toBeInTheDocument();

    // Should not call router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("calls signOut when authenticated but walletAddress is explicitly undefined", async () => {
    mockSessionData = {
      status: "authenticated",
      data: {
        user: {
          // Omit walletAddress entirely (can't explicitly pass undefined with exactOptionalPropertyTypes)
        },
      },
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should call signOut via useEffect
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    // Should not call router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("calls signOut when authenticated but session.user is missing", async () => {
    mockSessionData = {
      status: "authenticated",
      data: {}, // No user property
    };

    const { default: AppLayout } = await import("@/app/(app)/layout");

    render(
      <AppLayout>
        <div data-testid="children">Protected Content</div>
      </AppLayout>
    );

    // Should call signOut via useEffect
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    // Should not call router.replace
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
