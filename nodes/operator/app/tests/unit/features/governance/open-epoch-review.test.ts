// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `open-epoch-review.test`
 * Purpose: Prove the UI only offers the open-to-review transition after an open epoch ends.
 * Scope: Eligibility boundary, reactive clock, and mutation invalidation tests; route authorization remains covered by the route contract suite.
 * Invariants: REVIEW_ONLY_AFTER_PERIOD_END, REVIEW_ONLY_FROM_OPEN.
 * Side-effects: mocked clock and HTTP
 * Links: src/features/governance/hooks/useOpenEpochReview.ts, work item bug.5042
 * @public
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isEpochReadyForReview,
  useEpochReviewReadiness,
  useOpenEpochReview,
} from "@/features/governance/hooks/useOpenEpochReview";

const END = "2026-08-17T00:00:00.000Z";
const END_MS = Date.parse(END);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isEpochReadyForReview", () => {
  it("opens at the exact period boundary", () => {
    expect(isEpochReadyForReview("open", END, END_MS)).toBe(true);
  });

  it("stays unavailable before the period boundary", () => {
    expect(isEpochReadyForReview("open", END, END_MS - 1)).toBe(false);
  });

  it.each([
    "review",
    "finalized",
  ] as const)("does not offer the transition from %s", (status) => {
    expect(isEpochReadyForReview(status, END, END_MS + 1)).toBe(false);
  });

  it("fails closed for an invalid period end", () => {
    expect(isEpochReadyForReview("open", "not-a-date", END_MS)).toBe(false);
  });
});

describe("useEpochReviewReadiness", () => {
  it("reacts at the exact boundary without a parent render", () => {
    vi.useFakeTimers();
    vi.setSystemTime(END_MS - 1_000);

    const { result } = renderHook(() => useEpochReviewReadiness("open", END));

    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("stays closed for review and finalized states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(END_MS + 1_000);

    const review = renderHook(() => useEpochReviewReadiness("review", END));
    const finalized = renderHook(() =>
      useEpochReviewReadiness("finalized", END)
    );

    expect(review.result.current).toBe(false);
    expect(finalized.result.current).toBe(false);
  });

  it("resets a reached boundary when the workspace advances to a later epoch", () => {
    vi.useFakeTimers();
    vi.setSystemTime(END_MS + 1_000);
    const nextEnd = "2026-08-24T00:00:00.000Z";

    const { result, rerender } = renderHook(
      ({ periodEnd }) => useEpochReviewReadiness("open", periodEnd),
      { initialProps: { periodEnd: END } }
    );
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(true);

    rerender({ periodEnd: nextEnd });

    expect(result.current).toBe(false);
  });
});

describe("useOpenEpochReview", () => {
  it("posts once and invalidates governance data after success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ epoch: { id: "epoch-7", status: "review" } }),
    } as Response);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useOpenEpochReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("epoch-7");
    });

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/attribution/epochs/epoch-7/review",
      { method: "POST", credentials: "same-origin" }
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["governance"] })
    );
  });
});
