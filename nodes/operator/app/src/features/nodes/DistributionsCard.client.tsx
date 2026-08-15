// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/nodes/DistributionsCard.client`
 * Purpose: The ONE-TIME distribution SETUP surface for a node — a single guided "Set up distributions"
 *   sequence the owner runs once, on the node page. Three ordered, idempotent steps:
 *     1. ACTIVATE — open the metadata-only repo-spec PR that flips `distributions.status: active`
 *        (POST `/api/v1/nodes/[id]/activate-distributions`). Metadata only; no tokens move.
 *     2. DEPLOY DISTRIBUTOR — the owner's wallet deploys the vendored `CumulativeMerkleDistributor`,
 *        transfers ownership to the DAO, and records the on-chain-verified address (useDeployDistributor).
 *     3. AUTHORIZE PUBLISHING — deploy the scoped `DistributionPublishCondition(token, distributor)` and
 *        submit ONE governance proposal granting the wallet SCOPED EXECUTE_PERMISSION
 *        (useAuthorizePublishing). This IS a governance proposal (said so). Once done, every per-epoch
 *        publish is a single direct `DAO.execute` with no vote (on the finalized-epoch page).
 *   Each step shows clear state (done / current / not-yet) and SKIPS when already complete:
 *   activated ⇒ skip step 1; distributor recorded ⇒ skip step 2; `hasPermission` true ⇒ skip step 3.
 * Scope: Renders a "Set up distributions" SectionCard (page-aligned with NodeAccess/Danger zone).
 *   Wallet-gated (wagmi) + chain-gated (node chain, Base mainnet 8453) for the on-chain steps. The
 *   git-authoritative "already done" signals (distributionsActive, recordedDistributorAddress) come
 *   from the page's server-side repo-spec read; the wallet's `hasPermission` is read on-chain here.
 * Side-effects: IO (POST activate-distributions route, router.refresh), blockchain writes via wallet.
 * Links: src/app/api/v1/nodes/[id]/activate-distributions/route.ts, src/app/(app)/nodes/[id]/page.tsx,
 *   src/features/nodes/useDeployDistributor.ts,
 *   src/features/governance/hooks/useAuthorizePublishing.ts,
 *   src/features/governance/hooks/useExecuteDistribution.ts (useHasExecutePermission)
 * @public
 */

"use client";

import { getTransactionExplorerUrl } from "@cogni/node-shared";
import { Check, CircleDashed, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button, SectionCard, WalletConnectButton } from "@/components";
import { useAuthorizePublishing } from "@/features/governance/hooks/useAuthorizePublishing";
import { useHasExecutePermission } from "@/features/governance/hooks/useExecuteDistribution";
import { useDeployDistributor } from "@/features/nodes/useDeployDistributor";

interface Props {
  readonly nodeId: string;
  readonly slug: string;
  readonly repoSpecUrl: string | null;
  /** The node's GovernanceERC20 token (constructor arg for the distributor). Null hides deploy. */
  readonly tokenAddress: string | null;
  /** The DAO that receives distributor ownership + grants publish authority. Null hides on-chain steps. */
  readonly daoAddress: string | null;
  /** The node's Aragon TokenVoting plugin — createProposal target for the authorize step. */
  readonly pluginAddress: string | null;
  /** The node's chain id — on-chain steps are gated on the connected wallet matching it. */
  readonly chainId: number | null;
  /** Git-authoritative: `distributions.status: active` in the node repo-spec (skip step 1). */
  readonly distributionsActive: boolean;
  /** Git-authoritative: the distributor address recorded in the spec, if any (skip step 2). */
  readonly recordedDistributorAddress: string | null;
}

