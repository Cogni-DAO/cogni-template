"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/components/CumulativeClaimPanel`
 * Purpose: Claim surface on /gov/holdings rendering the FIRST-CLASS distribution states (story.5003)
 *   — not-activated, activated-but-unpublished, no-allocation-for-this-wallet, root-pending,
 *   claimable (CTA), and fully-claimed — never a silent "no tokens" when a more specific truth is
 *   readable. The connected wallet claims its CUMULATIVE DAO tokens (all unclaimed epochs at once).
 * Scope: Client component. useClaimSurface derives ONE honest state from repo-spec config + the
 *   latest-manifest leaf + on-chain merkleRoot()/cumulativeClaimed; this component only renders it
 *   and (in the claimable state) submits CumulativeMerkleDrop.claim() via wagmi. No DB access.
 * Invariants:
 *   - HONEST_EMPTY: every "empty" rendering names its proven cause (see claim-surface-state.ts).
 *   - ROOT_GATED_CTA: the claim button only renders when the leaf root equals the live on-chain
 *     merkleRoot() — a mismatched claim reverts MerkleRootWasUpdated.
 *   - CUMULATIVE_MODEL: claim(account, cumulativeAmount, root, proof) pays cumulativeAmount −
 *     cumulativeClaimed. A single claim covers ALL unclaimed epochs.
 *   - HONEST_STATE: after a claim tx confirms, re-read cumulativeClaimed so the surface collapses
 *     to fully-claimed until the next root.
 *   - ALL_MATH_BIGINT: amounts stay bigint; formatted only at display.
 *   - PUBLIC_NO_SECRETS: all inputs come from public routes + chain reads + the connected wallet.
 * Side-effects: blockchain read (via useClaimSurface), blockchain write (claim tx via wallet signing).
 * Links: nodes/operator/app/src/features/governance/hooks/useClaimSurface.ts, nodes/operator/app/src/features/governance/lib/claim-surface-state.ts
 * @public
 */

import { CUMULATIVE_MERKLE_DISTRIBUTOR_ABI } from "@cogni/cogni-contracts";
import { getTransactionExplorerUrl } from "@cogni/node-shared";
import { useCallback, useEffect } from "react";
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
import { useClaimSurface } from "@/features/governance/hooks/useClaimSurface";
import type { ClaimSurfaceState } from "@/features/governance/lib/claim-surface-state";
import { getChainName } from "@/features/governance/lib/proposal-utils";

