// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/compute/workload-env-source`
 * Purpose: Pure composition of a node workload's FULL runtime env from server-side
 *   sources (task.5054): the node's OpenBao bucket (`cogni/<env>/<node>`, read via the
 *   secrets plane), the substrate host parsed from the node's own DATABASE_URL, and a
 *   freshly minted budget-capped LiteLLM virtual key. Callers of the deploy route carry
 *   ZERO secrets — `{nodeId, sourceSha}` alone produces a bootable workload.
 * Scope: Pure policy + composition. Does NOT read OpenBao/mint keys (route + adapters
 *   do IO), render specs (node-workload-spec), or invent key names (the universe is
 *   NODE_BASELINE_KEYS in scripts/setup/lib/reconcile-secrets.sh + the k8s base
 *   ConfigMap infra/k8s/base/node-app/configmap.yaml this mirrors).
 * Invariants:
 *   - SCOPED_CREDS_ONLY (node-workload-spec header): only node-scoped / budget-capped /
 *     ordinary-client values may reach the compute provider. Enforced structurally:
 *     forwarding is an explicit ALLOWLIST — an unknown bucket key is dropped, and the
 *     fleet-power keys below are named in DENIED_FLEET_KEYS so a future allowlist edit
 *     trips the test that asserts the two sets are disjoint.
 *   - MASTER_KEY_NEVER_LEAVES: the bucket's LITELLM_MASTER_KEY (shared proxy master,
 *     inheritFrom operator) is never forwarded; the workload gets a per-deploy VIRTUAL
 *     key under the same env name (node apps read LITELLM_MASTER_KEY as "my proxy cred").
 *   - HOST_FROM_NODE_DSN: the externally-reachable substrate host is parsed from the
 *     node's OpenBao DATABASE_URL (composed against the env VM by secret-materialize.sh)
 *     — never reconstructed from the operator's own cluster-local endpoints (which are
 *     ExternalName svc names an Akash workload cannot resolve).
 * Side-effects: none (pure)
 * Links: node-workload-spec.ts (consumes the composed env), secret-materialize.sh
 *   (writes the bucket), infra/k8s/overlays/<env>/<node>/kustomization.yaml (the
 *   ConfigMap wiring the composed config mirrors), task.5054
 * @internal
 */

import type { NodeWorkloadLogPush } from "./node-workload-spec";

/**
 * Bucket keys forwarded verbatim to the workload. Mirrors what ESO delivers to the
 * node's k8s pod, minus fleet-power keys (see DENIED_FLEET_KEYS). Grouped by why
 * each is safe to hand a decentralized provider:
 * - per-node substrate creds (scoped DB roles / per-node generated values);
 * - per-node service tokens (scheduler/billing/ops/metrics — node-scoped auth);
 * - ordinary-client integration creds the node app consumes exactly like its k8s
 *   twin (OAuth login apps, analytics, tracing, web search, public RPC).
 */
export const FORWARDED_NODE_SECRET_KEYS: readonly string[] = [
  // Per-node substrate credentials
  "AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "DOLTGRES_URL",
  "CONNECTIONS_ENCRYPTION_KEY",
  // Per-node service tokens
  "SCHEDULER_API_TOKEN",
  "BILLING_INGEST_TOKEN",
  "INTERNAL_OPS_TOKEN",
  "METRICS_TOKEN",
  // Ordinary-client integration creds (same posture as the k8s pod)
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "GH_OAUTH_CLIENT_ID",
  "GH_OAUTH_CLIENT_SECRET",
  "DISCORD_OAUTH_CLIENT_ID",
  "DISCORD_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "TAVILY_API_KEY",
  "EVM_RPC_URL",
];

/**
 * Fleet-power keys that must NEVER reach a compute provider, even though they sit in
 * the per-node bucket today (ESO hands them to trusted k8s pods): control-plane
 * identities (GitHub App key, webhook HMAC, attestation key), custody material
 * (wallet AEAD, Privy), spend-unbounded masters (LiteLLM master, OpenRouter), push
 * identities (DoltHub), and raw DB role passwords (the composed DSNs carry what the
 * app needs). Kept as an explicit named set so the disjointness test guards drift.
 */
export const DENIED_FLEET_KEYS: readonly string[] = [
  "LITELLM_MASTER_KEY",
  "OPENROUTER_API_KEY",
  "GH_REVIEW_APP_ID",
  "GH_REVIEW_APP_PRIVATE_KEY_BASE64",
  "GH_WEBHOOK_SECRET",
  "IDENTITY_ATTESTATION_PRIVATE_KEY",
  "POLY_WALLET_AEAD_KEY_HEX",
  "POLY_WALLET_AEAD_KEY_ID",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_SIGNING_KEY",
  "PRIVY_USER_WALLETS_APP_ID",
  "PRIVY_USER_WALLETS_APP_SECRET",
  "PRIVY_USER_WALLETS_SIGNING_KEY",
  "DOLTHUB_OWNER",
  "DOLT_CREDS_JWK",
  "DOLT_CREDS_KEYID",
  "DOLTHUB_API_TOKEN",
  "DISCORD_BOT_TOKEN",
  "APP_DB_PASSWORD",
  "APP_DB_SERVICE_PASSWORD",
  "DOLTGRES_PASSWORD",
];

