// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/v1/compute/deployments`
 * Purpose: POST — provision ONE node's container workload on decentralized compute via the
 *   injected ComputeResourcePort write half (task.5044). The v1 seam that puts a Cogni node on
 *   Akash: resolve the node's built image (same artifact gate as candidate flight), source the
 *   workload env SERVER-SIDE (task.5054 — callers carry ZERO secrets), build the self-contained
 *   workload spec, and lease provider compute.
 * Scope: Thin HTTP shell — Cogni-token auth, `node.flight` RBAC on the target node, image
 *   resolution via DeployPlanePort, env sourcing via the secrets plane + LiteLLM key mint,
 *   delegate to computeCapability.provision. Does NOT track workloads in a registry table
 *   (vNext: compute_resources read-cache) or bill per-caller (v0 bills the shared operator
 *   account).
 * Invariants:
 *   - DEVELOPER_GATED: requires `node.flight` on the target node (same tuple as flight/deploy-state).
 *   - NODE_REF_ARTIFACT_GATE: the image is resolved+verified via prepareNodeRefCandidateFlight —
 *     you can only deploy an artifact the node's CI actually published.
 *   - ZERO_CALLER_SECRETS: the request body is `{nodeId, sourceSha[, port, hosts]}` — the env is
 *     composed from the node's OpenBao bucket (`cogni/<env>/<node>`, read via the operator's own
 *     in-cluster identity) + a per-deploy budget-capped LiteLLM virtual key + node-template Loki
 *     push creds (logPush). SCOPED_CREDS_ONLY is enforced in workload-env-source.ts.
 *   - WRITE_HALF_OPTIONAL: 501 compute_write_unsupported when no workload-capable provider is
 *     configured (AKASH_CONSOLE_API_KEY unset).
 *   - CAPABILITY_INJECTION + ADAPTER_SWAPPABLE: no provider type leaks into this route.
 * Side-effects: IO (registry read, authz check, GHCR artifact check, OpenBao reads, LiteLLM
 *   key mint, provider lease — spends escrow)
 * Links: docs/spec/cicd-platform-boundary.md § typed operator control plane, task.5044,
 *   task.5054, features/compute/workload-env-source.ts,
 *   adapters/server/compute/akash-compute.adapter.ts, [leaseId]/route.ts (status/release)
 * @public
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { createNodeVirtualKeyMinter } from "@/bootstrap/capabilities/litellm-virtual-key";
import { createOperatorDeployPlane } from "@/bootstrap/capabilities/operator-deploy-plane";
import { createOperatorSecretsPlane } from "@/bootstrap/capabilities/operator-secrets-plane";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { buildNodeWorkloadSpec } from "@/features/compute/node-workload-spec";
import {
  buildLogPush,
  composeWorkloadEnv,
} from "@/features/compute/workload-env-source";
import { serverEnv } from "@/shared/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bid polling dominates: deployment tx + up to ~90s awaiting provider bids + lease.
export const maxDuration = 180;

const bodySchema = z.object({
  /** Node UUID or slug. */
  nodeId: z.string().min(1),
  /** Node-repo commit SHA whose CI-published image to deploy. */
  sourceSha: z.string().regex(/^[0-9a-f]{40}$/),
  /** Container port the node app listens on. */
  port: z.number().int().positive().max(65535).default(3000),
  /** Custom hostnames for the provider ingress to accept (CNAME targets). */
  hosts: z.array(z.string().min(1)).max(5).optional(),
  // NOTE: no `env` — removed in task.5054 (ZERO_CALLER_SECRETS). Node-owners set
  // custom values via POST /api/v1/nodes/<id>/secrets; sourcing picks them up only
  // if allowlisted (SCOPED_CREDS_ONLY).
});

