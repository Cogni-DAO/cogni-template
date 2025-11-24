// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/auth/WalletConnectButton`
 * Purpose: Wallet connection kit component with SIWE authentication.
 * Scope: Client component that wraps RainbowKit ConnectButton with automatic SIWE signing. Enforces wallet-session consistency globally when mounted. Does not handle wallet selection UI or chain switching.
 * Invariants: Connected wallet address must match session wallet address; wallet disconnection clears session; auto-triggers SIWE on connect.
 * Side-effects: IO (Auth.js session creation via signIn, session destruction via signOut on wallet disconnect/change)
 * Notes: Kit component for reuse in header and other locations. Session consistency enforced wherever this component is mounted.
 * Links: https://www.rainbowkit.com/docs/connect-button, docs/SECURITY_AUTH_SPEC.md
 * @public
 */

"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getCsrfToken, signIn, signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { SiweMessage } from "siwe";
import { useAccount, useSignMessage } from "wagmi";

import {
  computeWalletSessionAction,
  normalizeWalletAddress,
} from "@/shared/auth";
import { getChainId } from "@/shared/web3";

export interface WalletConnectButtonProps {
  /**
   * Whether to show error messages inline (default: false)
   * Set to true for debug/test pages, false for header
   */
  showError?: boolean;
}

export function WalletConnectButton({
  showError = false,
}: WalletConnectButtonProps): ReactNode {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [siweAttemptedFor, setSiweAttemptedFor] = useState<string | null>(null);

  // Enforce wallet-session consistency (GLOBAL - runs wherever this component is mounted)
  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    const action = computeWalletSessionAction({
      isConnected,
      connectedAddress: normalizeWalletAddress(address),
      sessionAddress: normalizeWalletAddress(session.user?.walletAddress),
    });

    if (action === "sign_out") {
      void signOut();
    }
  }, [address, isConnected, session, status]);

  // Reset SIWE attempt flag when wallet changes or disconnects
  useEffect(() => {
    if (!address && siweAttemptedFor) {
      // Fully disconnected: allow new attempt next time they connect
      setSiweAttemptedFor(null);
      setError(null);
      return;
    }
    if (address && siweAttemptedFor && siweAttemptedFor !== address) {
      // Switched wallets: allow SIWE for new address
      setSiweAttemptedFor(null);
      setError(null);
    }
  }, [address, siweAttemptedFor]);

  const handleLogin = useCallback(async (): Promise<void> => {
    setIsSigningIn(true);
    setError(null);

    try {
      if (!address || !isConnected) {
        throw new Error("Wallet not connected");
      }

      const csrfToken = await getCsrfToken();
      if (!csrfToken) {
        throw new Error("Failed to get CSRF token");
      }

      // Domain must match server req.headers.host
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in with Ethereum to the app.",
        uri: window.location.origin,
        version: "1",
        chainId: getChainId(),
        nonce: csrfToken,
      });

      const preparedMessage = message.prepareMessage();
      const signature = await signMessageAsync({
        account: address,
        message: preparedMessage,
      });

      const result = await signIn("siwe", {
        message: preparedMessage,
        redirect: false,
        signature,
      });

      if (result?.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("[WalletConnectButton] SIWE failed:", err);
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setIsSigningIn(false);
    }
  }, [address, isConnected, signMessageAsync]);

  // Auto-trigger SIWE login when wallet connects (no manual button needed)
  useEffect(() => {
    // Only when a wallet is connected
    if (!isConnected || !address) return;

    // Only when not already authenticated
    if (status !== "unauthenticated") return;

    // Avoid re-entrancy
    if (isSigningIn) return;

    // Avoid spamming same address if user rejects once
    if (siweAttemptedFor === address) return;

    setSiweAttemptedFor(address);
    void handleLogin();
  }, [
    isConnected,
    address,
    status,
    isSigningIn,
    siweAttemptedFor,
    handleLogin,
  ]);

  return (
    <>
      <ConnectButton />
      {showError && error && (
        <div className="text-destructive mt-4">{error}</div>
      )}
    </>
  );
}
