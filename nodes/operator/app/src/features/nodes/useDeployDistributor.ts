// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/useDeployDistributor`
 * Purpose: Owner-wallet state machine that deploys the vendored `CumulativeMerkleDistributor(token)`,
 *   transfers its ownership to the node DAO, then POSTs the verified distributor address to the
 *   activation route (which re-verifies on-chain before pinning it into the node repo-spec).
 * Scope: Client-side wagmi wiring for `DistributionsCard.client`. Does NOT deploy from the server and
 *   does NOT hold any secret — the connected wallet signs every transaction.
 * Invariants:
 *   - WALLET_DEPLOYS: the distributor is deployed + transferred by the OWNER'S wallet, never the
 *     operator. Constructor arg is the node token; ownership is transferred to the DAO.
 *   - VERIFY_BEFORE_RECORD: only after `transferOwnership(DAO)` confirms do we POST; the route then
 *     re-verifies owner()==DAO AND token()==token on-chain before writing the spec.
 *   - CHAIN_GATED: the caller gates the button on the connected chain matching the node chain (Base
 *     mainnet 8453 for toks2); this hook assumes the wallet is already on-chain.
 *   - ADDRESSES_ONLY: no token math — every value is an address/hash/bytes.
 * Side-effects: blockchain write (deploy tx + transferOwnership tx via wallet), IO (POST activation).
 * Links: nodes/operator/app/src/features/nodes/DistributionsCard.client.tsx,
 *   nodes/operator/app/src/app/api/v1/nodes/[id]/activate-distributions/route.ts,
 *   packages/cogni-contracts/src/cumulative-merkle-distributor/{abi,bytecode}.ts
 * @public
 */

"use client";

import {
  CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
  CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE,
} from "@cogni/cogni-contracts";
import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useDeployContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

/** Coarse phase of the deploy → transfer-ownership → record pipeline. */
export type DeployDistributorPhase =
  | "idle"
  | "deploying" // deploy tx submitted, awaiting receipt (→ contractAddress)
  | "transferring" // transferOwnership(DAO) tx submitted, awaiting receipt
  | "recording" // POST activate-distributions (route re-verifies on-chain)
  | "done"
  | "error";

export interface DeployDistributorResult {
  readonly phase: DeployDistributorPhase;
  /** The distributor address the deploy receipt reported (checksummed by viem). */
  readonly distributorAddress: `0x${string}` | null;
  /** Deploy tx hash (for a Basescan link). */
  readonly deployTx: `0x${string}` | undefined;
  /** transferOwnership tx hash (for a Basescan link). */
  readonly transferTx: `0x${string}` | undefined;
  /** Activation PR url once the route records the distributor. */
  readonly prUrl: string | null;
  /**
   * Non-fatal record failure. The on-chain deploy + `transferOwnership(DAO)` are
   * irreversible truth; a failed git-record (e.g. the operator App isn't installed
   * on the target repo — the local-dev case) must NOT mask a successful deploy.
   * When set, `phase` is still "done" and `distributorAddress` is populated so the
   * address can be recorded off-plane (candidate-a) or retried.
   */
  readonly recordError: string | null;
  readonly error: string | null;
  /** Kick off the flow: deploy `CumulativeMerkleDistributor(token)`. */
  readonly deploy: () => void;
  readonly reset: () => void;
}

/**
 * Drive the owner-wallet distributor-deploy flow for one node.
 *
 * @param nodeId node id/slug — the activation route path segment.
 * @param tokenAddress the node's GovernanceERC20 (constructor arg).
 * @param daoAddress the DAO that receives ownership.
 */
