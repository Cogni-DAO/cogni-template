// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/admin/accounts/register-litellm-key`
 * Purpose: Control plane endpoint to register LiteLLM API keys with accounts.
 * Scope: Admin-only endpoint for explicit account creation. Does not handle authentication or rate limiting.
 * Invariants: Only way to create accounts in the system, idempotent operations
 * Side-effects: IO (HTTP request/response)
 * Notes: Creates accounts mapped to API keys, admin auth required
 * Links: Uses AccountService.createAccountForApiKey(), part of Stage 7 MVP endpoints
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { registerAccount } from "@/app/_facades/accounts/register.server";
import { adminAccountsRegisterOperation } from "@/contracts/admin.accounts.register.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // TODO: Add proper admin authentication
    // For MVP, we'll use a simple bearer token check
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer admin-")) {
      return NextResponse.json(
        { error: "Admin authentication required" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate input with contract
    const input = adminAccountsRegisterOperation.input.parse(body);

    // Delegate to facade
    const result = await registerAccount(input);

    // Validate and return output
    return NextResponse.json(
      adminAccountsRegisterOperation.output.parse(result),
      { status: 201 }
    );
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        { error: "Invalid request format", details: error.issues },
        { status: 400 }
      );
    }

    // Handle accounts feature errors
    if (isAccountsFeatureError(error)) {
      if (error.kind === "UNKNOWN_API_KEY") {
        return NextResponse.json({ error: "Unknown API key" }, { status: 400 });
      }
      if (error.kind === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }
      // Generic feature error
      return NextResponse.json(
        { error: error.kind === "GENERIC" ? error.message : "Account error" },
        { status: 400 }
      );
    }

    // Handle service errors
    if (error instanceof Error) {
      console.error("Account registration error:", error);
      return NextResponse.json(
        { error: "Failed to register API key" },
        { status: 500 }
      );
    }

    // Generic server error
    console.error("Unknown error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
