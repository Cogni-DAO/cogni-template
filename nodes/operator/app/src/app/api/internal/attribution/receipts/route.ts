// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/internal/attribution/receipts`
 * Purpose: Internal endpoint the operator gateway delivers normalized git/activity receipts to;
 *   the owning node persists them in its OWN attribution ledger.
 * Scope: Auth-protected POST that persists delivered receipts in this node's OWN ledger. Does not
 *   run collection, selection, or identity resolution — persistence only; the operator resolves the
 *   owning node and normalizes receipts upstream. Mirrors graph-runs.create.internal.v1.
 * Invariants:
 *   - INTERNAL_API_SHARED_SECRET: Requires Bearer SCHEDULER_API_TOKEN
 *   - NODE_WRITES_OWN_LEDGER: envelope `nodeId` MUST equal this node's own node_id; the node stamps
 *     its own node_id on each receipt. A node never persists a foreign ledger.
 *   - RECEIPT_IDEMPOTENT: same-economic-content retry is a counted no-op; differing economic content for the same
 *     deterministic ID is a 409 and the attempted batch is rolled back.
 *   - RECEIPT_HASH_SELF_VERIFYING: payloadHash is recomputed over immutable v1 economic context.
 * Side-effects: IO (writes ingestion_receipts via AttributionStore)
 * Links: attribution.receipts.internal.v1.contract, task.0280, story.5023
 * @internal
 */

import {
  type InsertReceiptParams,
  isReceiptContentConflictError,
  type ReceiptInsertResult,
} from "@cogni/attribution-ledger";
import { hashReceiptEconomicContent } from "@cogni/ingestion-core";
import {
  type InternalDeliverReceiptsInput,
  internalDeliverReceiptsOperation,
} from "@cogni/node-contracts";
import { verifySchedulerBearer } from "@cogni/node-shared";
import { NextResponse } from "next/server";
import { getContainer } from "@/bootstrap/container";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import { getNodeId } from "@/shared/config";
import { serverEnv } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = wrapRouteHandlerWithLogging(
  { routeId: "attribution.receipts.internal", auth: { mode: "none" } },
  async (ctx, request) => {
    const env = serverEnv();
    const log = ctx.log;

    if (
      !verifySchedulerBearer(
        request.headers.get("authorization"),
        env.SCHEDULER_API_TOKEN
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = internalDeliverReceiptsOperation.input.safeParse(body);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.issues }, "Invalid request body");
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data: InternalDeliverReceiptsInput = parsed.data;
    const nodeId = getNodeId();

    // NODE_WRITES_OWN_LEDGER: refuse to persist a foreign node's ledger.
    if (data.nodeId !== nodeId) {
      log.warn(
        { envelopeNodeId: data.nodeId, nodeId },
        "Rejected foreign node ledger delivery"
      );
      return NextResponse.json(
        { error: "foreign node ledger" },
        { status: 403 }
      );
    }

    // Idempotency-Key is honored by economic-content duplicate classification at the
    // DB boundary; surface it in structured logs for delivery tracing.
    const idempotencyKey = request.headers.get("idempotency-key");

    for (const receipt of data.receipts) {
      const expectedHash = await hashReceiptEconomicContent({
        receiptId: receipt.receiptId,
        source: receipt.source,
        eventType: receipt.eventType,
        platformUserId: receipt.platformUserId,
        artifactUrl: receipt.artifactUrl ?? null,
        metadata: receipt.metadata,
        eventTime: receipt.eventTime,
      });
      if (expectedHash !== receipt.payloadHash) {
        log.warn(
          { receiptId: receipt.receiptId },
          "Rejected receipt with invalid canonical payload hash"
        );
        return NextResponse.json(
          {
            error: "payloadHash does not match canonical economic content",
            receiptId: receipt.receiptId,
          },
          { status: 400 }
        );
      }
    }

    const mapped: InsertReceiptParams[] = data.receipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      nodeId,
      source: receipt.source,
      eventType: receipt.eventType,
      platformUserId: receipt.platformUserId,
      // wire fields are nullish (null | undefined); InsertReceiptParams is string | null
      // under exactOptionalPropertyTypes — coerce undefined -> null.
      platformLogin: receipt.platformLogin ?? null,
      artifactUrl: receipt.artifactUrl ?? null,
      metadata: receipt.metadata ?? null,
      payloadHash: receipt.payloadHash,
      producer: receipt.producer,
      producerVersion: receipt.producerVersion,
      eventTime: new Date(receipt.eventTime),
      retrievedAt: new Date(receipt.retrievedAt),
    }));

    let insertResult: ReceiptInsertResult;
    try {
      insertResult =
        await getContainer().attributionStore.insertIngestionReceipts(mapped);
    } catch (error) {
      if (!isReceiptContentConflictError(error)) throw error;
      log.error(
        {
          event: "attribution.receipt_conflict",
          nodeId,
          source: data.source,
          conflictReceiptIds: error.receiptIds,
          duplicateCount: error.duplicateCount,
          idempotencyKey,
        },
        "Rejected conflicting deterministic receipt content"
      );
      return NextResponse.json(
        {
          ok: false,
          nodeId,
          received: mapped.length,
          inserted: 0,
          duplicates: error.duplicateCount,
          conflicts: error.receiptIds.length,
          conflictReceiptIds: error.receiptIds,
        },
        { status: 409 }
      );
    }

    log.info(
      {
        event: "attribution.receipts_ingested",
        nodeId,
        source: data.source,
        count: mapped.length,
        inserted: insertResult.inserted,
        duplicates: insertResult.duplicates,
        idempotencyKey,
      },
      "Ingested attribution receipts"
    );

    return NextResponse.json(
      {
        ok: true,
        nodeId,
        received: mapped.length,
        inserted: insertResult.inserted,
        duplicates: insertResult.duplicates,
        conflicts: 0,
      },
      { status: 200 }
    );
  }
);
