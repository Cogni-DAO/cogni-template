// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: tests for `@features/nodes/distribution-setup-state`
 * Purpose: Pin the ground-truth fold behind the node distribution-setup stepper (story.5004) —
 *   most importantly the toks3 regression: on-chain work done + activation PR OPEN must derive
 *   "recorded, merge to persist" (pr_open, awaiting), NEVER baseline "not set up". Also pins
 *   ordering (deploy → record → authorize), the incomplete-record state, and refresh determinism.
 * Scope: Pure function only — no React, no IO.
 * Side-effects: none
 * Links: src/features/nodes/distribution-setup-state.ts,
 *   src/features/nodes/DistributionsCard.client.tsx
 */

import { describe, expect, it } from "vitest";

import {
  type DistributionSetupInput,
  deriveDistributionSetup,
} from "@/features/nodes/distribution-setup-state";

const DISTRIBUTOR = "0xB8A2000000000000000000000000000000007ceb";
const OTHER_DISTRIBUTOR = "0x6666666666666666666666666666666666666666";
const PR = { number: 1, url: "https://github.com/Cogni-DAO/toks3/pull/1" };

function input(over: Partial<DistributionSetupInput>): DistributionSetupInput {
  return {
    repoSpecActive: false,
    openPr: null,
    recordedDistributorAddress: null,
    pendingDistributorAddress: null,
    sessionDistributorAddress: null,
    distributorVerified: false,
    authorized: false,
    ...over,
  };
}

describe("deriveDistributionSetup", () => {
  it("fresh node: deploy is the current step, later steps say why they wait", () => {
    const derived = deriveDistributionSetup(input({}));
    expect(derived.currentStep).toBe(1);
    expect(derived.steps).toEqual({
      deploy: "current",
      record: "pending",
      authorize: "pending",
    });
    expect(derived.distributorAddress).toBeNull();
    expect(derived.recordPlane).toEqual({ kind: "not_recorded" });
  });

  // toks3 repro (story.5004): everything succeeded on-chain and the record PR is OPEN but
  // unmerged. A refresh reads main's `pending_activation` — the fold must surface the open PR
  // as first-class "recorded — merge to persist" and keep the distributor visible. NEVER baseline.
  it("toks3 regression: on-chain done + open record PR is pr_open/awaiting, never baseline", () => {
    const derived = deriveDistributionSetup(
      input({
        repoSpecActive: false, // main still reads pending_activation pre-merge
        openPr: PR,
        pendingDistributorAddress: DISTRIBUTOR, // address lives only in the PR branch
        distributorVerified: true,
        authorized: true, // chain truth: grant already live
      })
    );
    expect(derived.distributorAddress).toBe(DISTRIBUTOR);
    expect(derived.distributorSource).toBe("activation-pr");
    expect(derived.recordPlane).toEqual({ kind: "pr_open", pr: PR });
    expect(derived.steps).toEqual({
      deploy: "done",
      record: "awaiting",
      authorize: "done",
    });
    // Nothing left for the OWNER to click — the merge persists the record.
    expect(derived.currentStep).toBeNull();
  });

  it("an existing open record cannot bypass CAS authorization", () => {
    const derived = deriveDistributionSetup(
      input({
        openPr: PR,
        pendingDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
        authorized: false,
      })
    );
    expect(derived.steps.record).toBe("awaiting");
    expect(derived.currentStep).toBe(2);
    expect(derived.steps.authorize).toBe("current");
  });

  it("deployed this session but unrecorded: authorize is current before record", () => {
    const derived = deriveDistributionSetup(
      input({
        sessionDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
      })
    );
    expect(derived.distributorAddress).toBe(DISTRIBUTOR);
    expect(derived.distributorSource).toBe("session");
    expect(derived.recordPlane).toEqual({ kind: "not_recorded" });
    expect(derived.currentStep).toBe(2);
    expect(derived.steps).toEqual({
      deploy: "done",
      record: "pending",
      authorize: "current",
    });
  });

  it("fully recorded + authorized: all steps done, nothing current", () => {
    const derived = deriveDistributionSetup(
      input({
        repoSpecActive: true,
        recordedDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
        authorized: true,
      })
    );
    expect(derived.recordPlane).toEqual({ kind: "recorded" });
    expect(derived.steps).toEqual({
      deploy: "done",
      record: "done",
      authorize: "done",
    });
    expect(derived.currentStep).toBeNull();
  });

  it("recorded address matching is case-insensitive", () => {
    const derived = deriveDistributionSetup(
      input({
        repoSpecActive: true,
        recordedDistributorAddress: DISTRIBUTOR.toLowerCase(),
        sessionDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
      })
    );
    expect(derived.recordPlane).toEqual({ kind: "recorded" });
  });

  it("legacy metadata-only activation: spec active but no distributor → deploy is current", () => {
    const derived = deriveDistributionSetup(input({ repoSpecActive: true }));
    // No distributor known anywhere: the record carries everything we know → recorded.
    expect(derived.recordPlane).toEqual({ kind: "recorded" });
    expect(derived.currentStep).toBe(1);
    expect(derived.steps.deploy).toBe("current");
  });

  it("record stays pending until CAS authorization is verified", () => {
    const derived = deriveDistributionSetup(
      input({
        repoSpecActive: true,
        sessionDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
      })
    );
    expect(derived.recordPlane).toEqual({ kind: "record_incomplete" });
    expect(derived.currentStep).toBe(2);
    expect(derived.steps.authorize).toBe("current");
    expect(derived.steps.record).toBe("pending");
  });

  it("record becomes current only after deploy and CAS authorization both verify", () => {
    const derived = deriveDistributionSetup(
      input({
        sessionDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
        authorized: true,
      })
    );
    expect(derived.currentStep).toBe(3);
    expect(derived.steps.record).toBe("current");
  });

  it("redeploy after record: session address differing from main's record → record_incomplete", () => {
    const derived = deriveDistributionSetup(
      input({
        repoSpecActive: true,
        recordedDistributorAddress: OTHER_DISTRIBUTOR,
        sessionDistributorAddress: DISTRIBUTOR,
        distributorVerified: true,
        authorized: true,
      })
    );
    expect(derived.distributorAddress).toBe(DISTRIBUTOR); // freshest truth wins display
    expect(derived.recordPlane).toEqual({ kind: "record_incomplete" });
    expect(derived.currentStep).toBe(3);
  });

  it("refresh-safe by construction: identical inputs derive identical state", () => {
    const shape = input({
      openPr: PR,
      pendingDistributorAddress: DISTRIBUTOR,
      distributorVerified: true,
      authorized: true,
    });
    expect(deriveDistributionSetup(shape)).toEqual(
      deriveDistributionSetup(shape)
    );
  });

  it("an address without owner/token verification does not complete deploy", () => {
    const derived = deriveDistributionSetup(
      input({ sessionDistributorAddress: DISTRIBUTOR })
    );
    expect(derived.currentStep).toBe(1);
    expect(derived.steps.deploy).toBe("current");
    expect(derived.steps.authorize).toBe("pending");
  });
});
