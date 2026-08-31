// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/api/cognition-bundle`
 * Purpose: Unit tests for the cognition bundle markdown renderer.
 * Scope: Pure rendering only; route IO and hub reads are validated separately.
 * Invariants: Session-start heading is human node identity first, deploy SHA as metadata.
 * Side-effects: none
 * Links: src/app/api/v1/cognition/_bundle.ts
 * @public
 */

import { describe, expect, it } from "vitest";
import {
  renderBundleMarkdown,
  SESSION_BOOTSTRAP_INVARIANTS,
} from "@/app/api/v1/cognition/_bundle";

const baseInput = {
  node: "4ff8eac1-4eba-4ed0-931b-b1fe4f64713d",
  name: "operator",
  mission: "Coordinate code, deploys, and validation for Cogni nodes.",
  generatedAt: "2026-06-16T19:31:02.838Z",
  origin: "https://test.cognidao.org",
  buildSha: "f52036b33ffecdf5244662e673a0d6d174c50150",
  toolingInvariants: ["Adopt one production work item."],
  skillsIndex: [
    {
      id: "node-launch-handoff",
      title: "Node launch handoff",
      entryType: "guide",
      domain: "infrastructure",
    },
  ],
  domainPointers: [
    {
      domain: "infrastructure",
      entryCount: 7,
      description: "Runtime and deploy knowledge.",
    },
  ],
  orientation: null,
} as const;

describe("renderBundleMarkdown", () => {
  it("renders name, mission, counts, and load time while demoting build SHA", () => {
    const markdown = renderBundleMarkdown(baseInput);

    const [heading, blank, subtitle, spacer, delivered] = markdown.split("\n");

    expect(heading).toBe("# operator — Cogni Session Cognition");
    expect(blank).toBe("");
    expect(subtitle).toBe(
      "> Coordinate code, deploys, and validation for Cogni nodes. · 1 skills · 1 domains · loaded 2026-06-16 19:31"
    );
    expect(spacer).toBe(">");
    expect(delivered).toContain("node `4ff8eac1-4eba-4ed0-931b-b1fe4f64713d`");
    expect(delivered).toContain(
      "build `f52036b33ffecdf5244662e673a0d6d174c50150`"
    );
    expect(heading).not.toContain("f52036b3");
  });

  it("surfaces the derived candidate (flight + validate) URL for the node", () => {
    // operator is the primary test apex...
    expect(renderBundleMarkdown(baseInput)).toContain(
      "https://test.cognidao.org"
    );
    // ...every other node is a slugged test host.
    expect(renderBundleMarkdown({ ...baseInput, name: "poly" })).toContain(
      "https://poly-test.cognidao.org"
    );
  });

  it("renders the current-node orientation entry IN FULL above the tooling invariants", () => {
    const fullOrientation = [
      "**USE WHEN:** first read of every operator session.",
      "",
      "## Mission",
      "Operator is the agentic git-manager. Edit nodes/operator/app.",
      "",
      "## Principles",
      "- Recall before write, refine over extend.",
    ].join("\n");
    const markdown = renderBundleMarkdown({
      ...baseInput,
      orientation: {
        id: "operator-agent-orientation",
        content: fullOrientation,
      },
    });

    expect(markdown).toContain("## Orientation — recall this first");
    // The whole entry body is inlined, not a truncated excerpt — every section
    // survives, including ones past the old 480-char first-paragraph cut.
    expect(markdown).toContain(fullOrientation);
    expect(markdown).toContain("## Mission");
    expect(markdown).toContain("- Recall before write, refine over extend.");
    // No second-recall footer: the bootstrap IS the orientation.
    expect(markdown).not.toContain("for the full context");
    // Map comes before the constitution.
    expect(markdown.indexOf("## Orientation — recall this first")).toBeLessThan(
      markdown.indexOf("## Tooling invariants")
    );
  });

  // The bootstrap is served to every harness (Claude Code, Codex, OpenAI, plain
  // curl). The "how to watch an async gate" contract must therefore be a portable
  // shell recipe — not a Claude-only Monitor/background primitive. Pin it here so
  // a future refactor can't silently drop the harness-agnostic guidance.
  it("carries a harness-agnostic watch recipe for every async CI/CD gate", () => {
    const watch = SESSION_BOOTSTRAP_INVARIANTS.find((line) =>
      line.startsWith("Watch every async gate")
    );
    expect(
      watch,
      "a dedicated async-gate watch invariant must exist"
    ).toBeDefined();
    const text = watch as string;
    // Portable, not harness-specific: a blocking shell command is the verdict.
    expect(text).toContain("blocking foreground command");
    expect(text).toContain(
      "no harness-specific monitor/background/notification primitive"
    );
    // (1) PR CI: the exact gh one-liner, --fail-fast, and the --required trap.
    expect(text).toContain("gh pr checks <PR> --watch --fail-fast");
    expect(text).toContain("do NOT add `--required`");
    // (2)/(3) flight + deploy: /version.buildSha is the ground-truth verdict.
    expect(text).toContain("/version");
    expect(text).toContain(".buildSha");
    // Never fire-and-forget; a "done"/exit-0 notification is not the verdict.
    expect(text).toContain("silence is not success");
  });

  it("keeps the CICD-sequence invariant free of the CI watch mechanics it delegates", () => {
    const cicd = SESSION_BOOTSTRAP_INVARIANTS.find((line) =>
      line.startsWith("Follow the CICD checklist")
    );
    // The step order lives in invariant 3; the *how to watch* lives in invariant
    // 4. Don't duplicate the gh one-liner across both.
    expect(cicd).toBeDefined();
    expect(cicd).not.toContain("--fail-fast");
  });

  it("prompts seeding an orientation entry when none exists", () => {
    const markdown = renderBundleMarkdown(baseInput);

    expect(markdown).toContain("## Orientation — recall this first");
    expect(markdown).toContain("No `operator-agent-orientation` entry yet");
  });
});
