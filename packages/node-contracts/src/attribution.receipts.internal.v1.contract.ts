// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/attribution.receipts.internal.v1.contract`
 * Purpose: Wire format for internal attribution receipt delivery (operator gateway -> owning node app).
 * Scope: Wire format only; does not implement the route, delivery client, or business logic.
 *   For POST /api/internal/attribution/receipts (operator gateway -> owning node): the operator
 *   resolves repo -> owning node_id (source_refs, #1924) and the node persists receipts in its OWN
 *   ledger. Mirrors graph-runs.create.internal.v1.
 * Invariants:
 *   - Bearer SCHEDULER_API_TOKEN required (MVP dispatch identity, same as graph dispatch;
 *     the per-node dispatch principal is the hardening — task.5033).
 *   - NODE_WRITES_OWN_LEDGER: the envelope `nodeId` MUST equal the receiving node's own node_id;
 *     receipt rows carry no node_id on the wire — the node stamps its own. A node never persists
 *     a foreign ledger.
 *   - RECEIPT_IDEMPOTENT: same-ID/same-economic-content retry is a visible duplicate no-op;
 *     same-ID/different-economic-content is a visible conflict and never silently wins.
 *   - RECEIPT_CONTEXT_V1_STRICT: source/event/producer are bounded and known events require their
 *     complete versioned attribution context.
 *   - All consumers use z.infer types; Date fields are ISO-8601 strings on the wire.
 * Side-effects: none
 * Links: /api/internal/attribution/receipts route,
 *   nodes/operator/app/src/features/ingestion/services/webhook-receiver.ts,
 *   docs/design/attribution-operator-gateway.md, task.0280, story.5023
 * @internal
 */

import {
  RECEIPT_EVENT_TYPES,
  RECEIPT_PRODUCERS,
  RECEIPT_SOURCES,
} from "@cogni/ingestion-core";
import { z } from "zod";

export const ReceiptSourceSchema = z.enum(RECEIPT_SOURCES);
export const ReceiptEventTypeSchema = z.enum(RECEIPT_EVENT_TYPES);
export const ReceiptProducerSchema = z.enum(RECEIPT_PRODUCERS);

const contextV1 = z.object({ schemaVersion: z.literal(1) }).passthrough();
const githubRepo = z.string().regex(/^[^/\s]+\/[^/\s]+$/);
const nullableSha = z.string().min(1).nullable();

const prMergedContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  prNumber: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  baseBranch: z.string().min(1),
  branch: z.string().min(1),
  mergeCommitSha: z.string().min(1),
  mergedById: z.string().min(1),
  commitShas: z.array(z.string().min(1)).min(1),
  labels: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  action: z.literal("closed"),
});

const prLifecycleContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  prNumber: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  baseBranch: z.string().min(1),
  branch: z.string().min(1),
  labels: z.array(z.string()),
  action: z.enum(["opened", "closed"]),
});

const reviewContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  prNumber: z.number().int().positive(),
  prBaseBranch: z.string().min(1),
  prMergeCommitSha: nullableSha,
  state: z.string().min(1),
});

const issueContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  issueNumber: z.number().int().positive(),
  title: z.string().min(1),
  action: z.enum(["opened", "closed"]),
});

const commentContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  issueNumber: z.number().int().positive(),
});

const commitPushedContextV1 = contextV1.extend({
  providerRepoId: z.string().min(1),
  repo: githubRepo,
  ref: z.string().min(1),
  after: z.string().min(1),
  commitCount: z.number().int().nonnegative(),
});

const cogniSignalContextV1 = contextV1.extend({
  txHash: z.string().min(1),
  webhookId: z.string().nullable(),
  webhookType: z.string().nullable(),
});

const contextSchemaByEventType = {
  pr_merged: prMergedContextV1,
  pr_opened: prLifecycleContextV1,
  pr_closed: prLifecycleContextV1,
  review_submitted: reviewContextV1,
  issue_opened: issueContextV1,
  issue_closed: issueContextV1,
  comment_created: commentContextV1,
  commit_pushed: commitPushedContextV1,
  cogni_signal: cogniSignalContextV1,
} as const;

function expectedSourceForEvent(
  eventType: z.infer<typeof ReceiptEventTypeSchema>
): z.infer<typeof ReceiptSourceSchema> {
  return eventType === "cogni_signal" ? "alchemy" : "github";
}

