// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/_facades/payments/attempts.server`
 * Purpose: App-layer wiring for payment attempts. Resolves dependencies, delegates to feature services, and maps port types to contract DTOs.
 * Scope: Server-only facade. Handles billing account resolution from session user, maps Date to ISO string for contract compliance; does not perform direct persistence or HTTP handling.
 * Invariants: Billing account from session identity only; return types use z.infer; Date fields map to ISO strings.
 * Side-effects: IO (via PaymentAttemptRepository, AccountService, OnChainVerifier ports).
 * Notes: Errors bubble to route handlers for HTTP mapping. Facades own DTO mapping (port types → contract types).
 * Links: docs/PAYMENTS_DESIGN.md, src/contracts/AGENTS.md
 * @public
 */

import { getAddress } from "viem";

import { getContainer } from "@/bootstrap/container";
import type { PaymentIntentOutput } from "@/contracts/payments.intent.v1.contract";
import type { PaymentStatusOutput } from "@/contracts/payments.status.v1.contract";
import type { PaymentSubmitOutput } from "@/contracts/payments.submit.v1.contract";
import { AuthUserNotFoundError } from "@/features/payments/errors";
import {
  createIntent,
  getStatus,
  submitTxHash,
} from "@/features/payments/services/paymentService";
import { getOrCreateBillingAccountForUser } from "@/lib/auth/mapping";
import type { SessionUser } from "@/shared/auth";
import type { RequestContext } from "@/shared/observability";
import type {
  PaymentsIntentCreatedEvent,
  PaymentsStateTransitionEvent,
  PaymentsStatusReadEvent,
} from "@/shared/observability/logging/events";

/**
 * Creates payment intent facade
 * Resolves billing account from session, delegates to feature service
 *
 * @param params - Session user and payment amount
 * @param ctx - Request context for logging
 * @returns Payment intent with on-chain transfer parameters
 * @throws Error if user not provisioned or amount invalid
 */
export async function createPaymentIntentFacade(
  params: {
    sessionUser: SessionUser;
    amountUsdCents: number;
  },
  ctx: RequestContext
): Promise<PaymentIntentOutput> {
  const start = performance.now();
  const { accountService, paymentAttemptRepository, clock } = getContainer();

  let billingAccount: Awaited<
    ReturnType<typeof getOrCreateBillingAccountForUser>
  >;
  try {
    billingAccount = await getOrCreateBillingAccountForUser(accountService, {
      userId: params.sessionUser.id,
      walletAddress: params.sessionUser.walletAddress,
    });
  } catch (error) {
    // Check for FK constraint violation (user not found in DB)
    // Drizzle wraps Postgres errors - constraint name is in cause.message
    if (
      error &&
      typeof error === "object" &&
      "cause" in error &&
      error.cause instanceof Error &&
      error.cause.message.includes("billing_accounts_owner_user_id_users_id_fk")
    ) {
      throw new AuthUserNotFoundError(params.sessionUser.id);
    }
    throw error;
  }

  // Enrich context with business identifiers
  const enrichedCtx: RequestContext = {
    ...ctx,
    log: ctx.log.child({
      userId: params.sessionUser.id,
      billingAccountId: billingAccount.id,
    }),
  };

  const fromAddress = getAddress(params.sessionUser.walletAddress);

  const result = await createIntent(paymentAttemptRepository, clock, {
    billingAccountId: billingAccount.id,
    fromAddress,
    amountUsdCents: params.amountUsdCents,
  });

  // Log domain event
  const event: PaymentsIntentCreatedEvent = {
    event: "payments.intent_created",
    routeId: ctx.routeId,
    reqId: ctx.reqId,
    billingAccountId: billingAccount.id,
    paymentIntentId: result.attemptId,
    chainId: result.chainId,
    durationMs: performance.now() - start,
  };
  enrichedCtx.log.info(event, "payment intent created");

  return {
    attemptId: result.attemptId,
    chainId: result.chainId,
    token: result.token,
    to: result.to,
    amountRaw: result.amountRaw,
    amountUsdCents: result.amountUsdCents,
    expiresAt: result.expiresAt.toISOString(),
  };
}

/**
 * Submits payment transaction hash facade
 * Resolves billing account from session, delegates to feature service
 *
 * @param params - Session user, attempt ID, and transaction hash
 * @param ctx - Request context for logging
 * @returns Payment status after submission and verification attempt
 * @throws Error if attempt not found or not owned
 */