export function useDeployDistributor(
  nodeId: string,
  tokenAddress: `0x${string}`,
  daoAddress: `0x${string}`
): DeployDistributorResult {
  const { address: account } = useAccount();
  const [phase, setPhase] = useState<DeployDistributorPhase>("idle");
  const [distributorAddress, setDistributorAddress] = useState<
    `0x${string}` | null
  >(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: deploy the vendored distributor with the node token as ctor arg.
  const {
    deployContract,
    data: deployTx,
    error: deployError,
    reset: resetDeploy,
  } = useDeployContract();
  const { data: deployReceipt, error: deployReceiptError } =
    useWaitForTransactionReceipt({ hash: deployTx });

  // Step 2: transfer ownership of the deployed distributor to the DAO.
  const {
    writeContract,
    data: transferTx,
    error: transferError,
    reset: resetTransfer,
  } = useWriteContract();
  const { isSuccess: transferConfirmed, error: transferReceiptError } =
    useWaitForTransactionReceipt({ hash: transferTx });

  const deploy = useCallback(() => {
    if (!account) {
      setError("Connect your wallet to deploy the distributor.");
      setPhase("error");
      return;
    }
    setError(null);
    setPrUrl(null);
    setDistributorAddress(null);
    setPhase("deploying");
    deployContract({
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      bytecode: CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE,
      args: [tokenAddress],
      account,
    });
  }, [account, deployContract, tokenAddress]);

  // Deploy confirmed → capture the distributor address, then transferOwnership(DAO).
  useEffect(() => {
    if (phase !== "deploying" || !deployReceipt) return;
    const deployed = deployReceipt.contractAddress;
    if (!deployed) {
      setError("Deploy receipt had no contract address.");
      setPhase("error");
      return;
    }
    setDistributorAddress(deployed);
    setPhase("transferring");
    writeContract({
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      address: deployed,
      functionName: "transferOwnership",
      args: [daoAddress],
      ...(account ? { account } : {}),
    });
  }, [phase, deployReceipt, writeContract, daoAddress, account]);

  // transferOwnership confirmed → POST the address; the route re-verifies on-chain.
  useEffect(() => {
    if (phase !== "transferring" || !transferConfirmed || !distributorAddress) {
      return;
    }
    setPhase("recording");
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/nodes/${nodeId}/activate-distributions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              distributorAddress,
              ...(deployTx ? { deployTx } : {}),
            }),
          }
        );
        const text = await response.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // non-JSON falls through to the raw-text error path
        }
        if (!response.ok) {
          let reason = `HTTP ${response.status}`;
          if (
            parsed &&
            typeof parsed === "object" &&
            "error" in parsed &&
            typeof (parsed as { error: unknown }).error === "string"
          ) {
            reason = (parsed as { error: string }).error;
          } else if (text.trim() !== "") {
            reason = text;
          }
          throw new Error(reason);
        }
        const activation =
          parsed && typeof parsed === "object" && "activation" in parsed
            ? (parsed as { activation: { status?: string; prUrl?: string } })
                .activation
            : null;
        if (activation?.status === "pr_opened" && activation.prUrl) {
          setPrUrl(activation.prUrl);
        }
        setPhase("done");
      } catch (err) {
        // RECORD_FAILURE_IS_NON_FATAL: the distributor is already deployed on-chain
        // and owned by the DAO — that is the irreversible truth. A failed git-record
        // (operator App not installed on the target repo — the local-dev case) becomes
        // a "deployed, record pending" state that keeps the distributor address visible
        // for off-plane recording (candidate-a) or retry. It is NOT a deploy failure.
        setRecordError(err instanceof Error ? err.message : "recording failed");
        setPhase("done");
      }
    })();
  }, [phase, transferConfirmed, distributorAddress, nodeId, deployTx]);

  // Surface wallet/receipt errors into the coarse phase.
  useEffect(() => {
    const wallet =
      deployError ??
      deployReceiptError ??
      transferError ??
      transferReceiptError;
    if (wallet && phase !== "error" && phase !== "done") {
      setError(wallet.message || "wallet transaction failed");
      setPhase("error");
    }
  }, [
    deployError,
    deployReceiptError,
    transferError,
    transferReceiptError,
    phase,
  ]);

  const reset = useCallback(() => {
    resetDeploy();
    resetTransfer();
    setDistributorAddress(null);
    setPrUrl(null);
    setRecordError(null);
    setError(null);
    setPhase("idle");
  }, [resetDeploy, resetTransfer]);

  return {
    phase,
    distributorAddress,
    deployTx,
    transferTx,
    prUrl,
    recordError,
    error,
    deploy,
    reset,
  };
}
