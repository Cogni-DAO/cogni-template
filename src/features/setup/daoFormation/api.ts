// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/setup/daoFormation/api`
 * Purpose: Client-side API for server verification of DAO formation.
 * Scope: HTTP requests to /api/setup/verify; does not perform local validation or RPC reads.
 * Invariants: Returns typed Result; never throws.
 * Side-effects: IO (HTTP fetch)
 * Links: docs/NODE_FORMATION_SPEC.md
 * @public
 */

import type { HexAddress } from "@cogni/aragon-osx";

import type {
  SetupVerifyInput,
  SetupVerifyOutput,
} from "@/contracts/setup.verify.v1.contract";

import type { VerifiedAddresses } from "./formation.reducer";

// ============================================================================
// Types
// ============================================================================

export type VerifyResult =
  | {
      ok: true;
      addresses: VerifiedAddresses;
      repoSpecYaml: string;
    }
  | {
      ok: false;
      errors: string[];
    };

// ============================================================================
// API Client
// ============================================================================

/**
 * Verify DAO formation transactions with server.
 * Server derives all addresses from receipts (never trusts client).
 */
export async function verifyFormation(params: {
  chainId: number;
  daoTxHash: HexAddress;
  signalTxHash: HexAddress;
  initialHolder: HexAddress;
}): Promise<VerifyResult> {
  try {
    const body: SetupVerifyInput = {
      chainId: params.chainId,
      daoTxHash: params.daoTxHash,
      signalTxHash: params.signalTxHash,
      initialHolder: params.initialHolder,
    };

    const response = await fetch("/api/setup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data: SetupVerifyOutput = await response.json();

    if (data.verified) {
      return {
        ok: true,
        addresses: data.addresses as VerifiedAddresses,
        repoSpecYaml: data.repoSpecYaml,
      };
    }

    return {
      ok: false,
      errors: data.errors,
    };
  } catch (err) {
    return {
      ok: false,
      errors: [
        err instanceof Error ? err.message : "Verification request failed",
      ],
    };
  }
}