export function DistributionsCard({
  nodeId,
  slug,
  repoSpecUrl,
  tokenAddress,
  daoAddress,
  pluginAddress,
  chainId,
  distributionsActive,
  recordedDistributorAddress,
}: Props): ReactElement {
  return (
    <SectionCard
      title="Set up distributions"
      className="mx-auto mt-4 w-full max-w-2xl"
    >
      <p className="text-muted-foreground text-sm">
        A one-time setup so <span className="font-medium">{slug}</span> can pay
        contributors in its DAO token. Three steps: activate, deploy the claim
        distributor, then authorize your wallet to publish. After setup, each
        epoch publishes in a single transaction with no vote.
      </p>

      {tokenAddress && daoAddress && chainId != null ? (
        <SetupSequence
          nodeId={nodeId}
          repoSpecUrl={repoSpecUrl}
          tokenAddress={tokenAddress as `0x${string}`}
          daoAddress={daoAddress as `0x${string}`}
          pluginAddress={
            pluginAddress ? (pluginAddress as `0x${string}`) : null
          }
          chainId={chainId}
          distributionsActive={distributionsActive}
          recordedDistributorAddress={
            recordedDistributorAddress
              ? (recordedDistributorAddress as `0x${string}`)
              : null
          }
        />
      ) : (
        <ActivateOnlyRow
          nodeId={nodeId}
          slug={slug}
          repoSpecUrl={repoSpecUrl}
          distributionsActive={distributionsActive}
        />
      )}
    </SectionCard>
  );
}

/** Step display state — drives the numbered badge + label styling. */
type StepState = "done" | "current" | "pending";

/**
 * The three-step guided setup. Reads the wallet's on-chain publish authority so step 3 can skip when
 * already granted. Steps are ordered but each shows its own done/current/not-yet state; a completed
 * step collapses to a compact "done" row.
 */
function SetupSequence({
  nodeId,
  repoSpecUrl,
  tokenAddress,
  daoAddress,
  pluginAddress,
  chainId,
  distributionsActive,
  recordedDistributorAddress,
}: {
  nodeId: string;
  repoSpecUrl: string | null;
  tokenAddress: `0x${string}`;
  daoAddress: `0x${string}`;
  pluginAddress: `0x${string}` | null;
  chainId: number;
  distributionsActive: boolean;
  recordedDistributorAddress: `0x${string}` | null;
}): ReactElement {
  const { address, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Step 1 state: activation is git-authoritative from the page read, but the owner can also flip it
  // in-session (the activate POST) — track that locally so the row advances without a full reload.
  const [activatedInSession, setActivatedInSession] = useState(false);
  const activated = distributionsActive || activatedInSession;

  // Step 2 state: the deploy hook drives the live flow; the recorded address makes it idempotent.
  const deploy = useDeployDistributor(nodeId, tokenAddress, daoAddress);
  const distributorAddress =
    deploy.distributorAddress ?? recordedDistributorAddress;
  const distributorDeployed = distributorAddress !== null;

  // Step 3 gate: does the connected wallet already hold scoped EXECUTE_PERMISSION on the DAO?
  // Probed with token + distributor so the SCOPED condition evaluates a real publish shape
  // (empty "0x" would make the condition deny a live grant → button falsely reappears).
  const { hasPermission, refetch: refetchPermission } = useHasExecutePermission(
    { daoAddress, wallet: address, tokenAddress, distributorAddress, chainId }
  );
  const authorized = hasPermission === true;

  const onCorrectChain = connectedChainId === chainId;

  // Derive the "current" step: the first not-yet-done step in the sequence.
  const currentStep: 1 | 2 | 3 | null = !activated
    ? 1
    : !distributorDeployed
      ? 2
      : !authorized
        ? 3
        : null;

  const stepState = (step: 1 | 2 | 3): StepState => {
    const done =
      (step === 1 && activated) ||
      (step === 2 && distributorDeployed) ||
      (step === 3 && authorized);
    if (done) return "done";
    return currentStep === step ? "current" : "pending";
  };

  return (
    <div className="mt-2 space-y-3">
      {/* Wallet + chain gating is shared by steps 2 and 3 (the on-chain steps). Step 1 is a server
          POST and needs no wallet. Surface the connect / switch control once, up top. */}
      {!isConnected ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-muted-foreground text-sm">
            Connect the node owner wallet to deploy + authorize.
          </p>
          <WalletConnectButton />
        </div>
      ) : !onCorrectChain ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => switchChain?.({ chainId })}
        >
          Switch network to continue setup
        </Button>
      ) : null}

      <ActivateStep
        state={stepState(1)}
        nodeId={nodeId}
        repoSpecUrl={repoSpecUrl}
        onActivated={() => setActivatedInSession(true)}
      />

      <DeployStep
        state={stepState(2)}
        chainId={chainId}
        deploy={deploy}
        recordedDistributorAddress={recordedDistributorAddress}
        walletReady={isConnected && onCorrectChain}
      />

      <AuthorizeStep
        state={stepState(3)}
        chainId={chainId}
        tokenAddress={tokenAddress}
        daoAddress={daoAddress}
        pluginAddress={pluginAddress}
        distributorAddress={distributorAddress}
        wallet={address ?? null}
        walletReady={isConnected && onCorrectChain}
        onAuthorized={refetchPermission}
      />
    </div>
  );
}

