// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/treasury/components/TreasuryBadge`
 * Purpose: Displays DAO treasury ETH balance in header.
 * Scope: Presentation component using useTreasuryBalance hook. Client-side only. Does not call APIs or perform RPC directly.
 * Invariants: Shows "Ξ --" on loading/error; no polling (hook handles fetch strategy).
 * Side-effects: none (pure presentation)
 * Notes: Phase 2: ETH only. Optional stale indicator for RPC timeouts.
 * Links: docs/ONCHAIN_READERS.md
 * @public
 */

"use client";

import type { ReactElement } from "react";

import { useTreasuryBalance } from "@/features/treasury/hooks/useTreasuryBalance";

/**
 * Formats balance for display (e.g., "3,726.42" → "3,726")
 * Strips decimals and formats with commas for readability
 */
function formatBalanceForDisplay(balance: string): string {
  const num = parseFloat(balance);
  if (Number.isNaN(num)) return "--";
  return Math.floor(num).toLocaleString("en-US");
}

/**
 * Treasury badge component for header display.
 * Shows DAO ETH balance with graceful degradation on errors.
 *
 * @returns Treasury badge element
 */
export function TreasuryBadge(): ReactElement {
  const { ethBalance, isLoading, error, staleWarning } = useTreasuryBalance();

  // Determine display value
  let displayValue = "--";
  if (!isLoading && !error && ethBalance !== null) {
    displayValue = formatBalanceForDisplay(ethBalance);
  }

  // Optional: Add visual indicator for stale data
  const textStyle = staleWarning ? "opacity-60" : "";

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm"
      title={
        staleWarning
          ? "Treasury balance unavailable (RPC timeout)"
          : "DAO Treasury Balance"
      }
    >
      <span className="text-muted-foreground">Treasury</span>
      <span className={`font-mono font-semibold ${textStyle}`}>
        Ξ {displayValue}
      </span>
    </div>
  );
}
