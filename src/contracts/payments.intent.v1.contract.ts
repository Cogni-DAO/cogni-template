// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/payments.intent.v1.contract`
 * Purpose: Contract for creating payment intents via HTTP API.
 * Scope: Defines request/response schemas for POST /api/v1/payments/intents; does not perform persistence or authentication.
 * Invariants: amountUsdCents must be between 100 ($1) and 1,000,000 ($10,000); all outputs include on-chain transfer parameters.
 * Side-effects: none
 * Notes: Billing account and from address derived from session server-side; not provided in input.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { z } from "zod";

export const paymentIntentOperation = {
  id: "payments.intent.v1",
  summary: "Create payment intent",
  description:
    "Creates a payment intent with on-chain USDC transfer parameters for the authenticated user's wallet",
  input: z.object({
    amountUsdCents: z
      .number()
      .int()
      .min(100, "Minimum payment is $1.00 (100 cents)")
      .max(1_000_000, "Maximum payment is $10,000.00 (1,000,000 cents)"),
  }),
  output: z.object({
    attemptId: z.string().uuid(),
    chainId: z.number().int(),
    token: z.string(),
    to: z.string(),
    amountRaw: z.string(), // bigint as string for JSON serialization
    amountUsdCents: z.number().int(),
    expiresAt: z.string().datetime(),
  }),
} as const;

export type PaymentIntentInput = z.infer<typeof paymentIntentOperation.input>;
export type PaymentIntentOutput = z.infer<typeof paymentIntentOperation.output>;
