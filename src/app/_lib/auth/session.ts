// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_lib/auth/session`
 * Purpose: Server-side session resolver using NextAuth with wallet-first invariant.
 * Scope: Server-only helper that derives a SessionUser from a NextAuth session. Does not perform database access or user existence checks.
 * Invariants: Returns null unless both id AND walletAddress are present (wallet-first auth).
 * Side-effects: IO (NextAuth session retrieval)
 * Notes: This resolver is a thin wrapper around NextAuth, enforcing a wallet-first session model.
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
