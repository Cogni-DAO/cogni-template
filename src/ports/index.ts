// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports`
 * Purpose: Hex entry file for port interfaces and port-level errors - canonical import surface.
 * Scope: Re-exports public port interfaces and error classes. Does not export implementations or runtime objects.
 * Invariants: Named exports only, no runtime coupling except error classes, no export *
 * Side-effects: none
 * Notes: Enforces architectural boundaries via ESLint entry-point rules
 * Links: Used by features and adapters for port contracts
 * @public
 */

export {
  type AccountService,
  type BilledLlmUsageParams,
  type BillingAccount,
  BillingAccountNotFoundPortError,
  type CreditLedgerEntry,
  InsufficientCreditsPortError,
  isBillingAccountNotFoundPortError,
  isInsufficientCreditsPortError,
  isVirtualKeyNotFoundPortError,
  type NeedsReviewLlmUsageParams,
  VirtualKeyNotFoundPortError,
} from "./accounts.port";
export type { Clock } from "./clock.port";
export type { LlmCaller, LlmService } from "./llm.port";
export type {
  OnChainVerifier,
  VerificationResult,
  VerificationStatus,
} from "./onchain-verifier.port";
export {
  type CreatePaymentAttemptParams,
  isPaymentAttemptNotFoundPortError,
  isTxHashAlreadyBoundPortError,
  type LogPaymentEventParams,
  type PaymentAttempt,
  PaymentAttemptNotFoundPortError,
  type PaymentAttemptRepository,
  type PaymentAttemptStatus,
  type PaymentErrorCode,
  TxHashAlreadyBoundPortError,
} from "./payment-attempt.port";
