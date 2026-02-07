id:: docs-system-guide
type:: guide
title:: Documentation System Guide
status:: draft
trust:: draft
summary:: How to navigate, create, and maintain documentation in this repository.
read_when:: You need to create, move, or understand the documentation structure.
owner:: derekg1729
created:: 2026-02-05
verified:: 2026-02-05
tags:: documentation, meta

# Documentation System Guide

> Front door to `/docs`. All curated knowledge lives here.

## Structure

| Directory     | Purpose                             |
| ------------- | ----------------------------------- |
| `spec/`       | Invariants, interfaces, contracts   |
| `decisions/`  | ADRs and EDO governance traces      |
| `guides/`     | Procedures (setup, howto, runbooks) |
| `archive/`    | Deprecated docs                     |
| `_templates/` | Templates for each doc type         |

## Doc Types

| type    | Use for                                  |
| ------- | ---------------------------------------- |
| `spec`  | System contracts, invariants, interfaces |
| `adr`   | Architecture decision records            |
| `guide` | Setup, howto, runbook procedures         |

## Metadata Format

All docs use `key:: value` properties at the top:

```
id:: scheduler-spec-v0
type:: spec
title:: Scheduled Graph Execution
status:: active
trust:: canonical
summary:: Invariants for Temporal schedules.
read_when:: Changing scheduling or execution grants.
owner:: derekg1729
created:: 2026-01-15
verified:: 2026-02-05
tags:: scheduler, temporal
```

**Required:** `id`, `type`, `title`, `status`, `trust`, `summary`, `read_when`, `owner`, `created`, `verified`

## Trust Levels

| Trust       | Meaning                             |
| ----------- | ----------------------------------- |
| `canonical` | Source of truth, CI-validated       |
| `reviewed`  | Peer-reviewed, accurate at verified |
| `draft`     | Work in progress                    |
| `external`  | Reference only, not authoritative   |

## Creating Docs

1. Copy template from `_templates/`
2. Fill required properties
3. Place in matching directory
4. Ensure `type::` matches directory

## Hard Rules

1. **NO_YAML_FRONTMATTER** — Use `key:: value` only
2. **NO_WIKILINKS** — Use `[text](path)` markdown links
3. **TYPE_MATCHES_DIR** — `type::` must match parent directory
4. **UNIQUE_IDS** — Each `id::` unique repo-wide

## Related

- [Work Management](../work/README.md)
- [Spec Index](./spec/SPEC_INDEX.md)
- [Organization Plan](./DOCS_ORGANIZATION_PLAN.md)
