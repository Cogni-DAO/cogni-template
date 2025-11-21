// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/wallet/link`
 * Purpose: HTTP endpoint for wallet linking - data-plane onboarding helper.
 * Scope: Validate wallet address, delegate to wallet link facade, map errors to HTTP codes. Does not handle signature verification (MVP).
 * Invariants: Validates with contract, ensures accounts exist via AccountService, returns accountId + apiKey
 * Side-effects: IO (HTTP request/response)
 * Notes: MVP uses single API key for all wallets; future versions will verify signatures and map per-wallet
 * Links: Uses walletLinkOperation contract, delegates to link.server facade
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { linkWallet } from "@/app/_facades/wallet/link.server";
import { walletLinkOperation } from "@/contracts/wallet.link.v1.contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate input with contract
    const input = walletLinkOperation.input.parse(body);

    // Delegate to facade
    const result = await linkWallet(input);

    // Validate and return output
    return NextResponse.json(walletLinkOperation.output.parse(result), {
      status: 200,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        { error: "Invalid request format", details: error.issues },
        { status: 400 }
      );
    }

    // Handle server misconfiguration (missing API key)
    if (error instanceof Error) {
      if (error.message.includes("Server misconfiguration")) {
        console.error("Wallet link configuration error:", error.message);
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 503 }
        );
      }

      // Log unexpected errors
      console.error("Wallet link error:", error);
    }

    // Generic server error (don't leak internal details)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
