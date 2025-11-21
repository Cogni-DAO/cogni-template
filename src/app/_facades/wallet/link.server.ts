// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/wallet/link.server`
 * Purpose: App-layer facade for wallet linking - bridges wallet addresses to accounts via API keys.
 * Scope: Coordinates DI resolution and account creation for wallet onboarding. Does not handle authentication.
 * Invariants: Only app layer imports this; data-plane operation; ensures accounts exist with zero balance
 * Side-effects: IO (via resolved dependencies)
 * Notes: MVP uses single configured API key for all wallets; future versions will map wallets to keys
 * Links: Called by /api/v1/wallet/link route, uses AccountService for provisioning
 * @public
 */

import { resolveAiDeps } from "@/bootstrap/container";
import type {
  WalletLinkInput,
  WalletLinkOutput,
} from "@/contracts/wallet.link.v1.contract";
import { serverEnv } from "@/shared/env";
import { deriveAccountIdFromApiKey } from "@/shared/util";

export async function linkWallet(
  input: WalletLinkInput
): Promise<WalletLinkOutput> {
  // Resolve dependencies from bootstrap (pure composition root)
  const { accountService } = resolveAiDeps();

  // Get MVP API key from configuration (feature-level requirement)
  const env = serverEnv();
  const apiKey = env.LITELLM_MVP_API_KEY;

  // Feature-level enforcement: wallet link requires this MVP key
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "MVP wallet link requires LITELLM_MVP_API_KEY to be configured. " +
        "This is a temporary requirement until proper wallet→key registry exists."
    );
  }

  // Derive accountId from apiKey using stable hash
  const accountId = deriveAccountIdFromApiKey(apiKey);

  // Ensure account exists (idempotent - safe to call multiple times)
  // Format wallet address: 0x07007...0c949 (first 5 + last 5 hex digits)
  // 0x + first 5 chars
  const addressPrefix = input.address.slice(0, 7);
  // last 5 chars
  const addressSuffix = input.address.slice(-5);
  const displayAddress = `${addressPrefix}...${addressSuffix}`;

  await accountService.createAccountForApiKey({
    apiKey,
    displayName: `Wallet: ${displayAddress}`,
  });

  return {
    accountId,
    apiKey,
  };
}
