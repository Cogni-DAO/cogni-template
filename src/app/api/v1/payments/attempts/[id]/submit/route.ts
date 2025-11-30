// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/payments/attempts/[id]/submit`
 * Purpose: HTTP endpoint to submit transaction hash for payment verification.
 * Scope: Validates request/response with contract, enforces SIWE session, delegates to facade; does not perform verification or settlement directly.
 * Invariants: Ownership enforced via session billing account; idempotent on same txHash for same attempt.
 * Side-effects: IO (binds txHash, updates payment_attempts, logs payment_events, initiates verification).
 * Notes: Returns 404 if attempt not found or not owned; 409 if txHash already bound to different attempt.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { type NextRequest, NextResponse } from "next/server";

import { submitPaymentTxHashFacade } from "@/app/_facades/payments/attempts.server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { paymentSubmitOperation } from "@/contracts/payments.submit.v1.contract";
import {
  AuthUserNotFoundError,
  PaymentNotFoundError,
} from "@/features/payments/errors";
import { isTxHashAlreadyBoundPortError } from "@/ports";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
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

    // 2. Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 3. Validate with contract
    const input = paymentSubmitOperation.input.parse(body);

    // 4. Call facade
    const result = await submitPaymentTxHashFacade({
      sessionUser,
      attemptId,
      ...input,
    });

    // 5. Validate output and return
    return NextResponse.json(paymentSubmitOperation.output.parse(result));
  } catch (error) {
    // Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        {
          error: "Invalid input format",
          details: (error as { issues: unknown }).issues,
        },
        { status: 400 }
      );
    }

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

    // TxHash conflict errors (duplicate txHash on different attempt)
    if (isTxHashAlreadyBoundPortError(error)) {
      return NextResponse.json(
        {
          error: "Transaction hash conflict",
          details: {
            txHash: error.txHash,
            existingAttemptId: error.existingAttemptId,
          },
        },
        { status: 409 }
      );
    }

    // Generic errors
    console.error("Payment submission error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
