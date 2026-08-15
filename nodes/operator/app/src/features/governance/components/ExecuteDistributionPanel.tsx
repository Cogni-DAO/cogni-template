"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/ExecuteDistributionPanel`
 * Purpose: Node-owner control on the finalized-epoch governance view that EXECUTES a distribution
 *   in one click. It builds ONE Aragon TokenVoting proposal carrying two DAO actions — mint the
 *   epoch's cumulative delta into the distributor, then setMerkleRoot(newRoot) — and submits it
 *   with a Yes vote + tryEarlyExecution. Because the owner holds 100% voting power and the plugin
 *   is EarlyExecution, that single tx creates, passes, AND executes the proposal atomically.
 * Scope: Client component. Fetch the execute payload (useExecuteDistribution) → wagmi
 *   useWriteContract on the plugin's createProposal. Connect-wallet + chain(chainId) gating, mint +
 *   root preview, tx hash + explorer link, success state. Does NOT perform DB access; the fold/worker
 *   NEVER sends this tx — this surface serves what R3 built and the wallet executes.
 * Invariants:
 *   - SINGLE_TX_ATOMIC: one createProposal(_voteOption=Yes, _tryEarlyExecution=true) mints + sets the
 *     root + executes in the same transaction (EarlyExecution + 100% owner voting power).
 *   - TWO_ACTIONS_ORDERED: [0] token.mint(distributor, mintDelta) then [1] distributor.setMerkleRoot(root),
 *     both executed as msg.sender=DAO (DAO holds MINT on the token and owns the distributor).
 *   - ALL_MATH_BIGINT: mintDelta stays bigint (BigInt(payload.mintDelta)); formatted only at display.
 *   - VERIFIED_ABI: uses TOKEN_VOTING_ABI (Aragon OSx TokenVoting v1.3 createProposal signature,
 *     verified against the deployed plugin — selector 0x9cba3021 decoded cleanly and the plugin
 *     reports votingMode=1/support=500000/minDuration=3600).
 *   - PUBLIC_NO_SECRETS: all inputs come from the authed execute-payload route + the connected wallet.
 * Side-effects: blockchain write (createProposal tx via wallet signing).
 * Links: nodes/operator/app/src/features/governance/hooks/useExecuteDistribution.ts,
 *   nodes/operator/app/src/features/governance/lib/proposal-abis.ts,
 *   packages/cogni-contracts/src/cumulative-merkle-distributor/abi.ts
 * @public
 */

import { CUMULATIVE_MERKLE_DISTRIBUTOR_ABI } from "@cogni/cogni-contracts";
import { getTransactionExplorerUrl } from "@cogni/node-shared";
import { useCallback, useMemo } from "react";
import { encodeFunctionData, parseAbi } from "viem";
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
} from "@/features/governance/hooks/useExecuteDistribution";
import { TOKEN_VOTING_ABI } from "@/features/governance/lib/proposal-abis";
import { getChainName } from "@/features/governance/lib/proposal-utils";

/** Minimal GovernanceERC20 mint ABI (DAO holds MINT_PERMISSION on the token). */
const TOKEN_MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

/** Aragon IMajorityVoting.VoteOption: None=0, Abstain=1, Yes=2, No=3. */
const VOTE_OPTION_YES = 2;

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
        <CardTitle>Execute distribution</CardTitle>
        <CardDescription>
          Submit one governance proposal that mints this epoch&apos;s tokens
          into the distributor and publishes the new claim root. With your full
          voting power it passes and executes in a single transaction.
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
          <ExecuteBody payload={payload} />
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

function ExecuteBody({ payload }: { payload: ExecuteDistributionPayload }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const {
    writeContract,
    isPending,
    error: writeError,
    data: txHash,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const mintDelta = useMemo(
    () => BigInt(payload.mintDelta),
    [payload.mintDelta]
  );
  const isCorrectChain = chainId === payload.chainId;
  const chainName = getChainName(payload.chainId);
  const explorerUrl = txHash
    ? getTransactionExplorerUrl(payload.chainId, txHash)
    : null;

  // TWO_ACTIONS_ORDERED: [0] mint the delta into the distributor, then [1] set the
  // new cumulative root. Both run as msg.sender=DAO inside the executed proposal.
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

  const onExecute = useCallback(() => {
    if (!isCorrectChain) return;
    // SINGLE_TX_ATOMIC: Yes vote + tryEarlyExecution ⇒ create+pass+execute in one tx.
    // _startDate=0/_endDate=0 lets the plugin derive dates; EarlyExecution bypasses minDuration.
    writeContract({
      abi: TOKEN_VOTING_ABI,
      address: payload.pluginAddress,
      functionName: "createProposal",
      args: [
        "0x", // _metadata
        actions, // _actions
        0n, // _allowFailureMap
        0n, // _startDate
        0n, // _endDate
        VOTE_OPTION_YES, // _voteOption
        true, // _tryEarlyExecution
      ],
      account: address,
    });
  }, [actions, address, isCorrectChain, payload.pluginAddress, writeContract]);

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
            Connect the node owner wallet to execute this distribution.
          </p>
          <WalletConnectButton />
        </div>
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

      {!isCorrectChain ? (
        <Button
          variant="outline"
          onClick={() => switchChain?.({ chainId: payload.chainId })}
        >
          Switch to {chainName}
        </Button>
      ) : (
        <>
          <Button onClick={onExecute} disabled={isPending || isConfirming}>
            {isPending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Executing…"
                : "Execute distribution"}
          </Button>

          {explorerUrl && (isPending || isConfirming) && (
            <p className="text-muted-foreground text-sm">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-foreground"
              >
                View transaction
              </a>
            </p>
          )}
        </>
      )}

      {isConfirmed && (
        <Alert>
          <AlertTitle>Distribution executed</AlertTitle>
          <AlertDescription>
            The mint + new claim root are live on {chainName}.{" "}
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-foreground"
              >
                View transaction
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}

      {writeError && (
        <Alert variant="destructive">
          <AlertTitle>Execution failed</AlertTitle>
          <AlertDescription>
            {writeError.message?.includes("User rejected")
              ? "Transaction cancelled."
              : writeError.message?.includes("insufficient funds")
                ? "Insufficient funds for gas."
                : (writeError.message ?? "Unknown error")}
          </AlertDescription>
        </Alert>
      )}
    </div>
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
