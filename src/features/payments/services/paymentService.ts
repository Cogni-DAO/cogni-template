// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/services/paymentService`
 * Purpose: Orchestrate payment attempt lifecycle via ports. Handles intent creation, txHash submission, status polling, and settlement.
 * Scope: Feature-layer orchestration for payment attempts; validates state transitions, enforces TTLs; does not expose HTTP handling.
 * Invariants: State machine transitions validated via core/rules; atomic settlement via confirmCreditsPayment.
 * Side-effects: IO
 * Notes: OnChainVerifier stubbed (always VERIFIED) in MVP; Phase 3 uses real Ponder indexer.
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import type {
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentErrorCode,
} from "@/core";
import {
  isIntentExpired,
  isValidPaymentAmount,
  isValidTransition,
  isVerificationTimedOut,
  PAYMENT_INTENT_TTL_MS,
  toClientVisibleStatus,
  usdCentsToRawUsdc,
} from "@/core";
import type {
  AccountService,
  Clock,
  OnChainVerifier,
  PaymentAttemptRepository,
} from "@/ports";
import { getPaymentConfig } from "@/shared/config/repoSpec.server";
import type { Logger } from "@/shared/observability";
import { USDC_TOKEN_ADDRESS, VERIFY_THROTTLE_SECONDS } from "@/shared/web3";
import { PaymentNotFoundError } from "../errors";
import { confirmCreditsPayment } from "./creditsConfirm";

// ============================================================================
// Public Types
// ============================================================================

export interface CreateIntentInput {
  billingAccountId: string;
  fromAddress: string; // SIWE wallet address (checksummed via getAddress())
  amountUsdCents: number;
}

export interface CreateIntentResult {
  attemptId: string;
  chainId: number;
  token: string;
  to: string;
  amountRaw: string; // bigint serialized as string for JSON
  amountUsdCents: number;
  expiresAt: Date;
}

export interface SubmitTxHashInput {
  attemptId: string;
  billingAccountId: string;
  defaultVirtualKeyId: string;
  txHash: string;
}

export interface SubmitTxHashResult {
  attemptId: string;
  status: PaymentAttemptStatus;
  txHash: string;
  errorCode?: PaymentErrorCode | undefined;
  errorMessage?: string | undefined;
}

export interface GetStatusInput {
  attemptId: string;
  billingAccountId: string;
  defaultVirtualKeyId: string;
}

export interface GetStatusResult {
  attemptId: string;
  status: PaymentAttemptStatus;
  clientStatus: string; // ClientVisibleStatus from core
  txHash: string | null;
  amountUsdCents: number;
  errorCode?: PaymentErrorCode | undefined;
  createdAt: Date;
}

// ============================================================================
// Create Intent
// ============================================================================

/**
 * Creates payment intent with on-chain transfer parameters
 * Validates amount, resolves widget config, creates attempt in CREATED_INTENT state
 *
 * @param repository - PaymentAttemptRepository port for persistence
 * @param clock - Clock port for deterministic timestamps
 * @param input - Intent parameters (billing account, from address, amount)
 * @returns Intent details with on-chain transfer params (token, to, amountRaw, etc.)
 * @throws Error if amount is invalid
 */
export async function createIntent(
  repository: PaymentAttemptRepository,
  clock: Clock,
  input: CreateIntentInput
): Promise<CreateIntentResult> {
  if (!isValidPaymentAmount(input.amountUsdCents)) {
    throw new Error(
      `Invalid payment amount: ${input.amountUsdCents} cents. Must be between 100 and 1,000,000 cents.`
    );
  }

  const paymentConfig = getPaymentConfig();
  const { chainId, receivingAddress } = paymentConfig;
  const token = USDC_TOKEN_ADDRESS;
  const amountRaw = usdCentsToRawUsdc(input.amountUsdCents);

  const now = new Date(clock.now());
  const expiresAt = new Date(now.getTime() + PAYMENT_INTENT_TTL_MS);

  const attempt = await repository.create({
    billingAccountId: input.billingAccountId,
    fromAddress: input.fromAddress,
    chainId,
    token,
    toAddress: receivingAddress,
    amountRaw,
    amountUsdCents: input.amountUsdCents,
    expiresAt,
  });

  if (!attempt.expiresAt) {
    throw new Error("Internal error: expiresAt is null for CREATED_INTENT");
  }

  return {
    attemptId: attempt.id,
    chainId: attempt.chainId,
    token: attempt.token,
    to: attempt.toAddress,
    amountRaw: attempt.amountRaw.toString(),
    amountUsdCents: attempt.amountUsdCents,
    expiresAt: attempt.expiresAt,
  };
}

