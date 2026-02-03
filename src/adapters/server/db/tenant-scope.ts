// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db/tenant-scope`
 * Purpose: Transaction helper that sets PostgreSQL RLS tenant context via SET LOCAL.
 * Scope: Wraps Drizzle transactions with `SET LOCAL app.current_user_id`. Does not handle role switching or connection pooling.
 * Invariants:
 * - userId must be a valid UUID v4 (validated before interpolation into SQL)
 * - SET LOCAL scopes the setting to the current transaction only (no cross-request leakage)
 * - If userId is invalid, throws immediately (never reaches SQL)
 * Side-effects: IO (database transaction)
 * Notes: SET LOCAL does not accept parameterized $1 placeholders in PostgreSQL.
 *        We use sql.raw() after UUID format validation. This is safe because:
 *        1. The regex strictly limits the value to hex digits and hyphens
 *        2. The value comes from server-side JWT sessions, never from request body
 * Links: docs/DATABASE_RLS_SPEC.md
 * @public
 */

import { sql } from "drizzle-orm";

import type { Database } from "./drizzle.client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a Drizzle transaction with `app.current_user_id` set for RLS.
 *
 * Every query inside `fn` sees only rows belonging to `userId` per the
 * RLS policies defined in migration 0004_enable_rls.sql.
 *
 * @throws {Error} If userId is not a valid UUID v4
 */
export async function withTenantScope<T>(
  db: Database,
  userId: string,
  fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(userId)) {
    throw new Error(
      `withTenantScope: invalid userId format (expected UUID v4): ${userId}`
    );
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(userId)}'`);
    return fn(tx);
  });
}

/**
 * Set tenant context inside an existing transaction.
 *
 * Use this when the caller already has a transaction (e.g., adapter methods
 * that use `db.transaction()` for atomicity). Call as the first statement.
 *
 * @throws {Error} If userId is not a valid UUID v4
 */
export async function setTenantContext(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string
): Promise<void> {
  if (!UUID_RE.test(userId)) {
    throw new Error(
      `setTenantContext: invalid userId format (expected UUID v4): ${userId}`
    );
  }

  await tx.execute(sql`SET LOCAL app.current_user_id = '${sql.raw(userId)}'`);
}
