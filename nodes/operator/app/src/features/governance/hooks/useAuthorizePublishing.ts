// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/hooks/useAuthorizePublishing`
 * Purpose: Owner-wallet state machine for the ONE-TIME, SCOPED "Authorize publishing" step of node
 *   distribution setup. It grants the owner's wallet standing (but scoped) authority to publish THIS
 *   node's distributions — and nothing else — so every subsequent per-epoch publish is a single direct
 *   `DAO.execute` with NO vote. Two wallet transactions:
 *     1. DEPLOY `DistributionPublishCondition(token, distributor)` — a tiny per-node permission
 *        condition whose `isGranted` returns true ONLY for an atomic compare-and-swap publish.
 *        Capture its address from the deploy receipt.
 *     2. GOVERNANCE PROPOSAL: `plugin.createProposal([DAO.grantWithCondition(DAO, wallet,
 *        EXECUTE_PERMISSION, condition)], 0, 0, 0, Yes, tryEarlyExecution)`. On a 100%-owner
 *        EarlyExecution DAO this auto-executes, giving the wallet the SCOPED standing grant. This IS
 *        a governance proposal — honest, and labeled as such by the caller; never an unconditional
 *        EXECUTE grant (even a compromised executor key can only publish, never drain the treasury).
 * Scope: Client-side wagmi wiring extracted from `ExecuteDistributionPanel` so BOTH the per-epoch
 *   publish panel and the node-page setup sequence can drive the same authorize flow. Reads no secrets;
 *   the connected wallet signs every transaction. Does NOT declare activation complete — the caller
 *   re-reads paired `hasPermission` probes and only the terminal record route may mark the node active.
 * Invariants:
 *   - AUTHORIZE_IS_A_PROPOSAL: the grant is wrapped in createProposal(Yes, tryEarlyExecution); it is a
 *     governance action, never "executed".
 *   - SCOPED_GRANT: always `grantWithCondition` bound to the deployed condition — never a bare `grant`.
 *   - WALLET_SIGNS: deploy + proposal are both signed by the connected wallet, never the operator.
 *   - ADDRESSES_ONLY: no token math — every value is an address/hash/bytes.
 * Side-effects: blockchain writes (condition deploy tx; createProposal-with-grant tx).
 * Links: nodes/operator/app/src/features/governance/lib/proposal-abis.ts,
 *   nodes/operator/app/src/features/governance/components/ExecuteDistributionPanel.tsx,
 *   nodes/operator/app/src/features/nodes/DistributionsCard.client.tsx,
 *   packages/cogni-contracts/src/distribution-publish-condition/{abi,bytecode}.ts
 * @public
 */

"use client";

