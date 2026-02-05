---
work_item_id: ini.docs-system-infrastructure
work_item_type: initiative
title: Docs + Work System Infrastructure
state: Active
priority: 0
estimate: 4
summary: Engineering roadmap to build knowledge + project management infrastructure (Plane, MkDocs, CI gates, submodules)
outcome: Automated CI enforcement, Plane as work canonical, MkDocs publishing, optional cogni-knowledge submodule
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [docs, infra, tooling]
---

# Docs + Work System Infrastructure

## Goal

Build the tooling infrastructure that enforces our docs + work system:

- CI gates that validate docs structure and PR linkage
- Plane as canonical work tracker (with `/work` as export mirror)
- MkDocs for published documentation
- Optional: cogni-knowledge repo as git submodule

## Roadmap

### Crawl (P0) — Validator + CI Gates

**Goal:** Standardize identifiers, headings, and enforceability before integrating external tools.

| Deliverable                                                    | Status  | Notes                               |
| -------------------------------------------------------------- | ------- | ----------------------------------- |
| Templates finalized (spec, guide, decision, initiative, issue) | Done    | YAML frontmatter                    |
| CI check: required frontmatter properties                      | Partial | `validate-docs-metadata.mjs` exists |
| CI check: `spec_state` validation                              | Todo    | Extend validator                    |
| CI check: stable headings for specs                            | Todo    | Extend validator                    |
| CI check: IDs unique                                           | Done    | Existing validator                  |
| CI check: type matches directory                               | Todo    | Extend validator                    |

### Walk (P1) — MkDocs + Repo Separation

**Goal:** Published docs navigation; optionally separate docs into own repo.

| Deliverable                              | Status | Notes                                     |
| ---------------------------------------- | ------ | ----------------------------------------- |
| MkDocs pipeline                          | Future | CI builds docs site on `/docs/**` changes |
| `mkdocs.yml` at repo root                | Future | Published to internal URL                 |
| (Optional) Create `cogni-knowledge` repo | Future | Migrate `/docs` content                   |
| (Optional) Mount as git submodule        | Future | `/docs` → submodule                       |
| Submodule update workflow                | Future | See pinning policy below                  |

**Submodule Pinning Policy (if adopted):**

| Scenario                               | Action                                    |
| -------------------------------------- | ----------------------------------------- |
| Code PR references a spec that changed | Must bump submodule SHA in same PR        |
| Docs-only change (no code impact)      | Submodule updated independently           |
| Breaking spec change                   | Coordinated PR: bump submodule + fix code |

### Run (P2) — Plane Integration + PR Linkage

**Goal:** PRs automatically link to work; `/work` becomes export-only.

| Deliverable                             | Status | Notes                         |
| --------------------------------------- | ------ | ----------------------------- |
| Enable Plane GitHub integration         | Future | For `cogni-template` repo     |
| PR reference format standardized        | Future | `PLANE-123` triggers backlink |
| CI gate: PR body Spec + Work validation | Future | GitHub Action                 |
| `/work` becomes export-only             | Future | CI rejects direct edits       |
| Generate `/work` from Plane export      | Future | Script or GitHub Action       |

**Plane GitHub Integration:**

- PR merges update linked Plane issue state (configurable)
- Plane issues link back to PRs automatically

### Sprint (P3) — Plane MCP for Agents

**Goal:** Agents use Plane directly instead of markdown parsing.

| Deliverable                  | Status | Notes                                 |
| ---------------------------- | ------ | ------------------------------------- |
| Plane MCP server integration | Future | Official Plane MCP                    |
| Agent CRUD operations        | Future | list, get, create, update, transition |

**Plane MCP Operations:**

- `plane.list_issues(project_id, filters)`
- `plane.get_issue(issue_id)`
- `plane.create_issue(project_id, data)`
- `plane.update_issue(issue_id, data)`
- `plane.transition_state(issue_id, state)`

### Future — Backstage TechDocs + Dolt

**TechDocs (optional):**

- Follows TechDocs CI publish model
- Each repo publishes independently
- Backstage aggregates via catalog

**Dolt (future):**
Use Dolt as branchable, decentralized Postgres-compatible store for knowledge/task graphs; not the v0 human-authored docs surface.

