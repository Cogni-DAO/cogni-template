// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/auth/[...nextauth]`
 * Purpose: Expose Auth.js handlers for signin/session routes.
 * Scope: Delegates to Auth.js configuration in src/auth.ts. Does not implement auth logic directly.
 * Invariants: Public infrastructure endpoint; session cookies managed by Auth.js.
 * Side-effects: IO (Auth.js DB operations via Drizzle adapter)
 * Links: None
 * @public
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
