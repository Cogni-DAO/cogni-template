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

import { Button, UsdcPaymentFlow } from "@/components";
import {
  CREDITS_PER_CENT,
  useCreditsSummary,
  usePaymentFlow,
} from "@/features/payments/public";
import {
  badge,
  card,
  cardContent,
  cardHeader,
  container,
  heading,
  paragraph,
  section,
  twoColumn,
} from "@/styles/ui";

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
        <div className={twoColumn({})}>
          <div className={card({ variant: "elevated" })}>
            <div className={cardHeader()}>
              <div className="space-y-[var(--spacing-xs)]">
                <div className={heading({ level: "h2" })}>Credits</div>
                <div
                  className={paragraph({
                    size: "md",
                    tone: "subdued",
                    spacing: "xs",
                  })}
                >
                  Pay with USDC on Ethereum Sepolia. No auto top-up.
                </div>
              </div>
              <div className="mt-[var(--spacing-sm)] grid gap-[var(--spacing-xs)] lg:grid-cols-2">
                <div className="rounded-lg bg-muted p-[var(--spacing-md)]">
                  <div
                    className={paragraph({
                      size: "sm",
                      tone: "subdued",
                      spacing: "none",
                    })}
                  >
                    Balance
                  </div>
                  <div className={heading({ level: "h3" })}>
                    {summaryQuery.isLoading
                      ? "Loading..."
                      : `${formatCredits(summaryQuery.data?.balanceCredits ?? 0)} credits`}
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-[var(--spacing-md)]">
                  <div
                    className={paragraph({
                      size: "sm",
                      tone: "subdued",
                      spacing: "none",
                    })}
                  >
                    Conversion
                  </div>
                  <div className={heading({ level: "h3" })}>
                    1¢ = 10 credits
                  </div>
                </div>
              </div>
            </div>
            <div className={cardContent()}>
              {summaryQuery.isLoading ? (
                <div className={paragraph({})}>Loading recent activity...</div>
              ) : summaryQuery.isError ? (
                <div className={paragraph({ tone: "default" })}>
                  Unable to load ledger entries. Please refresh or try again.
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className={paragraph({ tone: "default" })}>
                  No ledger entries yet.
                </div>
              ) : (
                <div className="space-y-[var(--spacing-sm)]">
                  {ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-[var(--spacing-2xs)] rounded-md border border-border p-[var(--spacing-md)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-[var(--spacing-sm)]">
                          <span
                            className={badge({
                              intent:
                                entry.reason === "widget_payment"
                                  ? "secondary"
                                  : "outline",
                            })}
                          >
                            {entry.reason}
                          </span>
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
                        <div className={heading({ level: "h4" })}>
                          {entry.amount >= 0 ? "+" : ""}
                          {formatCredits(entry.amount)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-[var(--spacing-sm)] text-[var(--text-sm)] text-muted-foreground">
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
            </div>
          </div>

          <div className={card({ variant: "default" })}>
            <div className={cardHeader()}>
              <div className={heading({ level: "h3" })}>Buy Credits</div>
              <div
                className={paragraph({
                  size: "sm",
                  tone: "subdued",
                  spacing: "xs",
                })}
              >
                Choose an amount, complete the crypto payment, and we will
                credit your balance once the transaction confirms.
              </div>
            </div>
            <div className={cardContent()}>
              <div className="flex flex-wrap gap-[var(--spacing-sm)]">
                {PAYMENT_AMOUNTS.map((amountCents) => (
                  <Button
                    key={amountCents}
                    variant={
                      amountCents === selectedAmount ? "default" : "outline"
                    }
                    onClick={() => setSelectedAmount(amountCents)}
                  >
                    ${(amountCents / 100).toFixed(2)} /{" "}
                    {formatCredits(amountCents * CREDITS_PER_CENT)} credits
                  </Button>
                ))}
              </div>
              <div className="mt-[var(--spacing-lg)] space-y-[var(--spacing-sm)]">
                <UsdcPaymentFlow
                  amountUsdCents={selectedAmount}
                  state={paymentFlow.state}
                  onStartPayment={paymentFlow.startPayment}
                  onReset={paymentFlow.reset}
                  disabled={summaryQuery.isLoading}
                />
                <div className={paragraph({ size: "sm", tone: "subdued" })}>
                  Connect your wallet, approve the USDC transfer, and we will
                  credit your balance once the transaction is verified on-chain.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
