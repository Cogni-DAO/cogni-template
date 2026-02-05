---
id:
type: spec
title:
status: draft
spec_state: draft
trust: draft
summary:
read_when:
implements:
owner:
created:
verified:
tags: []
---

# [Title]

## Context

Why does this spec exist? What problem does it solve?

## Goal

One paragraph: what this spec enables when implemented.

## Non-Goals

- Explicitly out of scope item 1
- Explicitly out of scope item 2

## Core Invariants

<!-- Invariants must be numbered with stable IDs (SCREAMING_SNAKE_CASE) -->

1. **INVARIANT_NAME_001**: Description of the invariant.

2. **INVARIANT_NAME_002**: Description of the invariant.

## Schema

<!-- Optional: include for specs with database tables, API shapes, or config schemas -->
<!-- Delete this section if not applicable -->

**Table:** `table_name`

| Column       | Type | Constraints      | Description       |
| ------------ | ---- | ---------------- | ----------------- |
| `column_one` | type | NOT NULL, UNIQUE | Brief description |

**Why:** Rationale for schema design choices.

## Design

<!-- Reference code touchpoints (paths) but don't embed large code blocks -->

### Key Decisions

<!-- Number decisions with rationale. Example: -->
<!-- ### 1. Why X over Y -->
<!-- **Rule:** State the key principle derived from this decision. -->

### File Pointers

| File                  | Purpose           |
| --------------------- | ----------------- |
| `src/path/to/file.ts` | Brief description |

## Acceptance Checks

<!-- Must list concrete commands/tests or file pointers -->

**Automated:**

- `pnpm test path/to/test.ts` — what it validates

**Manual (if no automation):**

1. Step to verify

## Open Questions

<!-- REQUIRED: This section must be empty when spec_state is "active" -->

- [ ] Question 1?
- [ ] Question 2?

## Rollout / Migration

How to adopt this spec if there's existing code/behavior to migrate.

## Related

- [Related Spec](./related.md)
- [Initiative](../../work/initiatives/ini.name.md)
