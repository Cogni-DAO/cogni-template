// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/payments/PaymentFlowDialog`
 * Purpose: Modal dialog for payment flow states (IN_FLIGHT/TERMINAL).
 * Scope: Presentational dialog component. Does not contain payment logic or state management.
 * Invariants: Blocks page during payment; dismissable pre-chain or in TERMINAL; shows user-friendly errors only.
 * Side-effects: none
 * Notes: Uses Dialog on desktop, Drawer on mobile for better ergonomics.
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md, ~/.claude/plans/floating-stirring-trinket.md
 * @public
 */

import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import type { ReactElement } from "react";

import { Alert, AlertDescription } from "@/components/kit/feedback/Alert";
import { Button } from "@/components/kit/inputs/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/vendor/shadcn/dialog";
import type { PaymentFlowPhase, PaymentFlowState } from "@/types/payments";

export interface PaymentFlowDialogProps {
  /** Dialog open state */
  open: boolean;

  /** Current payment phase */
  phase: PaymentFlowPhase;

  /** True only during pending phases (from state.isInFlight) */
  isInFlight: boolean;

  /** Current wallet step (for IN_FLIGHT states) */
  walletStep: PaymentFlowState["walletStep"];

  /** Transaction hash (when available) */
  txHash: string | null;

  /** Block explorer URL (when txHash available) */
  explorerUrl: string | null;

  /** Result state (SUCCESS/ERROR) */
  result: "SUCCESS" | "ERROR" | null;

  /** User-friendly error message */
  errorMessage: string | null;

  /** Credits added (on success) */
  creditsAdded: number | null;

  /** Reset payment state */
  onReset: () => void;

  /** Close dialog */
  onClose: () => void;
}

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

function getStepMessage(walletStep: PaymentFlowState["walletStep"]): string {
  if (walletStep === null) {
    return "Preparing payment...";
  }

  switch (walletStep) {
    case "SIGNING":
      return "Confirm in your wallet...";
    case "CONFIRMING":
      return "Confirming on-chain...";
    case "SUBMITTING":
      return "Submitting to backend...";
    case "VERIFYING":
      return "Verifying payment...";
    default:
      assertNever(walletStep);
  }
}

function formatCredits(amount: number): string {
  return amount.toLocaleString("en-US");
}

export function PaymentFlowDialog({
  open,
  phase,
  isInFlight,
  walletStep,
  txHash,
  explorerUrl,
  result,
  errorMessage,
  creditsAdded,
  onReset,
  onClose,
}: PaymentFlowDialogProps): ReactElement {
  const isTerminal = phase === "DONE";

  // Only show "Cancel" during intent creation (before wallet prompt)
  const canCancel = isInFlight && walletStep === null;

  // Show "Close" for: terminal states, wallet prompt shown, or on-chain
  const canClose = isTerminal || (isInFlight && walletStep !== null);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        console.log("[PaymentFlowDialog] onOpenChange called:", {
          isOpen,
          phase,
          isTerminal,
          canClose,
          canCancel,
        });

        // In TERMINAL: NEVER auto-close via Dialog, only via button clicks
        if (isTerminal) {
          console.log("[PaymentFlowDialog] Ignoring close (terminal state)");
          return; // Ignore all Dialog-initiated close attempts
        }

        // In other states: allow close if canClose or canCancel
        if (!isOpen && (canClose || canCancel)) {
          console.log("[PaymentFlowDialog] Allowing close");
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        // Disable escape/backdrop click except when explicitly allowed
        onEscapeKeyDown={(e) => {
          if (isTerminal || (!canClose && !canCancel)) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          if (isTerminal || (!canClose && !canCancel)) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isTerminal ? "Payment" : "Processing Payment"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* IN_FLIGHT state */}
          {isInFlight && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              {/* eslint-disable-next-line ui-governance/token-classname-patterns -- text-center is alignment, not color */}
              <p className="text-center text-muted-foreground text-sm">
                {getStepMessage(walletStep)}
              </p>

              {/* Transaction link (when available) */}
              {txHash && explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary text-sm hover:underline"
                >
                  <span>View transaction</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {/* SUCCESS state */}
          {isTerminal && result === "SUCCESS" && (
            <>
              <div className="flex flex-col items-center gap-6 py-8">
                <CheckCircle2 className="h-16 w-16 text-success" />
                <p className="font-semibold text-foreground text-xl">
                  {creditsAdded != null
                    ? `${formatCredits(creditsAdded)} credits added`
                    : "Payment successful"}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    onReset();
                    onClose();
                  }}
                  size="lg"
                >
                  Done
                </Button>

                {/* Transaction link */}
                {txHash && explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-primary text-sm hover:underline"
                  >
                    <span>View transaction</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </>
          )}

          {/* ERROR state */}
          {isTerminal && result === "ERROR" && (
            <>
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {errorMessage ?? "Payment failed"}
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    onReset();
                    onClose();
                  }}
                  size="lg"
                >
                  Try Again
                </Button>

                {/* Transaction link (if payment reached on-chain) */}
                {txHash && explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-primary text-sm hover:underline"
                  >
                    <span>View transaction</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
