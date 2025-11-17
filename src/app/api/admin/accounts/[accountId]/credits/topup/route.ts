// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/admin/accounts/[accountId]/credits/topup`
 * Purpose: Control plane endpoint to manually add credits to accounts.
 * Scope: Admin-only endpoint for credit management. Does not handle authentication or business logic.
 * Invariants: Credits added via ledger operations, positive amounts only
 * Side-effects: IO (HTTP request/response)
 * Notes: Manual credit funding for testing, admin auth required
 * Links: Uses AccountService.creditAccount(), part of Stage 7 MVP endpoints
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { topupCredits } from "@/app/_facades/accounts/topup.server";
import { adminAccountsTopupOperation } from "@/contracts/admin.accounts.topup.v1.contract";
import { isAccountsFeatureError } from "@/features/accounts/public";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
): Promise<NextResponse> {
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

    // Extract and validate account ID from URL
    const { accountId } = await params;
    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate input with contract
    const input = adminAccountsTopupOperation.input.parse(body);

    // Delegate to facade
    const result = await topupCredits({ accountId, input });

    // Validate and return output
    return NextResponse.json(adminAccountsTopupOperation.output.parse(result));
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
      if (error.kind === "ACCOUNT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }
      if (error.kind === "INSUFFICIENT_CREDITS") {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 400 }
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
      console.error("Credit topup error:", error);
      return NextResponse.json(
        { error: "Failed to add credits" },
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
