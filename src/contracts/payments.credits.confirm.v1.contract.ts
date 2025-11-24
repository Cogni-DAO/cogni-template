// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/payments.credits.confirm.v1.contract`
 * Purpose: Contract for confirming widget payments via HTTP API.
 * Scope: Defines request/response schemas for /api/v1/payments/credits/confirm; does not perform persistence or authentication.
 * Invariants: amountUsdCents must be positive integer; clientPaymentId must be UUID.
 * Side-effects: none
 * Notes: Billing account is derived from session server-side; not provided in input.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import { z } from "zod";

export const creditsConfirmOperation = {
  id: "payments.credits.confirm.v1",
  summary: "Confirm widget payment and credit billing account",
  description:
    "Credits billing account balance after a widget payment confirmation using client-provided idempotency keys.",
  input: z.object({
    amountUsdCents: z.number().int().positive(),
    clientPaymentId: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  output: z.object({
    billingAccountId: z.string(),
    balanceCredits: z.number().nonnegative(),
  }),
} as const;

export type CreditsConfirmInput = z.infer<typeof creditsConfirmOperation.input>;
export type CreditsConfirmOutput = z.infer<
  typeof creditsConfirmOperation.output
>;
