// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/admin.accounts.register.v1.contract`
 * Purpose: External API contract for admin account registration with DTOs that isolate internal types.
 * Scope: Edge IO definition with schema validation. Does not contain business logic.
 * Invariants: Contract remains stable; breaking changes require new version.
 * Side-effects: none
 * Notes: Admin-only endpoint for explicit account provisioning.
 * Links: Used by HTTP routes for validation
 * @internal
 */

import { z } from "zod";

export const adminAccountsRegisterOperation = {
  id: "admin.accounts.register.v1",
  summary: "Register LiteLLM API key with account",
  description: "Create account for LiteLLM virtual key (admin only)",
  input: z.object({
    apiKey: z.string().min(1, "API key required"),
    displayName: z.string().optional(),
  }),
  output: z.object({
    accountId: z.string(),
    balanceCredits: z.number(),
  }),
} as const;

export type AdminAccountsRegisterInput = z.infer<
  typeof adminAccountsRegisterOperation.input
>;
export type AdminAccountsRegisterOutput = z.infer<
  typeof adminAccountsRegisterOperation.output
>;