import {
  DISTRIBUTION_PUBLISH_CONDITION_ABI,
  DISTRIBUTION_PUBLISH_CONDITION_BYTECODE,
} from "@cogni/cogni-contracts";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import {
  useAccount,
  useDeployContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import {
  DAO_ABI,
  EXECUTE_PERMISSION_ID,
  TOKEN_VOTING_ABI,
} from "@/features/governance/lib/proposal-abis";

/** Aragon IMajorityVoting.VoteOption: None=0, Abstain=1, Yes=2, No=3. */
const VOTE_OPTION_YES = 2;

/** Coarse phase of the deploy-condition → grant-proposal pipeline. */
export type AuthorizePublishingPhase =
  | "idle"
  | "deploying" // condition deploy tx submitted, awaiting receipt (→ condition address)
  | "granting" // grantWithCondition proposal submitted, awaiting receipt
  | "done" // grant proposal confirmed (EarlyExecution auto-executed the grant)
  | "error";

export interface AuthorizePublishingInput {
  /** The node's GovernanceERC20 token (condition ctor arg 0). */
  readonly token: `0x${string}`;
  /** The CumulativeMerkleDistributor for this node (condition ctor arg 1). */
  readonly distributor: `0x${string}`;
  /** The node DAO the grant targets (_where AND grant subject). */
  readonly dao: `0x${string}`;
  /** The node's Aragon TokenVoting plugin — createProposal is sent here. */
  readonly plugin: `0x${string}`;
  /** The connected owner wallet that signs + receives the scoped grant (_who). */
  readonly wallet: `0x${string}`;
}

export interface AuthorizePublishingResult {
  readonly phase: AuthorizePublishingPhase;
  /** The deployed condition address (from the deploy receipt), once available. */
  readonly conditionAddress: `0x${string}` | null;
  /** Condition-deploy tx hash (for an explorer link). */
  readonly deployTx: `0x${string}` | undefined;
  /** createProposal (grant) tx hash (for an explorer link). */
  readonly grantTx: `0x${string}` | undefined;
  readonly error: Error | null;
  /** Kick off the flow: deploy the scoped condition, then the grant proposal. */
  readonly authorize: () => void;
  readonly reset: () => void;
}

/**
 * Drive the one-time, scoped authorize-publishing flow for one node. `token`/`distributor`/`dao`/
 * `plugin`/`wallet` are all required up front (the caller gates the button on their presence). The
 * caller owns `hasPermission` and should re-read it when `phase === "done"` so its UI advances.
 */
export function useAuthorizePublishing(
  input: AuthorizePublishingInput
): AuthorizePublishingResult {
  const { token, distributor, dao, plugin, wallet } = input;
  const { address: account } = useAccount();
  const [phase, setPhase] = useState<AuthorizePublishingPhase>("idle");

  // Step 1: deploy the scoped condition contract from the connected wallet.
  const {
    deployContract,
    data: deployTx,
    error: deployError,
    reset: resetDeploy,
  } = useDeployContract();
  const { data: deployReceipt, error: deployReceiptError } =
    useWaitForTransactionReceipt({ hash: deployTx });
  const conditionAddress = deployReceipt?.contractAddress ?? null;

  // Step 2: the grantWithCondition governance proposal, bound to the deployed condition.
  const {
    writeContract,
    data: grantTx,
    error: grantError,
    reset: resetGrant,
  } = useWriteContract();
  const { data: grantReceipt, error: grantReceiptError } =
    useWaitForTransactionReceipt({ hash: grantTx });

  const authorize = useCallback(() => {
    if (!account) {
      setPhase("error");
      return;
    }
    setPhase("deploying");
    deployContract({
      abi: DISTRIBUTION_PUBLISH_CONDITION_ABI,
      bytecode: DISTRIBUTION_PUBLISH_CONDITION_BYTECODE,
      args: [token, distributor],
      account,
    });
  }, [account, deployContract, token, distributor]);

  // Condition deployed → submit the grantWithCondition proposal. The grant executes AS the DAO
  // (msg.sender=DAO) inside the proposal: DAO.grantWithCondition(_where=DAO, _who=wallet,
  // EXECUTE_PERMISSION, _condition=condition), wrapped in createProposal(Yes, tryEarlyExecution).
  useEffect(() => {
    if (phase !== "deploying" || !deployReceipt) return;
    // A mined-but-REVERTED condition deploy resolves without throwing — never advance it.
    if (deployReceipt.status !== "success" || !conditionAddress) {
      setPhase("error");
      return;
    }
    setPhase("granting");
    const grantData = encodeFunctionData({
      abi: DAO_ABI,
      functionName: "grantWithCondition",
      args: [dao, wallet, EXECUTE_PERMISSION_ID, conditionAddress],
    });
    const grantAction = { to: dao, value: 0n, data: grantData } as const;
    writeContract({
      abi: TOKEN_VOTING_ABI,
      address: plugin,
      functionName: "createProposal",
      args: [
        "0x", // _metadata
        [grantAction], // _actions
        0n, // _allowFailureMap
        0n, // _startDate (0 ⇒ plugin derives)
        0n, // _endDate (0 ⇒ plugin derives; EarlyExecution bypasses minDuration)
        VOTE_OPTION_YES, // _voteOption
        true, // _tryEarlyExecution
      ],
      account: wallet,
      // EXPLICIT GAS — do NOT let the wallet gas-estimate this tx. createProposal with
      // _tryEarlyExecution executes the grant in the SAME tx (a nested DAO.execute); many
      // wallets' estimators mis-predict that nested call as "likely to fail" and then refuse
      // to broadcast even when the user confirms (the tx never reaches the chain, UI hangs).
      // The call is proven to succeed on a Base fork; a fixed generous limit lets it submit.
      gas: 3_000_000n,
    });
  }, [
    phase,
    deployReceipt,
    conditionAddress,
    dao,
    wallet,
    plugin,
    writeContract,
  ]);

  // Grant proposal confirmed → transaction done. This is not activation success: the caller must
  // still prove the new condition with paired on-chain permission probes before recording active.
  useEffect(() => {
    if (phase !== "granting" || !grantReceipt) return;
    setPhase(grantReceipt.status === "success" ? "done" : "error");
  }, [phase, grantReceipt]);

  // Surface wallet/receipt errors into the coarse phase.
  useEffect(() => {
    const wallet =
      deployError ?? deployReceiptError ?? grantError ?? grantReceiptError;
    if (wallet && phase !== "error" && phase !== "done") {
      setPhase("error");
    }
  }, [deployError, deployReceiptError, grantError, grantReceiptError, phase]);

  const reset = useCallback(() => {
    resetDeploy();
    resetGrant();
    setPhase("idle");
  }, [resetDeploy, resetGrant]);

  const error = (deployError ??
    deployReceiptError ??
    grantError ??
    grantReceiptError ??
    null) as Error | null;

  return {
    phase,
    conditionAddress,
    deployTx,
    grantTx,
    error,
    authorize,
    reset,
  };
}
