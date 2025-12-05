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

import type { ChatInput, ChatMessage } from "@/contracts/ai.chat.v1.contract";
import * as clientLogger from "@/shared/observability/client";
import { EVENT_NAMES } from "@/shared/observability/events";

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
      const requestBody: ChatInput & { stream?: boolean } = {
        threadId, // client-generated, stable for session
        clientRequestId,
        messages: nextMessages,
        model: selectedModel, // REQ-001: always present
        stream: true,
      };

      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
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
        clientLogger.warn(EVENT_NAMES.CLIENT_CHAT_MODEL_INVALID_RETRY, {
          selectedModel,
          defaultModelId,
        });
        const retryBody: ChatInput & { stream?: boolean } = {
          ...requestBody,
          model: defaultModelId,
        };
        const retryResponse = await fetch("/api/v1/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(retryBody),
          signal: abortControllerRef.current.signal,
        });
        if (!retryResponse.ok) {
          throw new Error(`API error after retry: ${retryResponse.status}`);
        }
        await processStream(retryResponse, clientRequestId);
        return;
      }
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      await processStream(response, clientRequestId);
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

  const processStream = async (response: Response, clientRequestId: string) => {
    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const assistantMessageId = crypto.randomUUID();
    let accumulatedContent = "";

    // Create initial assistant message
    const initialAssistantMessage = createChatMessage(
      "assistant",
      "",
      assistantMessageId
    );

    // Optimistically add assistant message
    if (activeRequestIdRef.current === clientRequestId) {
      const msgs = [...messagesRef.current, initialAssistantMessage];
      messagesRef.current = msgs;
      setMessages(msgs);
    }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        processSseChunk(
          chunk,
          clientRequestId,
          accumulatedContent,
          (content) => {
            accumulatedContent = content;
          }
        );
      }
    }
  };

  const processSseChunk = (
    chunk: string,
    clientRequestId: string,
    currentContent: string,
    onContentUpdate: (content: string) => void
  ) => {
    const lines = chunk.split("\n");
    let eventType = "";
    let dataStr = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataStr = line.slice(6);
      }
    }

    if (!dataStr) return;

    try {
      const data = JSON.parse(dataStr);
      if (activeRequestIdRef.current !== clientRequestId) return;

      if (eventType === "message.delta") {
        const newContent = currentContent + data.delta;
        onContentUpdate(newContent);
        updateLastMessageContent(newContent);
      } else if (eventType === "message.completed") {
        queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      } else if (eventType === "error") {
        clientLogger.error(EVENT_NAMES.CLIENT_CHAT_STREAM_ERROR, {
          message: data.message,
        });
      }
    } catch (e) {
      clientLogger.error(EVENT_NAMES.CLIENT_CHAT_STREAM_CHUNK_PARSE_FAIL, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const updateLastMessageContent = (newContent: string) => {
    const currentMsgs = [...messagesRef.current];
    const lastMsg = currentMsgs[currentMsgs.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      currentMsgs[currentMsgs.length - 1] = {
        ...lastMsg,
        content: [{ type: "text", text: newContent }],
      };
      messagesRef.current = currentMsgs;
      setMessages(currentMsgs);
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
