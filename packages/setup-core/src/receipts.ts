// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@setup-core/receipts`
 * Purpose: Extract potential contract addresses from receipts/logs.
 * Scope: Pure extraction; no RPC.
 * Invariants: Never assumes event ABIs; only heuristic extraction.
 * Side-effects: none
 * @public
 */

import type { TransactionReceipt } from "viem";

export type HexAddress = `0x${string}`;

function toAddress(hex: string): HexAddress | null {
  if (!hex.startsWith("0x")) return null;
  if (hex.length !== 42) return null;
  return hex as HexAddress;
}

function candidateFromWord(word: string): HexAddress | null {
  // word is expected to be 0x + 64 hex chars
  if (!word.startsWith("0x")) return null;
  const stripped = word.slice(2);
  if (stripped.length !== 64) return null;

  const addr = `0x${stripped.slice(24)}`;
  if (/^0x0{40}$/.test(addr)) return null;
  return toAddress(addr);
}

function splitWords(data: `0x${string}`): `0x${string}`[] {
  const stripped = data.slice(2);
  if (stripped.length % 64 !== 0) return [];
  const words: `0x${string}`[] = [];
  for (let i = 0; i < stripped.length; i += 64) {
    words.push((`0x${stripped.slice(i, i + 64)}`) as `0x${string}`);
  }
  return words;
}

export function extractCandidateAddressesFromReceipt(
  receipt: TransactionReceipt
): HexAddress[] {
  const out = new Set<string>();

  if (receipt.contractAddress) {
    out.add(receipt.contractAddress.toLowerCase());
  }

  for (const log of receipt.logs) {
    out.add(log.address.toLowerCase());

    for (const topic of log.topics) {
      const addr = candidateFromWord(topic);
      if (addr) out.add(addr.toLowerCase());
    }

    for (const word of splitWords(log.data)) {
      const addr = candidateFromWord(word);
      if (addr) out.add(addr.toLowerCase());
    }
  }

  return [...out].map((a) => a as HexAddress);
}
