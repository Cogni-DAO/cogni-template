---
id: docs-work-system-spec
type: spec
title: Docs + Work System
status: draft
spec_state: draft
trust: draft
summary: Document taxonomy, identifier conventions, and directory structure for docs and work tracking
read_when: Creating docs or work items, understanding the directory structure
implements: ini.docs-system-infrastructure
owner: derekg1729
created: 2026-02-05
verified: 2026-02-06
tags: [docs, work, meta]
---

# Docs + Work System

## Context

This repo uses a typed directory structure for documentation (`/docs`) and work tracking (`/work`). This spec describes the current as-built conventions.

## Goal

Define the document taxonomy, identifier conventions, and directory structure that all docs and work items must follow.

## Non-Goals

- Roadmap for future tooling (see [ini.docs-system-v0](../../work/initiatives/ini.docs-system-v0.md))
- Plane integration details (future)
- CI enforcement implementation (future)

---

## Core Invariants

1. **DOCS_TYPED_DIRECTORIES**: Docs live in typed directories: `docs/spec/`, `docs/guides/`, `docs/decisions/adr/`.

2. **WORK_TYPED_DIRECTORIES**: Work items live in: `work/initiatives/`, `work/issues/`.

3. **ID_IMMUTABLE**: Once assigned, `id` (docs) and `work_item_id` (work) never change.

4. **SPECS_ARE_AS_BUILT**: Specs describe current implementation only. Roadmaps live in initiatives.

5. **TYPE_MATCHES_DIRECTORY**: A doc's `type` field must match its directory (`type: spec` → `docs/spec/`).

---

## Design

### Document Types

| Type    | Directory             | Purpose                        |
| ------- | --------------------- | ------------------------------ |
| `spec`  | `docs/spec/`          | As-built contracts, invariants |
| `guide` | `docs/guides/`        | Procedures, howtos, runbooks   |
| `adr`   | `docs/decisions/adr/` | Architecture decision records  |

### Work Item Types

| Type         | Directory           | ID Prefix | Purpose                          |
| ------------ | ------------------- | --------- | -------------------------------- |
| `initiative` | `work/initiatives/` | `ini.*`   | Roadmap, phased plans (pre-code) |
| `issue`      | `work/issues/`      | `wi.*`    | PR-sized execution               |

### Identifier Conventions

**Docs:**

```
id: kebab-case-name
```

**Initiatives:**

```
work_item_id: ini.feature-name
```

**Issues:**

```
work_item_id: wi.feature-001
```

### Required Frontmatter

**Specs:**

```yaml
id: example-spec
type: spec
title: Example Spec
status: draft|active|deprecated
spec_state: draft|proposed|active|deprecated
trust: draft|reviewed|canonical|external
summary: One-line description
read_when: When to read this
owner: handle
created: YYYY-MM-DD
verified: YYYY-MM-DD
tags: [optional]
```

**Initiatives:**

```yaml
work_item_id: ini.example
work_item_type: initiative
title: Example Initiative
state: Active|Paused|Done|Dropped
priority: High|Medium|Low
summary: One-line description
outcome: What success looks like
assignees: handle
created: YYYY-MM-DD
updated: YYYY-MM-DD
labels: [optional]
```

**Issues:**

```yaml
work_item_id: wi.example-001
work_item_type: issue
title: Example Issue
state: Backlog|Todo|In Progress|Done|Cancelled
priority: Urgent|High|Medium|Low|None
summary: One-line description
outcome: What the deliverable is
spec_refs: docs/spec/example.md
initiative: ini.example
assignees: handle
created: YYYY-MM-DD
updated: YYYY-MM-DD
labels: [optional]
pr:
```

---

## Acceptance Checks

**Automated:**

- `node scripts/validate-docs-metadata.mjs` — validates frontmatter (partially implemented)

**Manual:**

1. New specs go in `docs/spec/`
2. New initiatives go in `work/initiatives/`
3. New issues go in `work/issues/`
4. IDs follow conventions above

---

## Open Questions

- [ ] Validator doesn't yet check `spec_state` or `work_item_type`
- [ ] Directory structure not yet enforced by CI

---

## Related

- [Development Lifecycle](./development-lifecycle.md) — workflow spec
- [Work Management Guide](../../work/README.md) — front door to /work
- [Documentation Guide](../README.md) — front door to /docs
- [Initiative: Docs System Infrastructure](../../work/initiatives/ini.docs-system-infrastructure.md) — tooling roadmap
- [Initiative: Development Workflows](../../work/initiatives/ini.development-workflows.md) — workflow conventions
