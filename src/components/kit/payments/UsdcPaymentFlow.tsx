// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/payments/UsdcPaymentFlow`
 * Purpose: Presentational component for USDC payment flow with 3-state rendering (READY/PENDING/DONE).
 * Scope: Renders payment button, wallet/chain status, and success/error feedback. Does not contain business logic or API calls.
 * Invariants: State prop drives all rendering; callbacks are pure event handlers; className for layout only.
 * Side-effects: none
 * Notes: Consumes PaymentFlowState from usePaymentFlow hook; implements full PENDING substates for Phase 3 stability.
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md, docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ReactElement } from "react";
import { Alert, AlertDescription } from "@/components/kit/feedback/Alert";
import { Button } from "@/components/kit/inputs/Button";
import { cn } from "@/shared/util";
import {
  paragraph,
  paymentFlowContainer,
  paymentFlowStatus,
  paymentFlowStep,
} from "@/styles/ui";
import type { PaymentFlowState } from "@/types/payments";

export interface UsdcPaymentFlowProps {
  /** Amount in USD cents */
  amountUsdCents: number;

  /** Current flow state from usePaymentFlow */
  state: PaymentFlowState;

  /** Trigger payment initiation */
  onStartPayment: () => void;

  /** Reset to initial state */
  onReset: () => void;

  /** Disable all interactions */
  disabled?: boolean;

  /** Layout className (flex/margin only) */
  className?: string;
}

function getStepMessage(
  walletStep: PaymentFlowState["walletStep"]
): string | null {
  switch (walletStep) {
    case "SIGNING":
      return "Waiting for wallet signature...";
    case "CONFIRMING":
      return "Confirming transaction on-chain...";
    case "SUBMITTING":
      return "Submitting to backend...";
    case "VERIFYING":
      return "Verifying payment...";
    default:
      return null;
  }
}

function formatCredits(amount: number): string {
  return amount.toLocaleString("en-US");
}

function getExplorerUrl(txHash: string, chainId = 11155111): string {
  // Ethereum Sepolia for MVP, will read from intent response in hook
  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
  // Base mainnet for Phase 3
  if (chainId === 8453) {
    return `https://basescan.org/tx/${txHash}`;
  }
  return `https://etherscan.io/tx/${txHash}`;
}

export function UsdcPaymentFlow({
  amountUsdCents,
  state,
  onStartPayment,
  onReset,
  disabled = false,
  className,
}: UsdcPaymentFlowProps): ReactElement {
  // READY state
  if (state.phase === "READY") {
    return (
      <div className={cn(paymentFlowContainer(), className)}>
        <Button
          onClick={onStartPayment}
          disabled={disabled || state.isCreatingIntent}
          rightIcon={
            state.isCreatingIntent ? (
              <Loader2 className="animate-spin" />
            ) : undefined
          }
        >
          {state.isCreatingIntent
            ? "Preparing..."
            : `Pay $${(amountUsdCents / 100).toFixed(2)}`}
        </Button>
      </div>
    );
  }

  // PENDING state
  if (state.phase === "PENDING") {
    const stepMessage = getStepMessage(state.walletStep);

    return (
      <div className={cn(paymentFlowContainer(), className)}>
        <div className={paymentFlowStatus()}>
          <div className="mb-[var(--spacing-sm)] flex justify-center gap-[var(--spacing-md)]">
            <div
              className={paymentFlowStep({
                state:
                  state.walletStep === "SIGNING" ||
                  state.walletStep === "CONFIRMING"
                    ? "active"
                    : state.walletStep === "SUBMITTING" ||
                        state.walletStep === "VERIFYING"
                      ? "complete"
                      : "pending",
              })}
            >
              <span>Wallet</span>
            </div>
            <div
              className={paymentFlowStep({
                state:
                  state.walletStep === "CONFIRMING"
                    ? "active"
                    : state.walletStep === "SUBMITTING" ||
                        state.walletStep === "VERIFYING"
                      ? "complete"
                      : "pending",
              })}
            >
              <span>Chain</span>
            </div>
            <div
              className={paymentFlowStep({
                state:
                  state.walletStep === "SUBMITTING" ||
                  state.walletStep === "VERIFYING"
                    ? "active"
                    : "pending",
              })}
            >
              <span>Verify</span>
            </div>
          </div>

          {stepMessage && (
            <p className={paragraph({ size: "sm", tone: "subdued" })}>
              {stepMessage}
            </p>
          )}

          {state.txHash && (
            <a
              href={getExplorerUrl(state.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-[var(--spacing-sm)] inline-block text-[var(--text-sm)] text-primary hover:underline"
            >
              View transaction →
            </a>
          )}
        </div>
      </div>
    );
  }

  // DONE state
  if (state.phase === "DONE") {
    return (
      <div className={cn(paymentFlowContainer(), className)}>
        {state.result === "SUCCESS" ? (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {state.creditsAdded != null
                ? `Added ${formatCredits(state.creditsAdded)} credits`
                : "Payment successful"}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {state.errorMessage ?? "Payment failed"}
            </AlertDescription>
          </Alert>
        )}

        <Button variant="outline" onClick={onReset} disabled={disabled}>
          {state.result === "SUCCESS" ? "Make Another Payment" : "Try Again"}
        </Button>
      </div>
    );
  }

  // Should never reach
  return <div className={cn(paymentFlowContainer(), className)} />;
}
