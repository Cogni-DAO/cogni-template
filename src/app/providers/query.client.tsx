// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/query.client`
 * Purpose: React Query provider for client-side data fetching and caching.
 * Scope: Wraps application with QueryClientProvider; configures default options. Client component only. Does not fetch data or manage state directly.
 * Invariants: QueryClient instance created once per component mount; stale time set to 60 seconds.
 * Side-effects: none
 * Notes: Required by wagmi for wallet state management; follows React Query best practices.
 * Links: https://tanstack.com/query/latest/docs/framework/react/overview
 * @public
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

export function QueryProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60 seconds
            staleTime: 60_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
