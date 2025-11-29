// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/payment-attempt`
 * Purpose: Payment attempt repository port for persistence and audit logging.
 * Scope: Defines contracts for payment attempt lifecycle and event logging. Does not implement persistence logic.
 * Invariants:
 * - findById enforces ownership; feature layer MUST enforce ownership before calling mutating methods.
 * - Attempts are immutable once txHash is bound.
 * Side-effects: none (interface definition only)
 * Notes: Adapters throw port-level errors; feature layer translates to domain errors.
 * Links: Implemented by DrizzlePaymentAttemptRepository, used by payment feature services
 * @public
 */

import type {
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "@/core";

// Re-export core types so adapters don't import from @/core directly
export type {
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "@/core";

/**
 * Port-level error thrown when payment attempt is not found
 * Adapters throw this when attempt doesn't exist or ownership check fails
 */
export class PaymentAttemptNotFoundPortError extends Error {
  constructor(
    public readonly attemptId: string,
    public readonly billingAccountId?: string
  ) {
    const message = billingAccountId
      ? `Payment attempt ${attemptId} not found for billing account ${billingAccountId}`
      : `Payment attempt ${attemptId} not found`;
    super(message);
    this.name = "PaymentAttemptNotFoundPortError";
  }
}

/**
 * Port-level error thrown when txHash is already bound to different attempt
 * Prevents same transaction from being used across multiple payment attempts
 */
export class TxHashAlreadyBoundPortError extends Error {
  constructor(
    public readonly txHash: string,
    public readonly chainId: number,
    public readonly existingAttemptId: string
  ) {
    super(
      `Transaction hash ${txHash} on chain ${chainId} already bound to attempt ${existingAttemptId}`
    );
    this.name = "TxHashAlreadyBoundPortError";
  }
}

/**
 * Type guard for PaymentAttemptNotFoundPortError
 */
export function isPaymentAttemptNotFoundPortError(
  error: unknown
): error is PaymentAttemptNotFoundPortError {
  return (
    error instanceof Error && error.name === "PaymentAttemptNotFoundPortError"
  );
}

/**
 * Type guard for TxHashAlreadyBoundPortError
 */
export function isTxHashAlreadyBoundPortError(
  error: unknown
): error is TxHashAlreadyBoundPortError {
  return error instanceof Error && error.name === "TxHashAlreadyBoundPortError";
}

/**
 * Parameters for creating a payment attempt
 */
export interface CreatePaymentAttemptParams {
  billingAccountId: string;
  fromAddress: string;
  chainId: number;
  token: string;
  toAddress: string;
  amountRaw: bigint;
  amountUsdCents: number;
  expiresAt: Date;
}

/**
 * Parameters for logging a payment event
 * eventType is a coarse-grained operation verb; fromStatus/toStatus carry actual state transitions
 */
export interface LogPaymentEventParams {
  attemptId: string;
  eventType:
    | "INTENT_CREATED"
    | "TX_SUBMITTED"
    | "VERIFICATION_ATTEMPTED"
    | "STATUS_CHANGED";
  fromStatus: PaymentAttemptStatus | null;
  toStatus: PaymentAttemptStatus;
  errorCode?: PaymentErrorCode;
  metadata?: Record<string, unknown>;
}

/**
 * Payment attempt repository port
 * Abstracts persistence layer for payment attempts and audit events
 */
export interface PaymentAttemptRepository {
  /**
   * Creates a new payment attempt
   * Sets status to CREATED_INTENT and generates unique ID
   *
   * @param params - Attempt creation parameters
   * @returns Created payment attempt
   */
  create(params: CreatePaymentAttemptParams): Promise<PaymentAttempt>;

  /**
   * Finds payment attempt by ID with ownership enforcement
   * Returns null if not found or not owned by billingAccountId
   *
   * @param id - Attempt ID
   * @param billingAccountId - Billing account that must own the attempt
   * @returns Payment attempt or null
   */
  findById(
    id: string,
    billingAccountId: string
  ): Promise<PaymentAttempt | null>;

  /**
   * Finds payment attempt by transaction hash
   * Used for duplicate detection and idempotency checks
   *
   * @param chainId - Chain ID
   * @param txHash - Transaction hash
   * @returns Payment attempt or null
   */
  findByTxHash(chainId: number, txHash: string): Promise<PaymentAttempt | null>;

  /**
   * Updates payment attempt status
   * Feature service is responsible for validating transitions via core/rules.isValidTransition()
   * Repository is dumb persistence - just updates status and logs event
   *
   * @param id - Attempt ID
   * @param status - New status
   * @param errorCode - Optional error code for terminal failure states
   * @returns Updated payment attempt
   * @throws PaymentAttemptNotFoundPortError if not found
   */
  updateStatus(
    id: string,
    status: PaymentAttemptStatus,
    errorCode?: PaymentErrorCode
  ): Promise<PaymentAttempt>;

  /**
   * Binds transaction hash to payment attempt
   * Sets txHash, submittedAt, and clears expiresAt
   * Transitions status to PENDING_UNVERIFIED
   *
   * @param id - Attempt ID
   * @param txHash - Transaction hash to bind
   * @param submittedAt - Submission timestamp
   * @returns Updated payment attempt
   * @throws PaymentAttemptNotFoundPortError if not found
   * @throws TxHashAlreadyBoundPortError if hash already used
   */
  bindTxHash(
    id: string,
    txHash: string,
    submittedAt: Date
  ): Promise<PaymentAttempt>;

  /**
   * Records verification attempt
   * Updates lastVerifyAttemptAt and increments verifyAttemptCount
   *
   * @param id - Attempt ID
   * @param attemptedAt - Verification attempt timestamp
   * @returns Updated payment attempt
   */
  recordVerificationAttempt(
    id: string,
    attemptedAt: Date
  ): Promise<PaymentAttempt>;

  /**
   * Logs payment event to audit trail
   * Append-only event log for reconciliation and debugging
   *
   * @param params - Event parameters
   */
  logEvent(params: LogPaymentEventParams): Promise<void>;
}
