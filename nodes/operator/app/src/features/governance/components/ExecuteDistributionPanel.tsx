"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/ExecuteDistributionPanel`
 * Purpose: Node-owner PUBLISH surface on the finalized-epoch governance view. It replaces the old
 *   per-epoch DAO-vote (a dead-end that made every publish a fresh governance proposal) with a
 *   TWO-STATE flow gated on the executor wallet's on-chain EXECUTE_PERMISSION:
 *     1. AUTHORIZE (one-time, per node, SCOPED): if the wallet lacks EXECUTE_PERMISSION, (a) deploy
 *        `DistributionPublishCondition(token, distributor)` from the wallet, then (b) submit ONE Aragon
 *        TokenVoting proposal carrying a single action —
 *        `DAO.grantWithCondition(DAO, wallet, EXECUTE_PERMISSION, condition)` — with a Yes vote +
 *        tryEarlyExecution. On a 100%-owner EarlyExecution DAO this auto-executes, giving the wallet a
 *        SCOPED standing grant (publish this node's distributions and NOTHING else, enforced on-chain by
 *        the condition). A governance proposal, and we say so. Never an unconditional EXECUTE grant.
 *     2. PUBLISH (every epoch, NO vote): once authorized, call the DAO DIRECTLY —
 *        `DAO.execute(callId, [mint, setMerkleRoot], 0)` — one transaction, no proposal.
 * Scope: Client component. Fetch the publish payload (useExecuteDistribution) + read hasPermission
 *   (useHasExecutePermission) → wagmi useWriteContract. Connect-wallet + chain(chainId) gating, mint +
 *   root preview, tx hash + explorer link, success state. Does NOT perform DB access; the fold/worker
 *   NEVER sends these txs — this surface serves what R3 built and the wallet publishes.
 * Invariants:
 *   - PERMISSION_GATES_UI: read DAO.hasPermission(DAO, wallet, EXECUTE_PERMISSION, "0x"); NOT granted ⇒
 *     authorize step, granted ⇒ publish step. Re-read after the authorize tx confirms so UI advances.
 *   - AUTHORIZE_IS_A_PROPOSAL: the grant is wrapped in createProposal(Yes, tryEarlyExecution) — an
 *     honest governance action, labeled as such; never called "executed".
 *   - PUBLISH_IS_DIRECT_EXECUTE: per-epoch publish is DAO.execute([mint,setRoot],0) — a direct call,
 *     no vote; labeled as such.
 *   - TWO_ACTIONS_ORDERED: [0] token.mint(distributor, mintDelta) then [1] distributor.setMerkleRoot(root),
 *     built identically to before, both run as msg.sender=DAO (DAO holds MINT + owns the distributor).
 *   - ALL_MATH_BIGINT: mintDelta stays bigint (BigInt(payload.mintDelta)); formatted only at display.
 *   - VERIFIED_ABI: createProposal uses TOKEN_VOTING_ABI (Aragon OSx v1.3, selector 0x9cba3021);
 *     grant/execute/hasPermission use DAO_ABI (Aragon OSx v1.3 IDAO).
 *   - PUBLIC_NO_SECRETS: all inputs come from the authed payload route + the connected wallet.
 * Side-effects: blockchain writes (createProposal-with-grant tx; direct DAO.execute tx).
 * Links: nodes/operator/app/src/features/governance/hooks/useExecuteDistribution.ts,
 *   nodes/operator/app/src/features/governance/lib/proposal-abis.ts,
 *   packages/cogni-contracts/src/cumulative-merkle-distributor/abi.ts
 * @public
 */

