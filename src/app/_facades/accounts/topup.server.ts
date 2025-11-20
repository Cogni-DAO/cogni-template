// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/accounts/topup.server`
 * Purpose: App-layer facade for admin credit topup - bridges DTOs to AccountService.
 * Scope: Coordinates DI resolution and service calls for admin endpoints. Does not handle authentication.
 * Invariants: Only app layer imports this; admin-only operation; handles all coordination concerns
 * Side-effects: IO (via resolved dependencies)
 * Notes: Admin facade for manual credit funding; calls AccountService directly following completion pattern
 * Links: Called by admin API routes, uses bootstrap for DI and AccountService for logic
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import type {
  AdminAccountsTopupInput,
  AdminAccountsTopupOutput,
} from "@/contracts/admin.accounts.topup.v1.contract";
import type { AccountsFeatureError } from "@/features/accounts/public";
import { topupCredits as topupCreditsFeature } from "@/features/accounts/public";

interface TopupParams {
  accountId: string;
  input: AdminAccountsTopupInput;
}

export async function topupCredits(
  params: TopupParams
): Promise<AdminAccountsTopupOutput> {
  // Resolve dependencies from bootstrap (pure composition root)
  const { accountService } = resolveAiDeps();

  // Delegate to accounts feature service
  const result = await topupCreditsFeature(accountService, {
    accountId: params.accountId,
    amount: params.input.amount,
    reason: params.input.reason,
    ...(params.input.reference && { reference: params.input.reference }),
  });

  if (!result.ok) {
    // Propagate feature error to app layer
    const featureError: AccountsFeatureError = result.error;
    throw featureError;
  }

  return {
    newBalance: result.newBalance,
  };
}
