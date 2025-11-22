// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/wallet-test/page`
 * Purpose: Dev-test page for verifying SIWE authentication flow with Auth.js.
 * Scope: Client component that demonstrates RainbowKit wallet connection with SIWE signing. Enforces strict wallet-session consistency: disconnecting or switching wallets triggers immediate signOut(). This consistency check is scoped to wallet-aware surfaces only (not applied globally).
 * Invariants: Connected wallet address must match session wallet address or session is invalidated; wallet disconnection immediately clears session.
 * Side-effects: IO (Auth.js session creation via signIn, session destruction via signOut on wallet disconnect/change)
 * Notes: Test harness for proper Web3 UX - explicit SIWE button, enforce wallet-session consistency. Wallet address is canonical user identity for MVP.
 * Links: https://www.rainbowkit.com/docs/connect-button, docs/SECURITY_AUTH_SPEC.md
 * @public
 */

// TODO: DELETE after Stage 2 complete - temporary test harness only

"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getCsrfToken, signIn, signOut, useSession } from "next-auth/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SiweMessage } from "siwe";
import { useAccount, useSignMessage } from "wagmi";

export default function WalletTestPage(): ReactNode {
  const { address, isConnected, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [siweAttemptedFor, setSiweAttemptedFor] = useState<string | null>(null);

  // Enforce wallet-session consistency (strict: wallet = identity)
  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    const sessionAddress = session.user?.walletAddress?.toLowerCase();
    const connectedAddress = address?.toLowerCase();

    // Sign out if no wallet connected or wallet doesn't match session
    if (
      !connectedAddress ||
      (sessionAddress && sessionAddress !== connectedAddress)
    ) {
      void signOut();
    }
  }, [address, session, status]);

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
        chainId: chain?.id ?? 1,
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
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setIsSigningIn(false);
    }
  }, [address, isConnected, chain, signMessageAsync]);

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
    <div className="flex flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg)]">
      <h1 className="text-[length:var(--font-size-xl)] font-[var(--font-weight-bold)]">
        Wallet Connection Test
      </h1>
      <ConnectButton />

      {error && <div className="text-destructive mt-4">{error}</div>}
    </div>
  );
}
