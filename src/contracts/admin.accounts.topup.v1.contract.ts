// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/admin.accounts.topup.v1.contract`
 * Purpose: External API contract for admin account credit topup with DTOs that isolate internal types.
 * Scope: Edge IO definition with schema validation. Does not contain business logic.
 * Invariants: Contract remains stable; breaking changes require new version.
 * Side-effects: none
 * Notes: Admin-only endpoint for manual credit funding.
 * Links: Used by HTTP routes for validation
 * @internal
 */

import { z } from "zod";

export const adminAccountsTopupOperation = {
  id: "admin.accounts.topup.v1",
  summary: "Add credits to account",
  description: "Manually fund account with credits (admin only)",
  input: z.object({
    amount: z.number().positive("Amount must be positive"),
    reason: z.string().min(1, "Reason required"),
    reference: z.string().optional(),
  }),
  output: z.object({
    newBalance: z.number(),
  }),
} as const;

export type AdminAccountsTopupInput = z.infer<
  typeof adminAccountsTopupOperation.input
>;
export type AdminAccountsTopupOutput = z.infer<
  typeof adminAccountsTopupOperation.output
>;