export async function submitPaymentTxHashFacade(
  params: {
    sessionUser: SessionUser;
    attemptId: string;
    txHash: string;
  },
  ctx: RequestContext
): Promise<PaymentSubmitOutput> {
  const start = performance.now();
  const { accountService, paymentAttemptRepository, onChainVerifier, clock } =
    getContainer();

  let billingAccount: Awaited<
    ReturnType<typeof getOrCreateBillingAccountForUser>
  >;
  try {
    billingAccount = await getOrCreateBillingAccountForUser(accountService, {
      userId: params.sessionUser.id,
      walletAddress: params.sessionUser.walletAddress,
    });
  } catch (error) {
    // Check for FK constraint violation (user not found in DB)
    // Drizzle wraps Postgres errors - constraint name is in cause.message
    if (
      error &&
      typeof error === "object" &&
      "cause" in error &&
      error.cause instanceof Error &&
      error.cause.message.includes("billing_accounts_owner_user_id_users_id_fk")
    ) {
      throw new AuthUserNotFoundError(params.sessionUser.id);
    }
    throw error;
  }

  // Enrich context with business identifiers
  const enrichedCtx: RequestContext = {
    ...ctx,
    log: ctx.log.child({
      userId: params.sessionUser.id,
      billingAccountId: billingAccount.id,
    }),
  };

  const result = await submitTxHash(
    paymentAttemptRepository,
    accountService,
    onChainVerifier,
    clock,
    {
      attemptId: params.attemptId,
      billingAccountId: billingAccount.id,
      defaultVirtualKeyId: billingAccount.defaultVirtualKeyId,
      txHash: params.txHash,
    }
  );

  // Log domain event (state transition)
  const event: PaymentsStateTransitionEvent = {
    event: "payments.state_transition",
    routeId: ctx.routeId,
    reqId: ctx.reqId,
    billingAccountId: billingAccount.id,
    paymentIntentId: result.attemptId,
    toStatus: result.status,
    chainId: 0, // TODO: retrieve chainId from payment attempt
    txHash: result.txHash,
    durationMs: performance.now() - start,
  };
  enrichedCtx.log.info(event, "payment state transition");

  return {
    attemptId: result.attemptId,
    status: result.status,
    txHash: result.txHash,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  };
}

/**
 * Gets payment status facade
 * Resolves billing account from session, delegates to feature service
 *
 * @param params - Session user and attempt ID
 * @param ctx - Request context for logging
 * @returns Payment status with client-visible status mapping
 * @throws Error if attempt not found or not owned
 */
export async function getPaymentStatusFacade(
  params: {
    sessionUser: SessionUser;
    attemptId: string;
  },
  ctx: RequestContext
): Promise<PaymentStatusOutput> {
  const start = performance.now();
  const { accountService, paymentAttemptRepository, onChainVerifier, clock } =
    getContainer();

  let billingAccount: Awaited<
    ReturnType<typeof getOrCreateBillingAccountForUser>
  >;
  try {
    billingAccount = await getOrCreateBillingAccountForUser(accountService, {
      userId: params.sessionUser.id,
      walletAddress: params.sessionUser.walletAddress,
    });
  } catch (error) {
    // Check for FK constraint violation (user not found in DB)
    // Drizzle wraps Postgres errors - constraint name is in cause.message
    if (
      error &&
      typeof error === "object" &&
      "cause" in error &&
      error.cause instanceof Error &&
      error.cause.message.includes("billing_accounts_owner_user_id_users_id_fk")
    ) {
      throw new AuthUserNotFoundError(params.sessionUser.id);
    }
    throw error;
  }

  // Enrich context with business identifiers
  const enrichedCtx: RequestContext = {
    ...ctx,
    log: ctx.log.child({
      userId: params.sessionUser.id,
      billingAccountId: billingAccount.id,
    }),
  };

  const result = await getStatus(
    paymentAttemptRepository,
    accountService,
    onChainVerifier,
    clock,
    {
      attemptId: params.attemptId,
      billingAccountId: billingAccount.id,
      defaultVirtualKeyId: billingAccount.defaultVirtualKeyId,
    }
  );

  // Log domain event (read operation)
  const event: PaymentsStatusReadEvent = {
    event: "payments.status_read",
    routeId: ctx.routeId,
    reqId: ctx.reqId,
    billingAccountId: billingAccount.id,
    paymentIntentId: result.attemptId,
    status: result.clientStatus,
    durationMs: performance.now() - start,
  };
  enrichedCtx.log.info(event, "payment status read");

  // Map port types (Date) to contract types (ISO string)
  return {
    attemptId: result.attemptId,
    status: result.clientStatus as
      | "PENDING_VERIFICATION"
      | "CONFIRMED"
      | "FAILED",
    txHash: result.txHash,
    amountUsdCents: result.amountUsdCents,
    errorCode: result.errorCode,
    createdAt: result.createdAt.toISOString(),
  };
}
