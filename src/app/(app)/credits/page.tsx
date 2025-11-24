// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/credits/page`
 * Purpose: Protected credits page showing balance, ledger history, and DePay purchase CTA.
 * Scope: Client component using React Query to fetch billing data and trigger confirm flow; does not manage session auth or server-side billing logic.
 * Invariants: Billing account inferred from authenticated session; crypto-only with no auto top-up.
 * Side-effects: IO (network requests to payments APIs); global (localStorage for idempotency keys).
 * Notes: DePay widget runs client-side only; confirmation calls backend with UUID idempotency keys.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useCallback, useMemo, useState } from "react";

import { Button } from "@/components";
import { DePayWidget } from "@/components/vendor/depay";
import type { CreditsConfirmInput } from "@/contracts/payments.credits.confirm.v1.contract";
import type { CreditsSummaryOutput } from "@/contracts/payments.credits.summary.v1.contract";
import { buildConfirmPayload } from "@/features/payments/services/buildConfirmPayload";
import { clientEnv } from "@/shared/env";
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

const PAYMENT_AMOUNTS = [0.1, 10, 25, 50, 100] as const;
const DEFAULT_LEDGER_LIMIT = 10;

async function fetchSummary(): Promise<CreditsSummaryOutput> {
  const response = await fetch(
    "/api/v1/payments/credits/summary?limit=" + DEFAULT_LEDGER_LIMIT
  );
  if (!response.ok) {
    throw new Error("Unable to load credits");
  }
  return (await response.json()) as CreditsSummaryOutput;
}

async function confirmPayment(payload: CreditsConfirmInput): Promise<{
  billingAccountId: string;
  balanceCredits: number;
}> {
  const response = await fetch("/api/v1/payments/credits/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody.error === "string"
        ? errorBody.error
        : "Unable to confirm payment";
    throw new Error(message);
  }

  return (await response.json()) as {
    billingAccountId: string;
    balanceCredits: number;
  };
}

function formatCredits(amount: number): string {
  return amount.toLocaleString("en-US");
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export default function CreditsPage(): ReactElement {
  const [selectedAmount, setSelectedAmount] = useState<number>(
    PAYMENT_AMOUNTS[1]
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["payments-summary"],
    queryFn: fetchSummary,
  });

  const confirmMutation = useMutation({
    mutationFn: confirmPayment,
    onSuccess: async () => {
      setStatusMessage("Credits added successfully");
      await queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unable to confirm payment";
      setStatusMessage(message);
    },
  });

  const walletAddress = useMemo(
    () => clientEnv().NEXT_PUBLIC_DAO_WALLET_ADDRESS ?? "",
    []
  );
  const dePayReady = walletAddress.length > 0;

  const handlePaymentSuccess = useCallback(
    (txInfo: { txHash: string; blockchain: string; token: string }) => {
      // Build confirm payload using shared helper
      const payload = buildConfirmPayload(txInfo, selectedAmount);

      // Store payment ID for reference (best-effort, no error if localStorage fails)
      try {
        localStorage.setItem("depay:lastPaymentId", payload.clientPaymentId);
      } catch {
        // Ignore storage errors
      }

      setStatusMessage(null);
      confirmMutation.mutate(payload);
    },
    [selectedAmount, confirmMutation]
  );

  const handlePaymentFailure = useCallback((message: string) => {
    setStatusMessage(message);
    console.log("[Payment] Failed:", message);
  }, []);

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
                  Powered by DePay. No auto top-up.
                </div>
              </div>
              <div className="mt-[var(--spacing-sm)] grid gap-[var(--spacing-xs)] lg:grid-cols-2">
                <div className="bg-muted rounded-lg p-[var(--spacing-md)]">
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
                <div className="bg-muted rounded-lg p-[var(--spacing-md)]">
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
              {statusMessage ? (
                <div className="border-border bg-accent/30 text-accent-foreground rounded-md border p-[var(--spacing-sm)] text-[var(--text-sm)]">
                  {statusMessage}
                </div>
              ) : null}
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
                      className="border-border flex flex-col gap-[var(--spacing-2xs)] rounded-md border p-[var(--spacing-md)]"
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
                      <div className="text-muted-foreground flex flex-wrap items-center gap-[var(--spacing-sm)] text-[var(--text-sm)]">
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
                {PAYMENT_AMOUNTS.map((amount) => (
                  <Button
                    key={amount}
                    variant={amount === selectedAmount ? "default" : "outline"}
                    onClick={() => setSelectedAmount(amount)}
                  >
                    ${amount} / {formatCredits(amount * 1000)} credits
                  </Button>
                ))}
              </div>
              <div className="mt-[var(--spacing-lg)] space-y-[var(--spacing-sm)]">
                {!dePayReady ? (
                  <div className={paragraph({ tone: "default" })}>
                    Configure NEXT_PUBLIC_DAO_WALLET_ADDRESS to enable payments.
                  </div>
                ) : (
                  <DePayWidget
                    amountUsd={selectedAmount}
                    receiverAddress={walletAddress}
                    disabled={confirmMutation.isPending}
                    onSucceeded={handlePaymentSuccess}
                    onFailed={handlePaymentFailure}
                  />
                )}
                <div className={paragraph({ size: "sm", tone: "subdued" })}>
                  After payment completes, we call the confirm endpoint with
                  your amount and an idempotent payment ID. Repeat submissions
                  with the same ID will not double credit your balance.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
