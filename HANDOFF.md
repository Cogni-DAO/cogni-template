# Docs Migration Handoff

## Project Goal

Migrate ~100 legacy `docs/*.md` files (SCREAMING_CASE, no frontmatter) into a typed document system with CI-enforced YAML frontmatter. **Zero data loss.**

Three document types: **specs** (`docs/spec/`), **guides** (`docs/guides/`), **initiatives** (`work/initiatives/`). Many legacy docs contain both as-built design AND roadmap content ("AB+road") — these get split into a spec + initiative pair.

## Worktree

`/private/tmp/docs-integration/` on branch `refactor/docs-migrate-batch-4`. **All work happens here, never in `/Users/derek/dev/cogni-template/`.**

## Current Status

**91 done, 9 remaining.** Validator passes: `pnpm check:docs` → 97 files, 97 unique IDs.

**Working tree has uncommitted changes** for 4 completed migrations (UNIFIED_GRAPH_LAUNCH_SPEC, ONCHAIN_READERS, TENANT_CONNECTIONS_SPEC, TOOL_USE_SPEC). These need to be committed (1 commit per doc) before continuing.

**Last commit:** `2d6e6704` — docs(migrate): node-ci-cd-contract spec + new ini.ci-cd-reusable

**This session completed (uncommitted):**

1. `UNIFIED_GRAPH_LAUNCH_SPEC.md` → `docs/spec/unified-graph-launch.md` + new `ini.unified-graph-launch.md`
2. `ONCHAIN_READERS.md` → `docs/spec/onchain-readers.md` + new `ini.onchain-indexer.md`
3. `TENANT_CONNECTIONS_SPEC.md` → `docs/spec/tenant-connections.md` + new `ini.tenant-connections.md`
4. `TOOL_USE_SPEC.md` → `docs/spec/tool-use.md` + new `ini.tool-use-evolution.md`

**TOOL_USE_SPEC.md note:** The `git mv`, initiative creation, and spec cleanup all happened, but the tracker Done column was NOT yet marked `[x]`. Verify the migration is complete before marking it done — specifically check that all roadmap content (Implementation Checklists P0-P3, PX, File Pointers for planned changes) is in the initiative and removed from the spec.

---

## Remaining Docs (9) — All AB+road Splits

Every one produces a spec + initiative (some also produce a guide).

### Needs Commit First (4 — done, uncommitted)

| Source                         | Spec                    | Ini                         | Status                                    |
| ------------------------------ | ----------------------- | --------------------------- | ----------------------------------------- |
| `UNIFIED_GRAPH_LAUNCH_SPEC.md` | unified-graph-launch.md | ini.unified-graph-launch.md | Done, uncommitted                         |
| `ONCHAIN_READERS.md`           | onchain-readers.md      | ini.onchain-indexer.md      | Done, uncommitted                         |
| `TENANT_CONNECTIONS_SPEC.md`   | tenant-connections.md   | ini.tenant-connections.md   | Done, uncommitted                         |
| `TOOL_USE_SPEC.md`             | tool-use.md             | ini.tool-use-evolution.md   | Done, uncommitted — verify tracker update |

### Needs Migration (5 remaining)

| Source                   | Lines | Spec                  | Ini                                     | Guide                   | Notes                                                                                                          |
| ------------------------ | ----- | --------------------- | --------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `AI_GOVERNANCE_DATA.md`  | 1044  | ai-governance-data.md | ini.governance-agents.md                | —                       | Largest remaining. 28 invariants, 7 DB schemas, 7 TS interfaces, 3 architecture diagrams, ~100 checklist tasks |
| `HUMAN_IN_THE_LOOP.md`   | 585   | human-in-the-loop.md  | ini.hil-graphs.md                       | —                       |                                                                                                                |
| `LANGGRAPH_AI.md`        | 427   | langgraph-patterns.md | —                                       | langgraph-guide.md      | spec + guide split                                                                                             |
| `LANGGRAPH_SERVER.md`    | 705   | langgraph-server.md   | ini.langgraph-server-production.md      | langgraph-server-dev.md | 3-way split: spec + guide + initiative                                                                         |
| `NODE_FORMATION_SPEC.md` | 453   | node-formation.md     | ini.node-formation-ui.md                | node-formation-guide.md | 3-way split                                                                                                    |
| `PAYMENTS_DESIGN.md`     | 513   | payments-design.md    | ini.payments-enhancements.md (existing) | payments-setup.md       | 3-way split, **append** to existing ini                                                                        |

