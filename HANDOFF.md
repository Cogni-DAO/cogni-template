# Docs Migration Handoff

## Project Goal

Migrate ~100 legacy `docs/*.md` files (SCREAMING_CASE, no frontmatter) into a typed document system with CI-enforced YAML frontmatter:

- **Specs** (`docs/spec/`) — as-built design contracts with enforceable invariants
- **Initiatives** (`work/initiatives/`) — roadmaps with Crawl/Walk/Run deliverable tables
- **Guides** (`docs/guides/`) — procedural how-to docs
- **Research** (`docs/research/`) — spikes, investigations, design reviews (validated)
- **Research Archive** (`docs/research/archive/`) — closed research (not validated)
- **Postmortems** (`docs/postmortems/`) — incident analyses (validated)
- **Archive** (`docs/archive/`) — obsolete/superseded docs (not validated)

## HARD INVARIANTS — DO NOT VIOLATE

1. **DATA PRESERVATION**: No data loss. Every fact, code snippet, table row, file path from the original must appear in the migrated output. Roadmap/TODO content goes to initiatives — never deleted, never summarized to keywords.

2. **`pnpm check:docs` AFTER EVERY DOC**: Run validation after each individual migration. Fix before proceeding. Never batch.

3. **Update tracker AFTER EVERY DOC**: Mark `[x]` in the Done column of `work/issues/wi.docs-migration-tracker.md`.

4. **Update SPEC_INDEX.md AFTER EVERY SPEC**: Add new specs to the table.

5. **TODOs/future work → initiatives, NOT spec Open Questions**: Open Questions is only for minor spec clarifications. Planned work routes to existing initiatives (check `work/initiatives/` first) or new ones.

6. **Work ONLY in the worktree**: `/private/tmp/docs-integration/` — never touch `/Users/derek/dev/cogni-template/`.

7. **Source attribution on initiative appends**: When routing roadmap content to an initiative, include a `Source` column in deliverable tables or a `> Source:` annotation so future readers can trace content origin.

8. **Prefer `git mv` + surgical edits**: Move files with `git mv`, then use targeted edits to add frontmatter and restructure. Do not rewrite entire files from scratch and delete originals.

## Current Status

**Branch**: `refactor/docs-migrate-batch-2` in worktree at `/private/tmp/docs-integration/`

**Committed (8 commits on branch)**:

| Commit     | What                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ |
| `37479dab` | 16 as-built specs migrated to `docs/spec/`                                                 |
| `7043a313` | 5 initiative files created with roadmap content extracted from specs                       |
| `588f0f17` | 10 more as-built specs migrated to `docs/spec/`                                            |
| `c5803bd2` | Service creation guide + service spawning roadmap appended to initiative                   |
| `39967696` | Archive 11 obsolete docs, create `docs/research/` (6 files) + `docs/postmortems/` (1 file) |
| `2ea8a734` | 7 simple procedural → guide migrations                                                     |
| `0f95d6e0` | Alloy/Loki guide + roadmap routed to `ini.observability-hardening.md`                      |
| `93c1ed9f` | Wallet auth guide + new `ini.accounts-api-keys.md` + tracker update                        |

**Working tree**: Clean (only untracked `HANDOFF.md`).

**Validator**: `pnpm check:docs` passes (65 files, 65 unique IDs).

**Migration progress**: 67 done, 33 remaining.

## What's Done

- 26 as-built specs migrated (frontmatter, required H2s, SCREAMING_SNAKE invariant IDs)
- 10 guides in `docs/guides/` (1 pre-existing + 9 newly migrated)
- 8 initiative files in `work/initiatives/` (2 pre-existing + 5 from spec extractions + 1 from wallet auth)
- 16 obsolete docs archived to `docs/archive/`
- 6 research docs in `docs/research/` with frontmatter
- 1 postmortem in `docs/postmortems/` with frontmatter
- SPEC_INDEX.md has entries for all 35 migrated specs
- Migration tracker has `[x]` for all 67 done rows

## What's Remaining (33 docs)

| Category                          | Count | Notes                                                                                             |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Roadmap → initiative              | 13    | Pure future work, no spec needed. Each becomes a new initiative or appends to existing one.       |
| AB+road (spec + initiative split) | 20    | Hardest — each produces both a spec AND initiative content. Line-by-line content triage required. |

### Recommended order

1. **Roadmap docs** (13) — straightforward, create/append initiative files
2. **AB+road splits** (20) — hardest, do last. Each needs content triage: as-built → spec, planned → initiative

### Remaining Roadmap docs (13)

