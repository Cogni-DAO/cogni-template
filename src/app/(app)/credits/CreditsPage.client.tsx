// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/credits/CreditsPage.client`
 * Purpose: Client-side credits page UI handling balance display and USDC payment flow.
 * Scope: Fetches credits data via React Query, renders native USDC payment flow, and refreshes balance on success. Does not handle backend payment verification or wallet connection.
 * Invariants: Payment amounts stored as integer cents (no float math).
 * Side-effects: IO (fetch API via React Query).
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  Card,
  HintText,
  PageContainer,
  SectionCard,
  SplitInput,
  UsdcPaymentFlow,
} from "@/components";
import {
  CREDITS_PER_CENT,
  useCreditsSummary,
  usePaymentFlow,
} from "@/features/payments/public";

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
    <PageContainer maxWidth="2xl">
      {/* Balance Card */}
      <Card className="flex items-center justify-between p-6">
        <span className="font-bold text-4xl">$ {balanceDisplay}</span>
      </Card>

      {/* Buy Credits Section */}
      <SectionCard title="Buy Credits">
        <SplitInput
          label="Amount"
          value={amountInput}
          onChange={(val) => setAmountInput(val.replace(/[^0-9]/g, ""))}
          placeholder="1 - 100000"
        />

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

        <HintText icon={<Info size={16} />}>
          Transactions may take many minutes to confirm
        </HintText>
      </SectionCard>
    </PageContainer>
  );
}
