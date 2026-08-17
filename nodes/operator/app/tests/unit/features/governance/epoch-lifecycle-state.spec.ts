// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `epoch-lifecycle-state.spec`
 * Purpose: Lock the honest mapping from epoch/manifest/chain evidence to lifecycle checkpoints.
 * Scope: Pure table-driven state tests; no React, IO, time, or adapters.
 * Invariants: FINALIZED_NOT_PUBLISHED, UNKNOWN_NEVER_COMPLETE, CUMULATIVE_COVERS_PRIOR.
 * Side-effects: none
 * Links: src/features/governance/lib/epoch-lifecycle-state.ts, bug.5042
 */

import type { DistributionLifecycleOutput } from "@cogni/node-contracts";
import { describe, expect, it } from "vitest";

import {
  deriveEpochLifecycle,
  selectFinishEpoch,
} from "@/features/governance/lib/epoch-lifecycle-state";
import type { EpochView } from "@/features/governance/types";

const EMPTY: DistributionLifecycleOutput = {
  foldedEpochIds: [],
  latestFoldedEpochId: null,
  publishedThroughEpochId: null,
  publicationEvidence: "not_published",
};

function epoch(id: string, status: EpochView["status"]): EpochView {
  return {
    id,
    status,
    periodStart: "2026-08-10T00:00:00.000Z",
    periodEnd: "2026-08-17T00:00:00.000Z",
    poolTotalCredits: status === "finalized" ? "100" : null,
    approvers: status === "open" ? null : ["0xapprover"],
    contributors: [],
    unresolvedCount: 0,
    unresolvedActivities: [],
  };
}

function states(
  value: ReturnType<typeof deriveEpochLifecycle>
): Record<string, string> {
  return Object.fromEntries(value.steps.map((step) => [step.id, step.state]));
}

describe("deriveEpochLifecycle", () => {
  it("moves an ended open epoch from collect to review without claiming server state changed", () => {
    expect(
      states(deriveEpochLifecycle(epoch("8", "open"), EMPTY, false))
    ).toMatchObject({
      collect: "current",
      review: "locked",
    });
    expect(
      states(deriveEpochLifecycle(epoch("8", "open"), EMPTY, true))
    ).toMatchObject({
      collect: "complete",
      review: "current",
      finalize: "locked",
    });
  });

  it("does not infer fold or publish from finalized", () => {
    const result = deriveEpochLifecycle(epoch("7", "finalized"), EMPTY, true);
    expect(result.isFolded).toBe(false);
    expect(result.isPublished).toBe(false);
    expect(states(result)).toMatchObject({
      finalize: "complete",
      publish: "unavailable",
      claim: "unavailable",
    });
  });

  it("offers publish only for the newest frozen manifest with known-not-published evidence", () => {
    const evidence: DistributionLifecycleOutput = {
      foldedEpochIds: ["7"],
      latestFoldedEpochId: "7",
      publishedThroughEpochId: null,
      publicationEvidence: "not_published",
    };
    expect(
      states(deriveEpochLifecycle(epoch("7", "finalized"), evidence, true))
    ).toMatchObject({ publish: "current", claim: "locked" });
  });

  it("marks an older epoch covered when a later cumulative root is live", () => {
    const evidence: DistributionLifecycleOutput = {
      foldedEpochIds: ["6", "7"],
      latestFoldedEpochId: "7",
      publishedThroughEpochId: "7",
      publicationEvidence: "matched",
    };
    const result = deriveEpochLifecycle(
      epoch("6", "finalized"),
      evidence,
      true
    );
    expect(result.isPublished).toBe(true);
    expect(states(result)).toMatchObject({
      publish: "complete",
      claim: "current",
    });
  });

  it("keeps publish and claim unknown when live-root evidence is unavailable", () => {
    const evidence: DistributionLifecycleOutput = {
      foldedEpochIds: ["7"],
      latestFoldedEpochId: "7",
      publishedThroughEpochId: null,
      publicationEvidence: "unknown",
    };
    expect(
      states(deriveEpochLifecycle(epoch("7", "finalized"), evidence, true))
    ).toMatchObject({ publish: "unknown", claim: "unknown" });
  });
});

describe("selectFinishEpoch", () => {
  it("prioritizes review backlog, then ended open, then finalized", () => {
    const open = epoch("8", "open");
    const review = epoch("7", "review");
    const finalized = epoch("6", "finalized");
    expect(
      selectFinishEpoch([open, finalized, review], Date.parse(open.periodEnd))
    ).toBe(review);
    expect(
      selectFinishEpoch([open, finalized], Date.parse(open.periodEnd))
    ).toBe(open);
    expect(
      selectFinishEpoch([finalized], Date.parse("2026-08-18T00:00:00Z"))
    ).toBe(finalized);
  });
});