/**
 * One ingestion receipt on the wire — mirrors `InsertReceiptParams`
 * (`@cogni/attribution-ledger`) with `Date` fields as ISO strings and WITHOUT
 * `nodeId` (NODE_WRITES_OWN_LEDGER: the receiving node stamps its own node_id).
 */
export const InternalReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    source: ReceiptSourceSchema,
    eventType: ReceiptEventTypeSchema,
    platformUserId: z.string(),
    platformLogin: z.string().nullish(),
    artifactUrl: z.string().nullish(),
    metadata: z.record(z.string(), z.unknown()),
    /** SHA-256 of immutable economic content; mutable display snapshot fields are excluded. */
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    producer: ReceiptProducerSchema,
    producerVersion: z.string().regex(/^\d+\.\d+\.\d+(?:[-+].+)?$/),
    /** ISO-8601 */
    eventTime: z.string().datetime(),
    /** ISO-8601 */
    retrievedAt: z.string().datetime(),
  })
  .superRefine((receipt, ctx) => {
    const context = contextSchemaByEventType[receipt.eventType].safeParse(
      receipt.metadata
    );
    if (!context.success) {
      for (const issue of context.error.issues) {
        ctx.addIssue({ ...issue, path: ["metadata", ...issue.path] });
      }
    }

    const expectedSource = expectedSourceForEvent(receipt.eventType);
    if (receipt.source !== expectedSource) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: `${receipt.eventType} requires source ${expectedSource}`,
      });
    }

    if (
      (receipt.producer === "github:webhook" ||
        receipt.producer === "github:poll") &&
      receipt.source !== "github"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["producer"],
        message: `${receipt.producer} requires source github`,
      });
    }
    if (
      receipt.producer === "alchemy:webhook" &&
      receipt.source !== "alchemy"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["producer"],
        message: "alchemy:webhook requires source alchemy",
      });
    }
  });

export const InternalDeliverReceiptsInputSchema = z
  .object({
    /** The owning node's node_id — the receiving node asserts this equals its own. */
    nodeId: z.string().uuid(),
    /** Source key — every receipt in the envelope must match it. */
    source: ReceiptSourceSchema,
    receipts: z.array(InternalReceiptSchema).min(1).max(500),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.receipts.forEach((receipt, index) => {
      if (receipt.source !== input.source) {
        ctx.addIssue({
          code: "custom",
          path: ["receipts", index, "source"],
          message: `receipt source ${receipt.source} does not match envelope source ${input.source}`,
        });
      }
      if (seen.has(receipt.receiptId)) {
        ctx.addIssue({
          code: "custom",
          path: ["receipts", index, "receiptId"],
          message: "duplicate receiptId in delivery envelope",
        });
      }
      seen.add(receipt.receiptId);
    });
  });

export const InternalDeliverReceiptsOutputSchema = z.object({
  ok: z.literal(true),
  nodeId: z.string().uuid(),
  /** Number presented after strict validation. */
  received: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  conflicts: z.literal(0),
});

export const InternalDeliverReceiptsConflictOutputSchema = z.object({
  ok: z.literal(false),
  nodeId: z.string().uuid(),
  received: z.number().int().nonnegative(),
  inserted: z.literal(0),
  duplicates: z.number().int().nonnegative(),
  conflicts: z.number().int().positive(),
  conflictReceiptIds: z.array(z.string().min(1)).min(1),
});

export const internalDeliverReceiptsOperation = {
  id: "attribution.receipts.internal.v1",
  summary: "Deliver ingestion receipts (operator gateway -> owning node app)",
  description:
    "Internal endpoint the operator calls to persist normalized activity receipts in the owning node's OWN ledger. Bearer SCHEDULER_API_TOKEN. Same-economic-content retries are no-ops; conflicting economic content is rejected.",
  input: InternalDeliverReceiptsInputSchema,
  output: z.union([
    InternalDeliverReceiptsOutputSchema,
    InternalDeliverReceiptsConflictOutputSchema,
  ]),
} as const;

export type InternalReceipt = z.infer<typeof InternalReceiptSchema>;
export type InternalDeliverReceiptsInput = z.infer<
  typeof InternalDeliverReceiptsInputSchema
>;
export type InternalDeliverReceiptsOutput = z.infer<
  typeof InternalDeliverReceiptsOutputSchema
>;
export type InternalDeliverReceiptsConflictOutput = z.infer<
  typeof InternalDeliverReceiptsConflictOutputSchema
>;
