// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/payments/UsdcPaymentFlow`
 * Purpose: Composed payment flow UI with button, dialog, and status chip.
 * Scope: Renders PaymentButton + PaymentFlowDialog + PaymentStatusChip. Does not contain business logic or API calls.
 * Invariants: State prop drives all rendering; callbacks are pure event handlers; className for layout only.
 * Side-effects: none
 * Notes: Refactored to use new component architecture per ~/.claude/plans/floating-stirring-trinket.md
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md, docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

"use client";

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/shared/util";
import type { PaymentFlowState } from "@/types/payments";
import { PaymentButton } from "./PaymentButton";
import { PaymentFlowDialog } from "./PaymentFlowDialog";
import { PaymentStatusChip } from "./PaymentStatusChip";

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

export function UsdcPaymentFlow({
  amountUsdCents,
  state,
  onStartPayment,
  onReset,
  disabled = false,
  className,
}: UsdcPaymentFlowProps): ReactElement {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Debug: Log component mount
  useEffect(() => {
    console.log("[UsdcPaymentFlow] MOUNTED");
  }, []);

  // Auto-open dialog when payment is in-flight or has result
  useEffect(() => {
    console.log("[UsdcPaymentFlow] State changed:", {
      phase: state.phase,
      isInFlight: state.isInFlight,
      result: state.result,
      isDialogOpen,
    });

    if (state.isInFlight || state.result !== null) {
      console.log("[UsdcPaymentFlow] Setting dialog open = true");
      setIsDialogOpen(true);
    }
  }, [state.phase, state.isInFlight, state.result, isDialogOpen]);

  // Show status chip when dialog is closed but payment is in progress
  const showStatusChip =
    !isDialogOpen &&
    state.isInFlight &&
    state.txHash !== null &&
    state.explorerUrl !== null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Payment Button */}
      <PaymentButton
        amountUsdCents={amountUsdCents}
        isInFlight={state.isInFlight}
        onClick={() => {
          onStartPayment();
          setIsDialogOpen(true);
        }}
        disabled={disabled}
      />

      {/* Status Chip (when dialog closed but payment in progress) */}
      {showStatusChip && state.txHash && state.explorerUrl && (
        <PaymentStatusChip
          txHash={state.txHash}
          explorerUrl={state.explorerUrl}
          onClick={() => setIsDialogOpen(true)}
        />
      )}

      {/* Payment Flow Dialog */}
      <PaymentFlowDialog
        open={isDialogOpen}
        phase={state.phase}
        isInFlight={state.isInFlight}
        walletStep={state.walletStep}
        txHash={state.txHash}
        explorerUrl={state.explorerUrl}
        result={state.result}
        errorMessage={state.errorMessage}
        creditsAdded={state.creditsAdded}
        onReset={onReset}
        onClose={() => setIsDialogOpen(false)}
      />
    </div>
  );
}
