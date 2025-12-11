// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/payments`
 * Purpose: Payment flow types shared across all layers (bottom of dependency hierarchy).
 * Scope: Type-only exports; defines UI state, backend status enums, and error codes. Does not contain runtime code or functions.
 * Invariants: All exports are types or interfaces; no values or functions.
 * Side-effects: none
 * Notes: Single source of truth for payment types; prevents circular dependencies.
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

// ============================================================================
// UI State (Hook → Component Interface)
// ============================================================================

/**
 * Payment flow UI phase.
 * Maps backend statuses to simplified UI states for component rendering.
 */
export type PaymentFlowPhase = "READY" | "PENDING" | "DONE";

/**
 * Complete payment flow state for UI rendering.
 * Consumed by UsdcPaymentFlow component, exported by usePaymentFlow hook.
 */
export interface PaymentFlowState {
  phase: PaymentFlowPhase;

  // READY phase
  isCreatingIntent: boolean;

  // PENDING phase
  walletStep: "SIGNING" | "CONFIRMING" | "SUBMITTING" | "VERIFYING" | null;
  txHash: string | null;
  explorerUrl: string | null;
  isInFlight: boolean; // True only during PENDING phases (not TERMINAL)

  // DONE phase
  result: "SUCCESS" | "ERROR" | null;
  errorMessage: string | null;
  creditsAdded: number | null;
}

// ============================================================================
// Backend Status Enums (Contract Types)
// ============================================================================

/**
 * Client-visible backend status from GET /api/v1/payments/attempts/:id.
 * Matches payments.status.v1.contract.ts output exactly.
 */
export type PaymentStatus = "PENDING_VERIFICATION" | "CONFIRMED" | "FAILED";

/**
 * Internal backend status from POST /api/v1/payments/attempts/:id/submit.
 * Matches payments.submit.v1.contract.ts output exactly.
 */
export type PaymentAttemptStatus =
  | "CREATED_INTENT"
  | "PENDING_UNVERIFIED"
  | "CREDITED"
  | "REJECTED"
  | "FAILED";

// ============================================================================
// Error Codes (Backend → Frontend)
// ============================================================================

/**
 * Payment error codes from backend.
 * Canonical source - core/payments/model.ts imports from here.
 */
export type PaymentErrorCode =
  | "SENDER_MISMATCH"
  | "INVALID_TOKEN"
  | "INVALID_RECIPIENT"
  | "INVALID_CHAIN"
  | "INSUFFICIENT_AMOUNT"
  | "INSUFFICIENT_CONFIRMATIONS"
  | "TX_NOT_FOUND"
  | "TX_REVERTED"
  | "TOKEN_TRANSFER_NOT_FOUND"
  | "RECIPIENT_MISMATCH"
  | "RECEIPT_NOT_FOUND"
  | "INTENT_EXPIRED"
  | "RPC_ERROR";
