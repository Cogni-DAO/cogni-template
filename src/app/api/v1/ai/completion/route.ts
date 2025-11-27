// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion`
 * Purpose: HTTP endpoint for AI completion with billing account resolution.
 * Scope: Require session, delegate to completion facade, map feature errors to HTTP codes. Does not handle rate limiting.
 * Invariants: Validates with contract, translates DTOs, handles billing/account errors cleanly
 * Side-effects: IO (HTTP request/response)
 * Notes: Route validates accounts via features layer, maps AccountsFeatureError to HTTP status codes
 * Links: Uses contract for validation, delegates to completion facade, maps feature errors
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { completion } from "@/app/_facades/ai/completion.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate input with contract
    const input = aiCompletionOperation.input.parse(body);

    // Delegate to bootstrap facade (returns { message: {...} })
    const result = await completion({ ...input, sessionUser });

    // Validate and return output (result already has correct shape)
    return NextResponse.json(aiCompletionOperation.output.parse(result));
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      console.error("[Completion API] Zod validation failed:", error.issues);
      return NextResponse.json(
        { error: "Invalid input format", details: error.issues },
        { status: 400 }
      );
    }

    // Handle accounts feature errors
    if (isAccountsFeatureError(error)) {
      if (error.kind === "INSUFFICIENT_CREDITS") {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 402 }
        );
      }
      if (error.kind === "BILLING_ACCOUNT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 403 }
        );
      }
      if (error.kind === "VIRTUAL_KEY_NOT_FOUND") {
        return NextResponse.json(
          { error: "Virtual key not found" },
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
