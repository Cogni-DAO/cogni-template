// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/accounts/services/adminAccounts`
 * Purpose: Orchestrates admin account management flows (register, topup, validate).
 * Scope: Coordinates domain logic and ports for admin operations. Does not handle HTTP concerns.
 * Invariants: Catches domain errors and translates to feature errors; pure business orchestration
 * Side-effects: IO (via ports)
 * Notes: Translates between domain (core/accounts) and feature boundaries; admin-only operations
 * Links: Called by app facades, uses core domain and ports, returns feature errors
 * @public
 */

import {
  AccountNotFoundError as DomainAccountNotFoundError,
  InsufficientCreditsError as DomainInsufficientCreditsError,
  UnknownApiKeyError as DomainUnknownApiKeyError,
} from "@/core";
import type { AccountService } from "@/ports";
import {
  isAccountNotFoundPortError,
  isInsufficientCreditsPortError,
} from "@/ports";

import type { AccountsFeatureError } from "../errors";

interface RegisterAccountRequest {
  apiKey: string;
  displayName?: string;
}

export type RegisterAccountResult =
  | { ok: true; account: { accountId: string; balanceCredits: number } }
  | { ok: false; error: AccountsFeatureError };

interface TopupCreditsRequest {
  accountId: string;
  amount: number;
  reason: string;
  reference?: string;
}

export type TopupCreditsResult =
  | { ok: true; newBalance: number }
  | { ok: false; error: AccountsFeatureError };

export type GetAccountForApiKeyResult =
  | { ok: true; account: { accountId: string; balanceCredits: number } }
  | { ok: false; error: AccountsFeatureError };

/**
 * Register a new account for an API key (admin operation)
 * Returns Result type to avoid throwing across feature boundary
 */
export async function registerAccount(
  accountService: AccountService,
  request: RegisterAccountRequest
): Promise<RegisterAccountResult> {
  try {
    const result = await accountService.createAccountForApiKey({
      apiKey: request.apiKey,
      ...(request.displayName && { displayName: request.displayName }),
    });

    return {
      ok: true,
      account: {
        accountId: result.accountId,
        balanceCredits: result.balanceCredits,
      },
    };
  } catch (error) {
    // Translate domain errors to feature errors
    if (error instanceof DomainUnknownApiKeyError) {
      return { ok: false, error: { kind: "UNKNOWN_API_KEY" } };
    }

    // Generic error fallback
    return {
      ok: false,
      error: {
        kind: "GENERIC",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Add credits to an account (admin operation)
 * Returns Result type to avoid throwing across feature boundary
 */
export async function topupCredits(
  accountService: AccountService,
  request: TopupCreditsRequest
): Promise<TopupCreditsResult> {
  try {
    const result = await accountService.creditAccount({
      accountId: request.accountId,
      amount: request.amount,
      reason: request.reason,
      ...(request.reference && { reference: request.reference }),
    });

    return { ok: true, newBalance: result.newBalance };
  } catch (error) {
    // Handle port-level errors
    if (isAccountNotFoundPortError(error)) {
      return {
        ok: false,
        error: { kind: "ACCOUNT_NOT_FOUND", accountId: request.accountId },
      };
    }
    if (isInsufficientCreditsPortError(error)) {
      return {
        ok: false,
        error: {
          kind: "INSUFFICIENT_CREDITS",
          accountId: request.accountId,
          required: error.cost,
          available: error.previousBalance,
        },
      };
    }

    // Translate domain errors to feature errors
    if (error instanceof DomainAccountNotFoundError) {
      return {
        ok: false,
        error: { kind: "ACCOUNT_NOT_FOUND", accountId: request.accountId },
      };
    }
    if (error instanceof DomainInsufficientCreditsError) {
      return {
        ok: false,
        error: {
          kind: "INSUFFICIENT_CREDITS",
          accountId: request.accountId,
          required: error.requiredCost,
          available: error.availableBalance,
        },
      };
    }

    // Generic error fallback
    return {
      ok: false,
      error: {
        kind: "GENERIC",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Get account information for API key (used by completion operations)
 * Returns Result type to avoid throwing across feature boundary
 */
export async function getAccountForApiKey(
  accountService: AccountService,
  apiKey: string
): Promise<GetAccountForApiKeyResult> {
  try {
    const account = await accountService.getAccountByApiKey(apiKey);
    if (!account) {
      // No account found for this API key
      return { ok: false, error: { kind: "UNKNOWN_API_KEY" } };
    }

    return {
      ok: true,
      account: {
        accountId: account.accountId,
        balanceCredits: account.balanceCredits,
      },
    };
  } catch (error) {
    // Handle port-level errors
    if (isAccountNotFoundPortError(error)) {
      return { ok: false, error: { kind: "UNKNOWN_API_KEY" } };
    }

    // Generic error fallback
    return {
      ok: false,
      error: {
        kind: "GENERIC",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
