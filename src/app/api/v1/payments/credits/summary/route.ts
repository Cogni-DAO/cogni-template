// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/payments/credits/summary`
 * Purpose: HTTP endpoint to fetch billing balance and recent credit ledger entries for widget payments UI.
 * Scope: Enforces SIWE session, validates query params, delegates to payments facade; does not access database directly.
 * Invariants: Billing account derived from session only; returns ledger ordered newest first.
 * Side-effects: IO (reads billing data via AccountService port).
 * Notes: Used by /credits page for balance and history display.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { getCreditsSummaryFacade } from "@/app/_facades/payments/credits.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { creditsSummaryOperation } from "@/contracts/payments.credits.summary.v1.contract";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsedLimit = searchParams.get("limit");
    const limit = parsedLimit ? Number(parsedLimit) : undefined;

    const input = creditsSummaryOperation.input.parse({ limit });

    const summary = await getCreditsSummaryFacade({
      sessionUser,
      limit: input.limit,
    });

    const serialized = {
      ...summary,
      ledger: summary.ledger.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(creditsSummaryOperation.output.parse(serialized));
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        {
          error: "Invalid query",
          details: (error as { issues: unknown }).issues,
        },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "User not provisioned; please re-authenticate" },
        { status: 401 }
      );
    }

    console.error("Credits summary error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
