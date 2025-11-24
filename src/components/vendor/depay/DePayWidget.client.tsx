// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/vendor/depay/DePayWidget.client`
 * Purpose: Client-only wrapper for DePay payment widget CDN integration (OSS mode).
 * Scope: Loads DePay CDN script and renders payment button; handles widget callbacks for success/failure. Does not handle idempotency, balance updates, or backend confirmation.
 * Invariants: Requires browser environment (uses Next.js Script); widget fires callbacks client-side only.
 * Side-effects: IO (loads external CDN script, wallet connection), DOM (renders button)
 * Notes: OSS mode (no DePay tracking API, 0% fees); callers must handle payment confirmation via backend endpoint.
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

"use client";

import Script from "next/script";
import type { ReactElement } from "react";
import { useState } from "react";

import { Button } from "@/components";
import { DEPAY_BLOCKCHAIN, USDC_TOKEN_ADDRESS } from "@/shared/web3";

declare global {
  interface Window {
    DePayWidgets?: {
      Payment: (config: unknown) => Promise<void>;
    };
  }
}

interface DePayWidgetProps {
  amountUsd: number;
  receiverAddress: string;
  disabled?: boolean;
  onSucceeded: (txInfo: {
    txHash: string;
    blockchain: string;
    token: string;
  }) => void;
  onFailed: (message: string) => void;
}

export function DePayWidget({
  amountUsd,
  receiverAddress,
  disabled = false,
  onSucceeded,
  onFailed,
}: DePayWidgetProps): ReactElement {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async (): Promise<void> => {
    if (!scriptLoaded || !window.DePayWidgets) {
      onFailed("DePay widget not loaded yet");
      return;
    }

    setIsProcessing(true);

    try {
      await window.DePayWidgets.Payment({
        accept: [
          {
            blockchain: DEPAY_BLOCKCHAIN,
            token: USDC_TOKEN_ADDRESS,
            receiver: receiverAddress,
          },
        ],
        amount: {
          currency: "USD",
          fix: amountUsd,
        },
        succeeded: (transaction: { id?: string }) => {
          onSucceeded({
            txHash: transaction?.id ?? "unknown",
            blockchain: DEPAY_BLOCKCHAIN,
            token: "USDC",
          });
        },
        failed: () => {
          onFailed("Payment failed or cancelled");
        },
      });
    } catch (error) {
      console.error("[DePay] Widget error:", error);
      const message =
        error instanceof Error ? error.message : "DePay widget failed";
      onFailed(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Script
        src="https://integrate.depay.com/widgets/v12.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => onFailed("Failed to load DePay CDN script")}
      />
      <Button
        onClick={handleClick}
        disabled={disabled || !scriptLoaded || isProcessing}
      >
        {scriptLoaded ? "Purchase with DePay" : "Loading DePay..."}
      </Button>
    </>
  );
}
