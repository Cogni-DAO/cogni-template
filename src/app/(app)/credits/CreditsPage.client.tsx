// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/credits/CreditsPage.client`
 * Purpose: Client-side credits page UI handling balance display, ledger history, and USDC payment flow.
 * Scope: Fetches credits data via React Query, renders native USDC payment flow, and refreshes balance on success. Does not manage server-side config or repo-spec access.
 * Invariants: Payment amounts stored as integer cents (no float math); UI display uses CREDITS_PER_CENT constant from payments feature.
 * Side-effects: IO (fetch API via React Query).
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  UsdcPaymentFlow,
} from "@/components";
import {
  CREDITS_PER_CENT,
  useCreditsSummary,
  usePaymentFlow,
} from "@/features/payments/public";
import { container, heading, paragraph, section } from "@/styles/ui";

// Payment amounts in USD cents (100 = $1.00, 1000 = $10.00, etc.)
const PAYMENT_AMOUNTS = [100, 1000, 2500, 5000, 10000] as const;
const DEFAULT_LEDGER_LIMIT = 10;

function formatCredits(amount: number): string {
  return amount.toLocaleString("en-US");
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export function CreditsPageClient(): ReactElement {
  const [selectedAmount, setSelectedAmount] = useState<number>(
    PAYMENT_AMOUNTS[1]
  );
  const queryClient = useQueryClient();

  const summaryQuery = useCreditsSummary({ limit: DEFAULT_LEDGER_LIMIT });

  const paymentFlow = usePaymentFlow({
    amountUsdCents: selectedAmount, // Already in cents, pass as-is
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["payments-summary", { limit: DEFAULT_LEDGER_LIMIT }],
      });
    },
  });

  const ledgerEntries = summaryQuery.data?.ledger ?? [];

  return (
    <div className={section()}>
      <div className={container({ size: "lg", spacing: "xl" })}>
        {/* Mobile-first vertical stack, side-by-side on lg+ */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
          {/* Balance & History Card */}
          <Card className="shadow-lg">
            <CardHeader>
              <div className="space-y-2">
                <h2 className={heading({ level: "h2" })}>Credits</h2>
                <p
                  className={paragraph({
                    size: "md",
                    tone: "subdued",
                    spacing: "xs",
                  })}
                >
                  Pay with USDC on Ethereum Sepolia. No auto top-up.
                </p>
              </div>
              {/* Stats Grid */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p
                    className={paragraph({
                      size: "sm",
                      tone: "subdued",
                      spacing: "none",
                    })}
                  >
                    Balance
                  </p>
                  <h3 className={heading({ level: "h3" })}>
                    {summaryQuery.isLoading
                      ? "Loading..."
                      : `${formatCredits(summaryQuery.data?.balanceCredits ?? 0)} credits`}
                  </h3>
                </div>
                <div className="space-y-2">
                  <p
                    className={paragraph({
                      size: "sm",
                      tone: "subdued",
                      spacing: "none",
                    })}
                  >
                    Conversion
                  </p>
                  <h3 className={heading({ level: "h3" })}>1¢ = 10 credits</h3>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summaryQuery.isLoading ? (
                <p className={paragraph({})}>Loading recent activity...</p>
              ) : summaryQuery.isError ? (
                <p className={paragraph({ tone: "default" })}>
                  Unable to load ledger entries. Please refresh or try again.
                </p>
              ) : ledgerEntries.length === 0 ? (
                <p className={paragraph({ tone: "default" })}>
                  No ledger entries yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="space-y-2 border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            intent={
                              entry.reason === "widget_payment"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {entry.reason}
                          </Badge>
                          <span
                            className={paragraph({
                              size: "sm",
                              tone: "default",
                              spacing: "none",
                            })}
                          >
                            {entry.reference ?? "No reference"}
                          </span>
                        </div>
                        <h4 className={heading({ level: "h4" })}>
                          {entry.amount >= 0 ? "+" : ""}
                          {formatCredits(entry.amount)}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <span>
                          Balance after: {formatCredits(entry.balanceAfter)}
                        </span>
                        <span>•</span>
                        <span>{formatTimestamp(entry.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Purchase Card */}
          <Card>
            <CardHeader>
              <h3 className={heading({ level: "h3" })}>Buy Credits</h3>
              <p
                className={paragraph({
                  size: "sm",
                  tone: "subdued",
                  spacing: "xs",
                })}
              >
                Choose an amount, complete the crypto payment, and we will
                credit your balance once the transaction confirms.
              </p>
            </CardHeader>
            <CardContent>
              {/* Amount selector grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PAYMENT_AMOUNTS.map((amountCents) => (
                  <Button
                    key={amountCents}
                    variant={
                      amountCents === selectedAmount ? "default" : "outline"
                    }
                    onClick={() => setSelectedAmount(amountCents)}
                    className="text-sm"
                  >
                    ${(amountCents / 100).toFixed(2)} /{" "}
                    {formatCredits(amountCents * CREDITS_PER_CENT)}
                  </Button>
                ))}
              </div>
              <div className="mt-6 space-y-4">
                <UsdcPaymentFlow
                  amountUsdCents={selectedAmount}
                  state={paymentFlow.state}
                  onStartPayment={paymentFlow.startPayment}
                  onReset={paymentFlow.reset}
                  disabled={summaryQuery.isLoading}
                />
                <p className={paragraph({ size: "sm", tone: "subdued" })}>
                  Connect your wallet, approve the USDC transfer, and we will
                  credit your balance once the transaction is verified on-chain.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
