// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/rules`
 * Purpose: Business rules for payment state machine and validation.
 * Scope: Pure validation functions and constants with no side effects. Does not perform I/O or state mutations.
 * Invariants: State transitions follow allowed paths: CREATED_INTENT → PENDING_UNVERIFIED → CREDITED|REJECTED|FAILED
 * Side-effects: none (pure functions)
 * Notes: Amount bounds: min 100 cents ($1), max 1,000,000 cents ($10,000).
 * Links: Used by feature services for validation
 * @public
 */

import type {
  ClientVisibleStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
} from "./model";

/**
 * @deprecated Use usdCentsToCredits() from @/core/billing/pricing for new code.
 * TODO: CENTS_DEBT_EPIC - migrate UI payment flows to use protocol constant CREDITS_PER_USD.
 * Kept for backward compatibility with usePaymentFlow.ts and CreditsPage.client.tsx.
 */
export const CREDITS_PER_CENT = 10;

/** Minimum payment amount in USD cents ($1.00) */
export const MIN_PAYMENT_CENTS = 100;

/** Maximum payment amount in USD cents ($10,000.00) */
export const MAX_PAYMENT_CENTS = 1_000_000;

/** Payment intent TTL in milliseconds (30 minutes) */
export const PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000;

/** Pending unverified timeout in milliseconds (24 hours) */
export const PENDING_UNVERIFIED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Validates if a state transition is allowed
 * Implements state machine rules
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid
 */
export function isValidTransition(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus
): boolean {
  // No transition from self
  if (from === to) return false;

  // No transitions from terminal states
  if (from === "CREDITED" || from === "REJECTED" || from === "FAILED") {
    return false;
  }

  // CREATED_INTENT transitions
  if (from === "CREATED_INTENT") {
    return to === "PENDING_UNVERIFIED" || to === "FAILED";
  }

  // PENDING_UNVERIFIED transitions
  if (from === "PENDING_UNVERIFIED") {
    return to === "CREDITED" || to === "REJECTED" || to === "FAILED";
  }

  return false;
}

/**
 * Validates payment amount bounds
 *
 * @param amountUsdCents - Amount in USD cents
 * @returns true if amount is within valid range
 */
export function isValidPaymentAmount(amountUsdCents: number): boolean {
  return (
    Number.isInteger(amountUsdCents) &&
    amountUsdCents >= MIN_PAYMENT_CENTS &&
    amountUsdCents <= MAX_PAYMENT_CENTS
  );
}

/**
 * Checks if payment intent has expired
 * Only applies to CREATED_INTENT state
 *
 * @param attempt - Payment attempt to check
 * @param now - Current timestamp
 * @returns true if intent is expired
 */
export function isIntentExpired(attempt: PaymentAttempt, now: Date): boolean {
  if (attempt.status !== "CREATED_INTENT") return false;
  if (!attempt.expiresAt) return false;
  return now >= attempt.expiresAt;
}

/**
 * Checks if pending verification has timed out
 * Only applies to PENDING_UNVERIFIED state
 *
 * @param attempt - Payment attempt to check
 * @param now - Current timestamp
 * @returns true if verification has timed out
 */
export function isVerificationTimedOut(
  attempt: PaymentAttempt,
  now: Date
): boolean {
  if (attempt.status !== "PENDING_UNVERIFIED") return false;
  if (!attempt.submittedAt) return false;

  const elapsed = now.getTime() - attempt.submittedAt.getTime();
  return elapsed > PENDING_UNVERIFIED_TTL_MS;
}

/**
 * Checks if status is terminal (no further transitions allowed)
 * Terminal states: CREDITED, REJECTED, FAILED
 *
 * @param status - Payment attempt status to check
 * @returns true if status is terminal
 */
export function isTerminalState(status: PaymentAttemptStatus): boolean {
  return status === "CREDITED" || status === "REJECTED" || status === "FAILED";
}

/**
 * Maps internal payment status to client-visible status
 * Simplifies state machine for UI consumption
 *
 * @param status - Internal payment attempt status
 * @returns Client-visible status for UI
 */
export function toClientVisibleStatus(
  status: PaymentAttemptStatus
): ClientVisibleStatus {
  switch (status) {
    case "CREATED_INTENT":
    case "PENDING_UNVERIFIED":
      return "PENDING_VERIFICATION";
    case "CREDITED":
      return "CONFIRMED";
    case "REJECTED":
    case "FAILED":
      return "FAILED";
  }
}