/** A numbered/step-state badge: green check (done), filled number (current), dashed (pending). */
function StepBadge({
  n,
  state,
}: {
  n: number;
  state: StepState;
}): ReactElement {
  if (state === "done") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
        {n}
      </span>
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
      <CircleDashed className="size-5" />
    </span>
  );
}

/** Shared step shell: badge + title + (collapsed when pending/done) body. */
function StepRow({
  n,
  state,
  title,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div
      className={
        state === "current"
          ? "rounded-lg border border-border bg-muted/30 p-4"
          : "rounded-lg border border-border/50 p-4"
      }
    >
      <div className="flex items-center gap-3">
        <StepBadge n={n} state={state} />
        <p
          className={
            state === "pending"
              ? "font-medium text-muted-foreground text-sm"
              : "font-medium text-sm"
          }
        >
          {title}
        </p>
      </div>
      {children ? <div className="mt-3 space-y-3 pl-9">{children}</div> : null}
    </div>
  );
}

/** Step 1 — metadata activation. POSTs the activate-distributions route; skips when already active. */
function ActivateStep({
  state,
  nodeId,
  repoSpecUrl,
  onActivated,
}: {
  state: StepState;
  nodeId: string;
  repoSpecUrl: string | null;
  onActivated: () => void;
}): ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const handleActivate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
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
        setPrUrl(activation.prUrl);
      }
      onActivated();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "activation failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "done") {
    return (
      <StepRow n={1} state="done" title="Distributions activated">
        {repoSpecUrl ? (
          <ExternalLinkRow href={repoSpecUrl}>View repo-spec</ExternalLinkRow>
        ) : null}
      </StepRow>
    );
  }

  return (
    <StepRow n={1} state={state} title="Activate distributions">
      {state === "current" ? (
        <>
          <p className="text-muted-foreground text-sm">
            Opens a one-file pull request writing{" "}
            <code>distributions.status: active</code> and the claim pattern into
            the node&apos;s repo-spec. Metadata only — the DAO is the minter, so
            no tokens move and nothing is pre-minted.
          </p>
          {prUrl ? (
            <ExternalLinkRow href={prUrl}>Activation PR opened</ExternalLinkRow>
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
        </>
      ) : null}
    </StepRow>
  );
}

/**
 * Step 2 — deploy the distributor. The wallet deploys the vendored CumulativeMerkleDistributor, transfers
 * ownership to the DAO, and records the on-chain-verified address. Skips when a distributor is already
 * recorded in the spec.
 */
function DeployStep({
  state,
  chainId,
  deploy,
  recordedDistributorAddress,
  walletReady,
}: {
  state: StepState;
  chainId: number;
  deploy: ReturnType<typeof useDeployDistributor>;
  recordedDistributorAddress: `0x${string}` | null;
  walletReady: boolean;
}): ReactElement {
  const router = useRouter();
  const {
    phase,
    distributorAddress,
    deployTx,
    transferTx,
    prUrl,
    recordError,
    error,
    deploy: runDeploy,
  } = deploy;

  const busy =
    phase === "deploying" || phase === "transferring" || phase === "recording";
  const deployTxUrl = deployTx
    ? getTransactionExplorerUrl(chainId, deployTx)
    : null;
  const transferTxUrl = transferTx
    ? getTransactionExplorerUrl(chainId, transferTx)
    : null;

  // Refresh once the PR is recorded so the git-authoritative page read reflects it.
  // MUST be an effect, not a render-body call — a render-body router.refresh() re-fires
  // on every re-render while phase stays "done" (a refresh loop).
  useEffect(() => {
    if (phase === "done" && prUrl) router.refresh();
  }, [phase, prUrl, router]);

  if (state === "done") {
    const shown = distributorAddress ?? recordedDistributorAddress;
    return (
      <StepRow n={2} state="done" title="Distributor deployed">
        {shown ? (
          <p className="break-all font-mono text-muted-foreground text-xs">
            Distributor: {shown}
          </p>
        ) : null}
      </StepRow>
    );
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
    <StepRow n={2} state={state} title="Deploy distributor">
      {state === "current" ? (
        <>
          <p className="text-muted-foreground text-sm">
            Your wallet deploys the vendored CumulativeMerkleDistributor for
            this node&apos;s token and transfers ownership to the DAO. The
            operator then verifies on-chain (DAO owns it, its token matches) and
            records the address so contributors can claim.
          </p>

          <Button
            type="button"
            onClick={runDeploy}
            disabled={busy || !walletReady}
            className="gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {phase === "done" ? "Redeploy distributor" : "Deploy distributor"}
          </Button>

          {phaseLabel ? (
            <p className="text-muted-foreground text-sm">{phaseLabel}</p>
          ) : null}
          {deployTxUrl ? (
            <ExternalLinkRow href={deployTxUrl}>
              Deploy transaction
            </ExternalLinkRow>
          ) : null}
          {transferTxUrl ? (
            <ExternalLinkRow href={transferTxUrl}>
              Transfer-ownership transaction
            </ExternalLinkRow>
          ) : null}
          {distributorAddress ? (
            <p className="break-all font-mono text-muted-foreground text-xs">
              Distributor: {distributorAddress}
            </p>
          ) : null}
          {phase === "done" && recordError ? (
            <p className="text-amber-600 text-sm dark:text-amber-500">
              ✅ Deployed on-chain + ownership transferred to the DAO.
              Git-record pending (the operator App can&apos;t write from this
              environment):{" "}
              <span className="font-mono text-xs">{recordError}</span>
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </>
      ) : null}
    </StepRow>
  );
}

/**
 * Step 3 — authorize publishing (a governance proposal). Deploys the scoped
 * DistributionPublishCondition(token, distributor) and submits ONE grantWithCondition proposal so the
 * wallet gains SCOPED standing publish authority. Skips when `hasPermission` is already true.
 */
function AuthorizeStep({
  state,
  chainId,
  tokenAddress,
  daoAddress,
  pluginAddress,
  distributorAddress,
  wallet,
  walletReady,
  onAuthorized,
}: {
  state: StepState;
  chainId: number;
  tokenAddress: `0x${string}`;
  daoAddress: `0x${string}`;
  pluginAddress: `0x${string}` | null;
  distributorAddress: `0x${string}` | null;
  wallet: `0x${string}` | null;
  walletReady: boolean;
  onAuthorized: () => void;
}): ReactElement {
  if (state === "done") {
    return (
      <StepRow n={3} state="done" title="Publishing authorized">
        <p className="text-muted-foreground text-sm">
          Your wallet holds scoped authority to publish this node&apos;s
          distributions — and nothing else.
        </p>
      </StepRow>
    );
  }

  return (
    <StepRow n={3} state={state} title="Authorize publishing">
      {state === "current" ? (
        <AuthorizeStepBody
          chainId={chainId}
          tokenAddress={tokenAddress}
          daoAddress={daoAddress}
          pluginAddress={pluginAddress}
          distributorAddress={distributorAddress}
          wallet={wallet}
          walletReady={walletReady}
          onAuthorized={onAuthorized}
        />
      ) : (
        <p className="pl-0 text-muted-foreground text-sm">
          Grant your wallet scoped authority to publish — after the distributor
          is deployed.
        </p>
      )}
    </StepRow>
  );
}

/** The live authorize flow (only mounted when step 3 is the current step + all inputs are present). */
function AuthorizeStepBody({
  chainId,
  tokenAddress,
  daoAddress,
  pluginAddress,
  distributorAddress,
  wallet,
  walletReady,
  onAuthorized,
}: {
  chainId: number;
  tokenAddress: `0x${string}`;
  daoAddress: `0x${string}`;
  pluginAddress: `0x${string}` | null;
  distributorAddress: `0x${string}` | null;
  wallet: `0x${string}` | null;
  walletReady: boolean;
  onAuthorized: () => void;
}): ReactElement {
  const ready = Boolean(
    walletReady && wallet && pluginAddress && distributorAddress
  );

  const { phase, deployTx, grantTx, error, authorize } = useAuthorizePublishing(
    {
      token: tokenAddress,
      distributor:
        distributorAddress ?? "0x0000000000000000000000000000000000000000",
      dao: daoAddress,
      plugin: pluginAddress ?? "0x0000000000000000000000000000000000000000",
      wallet: wallet ?? "0x0000000000000000000000000000000000000000",
    }
  );

  // Re-read the on-chain permission the moment the grant confirms so the sequence advances.
  // Effect, not render-body — otherwise onAuthorized re-fires every re-render at phase "done".
  useEffect(() => {
    if (phase === "done") onAuthorized();
  }, [phase, onAuthorized]);

  const busy = phase === "deploying" || phase === "granting";
  const explorerTx = grantTx ?? deployTx;
  const explorerUrl = explorerTx
    ? getTransactionExplorerUrl(chainId, explorerTx)
    : null;
  const label =
    phase === "deploying"
      ? "Deploying condition… confirm in wallet"
      : phase === "granting"
        ? "Submitting grant proposal…"
        : "Authorize publishing";

  return (
    <>
      <p className="text-muted-foreground text-sm">
        Grants your wallet permission to publish THIS node&apos;s distributions
        and nothing else (enforced on-chain by a scoped condition contract).
        This IS a governance proposal — two transactions, deploy the condition
        then submit the grant — run once. After this, each epoch publishes in a
        single transaction with no vote.
      </p>

      {!pluginAddress ? (
        <p className="text-amber-600 text-sm dark:text-amber-500">
          This node is missing its voting-plugin address; authorize can&apos;t
          run yet.
        </p>
      ) : null}

      <Button
        type="button"
        onClick={authorize}
        disabled={busy || !ready}
        className="gap-2"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {label}
      </Button>

      {explorerUrl && busy ? (
        <ExternalLinkRow href={explorerUrl}>
          {grantTx ? "View proposal transaction" : "View deploy transaction"}
        </ExternalLinkRow>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm">
          {error.message?.includes("User rejected")
            ? "Transaction cancelled."
            : (error.message ?? "Authorization failed")}
        </p>
      ) : null}
    </>
  );
}

/**
 * The metadata-only activation row, shown when on-chain setup isn't available (no token/DAO/chain).
 * There is nothing to deploy or authorize without those, so we surface only the activate action.
 */
function ActivateOnlyRow({
  nodeId,
  slug,
  repoSpecUrl,
  distributionsActive,
}: {
  nodeId: string;
  slug: string;
  repoSpecUrl: string | null;
  distributionsActive: boolean;
}): ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [activated, setActivated] = useState(distributionsActive);

  const handleActivate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
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
      setActivated(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "activation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 space-y-3">
      <p className="text-muted-foreground text-sm">
        Records that <span className="font-medium">{slug}</span> is ready to
        distribute. Deploy + authorize become available once the node has a
        token, DAO, and chain.
      </p>
      {activated ? (
        <p className="text-emerald-600 text-sm dark:text-emerald-500">
          Distributions activated.
        </p>
      ) : null}
      {prUrl ? (
        <ExternalLinkRow href={prUrl}>Activation PR opened</ExternalLinkRow>
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
    </div>
  );
}

/** A small external-link row (icon + label), matching the neighboring idiom. */
function ExternalLinkRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5" />
    </a>
  );
}