/** Bucket keys a bootable workload cannot run without (node-template server env). */
export const REQUIRED_NODE_SECRET_KEYS: readonly string[] = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "DOLTGRES_URL",
];

// Substrate service ports — the env VM's Compose stack (mirrors the base node-app
// ConfigMap + ExternalName wiring; one host serves them all).
const REDIS_PORT = 6379;
const TEMPORAL_PORT = 7233;
const LITELLM_PORT = 4000;

// Grafana Cloud Loki push creds live at cogni/<env>/node-template (seeded by
// `pnpm secrets:set <env> node-template GRAFANA_CLOUD_LOKI_*`; logs:write-only —
// SCOPED_CREDS_ONLY-compatible). The stored URL already includes /loki/api/v1/push
// (catalog transform append-path).
const LOKI_URL_KEY = "GRAFANA_CLOUD_LOKI_URL";
const LOKI_USER_KEY = "GRAFANA_CLOUD_LOKI_USER";
const LOKI_KEY_KEY = "GRAFANA_CLOUD_LOKI_API_KEY";

export interface ComposeWorkloadEnvInput {
  /** Operator's own env (`DEPLOY_ENVIRONMENT`) — stamps TEMPORAL_NAMESPACE etc. */
  readonly deployEnv: string;
  /** Full `cogni/<env>/<node>` bucket as read from OpenBao. */
  readonly nodeSecrets: Readonly<Record<string, string>>;
  /** Per-deploy budget-capped LiteLLM virtual key (never the master). */
  readonly mintedLlmKey: string;
}

export type ComposeWorkloadEnvResult =
  | { readonly ok: true; readonly env: Record<string, string> }
  | { readonly ok: false; readonly missing: readonly string[] };

/** Hostname embedded in the node's composed DATABASE_URL (the env VM). */
export function deriveSubstrateHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Compose the workload's connection + secret env. Key names only in the failure
 * branch — values never leave the success payload.
 */
export function composeWorkloadEnv(
  input: ComposeWorkloadEnvInput
): ComposeWorkloadEnvResult {
  const missing = REQUIRED_NODE_SECRET_KEYS.filter(
    (k) => !input.nodeSecrets[k]
  );
  const host = input.nodeSecrets.DATABASE_URL
    ? deriveSubstrateHost(input.nodeSecrets.DATABASE_URL)
    : null;
  if (!host && !missing.includes("DATABASE_URL")) {
    missing.push("DATABASE_URL"); // present but unparsable — same remediation
  }
  if (missing.length > 0 || !host) {
    return { ok: false, missing };
  }

  const env: Record<string, string> = {
    // Non-secret config (mirrors infra/k8s/base/node-app/configmap.yaml; NODE_NAME,
    // COGNI_REPO_PATH, AUTH_TRUST_HOST, NEXTAUTH_URL, APP_BASE_URL are stamped by
    // buildNodeWorkloadSpec).
    APP_ENV: "production",
    DEPLOY_ENVIRONMENT: input.deployEnv,
    TEMPORAL_ADDRESS: `${host}:${TEMPORAL_PORT}`,
    TEMPORAL_NAMESPACE: `cogni-${input.deployEnv}`,
    TEMPORAL_TASK_QUEUE: "scheduler-tasks",
    REDIS_URL: `redis://${host}:${REDIS_PORT}`,
    LITELLM_BASE_URL: `http://${host}:${LITELLM_PORT}`,
    // Node apps read LITELLM_MASTER_KEY as "my LiteLLM credential"; on decentralized
    // compute it is a per-deploy budget-capped virtual key (MASTER_KEY_NEVER_LEAVES).
    LITELLM_MASTER_KEY: input.mintedLlmKey,
  };
  for (const key of FORWARDED_NODE_SECRET_KEYS) {
    const value = input.nodeSecrets[key];
    if (value) env[key] = value;
  }
  return { ok: true, env };
}

/**
 * Build the v000 Loki-pump creds from the node-template bucket, or null when the
 * env has no Grafana Cloud Loki creds seeded (deploy proceeds without log push).
 */
export function buildLogPush(
  templateSecrets: Readonly<Record<string, string>> | null,
  deployEnv: string
): NodeWorkloadLogPush | null {
  const url = templateSecrets?.[LOKI_URL_KEY];
  const username = templateSecrets?.[LOKI_USER_KEY];
  const password = templateSecrets?.[LOKI_KEY_KEY];
  if (!url || !username || !password) return null;
  return { url, username, password, env: deployEnv };
}
