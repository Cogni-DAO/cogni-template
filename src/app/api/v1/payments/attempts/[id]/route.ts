// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/payments/attempts/[id]`
 * Purpose: HTTP endpoint to retrieve payment attempt status with throttled verification.
 * Scope: Validates response with contract, enforces SIWE session, delegates to facade; does not perform verification directly.
 * Invariants: Ownership enforced via session billing account; verification throttled to 10-second intervals server-side.
 * Side-effects: IO (reads payment_attempts, may trigger verification and update status).
 * Notes: Returns 404 if attempt not found or not owned; polling endpoint for client to check status.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { getPaymentStatusFacade } from "@/app/_facades/payments/attempts.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { paymentStatusOperation } from "@/contracts/payments.status.v1.contract";
import {
  AuthUserNotFoundError,
  PaymentNotFoundError,
} from "@/features/payments/errors";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Extract attemptId from URL params
    const { id: attemptId } = await params;

    // 1. Get session
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    }

    // 2. Call facade
    const result = await getPaymentStatusFacade({
      sessionUser,
      attemptId,
    });

    // 3. Validate output and return
    return NextResponse.json(paymentStatusOperation.output.parse(result));
  } catch (error) {
    // Auth errors
    if (error instanceof AuthUserNotFoundError) {
      return NextResponse.json(
        { error: "User not provisioned; please re-authenticate" },
        { status: 401 }
      );
    }

    // Payment not found errors
    if (error instanceof PaymentNotFoundError) {
      return NextResponse.json(
        { error: "Payment attempt not found or not owned by user" },
        { status: 404 }
      );
    }

    // Generic errors
    console.error("Payment status retrieval error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
