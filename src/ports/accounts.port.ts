// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/accounts`
 * Purpose: Billing account service port interface with discriminated union types for LLM billing and port-level errors.
 * Scope: Defines contracts for billing account lifecycle, virtual key provisioning, and credit management with type-safe billing discrimination. Does not implement business logic.
 * Invariants: All operations atomic; billing accounts own virtual keys; ledger integrity preserved; billingStatus discriminates cost fields
 * Side-effects: none (interface definition only)
 * Notes: Uses BilledLlmUsageParams and NeedsReviewLlmUsageParams for type-safe recordLlmUsage; implemented by database adapters
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

export interface CreditLedgerEntry {
  id: string;
  billingAccountId: string;
  virtualKeyId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * LLM usage with cost data - billed to user account
 */
export type BilledLlmUsageParams = {
  billingStatus: "billed";
  billingAccountId: string;
  virtualKeyId: string;
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  providerCostUsd: number;
  providerCostCredits: bigint;
  userPriceCredits: bigint;
  markupFactorApplied: number;
  metadata?: Record<string, unknown>;
};

/**
 * LLM usage without cost data - recorded but not billed
 */
export type NeedsReviewLlmUsageParams = {
  billingStatus: "needs_review";
  billingAccountId: string;
  virtualKeyId: string;
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, unknown>;
};

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

  /**
   * Fetch credit ledger entries for a billing account ordered by newest first.
   */
  listCreditLedgerEntries(params: {
    billingAccountId: string;
    limit?: number | undefined;
    reason?: string | undefined;
  }): Promise<CreditLedgerEntry[]>;

  /**
   * Records LLM usage with discriminated billing status.
   * - billingStatus: "billed" → records usage + debits credits atomically (throws InsufficientCreditsPortError if insufficient)
   * - billingStatus: "needs_review" → records usage only (no credit debit, no cost fields)
   */
  recordLlmUsage(
    params: BilledLlmUsageParams | NeedsReviewLlmUsageParams
  ): Promise<void>;

  /**
   * Lookup a specific credit ledger entry by reference and reason for idempotency checks.
   */
  findCreditLedgerEntryByReference(params: {
    billingAccountId: string;
    reason: string;
    reference: string;
  }): Promise<CreditLedgerEntry | null>;
}
