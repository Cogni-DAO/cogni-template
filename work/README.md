---
id: work-system-guide
type: guide
title: Work Management System Guide
status: active
trust: draft
summary: How to track initiatives and issues in this repository.
read_when: Creating work items, understanding the initiative/issue lifecycle.
owner: derekg1729
created: 2026-02-05
verified: 2026-02-06
tags: [work, meta]
---

# Work Management System Guide

> Front door to `/work`. Planning and execution tracking lives here.

## Structure

| Directory      | Purpose                                     |
| -------------- | ------------------------------------------- |
| `initiatives/` | Roadmap + phased plans (may exist pre-code) |
| `issues/`      | PR-sized execution + validation             |
| `_templates/`  | Templates for work items                    |

## Work Item Types

### initiative (`ini.*`)

Roadmap and phased plan for a multi-PR effort. **May exist before any code.**

Contains: Goal, crawl/walk/run roadmap, constraints, dependencies, work item list.

### issue (`wi.*`)

PR-sized unit of work. Links to initiative and specs.

Contains: Execution checklist, PR checklist, validation commands.

## Metadata Format (YAML)

```yaml
---
work_item_id: ini.sandbox-runtime
work_item_type: initiative
title: Sandboxed Agent Runtime
state: Active
priority: High
summary: Isolated execution environment for untrusted agent code
outcome: Agents run in gVisor containers with resource limits
assignees: derekg1729
created: 2026-02-05
updated: 2026-02-06
labels: [security, ai]
---
```

## Field Reference

### Initiative

| Field            | Req | Description                   |
| ---------------- | --- | ----------------------------- |
| `work_item_id`   | Yes | `ini.{name}` immutable        |
| `work_item_type` | Yes | `initiative`                  |
| `title`          | Yes | Human readable                |
| `state`          | Yes | Active, Paused, Done, Dropped |
| `summary`        | Yes | What is this about?           |
| `outcome`        | Yes | What does success look like?  |
| `assignees`      | Yes | CSV of handles                |
| `created`        | Yes | YYYY-MM-DD                    |
| `updated`        | Yes | YYYY-MM-DD                    |

### Issue

| Field            | Req | Description                                 |
| ---------------- | --- | ------------------------------------------- |
| `work_item_id`   | Yes | `wi.{name}` immutable                       |
| `work_item_type` | Yes | `issue`                                     |
| `title`          | Yes | Human readable                              |
| `state`          | Yes | Backlog, Todo, In Progress, Done, Cancelled |
| `priority`       | Yes | Urgent, High, Medium, Low, None             |
| `summary`        | Yes | What needs to be done?                      |
| `outcome`        | Yes | What is the deliverable?                    |
| `initiative`     | No  | `ini.{name}` parent (optional)              |
| `spec_refs`      | No  | Links to relevant specs                     |
| `assignees`      | Yes | CSV of handles                              |
| `created`        | Yes | YYYY-MM-DD                                  |
| `updated`        | Yes | YYYY-MM-DD                                  |
| `pr`             | No  | PR number/URL if applicable                 |
| `labels`         | No  | CSV labels                                  |

## Hard Rules

1. **WORK_ITEM_ID_IMMUTABLE** — Never changes once assigned
2. **SPECS_ARE_AS_BUILT** — Specs describe what IS, not what WILL BE; roadmaps live in initiatives
3. **ISSUES_ARE_PR_SIZED** — If an issue spans multiple PRs, break it up
4. **PR_LINKS_ISSUE** — Every PR references exactly one `wi.*`

## Related

- [Documentation System](../docs/README.md)
- [Spec + Initiative Lifecycle](../docs/spec/spec-project-lifecycle.md)
