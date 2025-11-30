// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/payments/hooks/usePaymentFlow`
 * Purpose: Orchestrates USDC payment flow state machine with wagmi + backend.
 * Scope: Manages intent → signature → confirmation → submit → poll cycle. Does not persist state across reloads.
 * Invariants: Single payment at a time; no localStorage; chain params from intent only; creditsAdded computed using CREDITS_PER_CENT constant.
 * Side-effects: IO (paymentsClient, wagmi); React state (useReducer, polling).
 * Notes: Implements full PENDING substates for Phase 3 stability.
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CREDITS_PER_CENT } from "@/core";
import { USDC_ABI } from "@/shared/web3/usdc-abi";
import type { PaymentFlowState } from "@/types/payments";
import { paymentsClient } from "../api/paymentsClient";
import { mapBackendStatus } from "../utils/mapBackendStatus";

// Re-export types for convenience
export type { PaymentFlowPhase, PaymentFlowState } from "@/types/payments";

export interface UsePaymentFlowOptions {
  amountUsdCents: number;
  onSuccess?: (creditsAdded: number) => void;
  onError?: (message: string) => void;
}

export interface UsePaymentFlowReturn {
  state: PaymentFlowState;
  startPayment: () => Promise<void>;
  reset: () => void;
}

// Internal state machine
type InternalState =
  | { phase: "READY" }
  | { phase: "CREATING_INTENT" }
  | {
      phase: "AWAITING_SIGNATURE";
      attemptId: string;
      chainId: number;
      token: string;
      to: string;
      amountRaw: string;
    }
  | { phase: "AWAITING_CONFIRMATION"; attemptId: string; txHash: string }
  | { phase: "SUBMITTING_HASH"; attemptId: string; txHash: string }
  | { phase: "POLLING_VERIFICATION"; attemptId: string; txHash: string }
  | { phase: "SUCCESS"; creditsAdded: number }
  | { phase: "ERROR"; message: string };

type Action =
  | { type: "START_CREATE_INTENT" }
  | {
      type: "INTENT_CREATED";
      attemptId: string;
      chainId: number;
      token: string;
      to: string;
      amountRaw: string;
    }
  | { type: "INTENT_FAILED"; error: string }
  | { type: "TX_HASH_RECEIVED"; attemptId: string; txHash: string }
  | { type: "TX_CONFIRMED"; attemptId: string; txHash: string }
  | { type: "SUBMIT_STARTED" }
  | { type: "SUBMIT_COMPLETED"; needsPolling: boolean }
  | { type: "SUBMIT_FAILED"; error: string }
  | { type: "VERIFICATION_SUCCESS"; creditsAdded: number }
  | { type: "VERIFICATION_FAILED"; error: string }
  | { type: "RESET" };

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case "START_CREATE_INTENT":
      return { phase: "CREATING_INTENT" };

    case "INTENT_CREATED":
      return {
        phase: "AWAITING_SIGNATURE",
        attemptId: action.attemptId,
        chainId: action.chainId,
        token: action.token,
        to: action.to,
        amountRaw: action.amountRaw,
      };

    case "INTENT_FAILED":
      return { phase: "ERROR", message: action.error };

    case "TX_HASH_RECEIVED":
      return {
        phase: "AWAITING_CONFIRMATION",
        attemptId: action.attemptId,
        txHash: action.txHash,
      };

    case "TX_CONFIRMED":
      return {
        phase: "SUBMITTING_HASH",
        attemptId: action.attemptId,
        txHash: action.txHash,
      };

    case "SUBMIT_STARTED":
      return state;

    case "SUBMIT_COMPLETED":
      if (state.phase !== "SUBMITTING_HASH") return state;
      if (action.needsPolling) {
        return {
          phase: "POLLING_VERIFICATION",
          attemptId: state.attemptId,
          txHash: state.txHash,
        };
      }
      // If backend immediately confirmed/failed, state will be updated by next action
      return state;

    case "SUBMIT_FAILED":
      return { phase: "ERROR", message: action.error };

    case "VERIFICATION_SUCCESS":
      return { phase: "SUCCESS", creditsAdded: action.creditsAdded };

    case "VERIFICATION_FAILED":
      return { phase: "ERROR", message: action.error };

    case "RESET":
      return { phase: "READY" };

    default:
      return state;
  }
}

