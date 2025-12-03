// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/chat/providers/ChatRuntimeProvider`
 * Purpose: Runtime provider for chat using assistant-ui with external store pattern.
 * Scope: Feature-local provider (v0 only wraps /chat route). Manages message state, API calls, abort control. Does not persist messages or handle streaming.
 * Invariants: All types from contract via z.infer; Zod parsing on response; ref-based state to avoid closures
 * Side-effects: IO (fetch to /api/v1/ai/chat, React Query invalidation)
 * Notes: Uses activeRequestIdRef for stale-response guard; AbortController for cancellation
 * Links: Uses ai.chat.v1 contract, integrates with payments query
 * @public
 */

"use client";

import {
  type AppendMessage,
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  aiChatOperation,
  type ChatInput,
  type ChatMessage,
} from "@/contracts/ai.chat.v1.contract";

/**
 * Message builder using CONTRACT TYPES - never manual interfaces
 */
function createChatMessage(
  role: ChatMessage["role"],
  text: string,
  id?: string
): ChatMessage {
  return {
    id: id ?? crypto.randomUUID(),
    role,
    createdAt: new Date().toISOString(),
    content: [{ type: "text" as const, text }],
    // requestId omitted for user messages (optional in schema)
  };
}

interface ChatRuntimeProviderProps {
  children: ReactNode;
  selectedModel: string;
  defaultModelId: string;
  onAuthExpired?: () => void;
}

export function ChatRuntimeProvider({
  children,
  selectedModel,
  defaultModelId,
  onAuthExpired,
}: ChatRuntimeProviderProps) {
  // ChatMessage includes optional requestId - type matches stored objects
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [threadId] = useState(() => crypto.randomUUID()); // client owns threadId

  // REFS to avoid stale closure bugs
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeRequestIdRef = useRef<string | null>(null); // REF not state!
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const onNew = async (message: AppendMessage) => {
    if (message.content[0]?.type !== "text")
      throw new Error("Only text supported");

    // 1. Build user message using contract type builder
    const userMessage = createChatMessage("user", message.content[0].text);
    const clientRequestId = crypto.randomUUID();

    // 2. Compute nextMessages deterministically BEFORE any async
    const nextMessages = [...messagesRef.current, userMessage];

    // 3. Update state + refs together
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setIsRunning(true);
    activeRequestIdRef.current = clientRequestId; // REF assignment

    // 4. Create AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      const requestBody: ChatInput = {
        threadId, // client-generated, stable for session
        clientRequestId,
        messages: nextMessages,
        model: selectedModel, // REQ-001: always present
      };

      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      // 5. Handle errors WITHOUT appending assistant message
      if (response.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (response.status === 402) {
        // TODO: show credits error in UI
        return;
      }
      if (response.status === 409) {
        // UX-001: Invalid model, retry with defaultModelId
        console.warn(`Model "${selectedModel}" invalid, retrying with default`);
        const retryBody: ChatInput = {
          ...requestBody,
          model: defaultModelId,
        };
        const retryResponse = await fetch("/api/v1/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retryBody),
          signal: abortControllerRef.current.signal,
        });
        if (!retryResponse.ok) {
          throw new Error(`API error after retry: ${retryResponse.status}`);
        }
        const retryRaw = await retryResponse.json();
        const retryParseResult = aiChatOperation.output.safeParse(retryRaw);
        if (!retryParseResult.success) {
          throw new Error(
            `Malformed retry response: ${retryParseResult.error.flatten().fieldErrors}`
          );
        }
        const retryData = retryParseResult.data;
        if (activeRequestIdRef.current !== clientRequestId) return;
        const retryFinalMessages = [...messagesRef.current, retryData.message];
        messagesRef.current = retryFinalMessages;
        setMessages(retryFinalMessages);
        queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
        return;
      }
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // 6. ZOD PARSE response - throws controlled error on malformed output
      const raw = await response.json();
      const parseResult = aiChatOperation.output.safeParse(raw);
      if (!parseResult.success) {
        throw new Error(
          `Malformed response: ${parseResult.error.flatten().fieldErrors}`
        );
      }
      const data = parseResult.data;

      // 7. Check if this request is still active (ref-based, not stale)
      if (activeRequestIdRef.current !== clientRequestId) return;

      // 8. Append assistant message on SUCCESS only
      const finalMessages = [...messagesRef.current, data.message];
      messagesRef.current = finalMessages;
      setMessages(finalMessages);

      // Only invalidate credits on successful response
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // cancelled - do NOT append
      }
      throw err;
    } finally {
      setIsRunning(false);
      activeRequestIdRef.current = null;
      abortControllerRef.current = null;
    }
  };

  // Stop handler for abort - works even in v0 non-streaming
  const onCancel = async () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  };

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages: (msgs) => setMessages(Array.from(msgs)),
    isRunning,
    onNew,
    onCancel,
    convertMessage: (m) => ({
      ...m,
      createdAt: new Date(m.createdAt), // Convert string to Date for assistant-ui
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
