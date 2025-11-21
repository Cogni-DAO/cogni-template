// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/wallet.link.v1.contract`
 * Purpose: External API contract for wallet-to-account linking with DTOs that isolate internal types.
 * Scope: Edge IO definition with schema validation. Does not contain business logic.
 * Invariants: Contract remains stable; breaking changes require new version.
 * Side-effects: none
 * Notes: Data-plane endpoint for wallet onboarding flow.
 * Links: Used by HTTP routes for validation
 * @internal
 */

import { z } from "zod";

export const walletLinkOperation = {
  id: "wallet.link.v1",
  summary: "Link wallet address to account",
  description:
    "Link a wallet address to an internal billing account and return the accountId + API key used for AI calls.",
  input: z.object({
    // TODO: Future - tighten to EVM address validator (0x + 40 hex chars)
    // and type to Address from viem once wallet deps are in place
    address: z.string().min(1, "Wallet address required"),
  }),
  output: z.object({
    accountId: z.string(),
    apiKey: z.string(),
  }),
} as const;

export type WalletLinkInput = z.infer<typeof walletLinkOperation.input>;
export type WalletLinkOutput = z.infer<typeof walletLinkOperation.output>;
