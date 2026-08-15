#!/usr/bin/env tsx
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

// TOKS2 RIG SEED — one REVIEW-status epoch for the toks2 node (localhost e2e).
// Mirrors scripts/db/seed.mts::seedReviewEpoch exactly, but:
//   - node/scope come from the AUGMENTED toks2 spec (.harness)
//   - 3 pr_merged receipts, ALL by the LINKED owner contributor whose users row
//     carries wallet 0x070075F1…c949 → every locked claimant resolves to that wallet
//   - approvers = [0x070075F1…c949] (same wallet signs on /gov/review)
// guard: DATABASE_SERVICE_URL must be local. Idempotent-ish: refuses to run if a
// toks2 review epoch already exists.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeApproverSetHash,
  computeArtifactsHash,
  computeEnricherInputsHash,
  computeEpochWindowV1,
  computeReceiptWeights,
  computeWeightConfigHash,
  deriveAllocationAlgoRef,
  type InsertReceiptClaimantsParams,
  type SelectedReceiptForAttribution,
} from "@cogni/attribution-ledger";
import { DrizzleAttributionAdapter } from "@cogni/db-client";
import { createServiceDbClient } from "@cogni/db-client/service";
import { identityEvents, userBindings } from "@cogni/db-schema/identity";
import { users } from "@cogni/db-schema/refs";
import { extractNodeId, extractScopeId, parseRepoSpec } from "@cogni/repo-spec";
import { sql } from "drizzle-orm";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SPEC_PATH = path.join(REPO_ROOT, ".harness", ".cogni", "repo-spec.yaml");

const REPO_REF = "cogni-test-org/toks2";
const APPROVER_WALLET = "0x070075F1389Ae1182aBac722B36CA12285d0c949";
const SEED_APPROVERS = [APPROVER_WALLET];
const WEIGHT_CONFIG: Record<string, number> = {
  "github:pr_merged": 1000,
  "github:review_submitted": 0,
  "github:issue_closed": 0,
};
const ALLOCATION_ALGO_REF = deriveAllocationAlgoRef("cogni-v0.0");
const CLAIMANT_RESOLVER_REF = "cogni.default-author.v0";
const CLAIMANT_ALGO_REF = "default-author-v0";
const PRODUCER = "toks2-rig-seed";
const PRODUCER_VERSION = "0.1.0-toks2";

