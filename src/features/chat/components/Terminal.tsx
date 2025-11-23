// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/chat/components/Terminal`
 * Purpose: Terminal component displaying authenticated session information with copy functionality.
 * Scope: Feature component for chat page showing wallet address and session status. Does NOT handle authentication logic.
 * Invariants: Displays static session info; copy button shows feedback; maintains accessibility.
 * Side-effects: IO (clipboard write)
 * Notes: Composes TerminalFrame with chat-specific content.
 * Links: src/components/kit/data-display/TerminalFrame.tsx
 * @public
 */

"use client";

import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { Prompt, Reveal, TerminalFrame } from "@/components";

export interface TerminalProps {
  /**
   * Wallet address to display
   */
  walletAddress: string;
}

export function Terminal({ walletAddress }: TerminalProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const lines = [
    { prompt: "#", text: "Authenticated Session" },
    { prompt: "wallet:", text: walletAddress },
    { prompt: "#", text: "Chat interface coming soon..." },
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, lines.length - 1));
    }, 500);
    return () => clearTimeout(timer);
  }, [currentStep, lines.length]);

  const onCopy = (): void => {
    navigator.clipboard.writeText(
      lines.map((line) => `${line.prompt} ${line.text}`).join("\n")
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TerminalFrame onCopy={onCopy} copied={copied}>
      {lines.map((line, index) => (
        <Reveal
          key={index}
          state={index > currentStep ? "hidden" : "visible"}
          duration="normal"
          delay="none"
        >
          <Prompt tone="success">{line.prompt}</Prompt> {line.text}
        </Reveal>
      ))}
    </TerminalFrame>
  );
}