export function CumulativeClaimPanel({
  bare = false,
}: {
  /**
   * Render without the outer Card chrome (header/border) — for embedding inside an existing
   * SectionCard (e.g. YourPositionPanel) so the claim UX reads as a flat section, not a card-in-card.
   */
  bare?: boolean;
} = {}) {
  const { address } = useAccount();
  const surface = useClaimSurface(address);

  const body = (
    <ClaimSurfaceBody
      state={surface.state}
      account={address}
      distributor={surface.distributor}
      refetchClaimed={surface.refetchClaimed}
    />
  );

  if (bare) {
    return (
      <div className="space-y-3 border-border/50 border-t pt-4">
        <div>
          <p className="font-semibold text-sm">Claim your tokens</p>
          <p className="text-muted-foreground text-sm">
            A single claim releases every unclaimed epoch you&apos;ve earned.
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>Claim your tokens</CardTitle>
        <CardDescription>
          A single claim releases every unclaimed epoch you&apos;ve earned.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

/** Render exactly ONE first-class state (HONEST_EMPTY — see claim-surface-state.ts). */
function ClaimSurfaceBody({
  state,
  account,
  distributor,
  refetchClaimed,
}: {
  state: ClaimSurfaceState;
  account: `0x${string}` | undefined;
  distributor: `0x${string}` | null;
  refetchClaimed: () => void;
}) {
  switch (state.kind) {
    case "loading":
      return (
        <p className="text-muted-foreground text-sm">
          Checking distribution state&hellip;
        </p>
      );

    case "error":
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your claim</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      );

    case "chain_unavailable":
      return (
        <Alert variant="destructive">
          <AlertTitle>
            Couldn&apos;t read on-chain distribution state
          </AlertTitle>
          <AlertDescription>
            The distributor contract couldn&apos;t be read right now, so your
            claim state can&apos;t be shown honestly. Refresh to retry.
          </AlertDescription>
        </Alert>
      );

    case "not_activated":
      return (
        <Alert>
          <AlertTitle>Distributions not activated</AlertTitle>
          <AlertDescription>
            This node hasn&apos;t activated token distributions yet.
            Contributions are still recorded — tokens become claimable after the
            node owner activates distributions.
          </AlertDescription>
        </Alert>
      );

    case "wallet_disconnected":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Connect your wallet to check what you can claim.
          </p>
          <WalletConnectButton />
        </div>
      );

    case "not_published":
      return (
        <Alert>
          <AlertTitle>
            Distributions activated — nothing published yet
          </AlertTitle>
          <AlertDescription>
            {state.pendingAllocation !== null
              ? `You have ${formatAmount(state.pendingAllocation)} allocated, awaiting the first on-chain publish. Nothing is claimable until the distribution root is published.`
              : "The first distribution hasn't been published on-chain yet. Check back after the next epoch publishes."}
          </AlertDescription>
        </Alert>
      );

    case "no_allocation":
      return (
        <Alert>
          <AlertTitle>No allocation for this wallet</AlertTitle>
          <AlertDescription>
            This wallet has no allocation in the current distribution. If you
            contributed with a different wallet, connect that one.
          </AlertDescription>
        </Alert>
      );

    case "root_pending":
      return (
        <Alert>
          <AlertTitle>Distribution update pending</AlertTitle>
          <AlertDescription>
            Your allocation of {formatAmount(state.cumulativeAmount)}
            {state.cumulativeClaimed !== null
              ? ` (${formatAmount(state.cumulativeClaimed)} already claimed)`
              : ""}{" "}
            targets a distribution root that isn&apos;t live on-chain yet.
            Claiming resumes once the new root is published.
          </AlertDescription>
        </Alert>
      );

    case "fully_claimed":
      return (
        <div className="space-y-5">
          <AllocationSummary
            cumulativeAmount={state.cumulativeAmount}
            cumulativeClaimed={state.cumulativeClaimed}
            claimable={0n}
            chainName=""
          />
          <Alert>
            <AlertTitle>
              You&apos;ve claimed everything —{" "}
              {formatAmount(state.cumulativeClaimed)} held
            </AlertTitle>
            <AlertDescription>
              Your full cumulative allocation has been claimed to your wallet.
              New tokens become claimable when the next cumulative root is
              published.
            </AlertDescription>
          </Alert>
        </div>
      );

    case "claimable":
      if (!account || !distributor) return null; // unreachable: claimable requires both
      return (
        <ClaimAction
          state={state}
          account={account}
          distributor={distributor}
          refetchClaimed={refetchClaimed}
        />
      );
  }
}

/** The claimable state: allocation summary + chain switch + the claim CTA + tx feedback. */
function ClaimAction({
  state,
  account,
  distributor,
  refetchClaimed,
}: {
  state: Extract<ClaimSurfaceState, { kind: "claimable" }>;
  account: `0x${string}`;
  distributor: `0x${string}`;
  refetchClaimed: () => void;
}) {
  const { claim, cumulativeAmount, cumulativeClaimed, claimable } = state;

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

  // HONEST_STATE: re-read cumulativeClaimed once the claim tx confirms so the
  // surface collapses to fully-claimed until the next cumulative root.
  useEffect(() => {
    if (isConfirmed) refetchClaimed();
  }, [isConfirmed, refetchClaimed]);

  const isCorrectChain = chainId === claim.chainId;
  const chainName = getChainName(claim.chainId);
  const explorerUrl = txHash
    ? getTransactionExplorerUrl(claim.chainId, txHash)
    : null;

  const onClaim = useCallback(() => {
    if (!isCorrectChain) return;
    writeContract({
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      address: distributor,
      functionName: "claim",
      // claim(account, cumulativeAmount, expectedMerkleRoot, merkleProof)
      args: [
        claim.account as `0x${string}`,
        BigInt(claim.amount),
        claim.root as `0x${string}`,
        claim.proof as `0x${string}`[],
      ],
      account,
    });
  }, [claim, distributor, isCorrectChain, writeContract, account]);

  return (
    <div className="space-y-5">
      <AllocationSummary
        cumulativeAmount={cumulativeAmount}
        cumulativeClaimed={cumulativeClaimed}
        claimable={claimable}
        chainName={chainName}
      />

      {!isCorrectChain ? (
        <Button
          variant="outline"
          onClick={() => switchChain?.({ chainId: claim.chainId })}
        >
          Switch to {chainName}
        </Button>
      ) : (
        <>
          <Button onClick={onClaim} disabled={isPending || isConfirming}>
            {isPending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Claiming…"
                : `Claim ${formatAmount(claimable)}`}
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
          <AlertTitle>Tokens claimed</AlertTitle>
          <AlertDescription>
            Your claim confirmed on {chainName}.{" "}
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
          <AlertTitle>Claim failed</AlertTitle>
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

function AllocationSummary({
  cumulativeAmount,
  cumulativeClaimed,
  claimable,
  chainName,
}: {
  cumulativeAmount: bigint;
  cumulativeClaimed: bigint | undefined;
  claimable: bigint | undefined;
  chainName: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-muted-foreground text-sm">Claimable now</p>
      <p className="font-bold text-2xl tracking-tight">
        {claimable === undefined ? "…" : formatAmount(claimable)}
      </p>
      <dl className="mt-3 space-y-1 text-muted-foreground text-sm">
        <div className="flex justify-between gap-4">
          <dt>Cumulative allocation</dt>
          <dd className="font-mono">{formatAmount(cumulativeAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Already claimed</dt>
          <dd className="font-mono">
            {cumulativeClaimed === undefined
              ? "…"
              : formatAmount(cumulativeClaimed)}
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