import {
  CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
  DISTRIBUTION_PUBLISH_CONDITION_ABI,
  DISTRIBUTION_PUBLISH_CONDITION_BYTECODE,
} from "@cogni/cogni-contracts";
import { getTransactionExplorerUrl } from "@cogni/node-shared";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { encodeFunctionData, keccak256, parseAbi, toBytes } from "viem";
import {
  useAccount,
  useChainId,
  useDeployContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  WalletConnectButton,
} from "@/components";
import {
  type ExecuteDistributionPayload,
  useExecuteDistribution,
  useHasExecutePermission,
} from "@/features/governance/hooks/useExecuteDistribution";
import {
  DAO_ABI,
  EXECUTE_PERMISSION_ID,
  TOKEN_VOTING_ABI,
} from "@/features/governance/lib/proposal-abis";
import { getChainName } from "@/features/governance/lib/proposal-utils";

/** Minimal GovernanceERC20 mint ABI (DAO holds MINT_PERMISSION on the token). */
const TOKEN_MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

/** Aragon IMajorityVoting.VoteOption: None=0, Abstain=1, Yes=2, No=3. */
const VOTE_OPTION_YES = 2;

/** Deterministic per-epoch callId for DAO.execute — cosmetic (uniqueness only). */
function publishCallId(epochId: string): `0x${string}` {
  return keccak256(toBytes(`cogni.publish.${epochId}`));
}

export function ExecuteDistributionPanel({
  nodeId,
  epochId,
}: {
  /** Node UUID or slug — the authed execute-payload route resolves either. */
  nodeId: string;
  /** Finalized epoch id (decimal string). */
  epochId: string;
}) {
  const { payload, notReady, isLoading, error } = useExecuteDistribution(
    nodeId,
    epochId
  );

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>Publish distribution</CardTitle>
        <CardDescription>
          Mint this epoch&apos;s tokens into the distributor and publish the new
          claim root. Grant your wallet standing publish authority once, then
          every epoch publishes in a single transaction with no vote.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading distribution payload&hellip;
          </p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load the distribution</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : notReady || !payload ? (
          <NotReadyNotice reason={notReady} />
        ) : (
          <PublishBody payload={payload} />
        )}
      </CardContent>
    </Card>
  );
}

