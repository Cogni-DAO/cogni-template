// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/chat/providers/ChatRuntimeProvider`
 * Purpose: Runtime provider for chat using assistant-ui streaming with multi-turn state.
 * Scope: Feature-local provider. Uses useDataStreamRuntime for streaming. Manages threadId state for LangGraph Server conversation continuity. Does not persist messages or manage auth.
 * Invariants:
 *   - BODY_IS_OBJECT: body must be object (not function) per assistant-ui limitation
 *   - THREAD_STATE_BY_KEY: threadId stored in threadIdByStateKey map for future thread switching
 * Side-effects: IO (fetch to /api/v1/ai/chat via runtime)
 * Notes: Uses @assistant-ui/react-data-stream; captures X-Thread-Id from response header
 * Links: ai.chat.v1 contract, chat/AGENTS.md (Thread State Management)
 * @public
 */

"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ChatError } from "@/contracts/error.chat.v1.contract";
import type { GraphId } from "@/ports";
import * as clientLogger from "@/shared/observability/client";
import { EVENT_NAMES } from "@/shared/observability/events";

import { mapHttpError } from "../utils/mapHttpError";

/**
 * Ref handle for ChatRuntimeProvider
 */
export interface ChatRuntimeRef {
  retryLastSend: () => void;
}

interface ChatRuntimeProviderProps {
  children: ReactNode;
  selectedModel: string;
  selectedGraph: GraphId;
  defaultModelId: string;
  onAuthExpired?: () => void;
  onError?: (error: ChatError) => void;
}

export function ChatRuntimeProvider({
  children,
  selectedModel,
  selectedGraph,
  defaultModelId,
  onAuthExpired,
  onError,
}: ChatRuntimeProviderProps) {
  const queryClient = useQueryClient();
  const selectedModelRef = useRef(selectedModel);
  const selectedGraphRef = useRef(selectedGraph);

  // State key for multi-turn conversations
  // Map pattern preserved for future thread switching/forks support (see chat/AGENTS.md)
  // Server generates stateKey on first request, we capture from X-State-Key and reuse
  const [stateKeyMap, setStateKeyMap] = useState<Record<string, string>>({});
  const activeStateKey = "default"; // Placeholder for future state/thread selection
  const stateKey = stateKeyMap[activeStateKey];

  // Keep refs in sync
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    selectedGraphRef.current = selectedGraph;
  }, [selectedGraph]);

  // Handle response - capture stateKey and handle errors
  const handleResponse = useCallback(
    async (response: Response) => {
      // Capture stateKey from response header for multi-turn continuity
      // Server generates stateKey on first request, we reuse it for subsequent requests
      const newStateKey = response.headers.get("X-State-Key");
      if (newStateKey && newStateKey !== stateKey) {
        setStateKeyMap((prev) => ({
          ...prev,
          [activeStateKey]: newStateKey,
        }));
      }

      if (response.status === 401) {
        onAuthExpired?.();
        throw new Error("Unauthorized");
      }

      if (response.status === 402) {
        const body = await response.json().catch(() => ({}));
        const error = mapHttpError(402, body, crypto.randomUUID());
        onError?.(error);
        throw new Error("Insufficient credits");
      }

      if (response.status === 409) {
        // UX-001: Invalid model - log warning but let retry happen via body.model
        clientLogger.warn(EVENT_NAMES.CLIENT_CHAT_MODEL_INVALID_RETRY, {
          model: selectedModelRef.current,
          defaultModelId,
        });
        // The server returns defaultModelId in the 409 response
        // For now, throw to trigger retry - user can resend with default model
        throw new Error("Invalid model");
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = mapHttpError(response.status, body, crypto.randomUUID());
        onError?.(error);
        throw new Error(body.error || "Request failed");
      }
    },
    [defaultModelId, onAuthExpired, onError, stateKey]
  );

  // Handle stream finish - invalidate credits query
  const handleFinish = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
  }, [queryClient]);

  const runtime = useDataStreamRuntime({
    api: "/api/v1/ai/chat",
    // body must be object (not function) - assistant-ui limitation
    // stateKey from state; state change triggers re-render with new body
    body: {
      model: selectedModel,
      graphName: selectedGraph,
      ...(stateKey ? { stateKey } : {}),
    },
    onResponse: handleResponse,
    onFinish: handleFinish,
    onError: (error) => {
      clientLogger.error(EVENT_NAMES.CLIENT_CHAT_STREAM_ERROR, {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // Note: disabled prop is handled by parent - composer should be disabled there

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
