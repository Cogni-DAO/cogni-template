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

export type { GraphId } from "@cogni/ai-core";
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
export type {
  AiTelemetryPort,
  CreateTraceWithIOParams,
  InvocationStatus,
  LangfusePort,
  LangfuseSpanHandle,
  RecordInvocationParams,
} from "./ai-telemetry.port";
export type { Clock } from "./clock.port";
export type {
  AiExecutionErrorCode,
  GraphExecutorPort,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
} from "./graph-executor.port";
// LlmError types re-exported for adapters (adapters can only import from ports)
// Features should import directly from @/core
export {
  type ChatDeltaEvent,
  type CompletionFinalResult,
  type CompletionStreamParams,
  classifyLlmErrorFromStatus,
  type GraphLlmCaller,
  isLlmError,
  type JsonSchemaObject,
  type LlmCaller,
  type LlmCompletionResult,
  LlmError,
  type LlmErrorKind,
  type LlmService,
  type LlmToolCall,
  type LlmToolCallDelta,
  type LlmToolChoice,
  type LlmToolDefinition,
  type Message,
  normalizeErrorToExecutionCode,
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
  EmitAiEvent,
  ToolEffect,
  ToolExecFn,
  ToolExecResult,
} from "./tool-exec.port";
export type {
  TokenBalance,
  TreasuryReadPort,
  TreasurySnapshot,
} from "./treasury-read.port";
export * from "./usage.port";