function NotReadyNotice({ reason }: { reason: string | null }) {
  const copy: Record<string, { title: string; body: string }> = {
    epoch_not_finalized: {
      title: "Epoch not finalized yet",
      body: "Finalize this epoch before executing its distribution.",
    },
    no_distribution_manifest: {
      title: "No distribution built yet",
      body: "The cumulative manifest for this epoch hasn't been persisted yet.",
    },
    distributor_not_recorded: {
      title: "Distributor not recorded",
      body: "Activate distributions so the distributor address is on record, then retry.",
    },
    node_missing_governance: {
      title: "Governance not configured",
      body: "This node is missing its DAO or voting-plugin address.",
    },
    negative_mint_delta: {
      title: "Nothing to mint",
      body: "This epoch's cumulative total does not increase over the prior distribution.",
    },
  };
  const { title, body } = copy[reason ?? ""] ?? {
    title: "Not ready to execute",
    body: "This distribution can't be executed yet.",
  };
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

/**
 * Two-state publish body. Reads the wallet's on-chain EXECUTE_PERMISSION and branches:
 * NOT authorized ⇒ the one-time AuthorizeStep (a governance proposal); authorized ⇒ the
 * per-epoch PublishStep (a direct DAO.execute). Connect-wallet + chain gating live here so
 * both steps share them.
 */
function PublishBody({ payload }: { payload: ExecuteDistributionPayload }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const mintDelta = useMemo(
    () => BigInt(payload.mintDelta),
    [payload.mintDelta]
  );
  const isCorrectChain = chainId === payload.chainId;
  const chainName = getChainName(payload.chainId);

  // PERMISSION_GATES_UI: does the connected wallet already hold EXECUTE_PERMISSION on the DAO?
  const {
    hasPermission,
    isLoading: isPermLoading,
    refetch: refetchPermission,
  } = useHasExecutePermission({
    daoAddress: payload.daoAddress,
    wallet: address,
    chainId: payload.chainId,
  });

  if (!isConnected || !address) {
    return (
      <div className="space-y-4">
        <DistributionSummary
          mintDelta={mintDelta}
          merkleRoot={payload.merkleRoot}
          chainName={chainName}
        />
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Connect the node owner wallet to publish this distribution.
          </p>
          <WalletConnectButton />
        </div>
      </div>
    );
  }

  if (!isCorrectChain) {
    return (
      <div className="space-y-5">
        <DistributionSummary
          mintDelta={mintDelta}
          merkleRoot={payload.merkleRoot}
          chainName={chainName}
        />
        <Button
          variant="outline"
          onClick={() => switchChain?.({ chainId: payload.chainId })}
        >
          Switch to {chainName}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DistributionSummary
        mintDelta={mintDelta}
        merkleRoot={payload.merkleRoot}
        chainName={chainName}
      />

      {hasPermission === undefined ? (
        <p className="text-muted-foreground text-sm">
          {isPermLoading
            ? "Checking your publish authority…"
            : "Reading your publish authority…"}
        </p>
      ) : hasPermission ? (
        <PublishStep
          payload={payload}
          mintDelta={mintDelta}
          address={address}
          chainName={chainName}
        />
      ) : (
        <AuthorizeStep
          payload={payload}
          address={address}
          chainName={chainName}
          onAuthorized={refetchPermission}
        />
      )}
    </div>
  );
}

/**
 * ONE-TIME AUTHORIZE — SCOPED (multi-member-safe). Two wallet txs:
 *   1. DEPLOY `DistributionPublishCondition(token, distributor)` — a tiny per-node contract
 *      whose isGranted returns true ONLY for the exact publish action set. Capture its address
 *      from the deploy receipt.
 *   2. GOVERNANCE PROPOSAL: createProposal(Yes, tryEarlyExecution) carrying a single
 *      `DAO.grantWithCondition(DAO, wallet, EXECUTE_PERMISSION, condition)` action. On a
 *      100%-owner EarlyExecution DAO this auto-executes, giving the wallet a SCOPED standing
 *      grant — it may publish this node's distributions and NOTHING else (enforced on-chain).
 * Never an unconditional EXECUTE grant: even a compromised executor key can only publish,
 * never drain the treasury or re-permission. After the grant confirms we re-read hasPermission
 * so the UI advances to Publish.
 */
function AuthorizeStep({
  payload,
  address,
  chainName,
  onAuthorized,
}: {
  payload: ExecuteDistributionPayload;
  address: `0x${string}`;
  chainName: string;
  onAuthorized: () => void;
}) {
  // Step 1: deploy the scoped condition contract from the connected wallet.
  const {
    deployContract,
    data: deployTx,
    isPending: isDeploying,
    error: deployError,
  } = useDeployContract();
  const { data: deployReceipt, isLoading: isDeployConfirming } =
    useWaitForTransactionReceipt({ hash: deployTx });
  const conditionAddress = deployReceipt?.contractAddress ?? null;

  // Step 2: the one-time governance grant, bound to the deployed condition.
  const {
    writeContract,
    isPending: isGranting,
    error: grantError,
    data: grantTx,
  } = useWriteContract();
  const { isLoading: isGrantConfirming, isSuccess: isGranted } =
    useWaitForTransactionReceipt({ hash: grantTx });

  // Re-read on-chain permission the moment the grant confirms so the UI advances to Publish.
  useEffect(() => {
    if (isGranted) onAuthorized();
  }, [isGranted, onAuthorized]);

  // Once the condition is deployed, submit the grantWithCondition proposal.
  useEffect(() => {
    if (!conditionAddress || grantTx || isGranting) return;
    // grantWithCondition executes AS the DAO (msg.sender=DAO) inside the proposal:
    //   DAO.grantWithCondition(_where=DAO, _who=wallet, EXECUTE_PERMISSION, _condition=condition).
    const grantData = encodeFunctionData({
      abi: DAO_ABI,
      functionName: "grantWithCondition",
      args: [
        payload.daoAddress,
        address,
        EXECUTE_PERMISSION_ID,
        conditionAddress,
      ],
    });
    const grantAction = {
      to: payload.daoAddress,
      value: 0n,
      data: grantData,
    } as const;

    // Same createProposal ABI the publish surface always used (OSx 1.3, selector 0x9cba3021):
    // Yes vote + tryEarlyExecution ⇒ on a 100%-owner EarlyExecution DAO this auto-executes.
    writeContract({
      abi: TOKEN_VOTING_ABI,
      address: payload.pluginAddress,
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
      account: address,
    });
  }, [
    conditionAddress,
    grantTx,
    isGranting,
    address,
    payload.daoAddress,
    payload.pluginAddress,
    writeContract,
  ]);

  const onAuthorize = useCallback(() => {
    deployContract({
      abi: DISTRIBUTION_PUBLISH_CONDITION_ABI,
      bytecode: DISTRIBUTION_PUBLISH_CONDITION_BYTECODE,
      args: [payload.tokenAddress, payload.distributorAddress],
      account: address,
    });
  }, [
    deployContract,
    payload.tokenAddress,
    payload.distributorAddress,
    address,
  ]);

  const explorerTx = grantTx ?? deployTx;
  const explorerUrl = explorerTx
    ? getTransactionExplorerUrl(payload.chainId, explorerTx)
    : null;
  const busy =
    isDeploying || isDeployConfirming || isGranting || isGrantConfirming;
  const buttonLabel = isDeploying
    ? "Confirm in wallet…"
    : isDeployConfirming
      ? "Deploying condition…"
      : isGranting
        ? "Confirm grant in wallet…"
        : isGrantConfirming
          ? "Authorizing…"
          : "Authorize publishing";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="font-medium text-sm">
          Step 1 · Authorize publishing (one-time, scoped)
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          Grants your wallet permission to publish THIS node&apos;s
          distributions and nothing else (enforced on-chain by a condition
          contract); it is a governance proposal. Runs as two transactions —
          deploy the scoped condition, then the grant — never repeated. After
          this, each epoch publishes in a single transaction with no vote.
        </p>
      </div>

      <Button onClick={onAuthorize} disabled={busy}>
        {buttonLabel}
      </Button>

      {explorerUrl && busy && (
        <p className="text-muted-foreground text-sm">
          <TxLink url={explorerUrl}>
            {grantTx ? "View proposal transaction" : "View deploy transaction"}
          </TxLink>
        </p>
      )}

      {isGranted && (
        <Alert>
          <AlertTitle>Publishing authorized</AlertTitle>
          <AlertDescription>
            Your wallet now holds scoped authority to publish on {chainName} —
            this node&apos;s distributions and nothing else. You can publish
            this epoch below — no vote.{" "}
            {explorerUrl && <TxLink url={explorerUrl}>View transaction</TxLink>}
          </AlertDescription>
        </Alert>
      )}

      <WriteErrorAlert
        error={deployError ?? grantError}
        title="Authorization failed"
      />
    </div>
  );
}

/**
 * PER-EPOCH PUBLISH — a direct execute, NO vote. Calls the DAO directly:
 *   DAO.execute(callId, [mint(distributor, delta), setMerkleRoot(root)], 0)
 * runnable because the wallet holds EXECUTE_PERMISSION. Both actions run as msg.sender=DAO.
 */
function PublishStep({
  payload,
  mintDelta,
  address,
  chainName,
}: {
  payload: ExecuteDistributionPayload;
  mintDelta: bigint;
  address: `0x${string}`;
  chainName: string;
}) {
  const {
    writeContract,
    isPending,
    error: writeError,
    data: txHash,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const explorerUrl = txHash
    ? getTransactionExplorerUrl(payload.chainId, txHash)
    : null;

  // TWO_ACTIONS_ORDERED: [0] mint the delta into the distributor, then [1] set the
  // new cumulative root. Built identically to before; run as msg.sender=DAO on execute.
  const actions = useMemo(() => {
    const mintData = encodeFunctionData({
      abi: TOKEN_MINT_ABI,
      functionName: "mint",
      args: [payload.distributorAddress, mintDelta],
    });
    const setRootData = encodeFunctionData({
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      functionName: "setMerkleRoot",
      args: [payload.merkleRoot],
    });
    return [
      { to: payload.tokenAddress, value: 0n, data: mintData },
      { to: payload.distributorAddress, value: 0n, data: setRootData },
    ] as const;
  }, [payload, mintDelta]);

  const onPublish = useCallback(() => {
    // PUBLISH_IS_DIRECT_EXECUTE: no proposal, no vote — a single DAO.execute call.
    writeContract({
      abi: DAO_ABI,
      address: payload.daoAddress,
      functionName: "execute",
      args: [publishCallId(payload.epochId), actions, 0n],
      account: address,
    });
  }, [actions, address, payload.daoAddress, payload.epochId, writeContract]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="font-medium text-sm">Publish distribution</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Mints this epoch&apos;s tokens into the distributor and publishes the
          new claim root — one transaction, no vote.
        </p>
      </div>

      <Button onClick={onPublish} disabled={isPending || isConfirming}>
        {isPending
          ? "Confirm in wallet…"
          : isConfirming
            ? "Publishing…"
            : "Publish distribution"}
      </Button>

      {explorerUrl && (isPending || isConfirming) && (
        <p className="text-muted-foreground text-sm">
          <TxLink url={explorerUrl}>View transaction</TxLink>
        </p>
      )}

      {isConfirmed && (
        <Alert>
          <AlertTitle>Distribution published</AlertTitle>
          <AlertDescription>
            The mint + new claim root are live on {chainName}.{" "}
            {explorerUrl && <TxLink url={explorerUrl}>View transaction</TxLink>}
          </AlertDescription>
        </Alert>
      )}

      <WriteErrorAlert error={writeError} title="Publish failed" />
    </div>
  );
}

/** Shared Basescan/explorer link. */
function TxLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

/** Shared write-error alert with friendly copy for the common wallet failures. */
function WriteErrorAlert({
  error,
  title,
}: {
  error: Error | null;
  title: string;
}) {
  if (!error) return null;
  const message = error.message?.includes("User rejected")
    ? "Transaction cancelled."
    : error.message?.includes("insufficient funds")
      ? "Insufficient funds for gas."
      : (error.message ?? "Unknown error");
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function DistributionSummary({
  mintDelta,
  merkleRoot,
  chainName,
}: {
  mintDelta: bigint;
  merkleRoot: string;
  chainName: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-muted-foreground text-sm">Minting this epoch</p>
      <p className="font-bold text-2xl tracking-tight">
        {formatAmount(mintDelta)}
      </p>
      <dl className="mt-3 space-y-1 text-muted-foreground text-sm">
        <div className="flex justify-between gap-4">
          <dt>New claim root</dt>
          <dd className="truncate font-mono" title={merkleRoot}>
            {shortenHash(merkleRoot)}
          </dd>
        </div>
        {chainName && (
          <div className="flex justify-between gap-4">
            <dt>Network</dt>
            <dd>{chainName}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Format an 18-decimal base-unit amount for display, trimming trailing zeros. */
function formatAmount(base: bigint): string {
  const DECIMALS = 18n;
  const divisor = 10n ** DECIMALS;
  const whole = base / divisor;
  const frac = base % divisor;
  if (frac === 0n) return `${whole.toLocaleString()} tokens`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)} tokens`;
}

/** 0x1234…abcd for a 32-byte hash. */
function shortenHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}
