// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/\(app\)/chat/page`
 * Purpose: Protected chat page.
 * Scope: Client component that displays the chat interface. Does NOT handle authentication - enforced by (app)/layout.tsx.
 * Invariants: Session guaranteed by (app)/layout auth guard.
 * Side-effects: IO (NextAuth session retrieval via client hook)
 * Notes: Displays the main chat terminal.
 * Links: src/features/chat/components/Terminal.tsx
 * @public
 */

"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

import { container, section } from "@/components";
import { Terminal } from "@/features/chat/components/Terminal";

export default function ChatPage(): ReactNode {
  return (
    <div className={section()}>
      <div className={container({ size: "lg", spacing: "xl" })}>
        <div className="mx-auto max-w-[var(--size-container-lg)]">
          <Terminal onAuthExpired={() => signOut()} />
        </div>
      </div>
    </div>
  );
}
