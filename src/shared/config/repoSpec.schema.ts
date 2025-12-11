// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/config/repoSpec.schema`
 * Purpose: Zod schemas and derived types for .cogni/repo-spec.yaml validation.
 * Scope: Validates governance-managed payment configuration structure; does not enforce chain/token values (those checked against chain.ts constants).
 * Invariants: Receiving_address must be valid EVM format; provider must be non-empty; allowed_chains/allowed_tokens are informational metadata.
 * Side-effects: none
 * Links: .cogni/repo-spec.yaml, docs/CHAIN_CONFIG.md, docs/PAYMENTS_DESIGN.md
 * @public
 */

import { z } from "zod";

/**
 * Schema for payments_in.credits_topup configuration.
 * Validates inbound payment settings structure.
 */
export const creditsTopupSpecSchema = z.object({
  /** Payment provider identifier (e.g., "cogni-usdc-backend-v1") */
  provider: z.string().min(1, "Provider must be a non-empty string"),

  /** EVM address receiving inbound payments (DAO wallet) */
  receiving_address: z
    .string()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "Receiving address must be a valid EVM address (0x + 40 hex chars)"
    ),

  /** Optional: Informational list of chain names (not enforced by schema; validation against chain.ts happens in loader) */
  allowed_chains: z.array(z.string()).optional(),

  /** Optional: Informational list of token names (not enforced by schema) */
  allowed_tokens: z.array(z.string()).optional(),
});

export type CreditsTopupSpec = z.infer<typeof creditsTopupSpecSchema>;

/**
 * Schema for full .cogni/repo-spec.yaml structure (payment-relevant subset).
 * Validates structure only; chain alignment checked in repoSpec.server.ts against chain.ts.
 */
export const repoSpecSchema = z.object({
  /** DAO governance configuration */
  cogni_dao: z.object({
    /**
     * Chain ID as string or number (YAML flexibility).
     * Validated against CHAIN_ID constant from chain.ts at load time.
     */
    chain_id: z.union([z.string(), z.number()]),
  }),

  /** Payment configuration (required) */
  payments_in: z.object({
    /** Inbound payment configuration for USDC credits top-up (required) */
    credits_topup: creditsTopupSpecSchema,
  }),
});

export type RepoSpec = z.infer<typeof repoSpecSchema>;
