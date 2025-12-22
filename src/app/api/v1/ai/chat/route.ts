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
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import {
  type AssistantUiMessage,
  aiChatOperation,
  type ChatInput,
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
 * Internal message DTO for completion facade
 * Matches MessageDto from @features/ai/services/mappers
 */
interface MessageDto {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/**
 * Transform assistant-ui wire format → MessageDto for completion facade
 * Handles both string content (system) and array content (user/assistant)
 */
function toMessageDtos(wireMessages: AssistantUiMessage[]): MessageDto[] {
  return wireMessages
    .filter(
      (m): m is AssistantUiMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant"
    )
    .map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content
          : m.content.map((p) => p.text).join("\n"),
    }));
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
          try {
            // Track tool call controllers for setting results
            const toolCallControllers = new Map<
              string,
              ReturnType<typeof controller.addToolCallPart>
            >();

            for await (const event of deltaStream) {
              if (event.type === "text_delta") {
                controller.appendText(event.delta);
              } else if (event.type === "tool_call_start") {
                // MVP: Stream tool lifecycle to UI
                const toolCtrl = controller.addToolCallPart({
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args as Parameters<
                    typeof controller.addToolCallPart
                  >[0] extends { args: infer A }
                    ? A
                    : never,
                });
                toolCallControllers.set(event.toolCallId, toolCtrl);
              } else if (event.type === "tool_call_result") {
                // Set tool result (completes the tool call in UI)
                const toolCtrl = toolCallControllers.get(event.toolCallId);
                toolCtrl?.setResponse({
                  result: event.result as Parameters<
                    NonNullable<typeof toolCtrl>["setResponse"]
                  >[0]["result"],
                });
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
