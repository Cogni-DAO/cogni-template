// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_lib/auth/session`
 * Purpose: Temporary session resolver until Auth.js + SIWE integration is wired.
 * Scope: Server-only helper that derives a SessionUser from request headers; does not perform network or database access.
 * Invariants: Returns null when no override header is present; no network or database access.
 * Side-effects: none
 * Notes: Replace with Auth.js-backed session retrieval when security stack lands.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */
import type { NextRequest } from "next/server";

import type { SessionUser } from "@/shared/auth";

/**
 * Temporary session resolver until Auth.js + SIWE wiring is complete.
 *
 * MVP policy: versioned APIs require an authenticated session. In the absence of
 * Auth.js, we allow a dev/test header override (`x-cogni-user-id`) to simulate
 * a logged-in user. This keeps the architecture aligned with the session-first
 * design while enabling automated tests.
 */
export function getSessionUser(request: NextRequest): SessionUser | null {
  const headerUserId = request.headers.get("x-cogni-user-id");
  if (headerUserId) {
    return { id: headerUserId };
  }

  return null;
}
