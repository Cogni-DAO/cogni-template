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

import { ThreadPrimitive } from "@assistant-ui/react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

import { Button, Thread } from "@/components";
import { ChatRuntimeProvider } from "@/features/ai/chat/providers/ChatRuntimeProvider.client";
import { useCreditsSummary } from "@/features/payments/public";

const SUGGESTIONS = [
  {
    title: "Help me start",
    label: "a community-owned project",
    action: "Help me start a community-owned project around ___",
  },
  {
    title: "Explain how",
    label: "Cogni works in 30 seconds",
    action: "Explain how Cogni works in 30 seconds",
  },
  {
    title: "Is my idea legal?",
    label: "What should I watch out for?",
    action: "Is my idea legal? What should I watch out for?",
  },
];

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
  <div className="mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] grow flex-col">
    <div className="flex w-full grow flex-col items-center justify-center">
      <div className="flex size-full flex-col justify-center px-8">
        <div className="fade-in slide-in-from-bottom-2 animate-in font-semibold text-2xl duration-300 ease-out">
          What do you want to build together?
        </div>
        <div className="fade-in slide-in-from-bottom-2 animate-in text-2xl text-muted-foreground/65 delay-100 duration-300 ease-out">
          Start a project, join one, or ship a change—Cogni helps with the next
          step.
        </div>
      </div>
    </div>
    <div className="grid w-full @md:grid-cols-2 gap-2 pb-4">
      {SUGGESTIONS.map((suggestion, index) => (
        <div
          key={`suggested-action-${suggestion.title}-${index}`}
          className="fade-in slide-in-from-bottom-4 @md:nth-[n+3]:block hidden nth-[n+3]:hidden animate-in duration-300 ease-out"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <ThreadPrimitive.Suggestion prompt={suggestion.action} send asChild>
            <Button
              variant="ghost"
              className="h-auto w-full flex-1 @md:flex-col flex-wrap items-start justify-start gap-1 rounded-3xl border px-5 py-4 text-sm dark:hover:bg-accent/60"
              aria-label={suggestion.action}
            >
              <span className="font-medium">{suggestion.title}</span>
              <span className="text-muted-foreground">{suggestion.label}</span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </div>
      ))}
    </div>
    <ChatCreditsHint />
  </div>
);

export default function ChatPage(): ReactNode {
  return (
    <div className="flex h-screen flex-col">
      <ChatRuntimeProvider onAuthExpired={() => signOut()}>
        <Thread welcomeMessage={<ChatWelcomeWithHint />} />
      </ChatRuntimeProvider>
    </div>
  );
}