| Source                                 | Initiative Destination               | Exists?     |
| -------------------------------------- | ------------------------------------ | ----------- |
| `AGENT_REGISTRY_SPEC.md`               | `ini.agent-registry.md`              | Yes         |
| `CACHING.md`                           | `ini.caching.md`                     | No — create |
| `CHAIN_DEPLOYMENT_TECH_DEBT.md`        | `ini.chain-deployment-refactor.md`   | Yes         |
| `CICD_SERVICES_ROADMAP.md`             | `ini.cicd-services-gitops.md`        | Yes         |
| `CLAUDE_SDK_ADAPTER_SPEC.md`           | `ini.claude-sdk-adapter.md`          | No — create |
| `CLAWDBOT_ADAPTER_SPEC.md`             | `ini.clawdbot-executor.md`           | No — create |
| `CRED_LICENSING_POLICY_SPEC.md`        | `ini.cred-licensing.md`              | No — create |
| `ERROR_HANDLING_IMPROVEMENT_DESIGN.md` | `ini.error-handling-improvements.md` | No — create |
| `METRICS_OBSERVABILITY.md`             | `ini.public-analytics.md`            | No — create |
| `N8N_ADAPTER_SPEC.md`                  | `ini.n8n-integration.md`             | No — create |
| `PROMPT_REGISTRY_SPEC.md`              | `ini.prompt-registry.md`             | No — create |
| `PROPOSAL_LAUNCHER.md`                 | `ini.proposal-launcher.md`           | No — create |
| `SERVICES_MIGRATION.md`                | `ini.services-migration.md`          | No — create |

### Remaining AB+road docs (20)

| Source                           | Spec Dest                       | Initiative Dest                           | Guide Dest                 |
| -------------------------------- | ------------------------------- | ----------------------------------------- | -------------------------- |
| `ACCOUNTS_API_KEY_ENDPOINTS.md`  | `accounts-api-endpoints.md`     | `ini.accounts-api-keys.md` (exists)       | -                          |
| `ACCOUNTS_DESIGN.md`             | `accounts-design.md`            | `ini.accounts-api-keys.md` (exists)       | -                          |
| `AI_GOVERNANCE_DATA.md`          | `ai-governance-data.md`         | `ini.governance-agents.md`                | -                          |
| `GRAPH_EXECUTION.md`             | `graph-execution.md`            | `ini.graph-execution.md`                  | -                          |
| `HUMAN_IN_THE_LOOP.md`           | `human-in-the-loop.md`          | `ini.hil-graphs.md`                       | -                          |
| `LANGGRAPH_AI.md`                | `langgraph-patterns.md`         | -                                         | `langgraph-guide.md`       |
| `LANGGRAPH_SERVER.md`            | `langgraph-server.md`           | `ini.langgraph-server-production.md`      | `langgraph-server-dev.md`  |
| `NODE_CI_CD_CONTRACT.md`         | `node-ci-cd-contract.md`        | `ini.ci-cd-reusable.md`                   | -                          |
| `NODE_FORMATION_SPEC.md`         | `node-formation.md`             | `ini.node-formation-ui.md`                | `node-formation-guide.md`  |
| `OBSERVABILITY_REQUIRED_SPEC.md` | `observability-requirements.md` | `ini.observability-hardening.md` (exists) | -                          |
| `ONCHAIN_READERS.md`             | `onchain-readers.md`            | `ini.onchain-indexer.md`                  | -                          |
| `PAYMENTS_DESIGN.md`             | `payments-design.md`            | `ini.payments-enhancements.md` (exists)   | `payments-setup.md`        |
| `SANDBOXED_AGENTS.md`            | `sandboxed-agents.md`           | `ini.sandboxed-agents.md`                 | -                          |
| `SOURCECRED.md`                  | `sourcecred.md`                 | -                                         | `sourcecred-operations.md` |
| `SYSTEM_TENANT_DESIGN.md`        | `system-tenant.md`              | -                                         | -                          |
| `TENANT_CONNECTIONS_SPEC.md`     | `tenant-connections.md`         | `ini.tenant-connections.md`               | -                          |
| `TOOL_USE_SPEC.md`               | `tool-use.md`                   | `ini.tool-use-evolution.md`               | -                          |
| `UNIFIED_GRAPH_LAUNCH_SPEC.md`   | `unified-graph-launch.md`       | -                                         | -                          |
| `USAGE_HISTORY.md`               | `usage-history.md`              | -                                         | -                          |
| `features/HEALTH_PROBES.md`      | `health-probes.md`              | -                                         | -                          |

## Per-Doc Migration Process

Defined in `work/issues/wi.docs-migration-tracker.md` lines 58-78. Summary:

1. **Read** the source doc end-to-end
2. **Classify content** — as-built → spec, procedural → guide, future work → initiative, obsolete → archive
3. **`git mv`** to destination directory
4. **Add YAML frontmatter** (see templates in `docs/_templates/`)
5. **Restructure into required headings** — for specs: Context, Goal, Non-Goals, Core Invariants (SCREAMING_SNAKE IDs), Design (with File Pointers subsection), Acceptance Checks, Open Questions, Related. For guides: When to Use This, Preconditions, Steps, Verification, Troubleshooting, Related.
6. **Route TODOs/future work** to initiatives (`work/initiatives/ini.*.md`) with source attribution
7. **Update SPEC_INDEX.md** (for specs)
8. **Run `pnpm check:docs`** — HARD REQUIREMENT
9. **Check Done `[x]`** in migration tracker — HARD REQUIREMENT

