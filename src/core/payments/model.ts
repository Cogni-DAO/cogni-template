// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/payments/model`
 * Purpose: Payment domain entities for USDC credit top-ups with backend verification.
 * Scope: Pure domain types with no infrastructure dependencies. Does not handle persistence or external services.
 * Invariants: Status transitions are validated by rules module; amounts in USD cents and USDC raw units (6 decimals).
 * Side-effects: none (pure domain logic)
 * Notes: Status enums and error codes imported from /types (canonical source).
 * Links: Used by ports and features, implemented by adapters
 * @public
 */

import type {
  PaymentStatus as ClientVisibleStatus,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "@/types/payments";

// Re-export for backward compatibility
export type { PaymentAttemptStatus, PaymentErrorCode, ClientVisibleStatus };

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
