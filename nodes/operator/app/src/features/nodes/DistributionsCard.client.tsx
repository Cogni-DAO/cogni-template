// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/DistributionsCard.client`
 * Purpose: Visible, owner-driven distribution control — the UI surface for
 *   `POST /api/v1/nodes/[id]/activate-distributions`. Two paths, NOT a hidden API: (1) "Activate
 *   distributions" opens the metadata-only repo-spec PR that flips `distributions.status: active`;
 *   (2) "Deploy distributor" lets the owner's wallet deploy the vendored `CumulativeMerkleDistributor`,
 *   transfer ownership to the DAO, and record the (on-chain-verified) distributor address in the spec.
 * Scope: Renders a compact "Distributions" SectionCard (page-aligned with NodeAccess/Danger zone).
 *   The deploy section is wallet-gated (wagmi) + chain-gated (node chain, Base mainnet 8453). POSTs
 *   the activation route (owner-or-`node.flight` auth) and surfaces tx hashes, the distributor
 *   address, and the resulting PR link.
 * Side-effects: IO (POST activate-distributions route, router.refresh), blockchain writes via wallet.
 * Links: src/app/api/v1/nodes/[id]/activate-distributions/route.ts, src/app/(app)/nodes/[id]/page.tsx,
 *   src/features/nodes/useDeployDistributor.ts
 * @public
 */

"use client";

import { getTransactionExplorerUrl } from "@cogni/node-shared";
import { ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button, SectionCard, WalletConnectButton } from "@/components";
import { useDeployDistributor } from "@/features/nodes/useDeployDistributor";

interface Props {
  readonly nodeId: string;
  readonly slug: string;
  readonly repoSpecUrl: string | null;
  /** The node's GovernanceERC20 token (constructor arg for the distributor). Null hides deploy. */
  readonly tokenAddress: string | null;
  /** The DAO that receives distributor ownership. Null hides the deploy section. */
  readonly daoAddress: string | null;
  /** The node's chain id — deploy is gated on the connected wallet matching it. */
  readonly chainId: number | null;
}

type Result =
  | { kind: "pr_opened"; prUrl: string }
  | { kind: "no_changes" }
  | null;

export function DistributionsCard({
  nodeId,
  slug,
  repoSpecUrl,
  tokenAddress,
  daoAddress,
  chainId,
}: Props): ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  const handleActivate = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/v1/nodes/${nodeId}/activate-distributions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-JSON body falls through to the raw-text error path below
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
        setResult({ kind: "pr_opened", prUrl: activation.prUrl });
      } else {
        setResult({ kind: "no_changes" });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "activation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Distributions"
      className="mx-auto mt-4 w-full max-w-2xl"
    >
      <p className="text-muted-foreground text-sm">
        Records that <span className="font-medium">{slug}</span> is ready to pay
        contributors in its DAO token. Opens a one-file pull request on the
        node's repo writing <code>distributions.status: active</code> and the
        stock Uniswap MerkleDistributor claim pattern. Metadata only — the DAO
        is the minter, so no tokens move and nothing is pre-minted.
      </p>

      {result?.kind === "pr_opened" ? (
        <a
          href={result.prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
        >
          Activation PR opened
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      {result?.kind === "no_changes" ? (
        <p className="text-muted-foreground text-sm">
          Distributions already active — nothing to change.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleActivate}
          disabled={submitting}
          className="gap-2"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Activate distributions
        </Button>
        {repoSpecUrl ? (
          <a
            href={repoSpecUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground text-sm hover:text-foreground"
          >
            View repo-spec
          </a>
        ) : null}
      </div>

      {tokenAddress && daoAddress && chainId != null ? (
        <DeployDistributorSection
          nodeId={nodeId}
          tokenAddress={tokenAddress as `0x${string}`}
          daoAddress={daoAddress as `0x${string}`}
          chainId={chainId}
        />
      ) : null}
    </SectionCard>
  );
}

/**
 * Owner-wallet deploy path: deploy the vendored `CumulativeMerkleDistributor(token)`, transfer
 * ownership to the DAO, then record the on-chain-verified distributor address. Wallet-gated
 * (connect) + chain-gated (node chain). Reads no secrets; the connected wallet signs.
 */
function DeployDistributorSection({
  nodeId,
  tokenAddress,
  daoAddress,
  chainId,
}: {
  nodeId: string;
  tokenAddress: `0x${string}`;
  daoAddress: `0x${string}`;
  chainId: number;
}): ReactElement {
  const router = useRouter();
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const {
    phase,
    distributorAddress,
    deployTx,
    transferTx,
    prUrl,
    recordError,
    error,
    deploy,
  } = useDeployDistributor(nodeId, tokenAddress, daoAddress);

  const onCorrectChain = connectedChainId === chainId;
  const busy =
    phase === "deploying" || phase === "transferring" || phase === "recording";
  const deployTxUrl = deployTx
    ? getTransactionExplorerUrl(chainId, deployTx)
    : null;
  const transferTxUrl = transferTx
    ? getTransactionExplorerUrl(chainId, transferTx)
    : null;

  // Refresh the page once the PR is recorded so the repo-spec link reflects it.
  if (phase === "done" && prUrl) {
    // router.refresh is idempotent + cheap; deferring avoids a render-phase call.
    queueMicrotask(() => router.refresh());
  }

  const phaseLabel =
    phase === "deploying"
      ? "Deploying distributor… confirm in wallet"
      : phase === "transferring"
        ? "Transferring ownership to the DAO… confirm in wallet"
        : phase === "recording"
          ? "Verifying on-chain + recording in the repo-spec…"
          : null;

  return (
    <div className="mt-2 space-y-3 border-border border-t pt-4">
      <div>
        <p className="font-medium text-sm">Deploy distributor</p>
        <p className="text-muted-foreground text-sm">
          Your wallet deploys the vendored CumulativeMerkleDistributor for this
          node&apos;s token and transfers ownership to the DAO. The operator
          then verifies on-chain (DAO owns it, its token matches) and records
          the address so contributors can claim.
        </p>
      </div>

      {!isConnected ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Connect your wallet to deploy.
          </p>
          <WalletConnectButton />
        </div>
      ) : !onCorrectChain ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => switchChain?.({ chainId })}
        >
          Switch network to deploy
        </Button>
      ) : (
        <Button
          type="button"
          onClick={deploy}
          disabled={busy}
          className="gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {phase === "done" ? "Redeploy distributor" : "Deploy distributor"}
        </Button>
      )}

      {phaseLabel ? (
        <p className="text-muted-foreground text-sm">{phaseLabel}</p>
      ) : null}

      {deployTxUrl ? (
        <a
          href={deployTxUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
        >
          Deploy transaction
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      {transferTxUrl ? (
        <a
          href={transferTxUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
        >
          Transfer-ownership transaction
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      {distributorAddress ? (
        <p className="break-all font-mono text-muted-foreground text-xs">
          Distributor: {distributorAddress}
        </p>
      ) : null}
      {phase === "done" && prUrl ? (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
        >
          Distributor recorded — activation PR
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      {phase === "done" && recordError ? (
        <p className="text-amber-600 text-sm dark:text-amber-500">
          ✅ Deployed on-chain + ownership transferred to the DAO. Git-record
          pending (the operator App can&apos;t write from this environment):{" "}
          <span className="font-mono text-xs">{recordError}</span>
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
