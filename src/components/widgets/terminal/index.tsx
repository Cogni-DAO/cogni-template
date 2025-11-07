// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Purpose: Animated terminal component displaying progressive installation steps with copy functionality.
 * Scope: Widget for showcasing CLI installation process; manages local animation state.
 * Invariants: Steps animate sequentially; copy button shows feedback; maintains accessibility.
 * Side-effects: time (animation timers), IO (clipboard write)
 * Notes: Used on landing page to demonstrate setup process; self-contained animation logic.
 * Links: ARCHITECTURE.md#components-widgets
 * @public
 */
"use client";

import { Check, Copy } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

export function Terminal(): ReactElement {
  const [terminalStep, setTerminalStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const terminalSteps = [
    "git clone https://github.com/cogni-template/cogni-template",
    "pnpm install",
    "pnpm db:setup",
    "pnpm db:migrate",
    "pnpm db:seed",
    "pnpm dev 🎉",
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerminalStep((prev) =>
        prev < terminalSteps.length - 1 ? prev + 1 : prev
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [terminalStep, terminalSteps.length]);

  const copyToClipboard = (): void => {
    navigator.clipboard.writeText(terminalSteps.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-900 font-mono text-sm text-white shadow-lg">
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex space-x-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
          </div>
          <button
            onClick={copyToClipboard}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-5 w-5" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="space-y-2">
          {terminalSteps.map((step, index) => (
            <div
              key={index}
              className={`${index > terminalStep ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
            >
              <span className="text-green-400">$</span> {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
