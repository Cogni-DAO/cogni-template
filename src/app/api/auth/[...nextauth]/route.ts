// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/auth/[...nextauth]`
 * Purpose: Expose NextAuth handlers for signin/session routes.
 * Scope: Delegates to NextAuth configuration in src/auth.ts. Does not implement auth logic directly.
 * Invariants: Public infrastructure endpoint; session cookies managed by NextAuth.
 * Side-effects: IO (NextAuth DB operations via Drizzle client)
 * Links: None
 * @public
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