// Linked owner contributor — github derekg1729 (58641509). The userId is resolved
// at runtime: if a users row already carries the approver wallet (Derek's real
// SIWE user from prior local sessions) we REUSE it, so the /gov session user and
// the claimant are the same row. Falls back to a deterministic seed user.
const OWNER = {
  platformUserId: "58641509",
  login: "derekg1729",
  name: "Derek G (toks2 owner)",
  userId: "d0000000-0000-4000-a000-000058641509", // overwritten if wallet user exists
  wallet: APPROVER_WALLET,
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const payloadHash = (d: Record<string, unknown>) =>
  sha256(JSON.stringify(d, Object.keys(d).sort()));

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_SERVICE_URL ?? "";
  const host = (() => {
    try {
      return new URL(dbUrl).hostname;
    } catch {
      return "";
    }
  })();
  if (!new Set(["localhost", "127.0.0.1", "postgres", "::1"]).has(host)) {
    throw new Error(
      `guard ABORT: DATABASE_SERVICE_URL host '${host}' is not local`
    );
  }

  const spec = parseRepoSpec(readFileSync(SPEC_PATH, "utf8"));
  const NODE_ID = extractNodeId(spec);
  const SCOPE_ID = extractScopeId(spec);
  console.log(`seeding toks2 review epoch — node ${NODE_ID} scope ${SCOPE_ID}`);

  const db = createServiceDbClient(dbUrl);
  const store = new DrizzleAttributionAdapter(db, SCOPE_ID);

  // SEED_INCREMENT=1: add ANOTHER review epoch ON TOP of the existing chain (for testing a
  // second publish+claim that folds onto the prior manifest — cumulative grows, mint delta =
  // this epoch's new allocation). Uses a distinct (current-week) period so it's a new epoch.
  const INCREMENT = process.env.SEED_INCREMENT === "1";
  try {
    const existing = await store.listEpochs(NODE_ID);
    if (existing.length > 0 && !INCREMENT) {
      console.log(
        `epochs already exist for toks2: ${existing.map((e) => `${e.id}=${e.status}`).join(", ")} — refusing to reseed.`
      );
      return;
    }
    if (INCREMENT) {
      console.log(
        `SEED_INCREMENT: adding a review epoch onto existing [${existing.map((e) => `${e.id}=${e.status}`).join(", ")}]`
      );
    }

    // linked owner user + github binding (wallet_address = approver/claimant).
    // Reuse the existing wallet-bound user when present (Derek's real SIWE user).
    const walletUser = await db.execute(
      sql`SELECT id FROM users WHERE lower(wallet_address) = lower(${OWNER.wallet}) LIMIT 1`
    );
    const existingId = (walletUser as unknown as { id: string }[])[0]?.id;
    if (existingId) {
      OWNER.userId = existingId;
      console.log(`  reusing existing wallet-bound user ${existingId}`);
    } else {
      await db
        .insert(users)
        .values({ id: OWNER.userId, name: OWNER.name })
        .onConflictDoNothing();
      await db.execute(
        sql`UPDATE users SET wallet_address = ${OWNER.wallet} WHERE id = ${OWNER.userId}`
      );
    }
    await db
      .insert(userBindings)
      .values({
        id: `seed:github-binding:${OWNER.platformUserId}`,
        userId: OWNER.userId,
        provider: "github",
        externalId: OWNER.platformUserId,
        providerLogin: OWNER.login,
      })
      .onConflictDoNothing({
        target: [userBindings.provider, userBindings.externalId],
      });
    await db
      .insert(identityEvents)
      .values({
        id: `seed:identity-event:github:${OWNER.platformUserId}:toks2`,
        userId: OWNER.userId,
        eventType: "bind",
        payload: {
          method: "toks2-rig-seed",
          provider: "github",
          external_id: OWNER.platformUserId,
          provider_login: OWNER.login,
          repo: REPO_REF,
        },
      })
      .onConflictDoNothing();
    console.log(`  linked owner user ${OWNER.userId} → wallet ${OWNER.wallet}`);

    // one review epoch, pool 12000 credits. Baseline seeds the LAST full week; an increment
    // seeds the CURRENT week so it lands as a distinct, later epoch on top of the baseline.
    const asOf = new Date(Date.now() - (INCREMENT ? 0 : 7 * 86_400_000));
    const { periodStartIso, periodEndIso } = computeEpochWindowV1({
      asOfIso: asOf.toISOString(),
      epochLengthDays: 7,
      timezone: "UTC",
      weekStart: "monday",
    });
    const periodStart = new Date(periodStartIso);
    const periodEnd = new Date(periodEndIso);
    const poolCredits = 12000n;

    const events = [1, 2, 3].map((n) => {
      const eventTime = new Date(periodEnd.getTime() - n * 86_400_000);
      return {
        id: `github:pr:${REPO_REF}:${n}`,
        source: "github" as const,
        eventType: "pr_merged" as const,
        artifactUrl: `https://github.com/${REPO_REF}/pull/${n}`,
        title: `toks2 rig PR #${n}`,
        eventTime,
        payloadHash: payloadHash({
          authorId: OWNER.platformUserId,
          id: `github:pr:${REPO_REF}:${n}`,
          mergedAt: eventTime.toISOString(),
        }),
      };
    });

    const epoch = await store.createEpoch({
      nodeId: NODE_ID,
      scopeId: SCOPE_ID,
      periodStart,
      periodEnd,
      weightConfig: WEIGHT_CONFIG,
    });
    console.log(
      `  created epoch ${epoch.id} [${periodStartIso.slice(0, 10)} → ${periodEndIso.slice(0, 10)}]`
    );

    await store.insertIngestionReceipts(
      events.map((e) => ({
        receiptId: e.id,
        nodeId: NODE_ID,
        source: e.source,
        eventType: e.eventType,
        platformUserId: OWNER.platformUserId,
        platformLogin: OWNER.login,
        artifactUrl: e.artifactUrl,
        metadata: { title: e.title, repo: REPO_REF },
        payloadHash: e.payloadHash,
        producer: PRODUCER,
        producerVersion: PRODUCER_VERSION,
        eventTime: e.eventTime,
        retrievedAt: e.eventTime,
      }))
    );
    console.log(`  inserted ${events.length} ingestion receipts`);

    const receipts: SelectedReceiptForAttribution[] = events.map((e) => ({
      receiptId: e.id,
      userId: OWNER.userId,
      source: e.source,
      eventType: e.eventType,
      included: true,
      weightOverrideMilli: null,
      platformUserId: OWNER.platformUserId,
      platformLogin: OWNER.login,
      artifactUrl: e.artifactUrl,
      eventTime: e.eventTime,
      payloadHash: e.payloadHash,
    }));

    await store.insertSelectionDoNothing(
      receipts.map((r) => ({
        nodeId: NODE_ID,
        epochId: epoch.id,
        receiptId: r.receiptId,
        userId: r.userId,
        included: true,
      }))
    );
    console.log(`  inserted ${receipts.length} selections`);

    // resolved-user projection (all weight on the owner).
    const weights = computeReceiptWeights(
      ALLOCATION_ALGO_REF,
      receipts,
      WEIGHT_CONFIG
    );
    const totalUnits = weights.reduce((s, w) => s + w.units, 0n);
    await store.insertUserProjections([
      {
        nodeId: NODE_ID,
        epochId: epoch.id,
        userId: OWNER.userId,
        projectedUnits: totalUnits,
        receiptCount: receipts.length,
      },
    ]);
    console.log(`  inserted owner projection (${totalUnits} units)`);

    await store.insertPoolComponent({
      nodeId: NODE_ID,
      epochId: epoch.id,
      componentId: "base_issuance",
      algorithmVersion: "v1.0.0",
      inputsJson: { base_amount: Number(poolCredits) },
      amountCredits: poolCredits,
    });
    console.log("  inserted pool component (12000 credits)");

    const claimantParams: InsertReceiptClaimantsParams[] = events.map((e) => ({
      nodeId: NODE_ID,
      epochId: epoch.id,
      receiptId: e.id,
      resolverRef: CLAIMANT_RESOLVER_REF,
      algoRef: CLAIMANT_ALGO_REF,
      inputsHash: sha256(`${e.id}:${OWNER.platformUserId}`),
      claimantKeys: [`user:${OWNER.userId}`],
      createdBy: PRODUCER,
    }));
    for (const p of claimantParams) await store.upsertDraftClaimants(p);
    const locked = await store.lockClaimantsForEpoch(epoch.id);
    console.log(
      `  locked ${locked} receipt claimants (all → user:${OWNER.userId})`
    );

    // echo evaluation (mirrors seed.mts buildEchoEvaluation).
    const payloadJson: Record<string, unknown> = {
      totalEvents: events.length,
      byEventType: { "github:pr_merged": events.length },
      byUserId: { [OWNER.userId]: events.length },
    };
    const evalPayloadHash = sha256(
      JSON.stringify(payloadJson, Object.keys(payloadJson).sort())
    );
    const inputsHash = await computeEnricherInputsHash({
      epochId: epoch.id,
      receipts: events.map((e) => ({
        receiptId: e.id,
        receiptPayloadHash: e.payloadHash,
      })),
    });
    const evaluations = [
      {
        nodeId: NODE_ID,
        epochId: epoch.id,
        evaluationRef: "cogni.echo.v0",
        status: "locked" as const,
        algoRef: "echo-v0",
        inputsHash,
        payloadHash: evalPayloadHash,
        payloadJson,
      },
    ];

    await store.closeIngestionWithEvaluations({
      epochId: epoch.id,
      approvers: SEED_APPROVERS,
      approverSetHash: await computeApproverSetHash(SEED_APPROVERS),
      allocationAlgoRef: ALLOCATION_ALGO_REF,
      weightConfigHash: await computeWeightConfigHash(WEIGHT_CONFIG),
      evaluations,
      artifactsHash: await computeArtifactsHash(evaluations),
    });
    console.log("  closed ingestion (open → REVIEW)");
    console.log(
      `\nDONE. Epoch ${epoch.id} is in review for node toks2; approver = ${APPROVER_WALLET}.`
    );
    console.log("  sign at:  http://localhost:3000/gov/review");
  } finally {
    await db.$client.end();
  }
}

main().catch((e: Error) => {
  console.error("seed-toks2 failed:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
