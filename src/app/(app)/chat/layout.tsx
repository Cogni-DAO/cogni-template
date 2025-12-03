// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/chat/layout`
 * Purpose: Chat-specific layout that creates a fixed-height viewport container.
 * Scope: Wraps chat page with height constraints to pin composer to bottom. Does not affect other routes.
 * Invariants: Height is exactly viewport minus header; overflow-hidden prevents document scroll.
 * Side-effects: none
 * Notes: Uses --app-header-h CSS variable defined in tailwind.css. Only applies to /chat route.
 * Links: src/app/(app)/chat/page.tsx, src/components/vendor/assistant-ui/thread.tsx
 * @public
 */

import type { ReactNode } from "react";

export default function ChatLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactNode {
  return (
    <div className="chat-viewport flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
