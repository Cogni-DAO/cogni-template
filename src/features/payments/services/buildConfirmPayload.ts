// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/utils/buildConfirmPayload`
 * Purpose: Constructs payment confirmation payload from DePay widget transaction info.
 * Scope: Pure utility for converting widget success data to confirm endpoint request. Does not perform network calls or state mutations.
 * Invariants: USD to cents conversion uses Math.round; txHash becomes clientPaymentId; fallback to UUID if hash missing
 * Side-effects: none (pure function)
 * Notes: Used by Credits page after DePay widget success callback
 * Links: docs/DEPAY_PAYMENTS.md, src/contracts/payments.credits.confirm.v1.contract.ts
 * @public
 */

export interface DePayTransactionInfo {
  txHash: string;
  blockchain: string;
  token: string;
}

export interface ConfirmPayload {
  amountUsdCents: number;
  clientPaymentId: string;
  metadata?: {
    provider: string;
    txHash: string;
    blockchain: string;
    token: string;
    timestamp: string;
  };
}

/**
 * Build payment confirmation payload from DePay widget transaction info.
 *
 * Converts transaction info to confirm endpoint format with USD to cents conversion
 * and idempotent clientPaymentId.
 *
 * @param txInfo - Transaction information from DePay widget success callback
 * @param amountUsd - Payment amount in USD (e.g., 25.00 for $25)
 * @returns Payload ready for POST to /api/v1/payments/credits/confirm
 *
 * @example
 * ```typescript
 * const payload = buildConfirmPayload(
 *   \{ txHash: '0xabc...', blockchain: 'ethereum', token: 'USDC' \},
 *   25.00
 * );
 * // payload.amountUsdCents === 2500
 * // payload.clientPaymentId === '0xabc...'
 * ```
 */
export function buildConfirmPayload(
  txInfo: DePayTransactionInfo,
  amountUsd: number,
  provider = "depay"
): ConfirmPayload {
  // Use transaction hash as idempotency key (prevents double-crediting same tx)
  // Fallback to random UUID if hash is invalid/missing (should not happen in production)
  const clientPaymentId =
    txInfo.txHash && txInfo.txHash !== "unknown"
      ? txInfo.txHash
      : crypto.randomUUID();

  // Convert USD to cents with rounding to handle floating point precision
  const amountUsdCents = Math.round(amountUsd * 100);

  return {
    amountUsdCents,
    clientPaymentId,
    metadata: {
      provider,
      txHash: txInfo.txHash,
      blockchain: txInfo.blockchain,
      token: txInfo.token,
      timestamp: new Date().toISOString(),
    },
  };
}