// ============================================================================
// Submit TxHash
// ============================================================================

/**
 * Submits transaction hash for verification
 * Binds txHash to attempt, checks expiration, initiates verification
 *
 * @param repository - PaymentAttemptRepository port
 * @param accountService - AccountService port for settlement
 * @param onChainVerifier - OnChainVerifier port for verification
 * @param clock - Clock port for timestamps
 * @param input - Submission parameters (attemptId, billingAccountId, txHash)
 * @returns Current attempt status with error details if failed
 * @throws PaymentAttemptNotFoundPortError if attempt not found or not owned
 * @throws TxHashAlreadyBoundPortError if txHash already bound to different attempt
 */
export async function submitTxHash(
  repository: PaymentAttemptRepository,
  accountService: AccountService,
  onChainVerifier: OnChainVerifier,
  clock: Clock,
  log: Logger,
  input: SubmitTxHashInput
): Promise<SubmitTxHashResult> {
  const now = new Date(clock.now());

  let attempt = await repository.findById(
    input.attemptId,
    input.billingAccountId
  );
  if (!attempt) {
    throw new PaymentNotFoundError(input.attemptId, input.billingAccountId);
  }

  if (attempt.txHash === input.txHash) {
    return {
      attemptId: attempt.id,
      status: attempt.status,
      txHash: attempt.txHash,
      errorCode: attempt.errorCode ?? undefined,
      errorMessage: attempt.errorCode
        ? `Payment ${attempt.status.toLowerCase()}: ${attempt.errorCode}`
        : undefined,
    };
  }

  if (isIntentExpired(attempt, now)) {
    if (isValidTransition(attempt.status, "FAILED")) {
      attempt = await repository.updateStatus(
        attempt.id,
        "FAILED",
        "INTENT_EXPIRED"
      );
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      txHash: attempt.txHash ?? input.txHash,
      errorCode: "INTENT_EXPIRED",
      errorMessage: "Payment intent expired before transaction submission",
    };
  }

  attempt = await repository.bindTxHash(attempt.id, input.txHash, now);

  attempt = await verifyAndSettle(
    attempt,
    repository,
    accountService,
    onChainVerifier,
    clock,
    log,
    input.defaultVirtualKeyId
  );

  if (!attempt.txHash) {
    throw new Error("Internal error: txHash is null after bind operation");
  }

  return {
    attemptId: attempt.id,
    status: attempt.status,
    txHash: attempt.txHash,
    errorCode: attempt.errorCode ?? undefined,
    errorMessage: attempt.errorCode
      ? `Payment ${attempt.status.toLowerCase()}: ${attempt.errorCode}`
      : undefined,
  };
}

// ============================================================================
// Get Status
// ============================================================================

/**
 * Retrieves payment attempt status with throttled verification
 * Checks expiration, verification timeout, throttles verification attempts
 *
 * @param repository - PaymentAttemptRepository port
 * @param accountService - AccountService port for settlement
 * @param onChainVerifier - OnChainVerifier port for verification
 * @param clock - Clock port for timestamps
 * @param input - Query parameters (attemptId, billingAccountId)
 * @returns Current status with client-visible status mapping
 * @throws PaymentAttemptNotFoundPortError if attempt not found or not owned
 */
