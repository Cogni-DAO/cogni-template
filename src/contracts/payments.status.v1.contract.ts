// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/payments.status.v1.contract`
 * Purpose: Contract for retrieving payment attempt status via HTTP API.
 * Scope: Defines request/response schemas for GET /api/v1/payments/attempts/:id; does not perform verification.
 * Invariants: Returns client-visible status (PENDING_VERIFICATION | CONFIRMED | FAILED); verification throttled server-side.
 * Side-effects: none
 * Notes: Ownership enforced server-side via session billing account; polling endpoint with 10-second throttle.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { z } from "zod";

export const paymentStatusOperation = {
  id: "payments.status.v1",
  summary: "Get payment attempt status",
  description:
    "Retrieves current status of payment attempt with throttled on-chain verification",
  input: z.object({}), // No input body - attemptId from URL params
  output: z.object({
    attemptId: z.string().uuid(),
    status: z.enum(["PENDING_VERIFICATION", "CONFIRMED", "FAILED"]), // Client-visible status
    txHash: z.string().nullable(),
    amountUsdCents: z.number().int(),
    errorCode: z.string().optional(),
    createdAt: z.string().datetime(),
  }),
} as const;

export type PaymentStatusInput = z.infer<typeof paymentStatusOperation.input>;
export type PaymentStatusOutput = z.infer<typeof paymentStatusOperation.output>;