## Canonical Systems Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CANONICAL SYSTEMS                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│  │ Work Tracking   │    │ Knowledge/Docs  │    │ Code            │       │
│  │ ═══════════════ │    │ ═══════════════ │    │ ═══════════════ │       │
│  │                 │    │                 │    │                 │       │
│  │ CANONICAL:      │    │ CANONICAL:      │    │ CANONICAL:      │       │
│  │ Plane           │    │ /docs (v0)      │    │ cogni-template  │       │
│  │                 │    │ cogni-knowledge │    │ (monorepo)      │       │
│  │ MIRROR:         │    │ (P1+ submodule) │    │                 │       │
│  │ /work (export)  │    │                 │    │                 │       │
│  │                 │    │ PUBLISHED:      │    │                 │       │
│  │ INTEGRATION:    │    │ MkDocs (now)    │    │                 │       │
│  │ GitHub ↔ Plane  │    │ TechDocs (P2+)  │    │                 │       │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘       │
│                                                                          │
│  ────────────────── LINKAGE ──────────────────                           │
│                                                                          │
│  Code PR ──references──► Spec (id) + Work Item (Plane ID)                │
│  Work Item ──links──► Spec(s) ──links──► Acceptance Checks (tests)       │
│  Git submodule pins docs SHA at each code commit (P1+)                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### System Boundaries

| System            | Canonical For                        | Sync Direction               | Drift Prevention                           |
| ----------------- | ------------------------------------ | ---------------------------- | ------------------------------------------ |
| **Plane**         | Work state (initiatives, issues)     | Plane → `/work` export       | `/work` is read-only after Plane cutover   |
| **`/docs`**       | Specifications, ADRs, guides         | Authored here                | CI validates structure + required headings |
| **Git submodule** | Docs SHA pinned to code commit (P1+) | `cogni-knowledge` → monorepo | Submodule update workflow                  |
| **MkDocs**        | Published navigation surface         | Built from `/docs`           | CI publish on docs changes                 |

## CI Enforcement Tables

### P0 Checks (Current Focus)

| Check                                                                 | Script                               | Failure Mode  |
| --------------------------------------------------------------------- | ------------------------------------ | ------------- |
| Required YAML frontmatter properties                                  | `scripts/validate-docs-metadata.mjs` | Merge blocked |
| `spec_state` field validation                                         | Extend validator                     | Merge blocked |
| Stable headings (Context/Goal/Non-Goals/Invariants/Design/Acceptance) | Extend validator                     | Merge blocked |
| Unique `id` values                                                    | Existing validator                   | Merge blocked |
| Type matches directory                                                | Extend validator                     | Merge blocked |
| Valid arrays in tags/labels fields                                    | Existing validator                   | Merge blocked |

### P2 Checks (With Plane)

| Check                                 | Implementation                     | Failure Mode             |
| ------------------------------------- | ---------------------------------- | ------------------------ |
| PR body contains Spec + Work Item     | GitHub Action parsing PR body      | Merge blocked            |
| `/work` edits forbidden (export-only) | Path-based check on modified files | Merge blocked            |
| Plane backlink confirmed              | Plane webhook or API check         | Warning (soft initially) |

## Constraints

- Infrastructure changes should not break existing docs
- Plane integration is additive (markdown still works during transition)
- Submodule is optional — can keep docs in monorepo

## Dependencies

- [ ] `js-yaml` for proper YAML parsing in validator
- [ ] GitHub Action for PR body validation
- [ ] Plane workspace setup
- [ ] MkDocs configuration

## Explicitly Deferred Items

| Item                                              | Deferred To | Rationale                       |
| ------------------------------------------------- | ----------- | ------------------------------- |
| Deprecation/redirect policy for moved specs       | P1          | Needs submodule mechanics first |
| Spec versioning scheme (v0, v1, breaking changes) | P1          | Low urgency                     |
| Multi-repo doc search aggregation                 | P2          | Backstage TechDocs handles this |
| Link checking (`lychee`)                          | P1          | Nice-to-have                    |

## Work Items

### P0

- [x] [wi.docs-migration-tracker](../issues/wi.docs-migration-tracker.md) — migration checklist + validator tasks

### P1

- [ ] wi.mkdocs-setup (create when entering P1)
- [ ] wi.validator-spec-state (create when entering P1)

### P2

- [ ] wi.plane-github-integration (create when entering P2)
- [ ] wi.pr-linkage-ci (create when entering P2)

## As-Built Specs

- [docs-work-system.md](../../docs/spec/docs-work-system.md) — document taxonomy and conventions

## Design Notes

**Open questions:**

- When should Plane become canonical (blocking `/work` edits)?
- Should cogni-knowledge repo be created before or after P1 tooling?