export async function getStatus(
  repository: PaymentAttemptRepository,
  accountService: AccountService,
  onChainVerifier: OnChainVerifier,
  clock: Clock,
  log: Logger,
  input: GetStatusInput
): Promise<GetStatusResult> {
  const now = new Date(clock.now());

  let attempt = await repository.findById(
    input.attemptId,
    input.billingAccountId
  );
  if (!attempt) {
    throw new PaymentNotFoundError(input.attemptId, input.billingAccountId);
  }

  if (attempt.status === "CREATED_INTENT" && isIntentExpired(attempt, now)) {
    if (isValidTransition(attempt.status, "FAILED")) {
      attempt = await repository.updateStatus(
        attempt.id,
        "FAILED",
        "INTENT_EXPIRED"
      );
    }
  }

  if (
    attempt.status === "PENDING_UNVERIFIED" &&
    isVerificationTimedOut(attempt, now)
  ) {
    if (isValidTransition(attempt.status, "FAILED")) {
      attempt = await repository.updateStatus(
        attempt.id,
        "FAILED",
        "RECEIPT_NOT_FOUND"
      );
    }
  }

  if (attempt.status === "PENDING_UNVERIFIED") {
    const shouldVerify =
      !attempt.lastVerifyAttemptAt ||
      now.getTime() - attempt.lastVerifyAttemptAt.getTime() >=
        VERIFY_THROTTLE_SECONDS * 1000;

    if (shouldVerify) {
      attempt = await repository.recordVerificationAttempt(attempt.id, now);

      attempt = await verifyAndSettle(
        attempt,
        repository,
        accountService,
        onChainVerifier,
        clock,
        log,
        input.defaultVirtualKeyId
      );
    }
  }

  return {
    attemptId: attempt.id,
    status: attempt.status,
    clientStatus: toClientVisibleStatus(attempt.status),
    txHash: attempt.txHash,
    amountUsdCents: attempt.amountUsdCents,
    errorCode: attempt.errorCode ?? undefined,
    createdAt: attempt.createdAt,
  };
}

// ============================================================================
// Verify and Settle (Private)
// ============================================================================

/**
 * Verifies on-chain transaction and settles payment if valid
 * Calls OnChainVerifier port, validates sender (Phase 3), settles via confirmCreditsPayment
 *
 * @param attempt - Current payment attempt
 * @param repository - PaymentAttemptRepository port
 * @param accountService - AccountService port for settlement
 * @param onChainVerifier - OnChainVerifier port for verification
 * @param clock - Clock port for timestamps
 * @returns Updated payment attempt after verification/settlement
 */
async function verifyAndSettle(
  attempt: PaymentAttempt,
  repository: PaymentAttemptRepository,
  accountService: AccountService,
  onChainVerifier: OnChainVerifier,
  _clock: Clock,
  log: Logger,
  defaultVirtualKeyId: string
): Promise<PaymentAttempt> {
  if (!attempt.txHash) {
    return attempt;
  }

  // Call OnChainVerifier port
  const verificationResult = await onChainVerifier.verify({
    chainId: attempt.chainId,
    txHash: attempt.txHash,
    expectedTo: attempt.toAddress,
    expectedToken: attempt.token,
    expectedAmount: attempt.amountRaw,
  });

  if (verificationResult.status === "PENDING") {
    return attempt;
  }

  if (verificationResult.status === "FAILED") {
    const errorCode = verificationResult.errorCode ?? "TX_REVERTED";
    const targetStatus: PaymentAttemptStatus =
      errorCode === "TX_REVERTED" ? "FAILED" : "REJECTED";

    if (isValidTransition(attempt.status, targetStatus)) {
      attempt = await repository.updateStatus(
        attempt.id,
        targetStatus,
        errorCode
      );
    }

    return attempt;
  }

  if (verificationResult.status === "VERIFIED") {
    if (
      verificationResult.actualFrom &&
      verificationResult.actualFrom.toLowerCase() !==
        attempt.fromAddress.toLowerCase()
    ) {
      if (isValidTransition(attempt.status, "REJECTED")) {
        attempt = await repository.updateStatus(
          attempt.id,
          "REJECTED",
          "SENDER_MISMATCH"
        );
      }

      return attempt;
    }

    const clientPaymentId = `${attempt.chainId}:${attempt.txHash}`;

    try {
      await confirmCreditsPayment(accountService, {
        billingAccountId: attempt.billingAccountId,
        defaultVirtualKeyId,
        amountUsdCents: attempt.amountUsdCents,
        clientPaymentId,
        metadata: {
          paymentAttemptId: attempt.id,
          txHash: attempt.txHash,
          chainId: attempt.chainId,
          fromAddress: attempt.fromAddress,
        },
      });

      if (isValidTransition(attempt.status, "CREDITED")) {
        attempt = await repository.updateStatus(attempt.id, "CREDITED");
      }
    } catch (error) {
      log.error(
        {
          attemptId: attempt.id,
          error: error instanceof Error ? error.message : error,
        },
        "Settlement failed for payment attempt"
      );
    }

    return attempt;
  }

  return attempt;
}
