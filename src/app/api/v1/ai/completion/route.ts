// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion`
 * Purpose: HTTP endpoint for AI completion with account validation.
 * Scope: Validate API keys, delegate to completion facade, map feature errors to HTTP codes. Does not handle rate limiting.
 * Invariants: Validates with contract, translates DTOs, handles accounts and completion errors cleanly
 * Side-effects: IO (HTTP request/response)
 * Notes: Route validates accounts via features layer, maps AccountsFeatureError to HTTP status codes
 * Links: Uses contract for validation, delegates to completion facade, maps feature errors
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { completion } from "@/app/_facades/ai/completion.server";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate input with contract
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

    // Handle accounts feature errors
    if (isAccountsFeatureError(error)) {
      if (error.kind === "UNKNOWN_API_KEY") {
        return NextResponse.json({ error: "Unknown API key" }, { status: 403 });
      }
      if (error.kind === "INSUFFICIENT_CREDITS") {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 402 }
        );
      }
      if (error.kind === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 403 }
        );
      }
      // Generic feature error
      return NextResponse.json(
        { error: error.kind === "GENERIC" ? error.message : "Account error" },
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
    console.error("Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
