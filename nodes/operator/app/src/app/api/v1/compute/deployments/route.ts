// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/api/v1/compute/deployments`
 * Purpose: POST — provision ONE node's container workload on decentralized compute via the
 *   injected ComputeResourcePort write half (task.5044). The v1 seam that puts a Cogni node on
 *   Akash: resolve the node's built image (same artifact gate as candidate flight), build the
 *   self-contained workload spec, and lease provider compute.
 * Scope: Thin HTTP shell — Cogni-token auth, `node.flight` RBAC on the target node, image
 *   resolution via DeployPlanePort, delegate to computeCapability.provision. Does NOT track
 *   workloads in a registry table (vNext: compute_resources read-cache) or bill per-caller
 *   (v0 bills the shared operator account).
 * Invariants:
 *   - DEVELOPER_GATED: requires `node.flight` on the target node (same tuple as flight/deploy-state).
 *   - NODE_REF_ARTIFACT_GATE: the image is resolved+verified via prepareNodeRefCandidateFlight —
 *     you can only deploy an artifact the node's CI actually published.
 *   - WRITE_HALF_OPTIONAL: 501 compute_write_unsupported when no workload-capable provider is
 *     configured (AKASH_CONSOLE_API_KEY unset).
 *   - CAPABILITY_INJECTION + ADAPTER_SWAPPABLE: no provider type leaks into this route.
 * Side-effects: IO (registry read, authz check, GHCR artifact check, provider lease — spends escrow)
 * Links: docs/spec/cicd-platform-boundary.md § typed operator control plane, task.5044,
 *   adapters/server/compute/akash-compute.adapter.ts, [leaseId]/route.ts (status/release)
 * @public
 */

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/app/_lib/auth/session";
import { resolveNodeAndAuthorize } from "@/app/_lib/node-rbac";
import { createCatalogControlDeployPlane } from "@/bootstrap/capabilities/operator-deploy-plane";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { buildNodeWorkloadSpec } from "@/features/compute/node-workload-spec";
import type { DeployPlanePort } from "@/ports";
import { serverEnv } from "@/shared/env";
import { resolveNodeCatalogSource } from "@/shared/node-registry/catalog-source";

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
  /**
   * Connection + secret env for the workload (shared-substrate DSNs, AUTH_SECRET,
   * LITELLM_*). SCOPED_CREDS_ONLY: node-scoped / budget-capped values — these reach the
   * compute provider. v0 replaces caller-supplied env with server-side OpenBao sourcing.
   */
  env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string()).optional(),
});

export const POST = wrapRouteHandlerWithLogging(
  {
    routeId: "compute.deployments.create",
    auth: { mode: "required", getSessionUser },
  },
  async (_ctx, request, sessionUser) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { nodeId, sourceSha, port, hosts, env: workloadEnv } = parsed.data;

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
    const catalogSource = resolveNodeCatalogSource(env);
    if (!catalogSource) {
      return NextResponse.json(
        { error: "deploy_plane_unconfigured" },
        { status: 503 }
      );
    }

    // NODE_REF_ARTIFACT_GATE: resolve + verify the CI-published image for this sourceSha.
    let deployPlane: DeployPlanePort;
    try {
      deployPlane = createCatalogControlDeployPlane(env);
    } catch {
      return NextResponse.json(
        { error: "deploy_plane_unconfigured" },
        { status: 503 }
      );
    }
    const prepared = await deployPlane.prepareNodeRefCandidateFlight({
      parentOwner: catalogSource.owner,
      parentRepo: catalogSource.repo,
      nodeId: node.nodeId,
      slug: node.slug,
      sourceSha,
    });

    const publicUrl = hosts?.[0]
      ? `https://${hosts[0]}`
      : `https://${node.slug}-akash.invalid`; // replaced once the provider URI is CNAMEd

    const spec = buildNodeWorkloadSpec({
      slug: node.slug,
      nodeId: node.nodeId,
      image: prepared.image,
      port,
      publicUrl,
      // AUTH_SECRET default keeps a bare workload bootable; real deployments override via
      // `env` with shared-substrate wiring (SCOPED_CREDS_ONLY).
      env: { AUTH_SECRET: randomBytes(32).toString("hex"), ...workloadEnv },
      ...(hosts ? { hosts } : {}),
    });

    const workload = await compute.provision({ env: "shared", spec });
    return NextResponse.json(
      { nodeId: node.nodeId, slug: node.slug, sourceSha, workload },
      { status: 201 }
    );
  }
);
