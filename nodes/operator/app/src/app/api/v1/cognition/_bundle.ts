// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/cognition/_bundle`
 * Purpose: Pure composition of the session-start kickstart bundle — the
 *   irreducible tooling invariants (code-owned) plus the markdown renderer
 *   that frames hub-delivered skills + domain pointers for a SessionStart hook.
 * Scope: Pure functions + the invariants constant. No I/O, no env, no container.
 * Invariants:
 *   - IRREDUCIBLE_INVARIANTS_ALWAYS_PRESENT: the constant is the one piece of
 *     cognition that must render even when the hub is empty/unreachable.
 *   - ORIENTATION_LOADED_IN_FULL: renders pointers (id + title + recall path)
 *     for skills/domains, but the current-node `<slug>-agent-orientation` entry
 *     is rendered IN FULL — the bootstrap IS the agent's operating map, so the
 *     git skeleton stays minimal and the Dolt orientation carries the substance.
 * Side-effects: none
 * Links: docs/spec/node-baas-architecture.md
 * @internal
 */

import type {
  CognitionDomainPointer,
  CognitionSkillPointer,
} from "@cogni/node-contracts";

/**
 * The irreducible session contract. This is the ONLY cognition that is
 * code-owned rather than hub-delivered: it must survive an empty or unreachable
 * hub so every session still bootstraps. Everything expandable (skills, guides,
 * domain expertise) is delivered live from the knowledge hub on top of this.
 */
export const SESSION_BOOTSTRAP_INVARIANTS: readonly string[] = [
  "ONE work item + ONE node per session (CI-gated). Claim, heartbeat, and link your PR at /api/v1/work/items/{id}; coordination.nextAction is authoritative.",
  "Cite before you act — not just before you write. Ladder: skills/guides → this hub (/api/v1/knowledge?domain=) → our code (node-template, operator) → external OSS. Recall merged + your own open branch; refine in place over adding new. An action with no citation is the exception you justify.",
  "Ship via PR: same-repo branch → CI green (gh pr checks) → flight to candidate → merge. The operator is the deploy plane (flight, logs, secrets); code, work, and knowledge live in the node repo + hub.",
  "Done = before→after behavior proven on the live surface, NOT a SHA deployed. Capture the BROKEN signal first, flight, then exercise the same surface and read the FIXED behavior back from Loki at that SHA. 'My request reached the build' is deployment proof, not function. Post a /validate-candidate scorecard — the merge gate; reprove prod-facing changes in preview/prod.",
  "Drive to done autonomously. You hold durable authority (flight/merge/promote via RBAC) and hours of runway — spend it. Checkpoint a human only for the irreversible or out-of-scope, never for approval you already have; a pending question usually means lost work.",
  "Your <slug>-agent-orientation is the operating map: recall it first, refine it as the node changes.",
];

const COGNITION_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "skill",
  "guide",
  "playbook",
]);

/** True for hub entries that belong in an agent's actionable skills index. */
export function isCognitionEntry(entryType: string | undefined): boolean {
  return COGNITION_ENTRY_TYPES.has(entryType ?? "");
}

/** Make a string safe to drop into a GFM table cell (no `|`, no line breaks). */
export function escapeCell(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** The current-node orientation entry — rendered in full as the session map. */
export interface OrientationEntry {
  id: string;
  content: string;
}

export interface RenderBundleInput {
  node: string;
  name: string;
  mission: string | null;
  generatedAt: string;
  origin: string;
  buildSha: string;
  toolingInvariants: readonly string[];
  skillsIndex: readonly CognitionSkillPointer[];
  domainPointers: readonly CognitionDomainPointer[];
  /** The current node's `<slug>-agent-orientation` entry (full), or null if unseeded. */
  orientation: OrientationEntry | null;
}

/**
 * Render the kickstart bundle as GFM markdown. A SessionStart hook echoes this
 * verbatim to stdout; Claude Code and Codex both inject SessionStart stdout
 * into the model's context.
 */
export function renderBundleMarkdown(input: RenderBundleInput): string {
  const {
    node,
    name,
    mission,
    generatedAt,
    origin,
    buildSha,
    toolingInvariants,
    orientation,
  } = input;
  const { skillsIndex, domainPointers } = input;
  // "2026-06-16 14:20" — human date, not an ISO wall of digits.
  const loadedAt = generatedAt.replace("T", " ").slice(0, 16);
  const subtitle = [
    mission,
    `${skillsIndex.length} skills`,
    `${domainPointers.length} domains`,
    `loaded ${loadedAt}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const invariants = toolingInvariants
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");

  // The node's candidate (pre-merge flight slot) — where "validated on
  // candidate" happens. operator is the primary test apex; every other node is
  // a slugged test host. Concrete so agents stop guessing the hostname.
  const candidateHost =
    name === "operator" ? "test.cognidao.org" : `${name}-test.cognidao.org`;

  const skillRows =
    skillsIndex.length > 0
      ? skillsIndex
          .map(
            (s) => `| \`${s.id}\` | ${s.entryType} | ${escapeCell(s.title)} |`
          )
          .join("\n")
      : "| _(none merged yet)_ | | |";

  const domainRows =
    domainPointers.length > 0
      ? domainPointers
          .map(
            (d) =>
              `| \`${d.domain}\` | ${d.entryCount} | ${escapeCell(d.description)} |`
          )
          .join("\n")
      : "| _(none)_ | | |";

  // The map, not just the constitution: the current-node orientation entry
  // rendered IN FULL — the bootstrap IS the orientation (no second recall).
  // Falls back to a seed prompt when unset so the convention surfaces even
  // before the entry exists.
  const orientationLines = orientation
    ? ["## Orientation — recall this first", "", orientation.content]
    : [
        "## Orientation — recall this first",
        "",
        `_No \`${name}-agent-orientation\` entry yet. Recall the hub, then seed one — the current-node operating map for agents (what this node is, where authority lives, what's safe, what to recall next) — and refine it as the repo changes._`,
      ];

  return [
    `# ${name} — Cogni Session Cognition`,
    "",
    `> ${subtitle}`,
    ">",
    `> Delivered at session start from ${origin}/api/v1/cognition — replaces git-synced AGENTS.md sprawl. (node \`${node}\` · build \`${buildSha}\`)`,
    "",
    ...orientationLines,
    "",
    "## Tooling invariants",
    "",
    invariants,
    "",
    `_Your candidate (flight + validate target): \`https://${candidateHost}\` · Loki namespace \`cogni-candidate-a\`._`,
    "",
    "## Skills index (recall full content from the hub before acting)",
    "",
    "| entry | type | use when |",
    "| --- | --- | --- |",
    skillRows,
    "",
    "## Knowledge domains — RECALL_BEFORE_WRITE",
    "",
    "| domain | entries | about |",
    "| --- | --- | --- |",
    domainRows,
    "",
    "## Recall + contribute",
    "",
    `- Browse a domain: \`GET ${origin}/api/v1/knowledge?domain=<domain>\``,
    `- Full entry body: \`GET ${origin}/api/v1/knowledge/{id}\``,
    `- Discovery doc: \`GET ${origin}/.well-known/agent.json\``,
    "- Contribute durable knowledge: `/contribute-knowledge-to-cogni` (refine in place > write new).",
    `- Cite an existing entry in your edit: \`POST ${origin}/api/v1/knowledge/contributions/{id}/commits\` with \`{op:"cite", citingId, citedId, citationType}\` — cross-plane cites (target on main) resolve and stay valid post-merge.`,
    "",
  ].join("\n");
}
