// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/model`
 * Purpose: Payment domain entities for USDC credit top-ups with backend verification.
 * Scope: Pure domain types with no infrastructure dependencies. Does not handle persistence or external services.
 * Invariants: Status transitions are validated by rules module; amounts in USD cents and USDC raw units (6 decimals).
 * Side-effects: none (pure domain logic)
 * Notes: Client-visible states are simplified projections of internal states.
 * Links: Used by ports and features, implemented by adapters
 * @public
 */

/**
 * Internal payment attempt states
 * State machine: CREATED_INTENT → PENDING_UNVERIFIED → CREDITED | REJECTED | FAILED
 */
export type PaymentAttemptStatus =
  | "CREATED_INTENT"
  | "PENDING_UNVERIFIED"
  | "CREDITED"
  | "REJECTED"
  | "FAILED";

/**
 * Client-visible payment states
 * Simplified projection for UI: PENDING_VERIFICATION | CONFIRMED | FAILED
 */
export type ClientVisibleStatus =
  | "PENDING_VERIFICATION"
  | "CONFIRMED"
  | "FAILED";

/**
 * Payment error codes for terminal failure states
 */
export type PaymentErrorCode =
  | "SENDER_MISMATCH"
  | "INVALID_TOKEN"
  | "INVALID_RECIPIENT"
  | "INSUFFICIENT_AMOUNT"
  | "INSUFFICIENT_CONFIRMATIONS"
  | "TX_REVERTED"
  | "RECEIPT_NOT_FOUND"
  | "INTENT_EXPIRED"
  | "VERIFICATION_TIMEOUT"
  | "RPC_ERROR";

/**
 * Payment attempt entity
 * Represents a single USDC payment attempt for credit top-up
 */
export interface PaymentAttempt {
  /** Unique attempt identifier */
  id: string;
  /** Billing account that owns this attempt */
  billingAccountId: string;
  /** Checksummed wallet address from SIWE session */
  fromAddress: string;
  /** Chain ID (Ethereum Sepolia = 11155111 for MVP) */
  chainId: number;
  /** Token contract address (USDC) */
  token: string;
  /** Recipient address (DAO wallet) */
  toAddress: string;
  /** USDC amount in raw units (6 decimals) */
  amountRaw: bigint;
  /** USD amount in cents */
  amountUsdCents: number;
  /** Current status */
  status: PaymentAttemptStatus;
  /** Transaction hash (null until submitted) */
  txHash: string | null;
  /** Error code for terminal failure states */
  errorCode: PaymentErrorCode | null;
  /** Intent expiration (null after submission) */
  expiresAt: Date | null;
  /** Submission timestamp (set when txHash bound) */
  submittedAt: Date | null;
  /** Last verification attempt timestamp */
  lastVerifyAttemptAt: Date | null;
  /** Verification attempt count */
  verifyAttemptCount: number;
  /** Creation timestamp */
  createdAt: Date;
}
