// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/credits/CreditsPage.client`
 * Purpose: Client-side credits page UI handling balance display and USDC payment flow.
 * Scope: Fetches credits data via React Query, renders native USDC payment flow, and refreshes balance on success.
 * Invariants: Payment amounts stored as integer cents (no float math).
 * Side-effects: IO (fetch API via React Query).
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  Input,
  UsdcPaymentFlow,
} from "@/components";
import {
  CREDITS_PER_CENT,
  useCreditsSummary,
  usePaymentFlow,
} from "@/features/payments/public";
import { heading, paragraph } from "@/styles/ui";

const MIN_AMOUNT_USD = 1;
const MAX_AMOUNT_USD = 100000;

function formatDollars(credits: number): string {
  const dollars = credits / (CREDITS_PER_CENT * 100);
  return dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CreditsPageClient(): ReactElement {
  const [amountInput, setAmountInput] = useState<string>("");
  const queryClient = useQueryClient();

  const summaryQuery = useCreditsSummary({ limit: 1 });

  const amountDollars = Number.parseFloat(amountInput) || 0;
  const amountCents = Math.round(amountDollars * 100);
  const isValidAmount =
    amountDollars >= MIN_AMOUNT_USD && amountDollars <= MAX_AMOUNT_USD;

  const paymentFlow = usePaymentFlow({
    amountUsdCents: amountCents,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["payments-summary", { limit: 1 }],
      });
      setAmountInput("");
    },
  });

  const balanceDisplay = summaryQuery.isLoading
    ? "—"
    : formatDollars(summaryQuery.data?.balanceCredits ?? 0);

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
      {/* Balance Card */}
      <Card>
        <CardContent className="py-6">
          <p className={heading({ level: "h1" })}>$ {balanceDisplay}</p>
        </CardContent>
      </Card>

      {/* Buy Credits Card */}
      <Card>
        <CardHeader>
          <p className={heading({ level: "h3" })}>Buy Credits</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <label
              htmlFor="amount-input"
              className={paragraph({ size: "sm", tone: "subdued" })}
            >
              Amount
            </label>
            <Input
              id="amount-input"
              type="number"
              min={MIN_AMOUNT_USD}
              max={MAX_AMOUNT_USD}
              step="1"
              placeholder={`${MIN_AMOUNT_USD} - ${MAX_AMOUNT_USD}`}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </div>

          {/* Payment Flow */}
          {isValidAmount ? (
            <UsdcPaymentFlow
              amountUsdCents={amountCents}
              state={paymentFlow.state}
              onStartPayment={paymentFlow.startPayment}
              onReset={paymentFlow.reset}
              disabled={summaryQuery.isLoading}
            />
          ) : (
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-md bg-muted px-4 py-2 text-muted-foreground"
            >
              Invalid amount
            </button>
          )}

          {/* Helper text */}
          <p className={paragraph({ size: "sm", tone: "subdued" })}>
            Transactions may take many minutes to confirm.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
