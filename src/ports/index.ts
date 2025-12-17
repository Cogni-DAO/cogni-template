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
  type BillingAccount,
  BillingAccountNotFoundPortError,
  type ChargeReceiptParams,
  type ChargeReceiptProvenance,
  type CreditLedgerEntry,
  InsufficientCreditsPortError,
  isBillingAccountNotFoundPortError,
  isInsufficientCreditsPortError,
  isVirtualKeyNotFoundPortError,
  VirtualKeyNotFoundPortError,
} from "./accounts.port";
export {
  type AiTelemetryPort,
  classifyLlmErrorFromStatus,
  type InvocationStatus,
  isLlmError,
  type LangfusePort,
  LlmError,
  type LlmErrorKind,
  type RecordInvocationParams,
} from "./ai-telemetry.port";
export type { Clock } from "./clock.port";
export type {
  ChatDeltaEvent,
  CompletionStreamParams,
  LlmCaller,
  LlmCompletionResult,
  LlmService,
} from "./llm.port";
export type {
  InstantQueryParams,
  MetricsQueryPort,
  PrometheusDataPoint,
  PrometheusInstantResult,
  PrometheusInstantValue,
  PrometheusRangeResult,
  PrometheusTimeSeries,
  RangeQueryParams,
} from "./metrics-query.port";
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
export type {
  TokenBalance,
  TreasuryReadPort,
  TreasurySnapshot,
} from "./treasury-read.port";
export * from "./usage.port";
