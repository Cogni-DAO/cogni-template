// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/attribution/epochs/[id]/finalize/route`
 * Purpose: SIWE + approver-gated endpoint for finalizing an epoch (review → finalized) with EIP-712 signature.
 * Scope: Auth-protected POST endpoint. Starts FinalizeEpochWorkflow via Temporal. Returns 202 + workflowId (WRITES_VIA_TEMPORAL). Does not perform finalization logic directly — delegates to workflow.
 * Invariants: WRITE_ROUTES_APPROVER_GATED, WRITES_VIA_TEMPORAL, EPOCH_FINALIZE_IDEMPOTENT.
 * Side-effects: IO (HTTP response, Temporal workflow start, Temporal task queue describe)
 * Links: docs/spec/attribution-ledger.md, contracts/attribution.finalize-epoch.v1.contract
 * @public
 */

import {
  FinalizeEpochInputSchema,
  finalizeEpochOperation,
} from "@cogni/node-contracts";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { checkApprover } from "@/app/api/v1/attribution/_lib/approver-guard";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { getNodeId, getScopeId } from "@/shared/config";
import { serverEnv } from "@/shared/env/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Task-queue BASE for ledger workflows — must match ledger-worker.ts. Finalize is
 * dispatched to this node's PER-NODE queue `${base}-${nodeId}` (bug.5023): a single
 * shared `ledger-tasks` queue let a wrong-scope worker steal another node's finalize →
 * getEpoch (scope-gated) returns null → "epoch not found" terminal fail + forced re-sign.
 * Mirrors the scheduler-tasks QUEUE_PER_NODE_ISOLATION convention (worker.ts::nodeTaskQueueName).
 */
const LEDGER_TASK_QUEUE_BASE = "ledger-tasks";

/**
 * temporal.api.enums.v1.TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW = 1
 * From @temporalio/proto (transitive dep, not re-exported by @temporalio/client).
 */
const TASK_QUEUE_TYPE_WORKFLOW = 1;

export const POST = wrapRouteHandlerWithLogging<{
  params: Promise<{ id: string }>;
}>(
  {
    routeId: "ledger.finalize-epoch",
    auth: { mode: "required", getSessionUser },
  },
  async (ctx, request, sessionUser, context) => {
    if (!context) throw new Error("context required for dynamic routes");
    const { id } = await context.params;
    let epochId: bigint;
    try {
      epochId = BigInt(id);
    } catch {
      return NextResponse.json({ error: "Invalid epoch ID" }, { status: 400 });
    }

    // Load epoch so we can check against pinned approvers (APPROVERS_PINNED_AT_REVIEW)
    const store = getContainer().attributionStore;
    const epoch = await store.getEpoch(epochId);
    if (!epoch) {
      return NextResponse.json({ error: "Epoch not found" }, { status: 404 });
    }

    // WRITE_ROUTES_APPROVER_GATED — checks against epoch's pinned approvers
    const denied = checkApprover(ctx, sessionUser?.walletAddress, epoch);
    if (denied) return denied;

    // Parse and validate request body
    const body = await request.json();
    const parsed = FinalizeEpochInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { signature } = parsed.data;
    const signerAddress = sessionUser?.walletAddress;
    if (!signerAddress) {
      return NextResponse.json(
        { error: "SIWE session missing wallet address" },
        { status: 401 }
      );
    }

    // Start FinalizeEpochWorkflow via Temporal
    const env = serverEnv();
    const scopeId = getScopeId();
    // bug.5023: dispatch to THIS node's own ledger queue so no wrong-scope worker can
    // steal the finalize. The shared `ledger-tasks` queue is purged (per-node only).
    const ledgerTaskQueue = `${LEDGER_TASK_QUEUE_BASE}-${getNodeId()}`;

    const workflowId = `ledger-finalize-${scopeId}-${epochId.toString()}`;

    // TODO: Replace per-request connection with a singleton/connection manager
    // to avoid connection overhead on every finalize call.
    const connection = await Connection.connect({
      address: env.TEMPORAL_ADDRESS,
    });
    const client = new Client({
      connection,
      namespace: env.TEMPORAL_NAMESPACE,
    });

    try {
      // Defense-in-depth: verify THIS node's ledger queue has active pollers before submitting
      const taskQueueDesc = await connection.workflowService.describeTaskQueue({
        namespace: env.TEMPORAL_NAMESPACE,
        taskQueue: { name: ledgerTaskQueue },
        taskQueueType: TASK_QUEUE_TYPE_WORKFLOW,
      });
      const pollersCount = taskQueueDesc.pollers?.length ?? 0;

      if (pollersCount === 0) {
        ctx.log.warn(
          { workflowId, taskQueue: ledgerTaskQueue, pollersCount: 0 },
          "ledger.finalize_no_pollers"
        );
        return NextResponse.json(
          {
            error: `No workers polling ${ledgerTaskQueue}. Finalize worker may be down.`,
          },
          { status: 503 }
        );
      }

      let created = true;

      try {
        await client.workflow.start("FinalizeEpochWorkflow", {
          taskQueue: ledgerTaskQueue,
          workflowId,
          args: [
            {
              epochId: epochId.toString(),
              signature,
              signerAddress,
            },
          ],
        });
      } catch (err) {
        // EPOCH_FINALIZE_IDEMPOTENT: already running or completed → return same workflowId
        if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
          throw err;
        }
        created = false;
        ctx.log.info(
          { workflowId },
          "Finalize workflow already running — returning existing ID"
        );
      }

      ctx.log.info(
        {
          epochId: id,
          workflowId,
          taskQueue: ledgerTaskQueue,
          pollersCount,
          created,
        },
        "ledger.finalize_submitted"
      );

      return NextResponse.json(
        finalizeEpochOperation.output.parse({ workflowId, created }),
        { status: 202 }
      );
    } finally {
      await connection.close();
    }
  }
);
