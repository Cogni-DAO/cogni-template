"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/ExecuteDistributionPanel`
 * Purpose: Node-owner PER-EPOCH PUBLISH surface on the finalized-epoch governance view. Publishing is
 *   a SINGLE clean action — once the node is set up, each epoch publishes in one transaction with NO
 *   vote: the wallet calls the DAO DIRECTLY, `DAO.execute(callId, [mint, setMerkleRoot], 0)`. There is
 *   no authorize step here anymore — the one-time SCOPED grant ("Authorize publishing") lives in the
 *   node-page distribution SETUP sequence (`DistributionsCard`). This panel only PUBLISHES.
 * Scope: Client component. Fetch the publish payload (useExecuteDistribution) + read hasPermission
 *   (useHasExecutePermission) → wagmi useWriteContract. Connect-wallet + chain(chainId) gating, mint +
 *   root preview, tx hash + explorer link, success state. Does NOT perform DB access; the fold/worker
 *   NEVER sends these txs — this surface serves what R3 built and the wallet publishes.
 * Invariants:
 *   - PUBLISH_IS_DIRECT_EXECUTE: per-epoch publish is DAO.execute([mint,setRoot],0) — a direct call,
 *     one transaction, no vote; labeled as such. Never called a "proposal".
 *   - SETUP_GATES_PUBLISH: read DAO.hasPermission(DAO, wallet, EXECUTE_PERMISSION, "0x"). NOT granted ⇒
 *     do NOT offer authorize here; show a quiet "finish distribution setup on the node page" notice.
 *     Granted ⇒ the single "Publish distribution" button. The authorize governance step lives on the
 *     node page, never here.
 *   - TWO_ACTIONS_ORDERED: [0] token.mint(distributor, mintDelta) then [1] distributor.setMerkleRoot(root),
 *     both run as msg.sender=DAO (DAO holds MINT + owns the distributor).
 *   - ALL_MATH_BIGINT: mintDelta stays bigint (BigInt(payload.mintDelta)); formatted only at display.
 *   - VERIFIED_ABI: execute/hasPermission use DAO_ABI (Aragon OSx v1.3 IDAO).
 *   - PUBLIC_NO_SECRETS: all inputs come from the authed payload route + the connected wallet.
 * Side-effects: blockchain writes (direct DAO.execute tx).
 * Links: nodes/operator/app/src/features/governance/hooks/useExecuteDistribution.ts,
 *   nodes/operator/app/src/features/nodes/DistributionsCard.client.tsx (the setup/authorize home),
 *   nodes/operator/app/src/features/governance/lib/proposal-abis.ts,
 *   packages/cogni-contracts/src/cumulative-merkle-distributor/abi.ts
 * @public
 */

import { CUMULATIVE_MERKLE_DISTRIBUTOR_ABI } from "@cogni/cogni-contracts";
import { getTransactionExplorerUrl } from "@cogni/node-shared";
import Link from "next/link";
import { type ReactNode, useCallback, useMemo } from "react";
import { encodeFunctionData, keccak256, parseAbi, toBytes } from "viem";
import {
  useAccount,
  useChainId,
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
import { DAO_ABI } from "@/features/governance/lib/proposal-abis";
import { getChainName } from "@/features/governance/lib/proposal-utils";

/** Minimal GovernanceERC20 mint ABI (DAO holds MINT_PERMISSION on the token). */
const TOKEN_MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

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
          claim root — one transaction, no vote. (One-time setup happens on the
          node page.)
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
          <PublishBody nodeId={nodeId} payload={payload} />
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
 * Publish body. Reads the wallet's on-chain EXECUTE_PERMISSION and gates:
 * NOT authorized ⇒ a quiet "finish setup on the node page" notice (this panel never offers the
 * authorize governance step); authorized ⇒ the per-epoch direct `DAO.execute` publish. Connect-wallet
 * + chain gating live here.
 */
function PublishBody({
  nodeId,
  payload,
}: {
  nodeId: string;
  payload: ExecuteDistributionPayload;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const mintDelta = useMemo(
    () => BigInt(payload.mintDelta),
    [payload.mintDelta]
  );
  const isCorrectChain = chainId === payload.chainId;
  const chainName = getChainName(payload.chainId);

  // SETUP_GATES_PUBLISH: does the connected wallet already hold EXECUTE_PERMISSION on the DAO?
  const { hasPermission, isLoading: isPermLoading } = useHasExecutePermission({
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
        <SetupNeededNotice nodeId={nodeId} />
      )}
    </div>
  );
}

/**
 * Quiet notice shown when the wallet is NOT yet authorized to publish. The authorize governance step
 * is deliberately NOT offered here — it belongs to the one-time distribution SETUP on the node page.
 */
function SetupNeededNotice({ nodeId }: { nodeId: string }) {
  return (
    <Alert>
      <AlertTitle>Finish distribution setup first</AlertTitle>
      <AlertDescription>
        Your wallet isn&apos;t authorized to publish yet. Complete the one-time
        &ldquo;Authorize publishing&rdquo; step in distribution setup{" "}
        <Link
          href={`/nodes/${nodeId}`}
          className="underline transition-colors hover:text-foreground"
        >
          on the node page →
        </Link>
      </AlertDescription>
    </Alert>
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
