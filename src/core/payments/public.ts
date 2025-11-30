// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/public`
 * Purpose: Public API for payment domain.
 * Scope: Barrel export for payment core domain. Does not expose internal implementation details.
 * Invariants: Only exports stable public interfaces and functions.
 * Side-effects: none (re-exports only)
 * Notes: This is the entry point for other layers importing payment domain logic.
 * Links: Imported by ports, features, and adapters
 * @public
 */

// Errors
export {
  InvalidStateTransitionError,
  isInvalidStateTransitionError,
  isPaymentIntentExpiredError,
  isPaymentNotFoundError,
  isPaymentVerificationError,
  isTxHashAlreadyBoundError,
  PaymentIntentExpiredError,
  PaymentNotFoundError,
  PaymentVerificationError,
  TxHashAlreadyBoundError,
} from "./errors";
// Model types
export type {
  ClientVisibleStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "./model";

// Rules and validation
export {
  CREDITS_PER_CENT,
  isIntentExpired,
  isTerminalState,
  isValidPaymentAmount,
  isValidTransition,
  isVerificationTimedOut,
  MAX_PAYMENT_CENTS,
  MIN_PAYMENT_CENTS,
  PAYMENT_INTENT_TTL_MS,
  PENDING_UNVERIFIED_TTL_MS,
  toClientVisibleStatus,
} from "./rules";

// Utilities
export { rawUsdcToUsdCents, usdCentsToRawUsdc } from "./util";
