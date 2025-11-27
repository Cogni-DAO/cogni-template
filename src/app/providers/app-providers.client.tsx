// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/app-providers.client`
 * Purpose: Composition of all client-side React providers for the web UI shell.
 * Scope: Composes QueryProvider and WalletProvider; wraps application children. Client component only. Does not configure providers or handle routing.
 * Invariants: Order matters - QueryProvider outermost (required by wagmi), then WalletProvider.
 * Side-effects: none
 * Notes: Single entry point for all client providers; part of app delivery layer. Does not touch core/ports/adapters.
 * Links: Provider composition pattern for React
 * @public
 */

"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";

import { AuthProvider } from "./auth.client";
import { QueryProvider } from "./query.client";

function SafeWalletProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [COMPONENT, setComponent] = useState<ComponentType<{
    children: ReactNode;
  }> | null>(null);

  useEffect(() => {
    import("./wallet.client").then((mod) => {
      setComponent(() => mod.WalletProvider);
    });
  }, []);

  if (!COMPONENT) {
    return <>{children}</>;
  }

  return <COMPONENT>{children}</COMPONENT>;
}

export function AppProviders({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <AuthProvider>
      <QueryProvider>
        <SafeWalletProvider>{children}</SafeWalletProvider>
      </QueryProvider>
    </AuthProvider>
  );
}
