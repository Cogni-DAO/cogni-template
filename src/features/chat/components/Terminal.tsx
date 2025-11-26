// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/chat/components/Terminal`
 * Purpose: Terminal component for a real-time chat interface.
 * Scope: Feature component for the chat page that allows users to send messages and see responses from an AI. Does not handle authentication.
 * Invariants: Displays chat history, handles user input, and interacts with the AI completion API.
 * Side-effects: IO (API requests, clipboard write)
 * Notes: Composes TerminalFrame with chat-specific content.
 * Links: src/components/kit/data-display/TerminalFrame.tsx
 * @public
 */

"use client";

import type { FormEvent, ReactElement } from "react";
import { useState } from "react";

import { Button, Input, Prompt, Reveal, TerminalFrame } from "@/components";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface TerminalProps {
  onAuthExpired?: () => void;
}

export function Terminal({ onAuthExpired }: TerminalProps): ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/ai/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else if (response.status === 401) {
        setError("Your session expired, please reconnect your wallet.");
        onAuthExpired?.();
      } else if (response.status === 402) {
        setError("You're out of credits.");
      } else {
        const errorData = await response.json();
        setError(errorData.error ?? "An error occurred.");
      }
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const onCopy = (): void => {
    navigator.clipboard.writeText(
      messages.map((m) => `${m.role}: ${m.content}`).join("\n")
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TerminalFrame onCopy={onCopy} copied={copied}>
      <div className="flex h-full flex-col">
        <div className="flex-grow overflow-y-auto p-4">
          {messages.map((message) => (
            <Reveal
              key={message.id}
              state="visible"
              duration="normal"
              delay="none"
            >
              <div className="mb-2">
                <Prompt tone={message.role === "user" ? "info" : "success"}>
                  {message.role}
                </Prompt>{" "}
                {message.content}
              </div>
            </Reveal>
          ))}
          {isLoading && (
            <Reveal state="visible" duration="normal" delay="none">
              <div className="mb-2">
                <Prompt tone="warning">assistant</Prompt> thinking...
              </div>
            </Reveal>
          )}
          {error && (
            <Reveal state="visible" duration="normal" delay="none">
              <div className="mb-2">
                <Prompt tone="error">Error</Prompt> {error}
              </div>
            </Reveal>
          )}
        </div>
        <div className="h-px bg-border" />
        <form onSubmit={handleSubmit} className="flex p-4">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-grow"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading} className="ml-2">
            Send
          </Button>
        </form>
      </div>
    </TerminalFrame>
  );
}
