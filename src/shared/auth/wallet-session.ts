// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/auth/wallet-session`
 * Purpose: Pure function for wallet-session consistency checking.
 * Scope: Determines whether user should be signed out based on wallet connection state vs session state. Does not perform sign-out or side effects.
 * Invariants: Pure function with no side effects; all inputs lowercase normalized before comparison.
 * Side-effects: none
 * Notes: Used by WalletConnectButton to enforce wallet-session consistency. If wallet disconnects or changes, session must be invalidated.
 * Links: docs/SECURITY_AUTH_SPEC.md, components/kit/auth/WalletConnectButton.tsx
 * @public
 */

export type WalletSessionAction = "none" | "sign_out";

/**
 * Normalized Ethereum address type.
 * Either a valid 0x-prefixed hex string or null (for no address).
 */
export type NormalizedAddress = `0x${string}` | null;

export interface WalletSessionState {
  /**
   * Whether a wallet is currently connected via wagmi
   */
  isConnected: boolean;
  /**
   * The currently connected wallet address (normalized)
   */
  connectedAddress: NormalizedAddress;
  /**
   * The wallet address stored in the NextAuth session (normalized)
   */
  sessionAddress: NormalizedAddress;
}

/**
 * Normalize a wallet address from external sources (wagmi, NextAuth) into canonical form.
 * Converts undefined/null/empty to null, otherwise returns lowercased address.
 *
 * @param value - Address from wagmi useAccount or NextAuth session (may be undefined, null, or string)
 * @returns Normalized address (null or lowercase 0x-prefixed string)
 */
export function normalizeWalletAddress(
  value: string | null | undefined
): NormalizedAddress {
  if (!value) return null;
  return value.toLowerCase() as NormalizedAddress;
}

/**
 * Compute whether the user should be signed out based on wallet-session consistency.
 *
 * Sign out if:
 * - Wallet is disconnected (!isConnected)
 * - No wallet address is available (!connectedAddress)
 * - Session has a wallet address that doesn't match the connected wallet
 *
 * @param state - Current wallet and session state
 * @returns "sign_out" if session should be invalidated, "none" otherwise
 */
export function computeWalletSessionAction(
  state: WalletSessionState
): WalletSessionAction {
  const { isConnected, connectedAddress, sessionAddress } = state;

  // Sign out if wallet is disconnected
  if (!isConnected) {
    return "sign_out";
  }

  // Sign out if no wallet address available
  if (!connectedAddress) {
    return "sign_out";
  }

  // Sign out if session has a wallet address that doesn't match
  if (sessionAddress && sessionAddress !== connectedAddress) {
    return "sign_out";
  }

  // Wallet and session are consistent
  return "none";
}
