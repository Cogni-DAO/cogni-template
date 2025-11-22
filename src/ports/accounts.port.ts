// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/accounts`
 * Purpose: Billing account service port interface and port-level errors for credit accounting operations.
 * Scope: Defines contracts for billing account lifecycle, virtual key provisioning, and credit management. Does not implement business logic.
 * Invariants: All operations are atomic, billing accounts own virtual keys, credit ledger integrity is preserved
 * Side-effects: none (interface definition only)
 * Notes: Implemented by database adapters, used by features and app facades
 * Links: Implemented by DrizzleAccountService, used by completion feature and auth mapping
 * @public
 */

/**
 * Port-level error thrown by adapters when billing account has insufficient credits
 * Structured data for feature layer to translate into domain errors
 */
export class InsufficientCreditsPortError extends Error {
  constructor(
    public readonly billingAccountId: string,
    public readonly cost: number,
    public readonly previousBalance: number
  ) {
    super(
      `Insufficient credits: billing account ${billingAccountId} has ${previousBalance}, needs ${cost}`
    );
    this.name = "InsufficientCreditsPortError";
  }
}

/**
 * Port-level error thrown by adapters when billing account is not found
 */
export class BillingAccountNotFoundPortError extends Error {
  constructor(public readonly billingAccountId: string) {
    super(`Billing account not found: ${billingAccountId}`);
    this.name = "BillingAccountNotFoundPortError";
  }
}

/**
 * Port-level error thrown when a virtual key lookup fails for a billing account
 */
export class VirtualKeyNotFoundPortError extends Error {
  constructor(
    public readonly billingAccountId: string,
    public readonly virtualKeyId?: string
  ) {
    super(`Virtual key not found for billing account: ${billingAccountId}`);
    this.name = "VirtualKeyNotFoundPortError";
  }
}

/**
 * Type guard to check if error is InsufficientCreditsPortError
 */
export function isInsufficientCreditsPortError(
  error: unknown
): error is InsufficientCreditsPortError {
  return (
    error instanceof Error && error.name === "InsufficientCreditsPortError"
  );
}

/**
 * Type guard to check if error is BillingAccountNotFoundPortError
 */
export function isBillingAccountNotFoundPortError(
  error: unknown
): error is BillingAccountNotFoundPortError {
  return (
    error instanceof Error && error.name === "BillingAccountNotFoundPortError"
  );
}

/**
 * Type guard to check if error is VirtualKeyNotFoundPortError
 */
export function isVirtualKeyNotFoundPortError(
  error: unknown
): error is VirtualKeyNotFoundPortError {
  return error instanceof Error && error.name === "VirtualKeyNotFoundPortError";
}

export interface BillingAccount {
  id: string;
  ownerUserId: string;
  balanceCredits: number;
  defaultVirtualKeyId: string;
  litellmVirtualKey: string;
}

export interface AccountService {
  /**
   * Idempotently create or fetch a billing account for the given user.
   * Ensures a default virtual key exists and is returned for data-plane calls.
   */
  getOrCreateBillingAccountForUser(params: {
    userId: string;
    walletAddress?: string;
    displayName?: string;
  }): Promise<BillingAccount>;

  /**
   * Reads cached balance from billing_accounts table.
   * Not recomputed from ledger for performance.
   */
  getBalance(billingAccountId: string): Promise<number>;

  /**
   * Atomic credit deduction after LLM usage.
   * Prevents race conditions with single operation.
   * Throws InsufficientCreditsError if balance would go negative.
   */
  debitForUsage(params: {
    billingAccountId: string;
    virtualKeyId: string;
    cost: number;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Credit billing account for funding/testing flows.
   * Inserts positive delta into ledger and returns new balance atomically.
   */
  creditAccount(params: {
    billingAccountId: string;
    amount: number;
    reason: string;
    reference?: string;
    virtualKeyId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ newBalance: number }>;
}
