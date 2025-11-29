// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/public`
 * Purpose: Stable core entry point - explicit named exports to control public surface.
 * Scope: Re-exports only approved domain interfaces, prevents accidental creep/cycles. Does not modify or transform exports.
 * Invariants: Named exports only, no export *, controlled public API surface
 * Side-effects: none
 * Notes: Single entry point for all core domain access, enforced by ESLint
 * Links: Used by features via \@/core alias
 * @public
 */

export type { Account } from "./accounts/model";
export {
  AccountNotFoundError,
  ensureHasCredits,
  hasSufficientCredits,
  InsufficientCreditsError,
  isAccountNotFoundError,
  isInsufficientCreditsError,
  isUnknownApiKeyError,
  UnknownApiKeyError,
} from "./accounts/public";
export {
  calculateUserPriceCredits,
  usdToCredits,
} from "./billing/pricing";
export type { Conversation, Message, MessageRole } from "./chat/model";
export {
  assertMessageLength,
  ChatErrorCode,
  ChatValidationError,
  filterSystemMessages,
  MAX_MESSAGE_CHARS,
  normalizeMessageRole,
  trimConversationHistory,
} from "./chat/rules";
export type {
  ClientVisibleStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "./payments/public";
export {
  InvalidStateTransitionError,
  isIntentExpired,
  isInvalidStateTransitionError,
  isPaymentIntentExpiredError,
  isPaymentNotFoundError,
  isPaymentVerificationError,
  isTerminalState,
  isTxHashAlreadyBoundError,
  isValidPaymentAmount,
  isValidTransition,
  isVerificationTimedOut,
  MAX_PAYMENT_CENTS,
  MIN_PAYMENT_CENTS,
  PAYMENT_INTENT_TTL_MS,
  PaymentIntentExpiredError,
  PaymentNotFoundError,
  PaymentVerificationError,
  PENDING_UNVERIFIED_TTL_MS,
  rawUsdcToUsdCents,
  TxHashAlreadyBoundError,
  toClientVisibleStatus,
  usdCentsToRawUsdc,
} from "./payments/public";