function derivePublicState(internal: InternalState): PaymentFlowState {
  switch (internal.phase) {
    case "READY":
      return {
        phase: "READY",
        isCreatingIntent: false,
        walletStep: null,
        txHash: null,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "CREATING_INTENT":
      return {
        phase: "READY",
        isCreatingIntent: true,
        walletStep: null,
        txHash: null,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "AWAITING_SIGNATURE":
      return {
        phase: "PENDING",
        isCreatingIntent: false,
        walletStep: "SIGNING",
        txHash: null,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "AWAITING_CONFIRMATION":
      return {
        phase: "PENDING",
        isCreatingIntent: false,
        walletStep: "CONFIRMING",
        txHash: internal.txHash,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "SUBMITTING_HASH":
      return {
        phase: "PENDING",
        isCreatingIntent: false,
        walletStep: "SUBMITTING",
        txHash: internal.txHash,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "POLLING_VERIFICATION":
      return {
        phase: "PENDING",
        isCreatingIntent: false,
        walletStep: "VERIFYING",
        txHash: internal.txHash,
        result: null,
        errorMessage: null,
        creditsAdded: null,
      };

    case "SUCCESS":
      return {
        phase: "DONE",
        isCreatingIntent: false,
        walletStep: null,
        txHash: null,
        result: "SUCCESS",
        errorMessage: null,
        creditsAdded: internal.creditsAdded,
      };

    case "ERROR":
      return {
        phase: "DONE",
        isCreatingIntent: false,
        walletStep: null,
        txHash: null,
        result: "ERROR",
        errorMessage: internal.message,
        creditsAdded: null,
      };
  }
}

export function usePaymentFlow(
  options: UsePaymentFlowOptions
): UsePaymentFlowReturn {
  const { amountUsdCents, onSuccess, onError } = options;
  const [internalState, dispatch] = useReducer(reducer, { phase: "READY" });

  const { writeContract, data: txHash, error: writeError } = useWriteContract();
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Track callback invocation to avoid double-calls
  const successCalledRef = useRef(false);
  const errorCalledRef = useRef(false);

  // Handle wallet write errors
  useEffect(() => {
    if (writeError && internalState.phase === "AWAITING_SIGNATURE") {
      dispatch({
        type: "INTENT_FAILED",
        error: writeError.message ?? "Wallet signature rejected",
      });
    }
  }, [writeError, internalState.phase]);

  // Handle receipt errors
  useEffect(() => {
    if (receiptError && internalState.phase === "AWAITING_CONFIRMATION") {
      dispatch({
        type: "SUBMIT_FAILED",
        error: receiptError.message ?? "Transaction confirmation failed",
      });
    }
  }, [receiptError, internalState.phase]);

  // Handle txHash received
  useEffect(() => {
    if (
      txHash &&
      internalState.phase === "AWAITING_SIGNATURE" &&
      "attemptId" in internalState
    ) {
      dispatch({
        type: "TX_HASH_RECEIVED",
        attemptId: internalState.attemptId,
        txHash,
      });
    }
  }, [txHash, internalState]);

  // Handle receipt confirmed
  useEffect(() => {
    if (
      receipt &&
      internalState.phase === "AWAITING_CONFIRMATION" &&
      "attemptId" in internalState &&
      "txHash" in internalState
    ) {
      dispatch({
        type: "TX_CONFIRMED",
        attemptId: internalState.attemptId,
        txHash: internalState.txHash,
      });

      // Submit txHash to backend
      (async () => {
        dispatch({ type: "SUBMIT_STARTED" });

        const result = await paymentsClient.submitTxHash(
          internalState.attemptId,
          { txHash: internalState.txHash }
        );

        if (!result.ok) {
          dispatch({ type: "SUBMIT_FAILED", error: result.error });
          return;
        }

        // Check if backend immediately resolved (stub verifier case)
        // submitTxHash returns internal backend status (CREATED_INTENT | PENDING_UNVERIFIED | CREDITED | REJECTED | FAILED)
        if (result.data.status === "CREDITED") {
          dispatch({
            type: "VERIFICATION_SUCCESS",
            creditsAdded: amountUsdCents * CREDITS_PER_CENT,
          });
          dispatch({ type: "SUBMIT_COMPLETED", needsPolling: false });
        } else if (
          result.data.status === "REJECTED" ||
          result.data.status === "FAILED"
        ) {
          dispatch({
            type: "VERIFICATION_FAILED",
            error: result.data.errorMessage ?? "Verification failed",
          });
          dispatch({ type: "SUBMIT_COMPLETED", needsPolling: false });
        } else {
          // PENDING_UNVERIFIED - need to poll
          dispatch({ type: "SUBMIT_COMPLETED", needsPolling: true });
        }
      })();
    }
  }, [receipt, internalState, amountUsdCents]);

  // Polling effect
  useEffect(() => {
    if (
      internalState.phase !== "POLLING_VERIFICATION" ||
      !("attemptId" in internalState)
    ) {
      return;
    }

    const pollInterval = setInterval(async () => {
      const result = await paymentsClient.getStatus(internalState.attemptId);

      if (!result.ok) {
        dispatch({
          type: "VERIFICATION_FAILED",
          error: result.error,
        });
        return;
      }

      const mapped = mapBackendStatus(
        result.data.status,
        result.data.errorCode
      );

      if (mapped.phase === "DONE") {
        if (mapped.result === "SUCCESS") {
          dispatch({
            type: "VERIFICATION_SUCCESS",
            creditsAdded: amountUsdCents * CREDITS_PER_CENT,
          });
        } else {
          dispatch({
            type: "VERIFICATION_FAILED",
            error: mapped.errorMessage ?? "Verification failed",
          });
        }
      }
    }, 3000); // Poll every 3 seconds (backend throttles to 10s)

    return () => clearInterval(pollInterval);
  }, [internalState, amountUsdCents]);

  // Success callback
  useEffect(() => {
    if (
      internalState.phase === "SUCCESS" &&
      !successCalledRef.current &&
      onSuccess
    ) {
      successCalledRef.current = true;
      onSuccess(internalState.creditsAdded);
    }
  }, [internalState, onSuccess]);

  // Error callback
  useEffect(() => {
    if (internalState.phase === "ERROR" && !errorCalledRef.current && onError) {
      errorCalledRef.current = true;
      onError(internalState.message);
    }
  }, [internalState, onError]);

  const startPayment = useCallback(async () => {
    if (internalState.phase !== "READY") {
      return;
    }

    dispatch({ type: "START_CREATE_INTENT" });

    const result = await paymentsClient.createIntent({ amountUsdCents });

    if (!result.ok) {
      dispatch({ type: "INTENT_FAILED", error: result.error });
      return;
    }

    const { attemptId, chainId, token, to, amountRaw } = result.data;

    dispatch({
      type: "INTENT_CREATED",
      attemptId,
      chainId,
      token,
      to,
      amountRaw,
    });

    // Trigger wallet write
    writeContract({
      chainId,
      address: token as `0x${string}`,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, BigInt(amountRaw)],
    });
  }, [internalState.phase, amountUsdCents, writeContract]);

  const reset = useCallback(() => {
    successCalledRef.current = false;
    errorCalledRef.current = false;
    dispatch({ type: "RESET" });
  }, []);

  return {
    state: derivePublicState(internalState),
    startPayment,
    reset,
  };
}