### Deferred by Owner (2 — do NOT migrate)

| Source                | Reason                                                   |
| --------------------- | -------------------------------------------------------- |
| `GRAPH_EXECUTION.md`  | Owner is actively updating on `feat/sandbox-0.75` branch |
| `SANDBOXED_AGENTS.md` | Owner is actively updating on `feat/sandbox-0.75` branch |

---

## Migration Process

**The exact step-by-step process is documented in the migration tracker itself:**
`work/issues/wi.docs-migration-tracker.md` → section "Migration Process (per doc) — Exact Steps"

Read that section before doing anything. It is the single source of truth for the process.

**Summary of the critical ordering:**

1. Read and classify content
2. `git mv` to spec dir (preserves history)
3. Search existing initiatives (20+ exist — prefer appending over creating new)
4. **Route roadmap to initiative FIRST** — verify zero data loss by reading it back
5. **THEN** surgically clean the spec (add frontmatter, restructure, remove roadmap sections)
6. Update SPEC_INDEX, check AGENTS.md pointers
7. `pnpm check:docs` — must pass
8. Mark `[x]` in tracker
9. Commit individually: `docs(migrate): target-name spec + ...`

---

## Key Files

| File                                       | Purpose                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `work/issues/wi.docs-migration-tracker.md` | **Master tracker** — Done/Refs columns, destination mappings, AND the exact migration process steps |
| `docs/spec/SPEC_INDEX.md`                  | Spec index — add row per spec, alphabetical by ID                                                   |
| `docs/_templates/spec.md`                  | Spec template — required frontmatter fields + H2 headings                                           |
| `work/_templates/initiative.md`            | Initiative template — Crawl/Walk/Run deliverable tables                                             |
| `docs/_templates/guide.md`                 | Guide template                                                                                      |
| `scripts/validate-docs-metadata.mjs`       | CI validator — run via `pnpm check:docs`                                                            |
| `work/initiatives/`                        | **20+ existing initiative files** — always search here before creating new ones                     |
| `AGENTS.md`                                | Root pointers — update when migrating docs it links to                                              |

## Existing Initiatives (20+)

Check `ls work/initiatives/` for the current list. Key ones that remaining docs may append to:

- `ini.payments-enhancements.md` — PAYMENTS_DESIGN.md will append here
- `ini.observability-hardening.md` — already has content from 2 prior migrations

For docs without a clear existing match, create new initiatives per the tracker's Ini column suggestion.

---

## Hard Invariants

1. **ZERO DATA LOSS** — every fact, table row, ASCII diagram copied verbatim
2. **SAFE ORDER** — initiative content FIRST, verify, THEN restructure spec
3. **`pnpm check:docs` AFTER EVERY DOC** — validator catches frontmatter, heading, ID issues
4. **TRACKER AFTER EVERY DOC** — `[x]` in Done column
5. **SPEC_INDEX AFTER EVERY SPEC**
6. **TODOs → initiatives, NOT spec Open Questions**
7. **SOURCE ATTRIBUTION** — `> Source: docs/ORIGINAL.md` in initiatives
8. **`git mv` + surgical edits** — preserve git history
9. **PREFER EXISTING INITIATIVES** — search before creating new
10. **DESIGN CONTENT STAYS IN SPECS** — invariants, schemas, interfaces, diagrams are spec-grade
11. **ONE DOC AT A TIME** — complete full cycle before starting next
12. **COMMIT 1 MIGRATION AT A TIME**
13. **DEFER GRAPH_EXECUTION.md and SANDBOXED_AGENTS.md**

## Gotchas

- **`spec_state` triggers heading validation** — if a spec has `spec_state: draft`, the validator requires H2s: Context, Goal, Non-Goals, Core Invariants, Design, Acceptance Checks
- **Initiative `estimate` max is 5** — validator rejects higher values
- **Initiative state enum:** `Active|Paused|Done|Dropped`
- **Validator requires `assignees`** to be non-empty on initiatives
- **Tracker Ini column may be wrong** — always evaluate the right initiative home yourself
- **AGENTS.md pointers** — check and update when migrating docs it links to
- **3-way splits** (spec + guide + initiative): create guide in `docs/guides/` with guide template frontmatter
