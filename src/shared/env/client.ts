// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/client`
 * Purpose: Client-side environment variable validation for Next.js public env vars using Zod schema.
 * Scope: Validates NEXT_PUBLIC_* env vars for browser runtime; provides clientEnv object. Does not handle server-only vars.
 * Invariants: Only processes NEXT_PUBLIC_ prefixed vars; validates at build time; fails fast on missing required vars.
 * Side-effects: process.env
 * Notes: Includes WalletConnect and chain configuration; runs in browser context.
 * Links: Next.js public environment variables specification
 * @public
 */

import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().default(1),
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
});
export type ClientEnv = typeof clientEnv;
