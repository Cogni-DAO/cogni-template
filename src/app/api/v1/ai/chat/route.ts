// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/chat`
 * Purpose: HTTP endpoint for chat API using assistant-ui streaming.
 * Scope: Maps UiEvents to assistant-stream format, emits FinishMessage with real usage. Does not implement business logic.
 * Invariants:
 *   - Uses official assistant-stream helper (no custom SSE)
 *   - Validates input with contract, delegates to completion facade
 * Side-effects: IO (HTTP request/response)
 * Notes: Uses createAssistantStreamResponse from assistant-stream package
 * Links: Uses ai.chat.v1 contract, completion.server facade, assistant-stream
 * @public
 */

import { createAssistantStreamResponse } from "assistant-stream";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import {
  type AssistantUiMessage,
  aiChatOperation,
  type ChatInput,
  type ContentPart,
} from "@/contracts/ai.chat.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";
import {
  aiChatStreamDurationMs,
  logRequestWarn,
  type RequestContext,
} from "@/shared/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tool call structure for MessageDto.
 * Matches downstream toBaseMessage() expectations.
 */
interface MessageToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Internal message DTO for completion facade.
 * Extended to support tool calls (assistant) and tool results (tool role).
 */
interface MessageDto {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp?: string;
  /** Tool calls made by assistant (only for role: "assistant") */
  toolCalls?: MessageToolCall[];
  /** Tool call ID this message responds to (only for role: "tool") */
  toolCallId?: string;
}

/**
 * Validate message history consistency.
 * Returns error message if invalid, undefined if valid.
 *
 * Checks:
 * 1. No system messages (not supported in P0)
 * 2. All tool-result toolCallIds reference earlier assistant tool-calls
 * 3. No duplicate tool-results for the same toolCallId
 */
function validateMessageHistory(
  wireMessages: AssistantUiMessage[]
): string | undefined {
  const seenToolCallIds = new Set<string>();
  const resolvedToolCallIds = new Set<string>();

  for (const msg of wireMessages) {
    // System messages not supported in P0
    if (msg.role === "system") {
      return "system messages are not supported; use the system field in request body";
    }

    if (typeof msg.content === "string") continue;

    // Collect tool call IDs from assistant messages
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "tool-call") {
          seenToolCallIds.add(part.toolCallId);
        }
      }
    }

    // Validate tool result IDs reference seen tool calls and are not duplicates
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool-result") {
          if (!seenToolCallIds.has(part.toolCallId)) {
            return `tool-result references unknown toolCallId: ${part.toolCallId}`;
          }
          if (resolvedToolCallIds.has(part.toolCallId)) {
            return `duplicate tool-result for toolCallId: ${part.toolCallId}`;
          }
          resolvedToolCallIds.add(part.toolCallId);
        }
      }
    }
  }

  return undefined;
}

/**
 * Transform assistant-ui wire format → MessageDto for completion facade.
 * Handles text, tool-call, and tool-result content parts.
 */