## Key Files

| File                                       | Purpose                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `work/issues/wi.docs-migration-tracker.md` | Master tracker — migration table with Done/Refs columns, process steps, all ~100 docs classified with destination columns |
| `docs/spec/SPEC_INDEX.md`                  | Master index of all specs — update after each spec migration                                                              |
| `docs/_templates/spec.md`                  | Spec template with required frontmatter and headings                                                                      |
| `docs/_templates/guide.md`                 | Guide template with required headings                                                                                     |
| `work/_templates/initiative.md`            | Initiative template with Crawl/Walk/Run deliverable tables                                                                |
| `scripts/validate-docs-metadata.mjs`       | Validator — enforces frontmatter, heading structure, field set separation                                                 |
| `work/initiatives/`                        | 8 initiative files — check here BEFORE creating new ones                                                                  |
| `docs/guides/create-service.md`            | Longest guide — use as format reference for complex guides                                                                |
| `docs/guides/developer-setup.md`           | Shortest guide — use as format reference for simple guides                                                                |

## Existing Initiative Files (8)

Check these BEFORE creating new initiatives — many remaining docs have content that slots into these:

| Initiative                          | Content                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `ini.accounts-api-keys.md`          | SIWE auth, session management, wallet-linked chat, API key server-side storage                |
| `ini.agent-registry.md`             | Agent discovery/execution split, LangGraph Server, multi-adapter                              |
| `ini.chain-deployment-refactor.md`  | Signed repo-spec, attested builds, revocation policy                                          |
| `ini.cicd-services-gitops.md`       | Graph-scoped builds, check:full CLI, service spawning automation                              |
| `ini.development-workflows.md`      | Development lifecycle workflows                                                               |
| `ini.docs-system-infrastructure.md` | Docs system infrastructure                                                                    |
| `ini.observability-hardening.md`    | Hourly bucketing, FakeUsageAdapter, stack tests, Alloy log filtering/traces/dashboards/alerts |
| `ini.payments-enhancements.md`      | External executor reconciliation, billing hardening                                           |

The tracker's `Ini` column pre-maps which initiative each doc's roadmap content should go to. Many reference initiatives that don't exist yet — create them when you reach those docs.

## Gotchas & Learnings

- **Validator `spec_state` field**: Adding `spec_state` to frontmatter triggers required H2 heading validation (Context, Goal, Non-Goals, Core Invariants, Design, Acceptance Checks). Omitting it skips heading checks. All specs should have it.
- **Initiative state enum**: Valid states are `Active|Paused|Done|Dropped` (NOT `Proposed`).
- **AB+road docs are the hardest**: Content must be triaged line-by-line. The as-built facts go to a spec, the planned/future work goes to an initiative. Don't put TODOs in spec Open Questions.
- **Security-auth pattern for mixed current/target**: When a spec has both implemented and not-yet-implemented content, keep both in the spec with clear "Current State (Implemented)" and "Target State" sections. Route the acceptance criteria for the target state to an initiative.
- **Services-architecture 3-way split pattern**: Large docs with as-built contracts + procedural checklists + roadmap content can split into spec + guide + initiative. This was done for SERVICES_ARCHITECTURE.md and is the model for similar splits (e.g., LANGGRAPH_SERVER.md, NODE_FORMATION_SPEC.md which the tracker maps to spec + guide + initiative).
- **Prettier runs on commit**: Pre-commit hook runs prettier on staged markdown. It may reformat tables. This is expected and correct — don't fight it.
- **SPEC_INDEX table ordering**: New entries were added alphabetically by ID within the table.
- **Guide template required headings**: When to Use This, Preconditions, Steps, Verification, Troubleshooting, Related.
- **Validated doc types**: `spec`, `adr`, `guide`, `research`, `postmortem` — all require standard DOC_REQUIRED frontmatter (id, type, title, status, trust, summary, read_when, owner, created).
- **Non-validated directories**: `docs/archive/` and `docs/research/archive/` are excluded from validator globs. No frontmatter needed.
- **Research vs archive**: Research is for spikes/investigations that may inform future work. Archive is dead-end, safe to ignore. Don't dump things in archive that have future value — use `docs/research/` instead, or `docs/research/archive/` if the research is closed.
- **Source attribution when appending to initiatives**: Always include a `Source` column in deliverable tables or `> Source:` annotation blocks so content origin is traceable. Without this, initiatives become confusing soup.
- **Data loss verification**: After migrating complex docs (especially AB+road splits), run a verification pass comparing original vs migrated content. The previous session caught data loss in 2/9 guide migrations that required fixes.
- **`git mv` + surgical edits preferred**: Move files first, then edit in place. This preserves git history better than rewriting + deleting.
- **The worktree is at `/private/tmp/docs-integration/`** — this is a git worktree of the main repo. All work happens here, not in `/Users/derek/dev/cogni-template/`.
