// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_lib/auth/session`
 * Purpose: Server-side session resolver using Auth.js with wallet-first invariant.
 * Scope: Server-only helper that derives a SessionUser from Auth.js session; does not perform direct database access.
 * Invariants: Returns null unless both id AND walletAddress are present (wallet-first auth); delegates DB access to Auth.js.
 * Side-effects: IO (Auth.js session retrieval via Drizzle adapter)
 * Notes: Wraps auth() from src/auth.ts; enforces walletAddress requirement at boundary.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */
import { auth } from "@/auth";
import type { SessionUser } from "@/shared/auth";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const walletAddress = session?.user?.walletAddress;

  // Enforce wallet-first invariant: require both id and walletAddress
  if (!id || !walletAddress) return null;

  return { id, walletAddress };
}
