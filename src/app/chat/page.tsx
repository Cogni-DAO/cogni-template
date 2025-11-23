// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/chat/page`
 * Purpose: Protected chat page requiring authentication.
 * Scope: Client component that enforces authentication via useSession hook. Redirects unauthenticated users to home. Does not implement chat functionality yet.
 * Invariants: Requires valid Auth.js session with wallet address to render.
 * Side-effects: IO (Auth.js session retrieval via client hook, Next.js navigation)
 * Notes: MVP scaffold - displays wallet address in terminal frame; chat UI coming soon. Uses client-side auth to avoid Next.js 15 async headers issue.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { container, section } from "@/components";
import { Terminal } from "@/features/chat/components/Terminal";

export default function ChatPage(): ReactNode {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect unauthenticated users to home
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // Loading state
  if (status === "loading") {
    return (
      <div className={section()}>
        <div className={container({ size: "lg" })}>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // Redirect in progress or no session
  if (status === "unauthenticated" || !session) {
    return null;
  }

  const walletAddress =
    session.user?.walletAddress ?? session.user?.id ?? "Unknown";

  return (
    <div className={section()}>
      <div className={container({ size: "lg", spacing: "xl" })}>
        <div className="mx-auto max-w-[var(--size-container-lg)]">
          <Terminal walletAddress={walletAddress} />
        </div>
      </div>
    </div>
  );
}
