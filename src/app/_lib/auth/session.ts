// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_lib/auth/session`
 * Purpose: Server-side session resolver using Auth.js.
 * Scope: Server-only helper that derives a SessionUser from Auth.js session; does not perform direct database access.
 * Invariants: Returns null when no authenticated session exists; delegates DB access to Auth.js.
 * Side-effects: IO (Auth.js session retrieval via Drizzle adapter)
 * Notes: Wraps auth() from src/auth.ts; extracts wallet address from session.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */
import { auth } from "@/auth";
import type { SessionUser } from "@/shared/auth";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const walletAddress = session.user?.walletAddress;
  return walletAddress ? { id, walletAddress } : { id };
}
