// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/errors`
 * Purpose: Domain errors for payment operations.
 * Scope: Pure error types with no infrastructure dependencies. Does not handle HTTP status codes.
 * Invariants: All errors include structured data for debugging and user feedback.
 * Side-effects: none (error definitions only)
 * Notes: Feature layer translates domain errors to HTTP responses; adapters throw port-level errors.
 * Links: Used by feature services, handled by API routes
 * @public
 */

import type { PaymentErrorCode } from "./model";

/**
 * Domain error thrown when payment intent has expired
 * Occurs when attempt is still in CREATED_INTENT after TTL
 */
export class PaymentIntentExpiredError extends Error {
  public readonly code = "PAYMENT_INTENT_EXPIRED" as const;

  constructor(
    /** Attempt ID that expired */
    public readonly attemptId: string,
    /** Expiration timestamp */
    public readonly expiresAt: Date,
    /** Current timestamp when check occurred */
    public readonly now: Date
  ) {
    super(
      `Payment intent ${attemptId} expired at ${expiresAt.toISOString()} (checked at ${now.toISOString()})`
    );
    this.name = "PaymentIntentExpiredError";
  }
}

/**
 * Domain error thrown when on-chain verification fails
 * Contains error code from OnChainVerifier for specific failure reason
 */
export class PaymentVerificationError extends Error {
  public readonly code = "PAYMENT_VERIFICATION_FAILED" as const;

  constructor(
    /** Attempt ID that failed verification */
    public readonly attemptId: string,
    /** Specific verification error code */
    public readonly errorCode: PaymentErrorCode,
    /** Human-readable error message */
    message: string
  ) {
    super(
      `Payment verification failed for attempt ${attemptId}: ${message} (${errorCode})`
    );
    this.name = "PaymentVerificationError";
  }
}

/**
 * Domain error thrown when payment attempt is not found
 * Either doesn't exist or not owned by requesting user
 */
export class PaymentNotFoundError extends Error {
  public readonly code = "PAYMENT_NOT_FOUND" as const;

  constructor(
    /** Attempt ID that was not found */
    public readonly attemptId: string,
    /** Billing account ID that requested the attempt */
    public readonly billingAccountId: string
  ) {
    super(
      `Payment attempt ${attemptId} not found for billing account ${billingAccountId}`
    );
    this.name = "PaymentNotFoundError";
  }
}

/**
 * Domain error thrown when transaction hash is already bound to a different attempt
 * Prevents reuse of same txHash across multiple payment attempts
 */
export class TxHashAlreadyBoundError extends Error {
  public readonly code = "TX_HASH_ALREADY_BOUND" as const;

  constructor(
    /** Transaction hash that is already bound */
    public readonly txHash: string,
    /** Chain ID */
    public readonly chainId: number,
    /** Existing attempt ID that owns this hash */
    public readonly existingAttemptId: string
  ) {
    super(
      `Transaction hash ${txHash} on chain ${chainId} is already bound to attempt ${existingAttemptId}`
    );
    this.name = "TxHashAlreadyBoundError";
  }
}

/**
 * Domain error thrown when invalid state transition is attempted
 * Enforces state machine rules
 */
export class InvalidStateTransitionError extends Error {
  public readonly code = "INVALID_STATE_TRANSITION" as const;

  constructor(
    /** Attempt ID */
    public readonly attemptId: string,
    /** Current status */
    public readonly from: string,
    /** Target status */
    public readonly to: string
  ) {
    super(`Invalid state transition for attempt ${attemptId}: ${from} → ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

/**
 * Type guard to check if error is PaymentIntentExpiredError
 */
export function isPaymentIntentExpiredError(
  error: unknown
): error is PaymentIntentExpiredError {
  return (
    error instanceof Error &&
    error.name === "PaymentIntentExpiredError" &&
    "code" in error &&
    (error as PaymentIntentExpiredError).code === "PAYMENT_INTENT_EXPIRED"
  );
}

/**
 * Type guard to check if error is PaymentVerificationError
 */
export function isPaymentVerificationError(
  error: unknown
): error is PaymentVerificationError {
  return (
    error instanceof Error &&
    error.name === "PaymentVerificationError" &&
    "code" in error &&
    (error as PaymentVerificationError).code === "PAYMENT_VERIFICATION_FAILED"
  );
}

/**
 * Type guard to check if error is PaymentNotFoundError
 */
export function isPaymentNotFoundError(
  error: unknown
): error is PaymentNotFoundError {
  return (
    error instanceof Error &&
    error.name === "PaymentNotFoundError" &&
    "code" in error &&
    (error as PaymentNotFoundError).code === "PAYMENT_NOT_FOUND"
  );
}

/**
 * Type guard to check if error is TxHashAlreadyBoundError
 */
export function isTxHashAlreadyBoundError(
  error: unknown
): error is TxHashAlreadyBoundError {
  return (
    error instanceof Error &&
    error.name === "TxHashAlreadyBoundError" &&
    "code" in error &&
    (error as TxHashAlreadyBoundError).code === "TX_HASH_ALREADY_BOUND"
  );
}

/**
 * Type guard to check if error is InvalidStateTransitionError
 */
export function isInvalidStateTransitionError(
  error: unknown
): error is InvalidStateTransitionError {
  return (
    error instanceof Error &&
    error.name === "InvalidStateTransitionError" &&
    "code" in error &&
    (error as InvalidStateTransitionError).code === "INVALID_STATE_TRANSITION"
  );
}
