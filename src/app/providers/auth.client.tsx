// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/auth.client`
 * Purpose: SessionProvider wrapper for NextAuth client context.
 * Scope: Client-only provider to wrap the App tree. Does not fetch data or add side effects.
 * Invariants: Minimal; only composes SessionProvider.
 * Side-effects: none
 * Links: None
 * @public
 */

"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function AuthProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <SessionProvider>{children}</SessionProvider>;
}
