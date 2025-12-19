// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/chat/providers/ChatRuntimeProvider`
 * Purpose: Runtime provider for chat using assistant-ui streaming.
 * Scope: Feature-local provider. Uses useDataStreamRuntime for streaming. Does not persist messages or manage auth.
 * Invariants: All types from contract via z.infer
 * Side-effects: IO (fetch to /api/v1/ai/chat via runtime)
 * Notes: Uses @assistant-ui/react-data-stream
 * Links: Uses ai.chat.v1 contract, assistant-stream on server
 * @public
 */

"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

import type { ChatError } from "@/contracts/error.chat.v1.contract";
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
  defaultModelId: string;
  onAuthExpired?: () => void;
  onError?: (error: ChatError) => void;
}

export function ChatRuntimeProvider({
  children,
  selectedModel,
  defaultModelId,
  onAuthExpired,
  onError,
}: ChatRuntimeProviderProps) {
  const queryClient = useQueryClient();
  const selectedModelRef = useRef(selectedModel);

  // Keep ref in sync
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Handle response errors
  const handleResponse = useCallback(
    async (response: Response) => {
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
    [defaultModelId, onAuthExpired, onError]
  );

  // Handle stream finish - invalidate credits query
  const handleFinish = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
  }, [queryClient]);

  const runtime = useDataStreamRuntime({
    api: "/api/v1/ai/chat",
    body: {
      model: selectedModel,
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
