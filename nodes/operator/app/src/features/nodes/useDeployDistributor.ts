// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/useDeployDistributor`
 * Purpose: Owner-wallet state machine that deploys the vendored `CumulativeMerkleDistributor(token)`,
 *   then transfers its ownership to the node DAO. Recording happens only after CAS authorization
 *   is independently verified by the final activation step.
 *   Also exports `useDistributorOnChain` — the READ-side chain truth for an already-known
 *   distributor address (`owner()==DAO`, `token()==token`), so the setup stepper derives the
 *   deploy step from ground truth instead of session state (story.5004).
 * Scope: Client-side wagmi wiring for `DistributionsCard.client`. Does NOT deploy from the server and
 *   does NOT hold any secret — the connected wallet signs every transaction.
 * Invariants:
 *   - WALLET_DEPLOYS: the distributor is deployed + transferred by the OWNER'S wallet, never the
 *     operator. Constructor arg is the node token; ownership is transferred to the DAO.
 *   - DEPLOY_DOES_NOT_ACTIVATE: this hook never writes the repo-spec. A transferred distributor is
 *     necessary but insufficient; CAS publishing authorization must be verified before activation.
 *   - CHAIN_GATED: the caller gates the button on the connected chain matching the node chain (Base
 *     mainnet 8453 for toks2); this hook assumes the wallet is already on-chain.
 *   - ADDRESSES_ONLY: no token math — every value is an address/hash/bytes.
 * Side-effects: blockchain writes (deploy tx + transferOwnership tx via wallet).
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
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

/** Coarse phase of the deploy → transfer-ownership pipeline. */
export type DeployDistributorPhase =
  | "idle"
  | "deploying" // deploy tx submitted, awaiting receipt (→ contractAddress)
  | "transferring" // transferOwnership(DAO) tx submitted, awaiting receipt
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
  readonly error: string | null;
  /** Kick off the flow: deploy `CumulativeMerkleDistributor(token)`. */
  readonly deploy: () => void;
  readonly reset: () => void;
}

/**
 * Drive the owner-wallet distributor-deploy flow for one node.
 *
 * @param tokenAddress the node's GovernanceERC20 (constructor arg).
 * @param daoAddress the DAO that receives ownership.
 */
export function useDeployDistributor(
  tokenAddress: `0x${string}`,
  daoAddress: `0x${string}`
): DeployDistributorResult {
  const { address: account } = useAccount();
  const [phase, setPhase] = useState<DeployDistributorPhase>("idle");
  const [distributorAddress, setDistributorAddress] = useState<
    `0x${string}` | null
  >(null);
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
  const { data: transferReceipt, error: transferReceiptError } =
    useWaitForTransactionReceipt({ hash: transferTx });

  const deploy = useCallback(() => {
    if (!account) {
      setError("Connect your wallet to deploy the distributor.");
      setPhase("error");
      return;
    }
    setError(null);
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
    // A mined-but-REVERTED deploy still yields a receipt — never treat it as success.
    if (deployReceipt.status !== "success") {
      setError("Distributor deploy transaction reverted on-chain.");
      setPhase("error");
      return;
    }
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

  // transferOwnership confirmed → deployment plane is complete. Activation remains pending until
  // the separate authorization plane is verified and the terminal record step succeeds.
  useEffect(() => {
    if (phase !== "transferring" || !transferReceipt || !distributorAddress) {
      return;
    }
    // A mined-but-REVERTED transferOwnership must not advance to record — the DAO
    // would not actually own the distributor.
    if (transferReceipt.status !== "success") {
      setError("transferOwnership transaction reverted on-chain.");
      setPhase("error");
      return;
    }
    setPhase("done");
  }, [phase, transferReceipt, distributorAddress]);

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
    setError(null);
    setPhase("idle");
  }, [resetDeploy, resetTransfer]);

  return {
    phase,
    distributorAddress,
    deployTx,
    transferTx,
    error,
    deploy,
    reset,
  };
}

/** Chain-read verdict for a known distributor address. */
export interface DistributorOnChainState {
  /**
   * `idle` = no address to check; `loading` = reads in flight; `verified` = owner()==DAO AND
   * token()==node token; `mismatch` = reads succeeded but the invariants DON'T hold (redeploy —
   * never record/authorize against it); `unavailable` = reads failed (RPC hiccup) → make no claim.
   */
  readonly status: "idle" | "loading" | "verified" | "mismatch" | "unavailable";
  readonly owner: `0x${string}` | null;
  readonly token: `0x${string}` | null;
}

/**
 * READ-side plane-1 ground truth: verify an already-known distributor address on-chain
 * (`owner()==DAO`, `token()==token`). Pure view calls — no wallet, no writes. The setup stepper
 * uses this so a refreshed page re-derives "deployed" from the chain, not from session state.
 */
export function useDistributorOnChain(params: {
  distributorAddress: `0x${string}` | null;
  daoAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  chainId: number;
}): DistributorOnChainState {
  const { distributorAddress, daoAddress, tokenAddress, chainId } = params;
  const enabled = distributorAddress !== null;
  const address =
    distributorAddress ?? "0x0000000000000000000000000000000000000000";

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
        address,
        functionName: "owner",
        chainId,
      },
      {
        abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
        address,
        functionName: "token",
        chainId,
      },
    ],
    query: { enabled },
  });

  if (!enabled) return { status: "idle", owner: null, token: null };
  if (isLoading) return { status: "loading", owner: null, token: null };

  const ownerResult = data?.[0];
  const tokenResult = data?.[1];
  const owner =
    ownerResult?.status === "success" && typeof ownerResult.result === "string"
      ? (ownerResult.result as `0x${string}`)
      : null;
  const token =
    tokenResult?.status === "success" && typeof tokenResult.result === "string"
      ? (tokenResult.result as `0x${string}`)
      : null;

  if (error || owner === null || token === null) {
    return { status: "unavailable", owner, token };
  }
  const verified =
    owner.toLowerCase() === daoAddress.toLowerCase() &&
    token.toLowerCase() === tokenAddress.toLowerCase();
  return { status: verified ? "verified" : "mismatch", owner, token };
}
