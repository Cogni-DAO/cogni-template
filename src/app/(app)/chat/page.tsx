// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/chat/page`
 * Purpose: Protected chat page with assistant-ui integration.
 * Scope: Client component that displays chat interface using assistant-ui Thread component. Does not handle authentication directly.
 * Invariants: Session guaranteed by (app)/layout auth guard.
 * Side-effects: IO (chat API calls, session management)
 * Notes: Uses assistant-ui with useExternalStoreRuntime; ThreadWelcome customized for Cogni copy.
 * Links: src/components/vendor/assistant-ui/thread.tsx, src/features/ai/chat/providers/ChatRuntimeProvider.client.tsx
 * @public
 */

"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

import { Thread } from "@/components";
import { ChatRuntimeProvider } from "@/features/ai/chat/providers/ChatRuntimeProvider.client";
import { useCreditsSummary } from "@/features/payments/public";

function ChatCreditsHint() {
  const { data, isLoading, isError } = useCreditsSummary();
  const noCredits = !isLoading && !isError && (data?.balanceCredits ?? 0) === 0;

  if (!noCredits) return null;

  return (
    <div className="mt-6 flex justify-center">
      <p className="text-muted-foreground text-sm">
        You may need credits to run AI.{" "}
        <Link href="/credits" className="text-primary underline">
          Add credits →
        </Link>
      </p>
    </div>
  );
}

const ChatWelcomeWithHint = () => (
  <div className="mx-auto flex h-full w-full max-w-[var(--thread-max-width)] flex-col items-center justify-center">
    <div className="flex flex-col justify-center px-8">
      <div className="fade-in slide-in-from-bottom-2 animate-in font-semibold text-2xl duration-300 ease-out">
        What do you want to build together?
      </div>
      <div className="fade-in slide-in-from-bottom-2 animate-in text-2xl text-muted-foreground/65 delay-100 duration-300 ease-out">
        Start a project, join one, or ship a change—Cogni helps with the next
        step.
      </div>
    </div>
    <ChatCreditsHint />
  </div>
);

export default function ChatPage(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatRuntimeProvider onAuthExpired={() => signOut()}>
        <Thread welcomeMessage={<ChatWelcomeWithHint />} />
      </ChatRuntimeProvider>
    </div>
  );
}