function toMessageDtos(wireMessages: AssistantUiMessage[]): MessageDto[] {
  const result: MessageDto[] = [];

  for (const msg of wireMessages) {
    // Skip system messages (handled separately via system prompt)
    if (msg.role === "system") continue;

    // String content (shouldn't happen for user/assistant/tool, but handle gracefully)
    if (typeof msg.content === "string") {
      if (msg.role === "user" || msg.role === "assistant") {
        result.push({ role: msg.role, content: msg.content });
      }
      continue;
    }

    const parts = msg.content;

    if (msg.role === "user") {
      // User messages: extract text parts only
      const textContent = parts
        .filter((p): p is ContentPart & { type: "text" } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      result.push({ role: "user", content: textContent });
    } else if (msg.role === "assistant") {
      // Assistant messages: extract text + tool calls
      const textParts = parts.filter(
        (p): p is ContentPart & { type: "text" } => p.type === "text"
      );
      const toolCallParts = parts.filter(
        (p): p is ContentPart & { type: "tool-call" } => p.type === "tool-call"
      );

      const textContent = textParts.map((p) => p.text).join("\n");
      const toolCalls: MessageToolCall[] = toolCallParts.map((p) => ({
        id: p.toolCallId,
        name: p.toolName,
        arguments: JSON.stringify(p.args),
      }));

      result.push({
        role: "assistant",
        content: textContent,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
    } else if (msg.role === "tool") {
      // Tool messages: extract tool results (one message per result)
      const toolResultParts = parts.filter(
        (p): p is ContentPart & { type: "tool-result" } =>
          p.type === "tool-result"
      );

      for (const part of toolResultParts) {
        result.push({
          role: "tool",
          content: JSON.stringify(part.result),
          toolCallId: part.toolCallId,
        });
      }
    }
  }

  return result;
}

/**
 * Local error handler for chat route.
 * Maps domain errors to HTTP responses; returns null for unhandled errors.
 */
function handleRouteError(
  ctx: RequestContext,
  error: unknown,
  model?: string
): NextResponse | null {
  // Zod validation errors
  if (error && typeof error === "object" && "issues" in error) {
    logRequestWarn(ctx.log, error, "VALIDATION_ERROR");
    return NextResponse.json(
      { error: "Invalid input format" },
      { status: 400 }
    );
  }

  // Accounts feature errors
  if (isAccountsFeatureError(error)) {
    if (error.kind === "INSUFFICIENT_CREDITS") {
      logRequestWarn(ctx.log, error, "INSUFFICIENT_CREDITS");
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }
    if (error.kind === "BILLING_ACCOUNT_NOT_FOUND") {
      logRequestWarn(ctx.log, error, "BILLING_ACCOUNT_NOT_FOUND");
      return NextResponse.json({ error: "Account not found" }, { status: 403 });
    }
    if (error.kind === "VIRTUAL_KEY_NOT_FOUND") {
      logRequestWarn(ctx.log, error, "VIRTUAL_KEY_NOT_FOUND");
      return NextResponse.json(
        { error: "Virtual key not found" },
        { status: 403 }
      );
    }
    // Fallback for GENERIC
    logRequestWarn(ctx.log, error, "ACCOUNT_ERROR");
    return NextResponse.json(
      { error: error.kind === "GENERIC" ? error.message : "Account error" },
      { status: 400 }
    );
  }

  // LLM-specific errors
  if (error instanceof Error) {
    if (
      error.message.includes("MESSAGE_TOO_LONG") ||
      error.message.includes("INVALID_CONTENT")
    ) {
      logRequestWarn(ctx.log, error, "MESSAGE_VALIDATION_ERROR");
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error.message.includes("timeout") ||
      error.message.includes("AbortError")
    ) {
      logRequestWarn(ctx.log, error, "REQUEST_TIMEOUT");
      return NextResponse.json({ error: "Request timeout" }, { status: 408 });
    }
    if (error.message.includes("LiteLLM API error: 429")) {
      logRequestWarn(ctx.log, error, "RATE_LIMIT_EXCEEDED");
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
    if (
      error.message.includes("LiteLLM API error: 404") ||
      error.message.includes("No endpoints found")
    ) {
      logRequestWarn(ctx.log, error, "MODEL_UNAVAILABLE");
      return NextResponse.json(
        { code: "MODEL_UNAVAILABLE", model },
        { status: 409 }
      );
    }
    if (error.message.includes("LiteLLM")) {
      logRequestWarn(ctx.log, error, "LLM_SERVICE_UNAVAILABLE");
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 503 }
      );
    }
  }

  return null; // Unhandled → let wrapper catch as 500
}

export const POST = wrapRouteHandlerWithLogging(
  { routeId: "ai.chat", auth: { mode: "required", getSessionUser } },
  async (ctx, request, sessionUser) => {
    let input: ChatInput | undefined;
    try {
      // Parse JSON body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }

      // Validate input with contract (safeParse for better error handling)
      const inputParseResult = aiChatOperation.input.safeParse(body);
      if (!inputParseResult.success) {
        logRequestWarn(ctx.log, inputParseResult.error, "VALIDATION_ERROR");
        return NextResponse.json(
          {
            error: "Invalid input",
            details: inputParseResult.error.flatten(),
          },
          { status: 400 }
        );
      }
      input = inputParseResult.data;

      // Validate message history (no system messages, toolCallId consistency, no duplicates)
      const historyError = validateMessageHistory(input.messages);
      if (historyError) {
        logRequestWarn(ctx.log, { error: historyError }, "VALIDATION_ERROR");
        return NextResponse.json(
          { error: "Invalid message history", details: historyError },
          { status: 400 }
        );
      }

      // Log request received (billingAccountId will be resolved in facade, log after validation)
      const handlerStartMs = performance.now();

      // Validate model against cached allowlist (MVP-004: PERF-001 fix)
      const { isModelAllowed, getDefaults } = await import(
        "@/shared/ai/model-catalog.server"
      );
      const modelIsValid = await isModelAllowed(input.model);

      if (!modelIsValid) {
        // Return 409 with defaultModelId for client retry (MVP-004: UX-001 fix)
        const defaults = await getDefaults();
        logRequestWarn(
          ctx.log,
          {
            model: input.model,
            defaultModelId: defaults.defaultPreferredModelId,
          },
          "model_validation_failed"
        );
        return NextResponse.json(
          {
            error: "Invalid model",
            defaultModelId: defaults.defaultPreferredModelId,
          },
          { status: 409 }
        );
      }

      // Log request received with validated inputs
      ctx.log.info(
        {
          reqId: ctx.reqId,
          userId: sessionUser?.id,
          requestedModel: input.model,
          messageCount: input.messages.length,
        },
        "ai.chat_received"
      );

      // assistant-ui always uses streaming
      {
        const { completionStream } = await import(
          "@/app/_facades/ai/completion.server"
        );

        // Transform wire format to DTO
        const messageDtos = toMessageDtos(input.messages);

        if (!sessionUser) throw new Error("sessionUser required");

        const streamStartMs = performance.now();

        const { stream: deltaStream, final } = await completionStream(
          {
            messages: messageDtos,
            model: input.model,
            sessionUser,
            abortSignal: request.signal,
            graphName: input.graphName,
          },
          ctx
        );

        // Log response started before returning
        ctx.log.info(
          {
            reqId: ctx.reqId,
            handlerMs: performance.now() - handlerStartMs,
            resolvedModel: input.model,
            stream: true,
          },
          "ai.chat_response_started"
        );

        // Use assistant-stream package for streaming
        // No custom SSE events - use official helper only
        const response = createAssistantStreamResponse(async (controller) => {
          // Helper: finalize tool-call substream with result, then close.
          // Encapsulates setResponse + close to prevent partial finalization bugs.
          // assistant-stream requires explicit close() after setResponse() to:
          // - Finalize the tool-call substream (emit part-finish)
          // - Preserve chunk ordering (result before message-finish)
          // - Allow the merger to complete and close the main stream
          //
          // TODO(assistant-stream): The current API is a footgun - setResponse() does NOT
          // finalize the tool-call substream. Consider wrapping assistant-stream or submitting
          // upstream PR to make setResponse() auto-close, or provide a finalizeWithResponse() method.
          // See: https://github.com/assistant-ui/assistant-ui/issues/XXX
          async function finalizeToolCall(
            toolCtrl: ReturnType<typeof controller.addToolCallPart>,
            toolCallId: string,
            result: ReadonlyJSONValue,
            aborted: boolean
          ): Promise<void> {
            // Phase 1: Set the response (enqueues result chunk)
            try {
              await toolCtrl.setResponse({ result });
            } catch (err) {
              const isClosedError =
                err instanceof Error &&
                (err.message.includes("Controller is already closed") ||
                  (err as NodeJS.ErrnoException).code === "ERR_INVALID_STATE");
              if (isClosedError && aborted) {
                ctx.log.debug(
                  { toolCallId, phase: "setResponse" },
                  "tool_call skipped (client abort)"
                );
                return;
              }
              throw err;
            }

            // Phase 2: Close the substream (finalizes ordering)
            try {
              await toolCtrl.close();
            } catch (err) {
              const isClosedError =
                err instanceof Error &&
                (err.message.includes("Controller is already closed") ||
                  (err as NodeJS.ErrnoException).code === "ERR_INVALID_STATE");
              if (isClosedError && aborted) {
                ctx.log.debug(
                  { toolCallId, phase: "close" },
                  "tool_call close skipped (client abort)"
                );
              } else {
                // Log non-abort close errors at warn for visibility
                ctx.log.warn(
                  { toolCallId, reqId: ctx.reqId, aborted, err },
                  "tool_call close failed"
                );
              }
              // Don't throw - close errors shouldn't abort the stream
            }
          }

          try {
            // Track tool call controllers for setting results
            const toolCallControllers = new Map<
              string,
              ReturnType<typeof controller.addToolCallPart>
            >();

            for await (const event of deltaStream) {
              // Guard: stop writing if client aborted
              if (request.signal.aborted) break;

              if (event.type === "text_delta") {
                controller.appendText(event.delta);
              } else if (event.type === "tool_call_start") {
                // MVP: Stream tool lifecycle to UI
                // NOTE: Do NOT pass args to addToolCallPart - it closes argsText immediately,
                // causing setResponse() to fail (double-close). Manually append args instead.
                ctx.log.info(
                  { toolCallId: event.toolCallId, toolName: event.toolName },
                  "tool_call_start received, creating controller"
                );
                const toolCtrl = controller.addToolCallPart({
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                });
                // Stream args text without closing (finalizeToolCall will close)
                if (event.args != null) {
                  // Invariant: assistant-stream must provide argsText.append
                  if (typeof toolCtrl.argsText?.append !== "function") {
                    throw new Error(
                      "assistant-stream API contract violated: toolCtrl.argsText.append is not a function"
                    );
                  }
                  toolCtrl.argsText.append(JSON.stringify(event.args));
                }
                toolCallControllers.set(event.toolCallId, toolCtrl);
              } else if (event.type === "tool_call_result") {
                const toolCtrl = toolCallControllers.get(event.toolCallId);
                if (!toolCtrl) {
                  ctx.log.warn(
                    { toolCallId: event.toolCallId },
                    "tool_call_result without matching tool_call_start"
                  );
                  continue;
                }
                await finalizeToolCall(
                  toolCtrl,
                  event.toolCallId,
                  event.result as ReadonlyJSONValue,
                  request.signal.aborted
                );
                ctx.log.info(
                  { toolCallId: event.toolCallId },
                  "tool_call_result completed"
                );
              }
            }

            // Wait for final result (billing) with 15s timeout
            const FINAL_TIMEOUT_MS = 15000;
            const finalTimeout = new Promise<{ ok: false; error: "timeout" }>(
              (resolve) =>
                setTimeout(
                  () => resolve({ ok: false, error: "timeout" }),
                  FINAL_TIMEOUT_MS
                )
            );

            const result = await Promise.race([final, finalTimeout]);

            if (result.ok) {
              // Emit FinishMessage with real usage/finishReason from LLM
              controller.enqueue({
                type: "message-finish",
                path: [],
                finishReason: result.finishReason as
                  | "stop"
                  | "length"
                  | "tool-calls"
                  | "content-filter"
                  | "other"
                  | "error"
                  | "unknown",
                usage: {
                  promptTokens: result.usage.promptTokens,
                  completionTokens: result.usage.completionTokens,
                },
              });
            } else {
              // Emit error chunk for timeout/aborted/internal errors
              ctx.log.warn(
                { reqId: ctx.reqId, error: result.error },
                "ai.chat_stream_final_error"
              );
              controller.enqueue({
                type: "error",
                path: [],
                error: `Stream finalization failed: ${result.error}`,
              });
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              ctx.log.info({ reqId: ctx.reqId }, "ai.chat_client_aborted");
            } else {
              ctx.log.error({ err: error }, "Stream error in route");
              throw error;
            }
          } finally {
            // Record stream duration metric
            const streamMs = performance.now() - streamStartMs;
            aiChatStreamDurationMs.observe(streamMs);
            ctx.log.info(
              { reqId: ctx.reqId, streamMs },
              "ai.chat_stream_closed"
            );
          }
        });

        // Convert Response to NextResponse for Next.js compatibility
        return new NextResponse(response.body, {
          status: response.status,
          headers: response.headers,
        });
      }
    } catch (error) {
      const errorResponse = handleRouteError(ctx, error, input?.model);
      if (errorResponse) return errorResponse;
      throw error; // Unhandled → wrapper catches
    }
  }
);
