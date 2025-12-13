// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/errors/onchain-ui-error`
 * Purpose: Normalize unknown errors into UI-friendly shape for on-chain operations.
 * Scope: Pure transformation from unknown to UiError. Does not log, throw, or perform IO.
 * Invariants: Always returns valid UiError; never throws.
 * Side-effects: none
 * Links: Used by wallet transaction UI components
 * @public
 */

/**
 * UI-friendly error shape for display in dialogs/alerts.
 */
export interface UiError {
  /** Short user-friendly message */
  message: string;
  /** Full error detail for debugging (optional) */
  detail?: string;
  /** Error category for potential styling/handling */
  kind: "user_rejected" | "insufficient_funds" | "rpc_error" | "unknown";
}

// EIP-1193 standard error codes
const EIP1193_USER_REJECTED = 4001;
const EIP1193_UNAUTHORIZED = 4100;

/**
 * Extract error code from various error shapes (wagmi, viem, MetaMask, WalletConnect).
 */
function extractErrorCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  const obj = err as Record<string, unknown>;

  // Direct code property (EIP-1193)
  if (typeof obj.code === "number") return obj.code;

  // Nested in cause (viem pattern)
  if (obj.cause && typeof obj.cause === "object") {
    const cause = obj.cause as Record<string, unknown>;
    if (typeof cause.code === "number") return cause.code;
  }

  // Nested in data (some providers)
  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;
    if (typeof data.code === "number") return data.code;
  }

  return undefined;
}

/**
 * Extract raw message from error, traversing cause chain if needed.
 */
function extractMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.shortMessage === "string") return obj.shortMessage;
  }
  return String(err);
}

/**
 * Normalize any error into a UI-friendly shape.
 *
 * Priority:
 * 1. EIP-1193 error codes (most reliable)
 * 2. Structured fields (cause/data)
 * 3. Minimal string matching for common cases
 * 4. Generic fallback with detail
 */
export function toUiError(err: unknown): UiError {
  // Handle null/undefined
  if (err == null) {
    return { message: "An unexpected error occurred", kind: "unknown" };
  }

  const code = extractErrorCode(err);
  const rawMessage = extractMessage(err);

  // 1. Check EIP-1193 codes first (most reliable)
  if (code === EIP1193_USER_REJECTED) {
    return {
      message: "Transaction was rejected in wallet",
      kind: "user_rejected",
    };
  }

  if (code === EIP1193_UNAUTHORIZED) {
    return {
      message: "Wallet not authorized",
      detail: rawMessage,
      kind: "user_rejected",
    };
  }

  // Server errors range (-32000 to -32099) often include insufficient funds
  if (code !== undefined && code >= -32099 && code <= -32000) {
    // Check for specific patterns in these server errors
    if (rawMessage.toLowerCase().includes("insufficient funds")) {
      return {
        message: "Insufficient funds for gas",
        detail: rawMessage,
        kind: "insufficient_funds",
      };
    }
    return {
      message: "Transaction failed",
      detail: rawMessage,
      kind: "rpc_error",
    };
  }

  // Internal JSON-RPC error (-32603)
  if (code === -32603) {
    return {
      message: "Transaction simulation failed",
      detail: rawMessage,
      kind: "rpc_error",
    };
  }

  // 2. Minimal string matching for cases without proper codes
  if (rawMessage.toLowerCase().includes("user rejected")) {
    return {
      message: "Transaction was rejected in wallet",
      kind: "user_rejected",
    };
  }

  if (rawMessage.toLowerCase().includes("insufficient funds")) {
    return {
      message: "Insufficient funds for gas",
      detail: rawMessage,
      kind: "insufficient_funds",
    };
  }

  // 3. Generic fallback - always include detail for long messages
  if (rawMessage.length > 150) {
    return {
      message: "Transaction failed",
      detail: rawMessage,
      kind: "unknown",
    };
  }

  return {
    message: rawMessage,
    kind: "unknown",
  };
}