/** OpenBao service path holding env-wide Loki push creds for the v000 log pump. */
const LOG_PUSH_SOURCE_SERVICE = "node-template";

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "compute.deployments.create",
    auth: { mode: "required", getSessionUser },
  },
  async (ctx, request, sessionUser) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { nodeId, sourceSha, port, hosts } = parsed.data;

    // RBAC gate FIRST — provider-configured state (501 vs 201) is not disclosed to
    // principals without the node grant.
    const gate = await resolveNodeAndAuthorize({
      id: nodeId,
      userId: sessionUser.id,
      action: "node.flight",
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.errorCode },
        { status: gate.status }
      );
    }
    const node = gate.node;

    const compute = getContainer().computeCapability;
    if (!compute.provision) {
      return NextResponse.json(
        {
          error: "compute_write_unsupported",
          message:
            "no workload-capable compute provider configured (AKASH_CONSOLE_API_KEY unset)",
        },
        { status: 501 }
      );
    }

    const env = serverEnv();
    if (!env.NODE_SUBMODULE_PARENT_OWNER || !env.NODE_SUBMODULE_PARENT_REPO) {
      return NextResponse.json(
        { error: "deploy_plane_unconfigured" },
        { status: 503 }
      );
    }
    // Server-side env sourcing needs the operator's own env identity (OpenBao path
    // stamp) and its in-cluster OpenBao identity (same seam as self-serve secrets).
    const deployEnv = env.DEPLOY_ENVIRONMENT;
    if (!deployEnv) {
      return NextResponse.json({ error: "deploy_env_unset" }, { status: 503 });
    }
    let secretsPlane: ReturnType<typeof createOperatorSecretsPlane>;
    try {
      secretsPlane = createOperatorSecretsPlane(env);
    } catch {
      return NextResponse.json(
        { error: "secrets_plane_config_missing" },
        { status: 503 }
      );
    }

    // NODE_REF_ARTIFACT_GATE: resolve + verify the CI-published image for this sourceSha.
    const deployPlane = createOperatorDeployPlane(env);
    const prepared = await deployPlane.prepareNodeRefCandidateFlight({
      parentOwner: env.NODE_SUBMODULE_PARENT_OWNER,
      parentRepo: env.NODE_SUBMODULE_PARENT_REPO,
      nodeId: node.nodeId,
      slug: node.slug,
      sourceSha,
    });

    // ZERO_CALLER_SECRETS: source the node's env bucket + Loki push creds via the
    // operator's own OpenBao identity (read retried; 404 = positively absent).
    let nodeSecrets: Record<string, string> | null;
    let templateSecrets: Record<string, string> | null;
    try {
      [nodeSecrets, templateSecrets] = await Promise.all([
        secretsPlane.readServiceSecrets({ service: node.slug, env: deployEnv }),
        secretsPlane.readServiceSecrets({
          service: LOG_PUSH_SOURCE_SERVICE,
          env: deployEnv,
        }),
      ]);
    } catch {
      // Transient OpenBao failure after retries — never deploy half-sourced (bug.5081).
      return NextResponse.json(
        { error: "workload_env_unavailable" },
        { status: 503 }
      );
    }
    if (!nodeSecrets) {
      return NextResponse.json(
        {
          error: "workload_env_missing",
          message: `no secrets materialized at cogni/${deployEnv}/${node.slug} — flight the node once (secret-materialize) before deploying to compute`,
        },
        { status: 503 }
      );
    }

    // SCOPED_CREDS_ONLY: per-deploy budget-capped virtual key — the shared LiteLLM
    // master never reaches the compute provider.
    let mintedLlmKey: string;
    try {
      mintedLlmKey = await createNodeVirtualKeyMinter(env)({
        slug: node.slug,
        nodeId: node.nodeId,
        sourceSha,
      });
    } catch {
      return NextResponse.json(
        { error: "litellm_key_mint_failed" },
        { status: 502 }
      );
    }

    const composed = composeWorkloadEnv({
      deployEnv,
      nodeSecrets,
      mintedLlmKey,
    });
    if (!composed.ok) {
      // Key NAMES only — values never appear in responses or logs.
      return NextResponse.json(
        { error: "workload_env_incomplete", missing: composed.missing },
        { status: 503 }
      );
    }
    const logPush = buildLogPush(templateSecrets, deployEnv);
    ctx.log.info(
      {
        nodeId: node.nodeId,
        slug: node.slug,
        envKeyCount: Object.keys(composed.env).length,
        logPush: logPush !== null,
      },
      "workload env sourced server-side"
    );

    const publicUrl = hosts?.[0]
      ? `https://${hosts[0]}`
      : `https://${node.slug}-akash.invalid`; // replaced once the provider URI is CNAMEd

    const spec = buildNodeWorkloadSpec({
      slug: node.slug,
      nodeId: node.nodeId,
      image: prepared.image,
      port,
      publicUrl,
      env: composed.env,
      ...(logPush ? { logPush } : {}),
      ...(hosts ? { hosts } : {}),
    });

    const workload = await compute.provision({ env: "shared", spec });
    return NextResponse.json(
      { nodeId: node.nodeId, slug: node.slug, sourceSha, workload },
      { status: 201 }
    );
  }
);
