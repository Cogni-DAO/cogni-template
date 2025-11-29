// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/payments/fake-onchain-verifier`
 * Purpose: Fake on-chain verifier for deterministic testing.
 * Scope: Test adapter that returns configurable verification results. Does not perform real chain verification.
 * Invariants: Deterministic behavior based on configuration; allows testing all verification scenarios.
 * Side-effects: none (in-memory only)
 * Notes: Configure via setVerified/setFailed/setPending helpers or setResponse() directly. Tracks lastCallParams for assertions.
 * Links: Implements OnChainVerifier port
 * @public
 */

import type {
  OnChainVerifier,
  PaymentErrorCode,
  VerificationResult,
} from "@/ports";

/**
 * Fake on-chain verifier for testing
 * Allows configuring responses to test all verification scenarios
 */
export class FakeOnChainVerifierAdapter implements OnChainVerifier {
  private response: VerificationResult = {
    status: "VERIFIED",
    actualFrom: "0x0000000000000000000000000000000000000001",
    actualTo: "0x0000000000000000000000000000000000000002",
    actualAmount: 1000000n,
    confirmations: 5,
  };

  public lastCallParams:
    | {
        chainId: number;
        txHash: string;
        expectedTo: string;
        expectedToken: string;
        expectedAmount: bigint;
      }
    | undefined;

  /**
   * Configure the verification response directly
   * Used by tests to simulate different verification outcomes
   */
  setResponse(response: VerificationResult): void {
    this.response = response;
  }

  /**
   * Configure VERIFIED response with optional overrides
   * Default: status=VERIFIED, actualFrom/To set, amount=1M, confirmations=5
   */
  setVerified(overrides?: Partial<Omit<VerificationResult, "status">>): void {
    this.response = {
      status: "VERIFIED",
      actualFrom: "0x0000000000000000000000000000000000000001",
      actualTo: "0x0000000000000000000000000000000000000002",
      actualAmount: 1000000n,
      confirmations: 5,
      ...overrides,
    };
  }

  /**
   * Configure FAILED response with error code
   * Default: status=FAILED, all actual fields null, specified errorCode
   */
  setFailed(
    errorCode: PaymentErrorCode,
    overrides?: Partial<Omit<VerificationResult, "status" | "errorCode">>
  ): void {
    this.response = {
      status: "FAILED",
      actualFrom: null,
      actualTo: null,
      actualAmount: null,
      confirmations: null,
      errorCode,
      ...overrides,
    };
  }

  /**
   * Configure PENDING response
   * Default: status=PENDING, all actual fields null
   */
  setPending(overrides?: Partial<Omit<VerificationResult, "status">>): void {
    this.response = {
      status: "PENDING",
      actualFrom: null,
      actualTo: null,
      actualAmount: null,
      confirmations: null,
      ...overrides,
    };
  }

  /**
   * Reset to default VERIFIED response
   */
  reset(): void {
    this.setVerified();
    this.lastCallParams = undefined;
  }

  async verify(params: {
    chainId: number;
    txHash: string;
    expectedTo: string;
    expectedToken: string;
    expectedAmount: bigint;
  }): Promise<VerificationResult> {
    this.lastCallParams = params;
    return this.response;
  }
}
