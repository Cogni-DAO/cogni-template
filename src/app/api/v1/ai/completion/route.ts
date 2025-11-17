// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion`
 * Purpose: HTTP endpoint for AI completion.
 * Scope: Validate, set input timestamps, delegate to feature. Does not handle authentication or rate limiting.
 * Invariants: Validates with contract, translates DTOs, handles errors cleanly
 * Side-effects: IO (HTTP request/response)
 * Notes: Route sets input timestamps, maps errors to HTTP codes
 * Links: Uses contract for validation, delegates to feature service
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { completion } from "@/app/_facades/ai/completion.server";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { deriveAccountIdFromApiKey } from "@/shared/util";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Enforce API key at boundary - 401 before facade call
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const apiKey = authHeader.slice("Bearer ".length).trim();
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    // Validate input with contract
    const body = await request.json();
    const input = aiCompletionOperation.input.parse(body);

    // Construct LlmCaller at auth boundary - only place this happens
    const caller = {
      accountId: deriveAccountIdFromApiKey(apiKey),
      apiKey,
    };

    // Delegate to bootstrap facade
    const { message } = await completion({ ...input, caller });

    // Validate and return output
    return NextResponse.json(aiCompletionOperation.output.parse({ message }));
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        { error: "Invalid input format", details: error.issues },
        { status: 400 }
      );
    }

    // Handle feature errors (mapped from core validation)
    if (error instanceof Error) {
      if (
        error.message.includes("MESSAGE_TOO_LONG") ||
        error.message.includes("INVALID_CONTENT")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (
        error.message.includes("timeout") ||
        error.message.includes("AbortError")
      ) {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }

      if (error.message.includes("LiteLLM API error: 429")) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429 }
        );
      }

      if (error.message.includes("LiteLLM")) {
        return NextResponse.json(
          { error: "AI service temporarily unavailable" },
          { status: 503 }
        );
      }
    }

    // Generic server error (don't leak internal details)
    console.error("AI completion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
