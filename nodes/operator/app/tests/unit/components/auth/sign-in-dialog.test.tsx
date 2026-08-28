// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/components/auth/sign-in-dialog`
 * Purpose: Unit tests for SignInDialog provider rendering (bug.5074).
 * Scope: Asserts the dialog renders what /api/auth/providers advertises. Does not exercise the OAuth round trip.
 * Invariants: no hardcoded provider allowlist — a configured provider always gets a button, an unconfigured one never does.
 * Side-effects: none (fetch + next-auth mocked)
 * Links: src/components/kit/auth/SignInDialog.tsx
 * @public
 */

// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

import { SignInDialog } from "@/components/kit/auth/SignInDialog";

function mockProviders(ids: readonly string[]): void {
  const body = Object.fromEntries(
    ids.map((id) => [id, { id, name: id[0]?.toUpperCase() + id.slice(1) }])
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve(body) }))
  );
}

function renderDialog() {
  return render(
    <SignInDialog open onOpenChange={() => {}} onWalletConnect={() => {}} />
  );
}

describe("SignInDialog — renders configured providers (bug.5074)", () => {
  beforeEach(() => {
    signIn.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders Discord when the deployment configures it", async () => {
    // The exact levelup production shape: SIWE + Discord, no GitHub.
    mockProviders(["credentials", "discord"]);
    renderDialog();

    expect(
      await screen.findByText("Continue with Discord")
    ).toBeInTheDocument();
    // credentials is the wallet flow, surfaced as its own button — never as OAuth.
    expect(
      screen.queryByText("Continue with Credentials")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ethereum Wallet")).toBeInTheDocument();
  });

  it("does NOT render GitHub when the deployment never registers it", async () => {
    // Every node today. The old hardcoded array advertised a button that could not work.
    mockProviders(["credentials", "discord"]);
    renderDialog();

    await screen.findByText("Continue with Discord");
    expect(screen.queryByText("Continue with GitHub")).not.toBeInTheDocument();
  });

  it("renders an unknown provider using the name the server returned", async () => {
    mockProviders(["credentials", "gitlab"]);
    renderDialog();

    expect(await screen.findByText("Continue with Gitlab")).toBeInTheDocument();
  });

  it("offers wallet only when the provider fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    renderDialog();

    expect(await screen.findByText("Ethereum Wallet")).toBeInTheDocument();
    expect(screen.queryByText("Continue with Discord")).not.toBeInTheDocument();
    expect(screen.queryByText("Continue with GitHub")).not.toBeInTheDocument();
  });
});
