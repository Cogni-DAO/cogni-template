// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/accounts/register.server`
 * Purpose: App-layer facade for admin account registration - bridges DTOs to AccountService.
 * Scope: Coordinates DI resolution and service calls for admin endpoints. Does not handle authentication.
 * Invariants: Only app layer imports this; admin-only operation; handles all coordination concerns
 * Side-effects: IO (via resolved dependencies)
 * Notes: Admin facade for explicit account provisioning; calls AccountService directly following completion pattern
 * Links: Called by admin API routes, uses bootstrap for DI and AccountService for logic
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import type {
  AdminAccountsRegisterInput,
  AdminAccountsRegisterOutput,
} from "@/contracts/admin.accounts.register.v1.contract";
import type { AccountsFeatureError } from "@/features/accounts/public";
import { registerAccount as registerAccountFeature } from "@/features/accounts/public";

export async function registerAccount(
  input: AdminAccountsRegisterInput
): Promise<AdminAccountsRegisterOutput> {
  // Resolve dependencies from bootstrap (pure composition root)
  const { accountService } = resolveAiDeps();

  // Delegate to accounts feature service
  const result = await registerAccountFeature(accountService, {
    apiKey: input.apiKey,
    ...(input.displayName !== undefined
      ? { displayName: input.displayName }
      : {}),
  });

  if (!result.ok) {
    // Propagate feature error to app layer
    const featureError: AccountsFeatureError = result.error;
    throw featureError;
  }

  return {
    accountId: result.account.accountId,
    balanceCredits: result.account.balanceCredits,
  };
}
