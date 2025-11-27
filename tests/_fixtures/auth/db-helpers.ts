// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@_fixtures/auth/db-helpers`
 * Purpose: Database seeding helpers for auth testing.
 * Scope: Provides reusable helpers for creating test users, billing accounts, and virtual keys. Does not contain test assertions.
 * Invariants: Auto-generates IDs; maintains referential integrity
 * Side-effects: IO (database writes)
 * Notes: Use for integration and stack tests that need pre-seeded auth data.
 * Links: tests/integration/auth/, tests/stack/auth/
 * @public
 */

import type { Database } from "@/adapters/server/db/client";
import type { SessionUser } from "@/shared/auth/session";
import { billingAccounts, users, virtualKeys } from "@/shared/db/schema";

export interface SeedUserParams {
  id?: string;
  walletAddress?: string;
  name?: string;
  email?: string;
}

export interface SeedBillingParams {
  balanceCredits?: number | bigint;
  virtualKeyLabel?: string;
  litellmVirtualKey?: string;
}

export interface SeededAuthData {
  user: typeof users.$inferSelect;
  billingAccount: typeof billingAccounts.$inferSelect;
  virtualKey: typeof virtualKeys.$inferSelect;
}

/**
 * Seed a complete authenticated user with billing account and virtual key
 */
export async function seedAuthenticatedUser(
  db: Database,
  userParams: SeedUserParams = {},
  billingParams: SeedBillingParams = {}
): Promise<SeededAuthData> {
  const walletAddress =
    userParams.walletAddress ?? "0x1234567890abcdef1234567890abcdef12345678";

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      id: userParams.id ?? walletAddress.toLowerCase(),
      walletAddress,
      name: userParams.name ?? `Test User ${walletAddress.slice(0, 8)}`,
      email: userParams.email ?? null,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create test user");
  }

  // Create billing account
  const [billingAccount] = await db
    .insert(billingAccounts)
    .values({
      id: `billing-${user.id}`,
      ownerUserId: user.id,
      balanceCredits: BigInt(billingParams.balanceCredits ?? 1000),
    })
    .returning();

  if (!billingAccount) {
    throw new Error("Failed to create test billing account");
  }

  // Create virtual key
  const [virtualKey] = await db
    .insert(virtualKeys)
    .values({
      billingAccountId: billingAccount.id,
      litellmVirtualKey:
        billingParams.litellmVirtualKey ?? `vk-test-${user.id}`,
      label: billingParams.virtualKeyLabel ?? "Test Default",
      isDefault: true,
      active: true,
    })
    .returning();

  if (!virtualKey) {
    throw new Error("Failed to create test virtual key");
  }

  return { user, billingAccount, virtualKey };
}

/**
 * Create a mock SessionUser for testing (no DB write)
 */
export function createMockSessionUser(
  overrides: Partial<SessionUser> = {}
): SessionUser {
  return {
    id: "test-user-id",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    ...overrides,
  };
}
