work_item_id:: wi.work-system-guide
work_item_type:: project
title:: Work Management System Guide
state:: Active
summary:: How to track projects and issues in this repository.
outcome:: Developers can create and manage work items consistently.
assignees:: derekg1729
created:: 2026-02-05
updated:: 2026-02-05

# Work Management System Guide

> Front door to `/work`. Planning and execution tracking lives here.

## Structure

| Directory     | Purpose                       |
| ------------- | ----------------------------- |
| `projects/`   | Multi-issue effort containers |
| `issues/`     | Atomic work items             |
| `_templates/` | Templates for work items      |

## Work Item Types

### project

Container for related issues. Defines goal and tracks child issues.

### issue

Atomic unit of work. Every issue belongs to one project. PR outcomes stored as fields on issue.

## Metadata Format

```
work_item_id:: wi.rls-001
work_item_type:: issue
title:: Implement RLS policies
state:: In Progress
priority:: High
summary:: Add row-level security to tenant tables.
outcome:: All queries enforce tenant isolation.
project:: wi.database-security
assignees:: derekg1729
created:: 2026-02-01
updated:: 2026-02-05
```

## Field Reference

### Project

| Field              | Req | Description                   |
| ------------------ | --- | ----------------------------- |
| `work_item_id::`   | Yes | `wi.{name}` immutable         |
| `work_item_type::` | Yes | `project`                     |
| `title::`          | Yes | Human readable                |
| `state::`          | Yes | Active, Paused, Done, Dropped |
| `summary::`        | Yes | What is this about?           |
| `outcome::`        | Yes | What does success look like?  |
| `assignees::`      | Yes | CSV of handles                |
| `created::`        | Yes | YYYY-MM-DD                    |
| `updated::`        | Yes | YYYY-MM-DD                    |

### Issue

| Field              | Req | Description                                 |
| ------------------ | --- | ------------------------------------------- |
| `work_item_id::`   | Yes | `wi.{name}` immutable                       |
| `work_item_type::` | Yes | `issue`                                     |
| `title::`          | Yes | Human readable                              |
| `state::`          | Yes | Backlog, Todo, In Progress, Done, Cancelled |
| `priority::`       | Yes | Urgent, High, Medium, Low, None             |
| `summary::`        | Yes | What needs to be done?                      |
| `outcome::`        | Yes | What is the deliverable?                    |
| `project::`        | Yes | `wi.{project-id}` parent                    |
| `assignees::`      | Yes | CSV of handles                              |
| `created::`        | Yes | YYYY-MM-DD                                  |
| `updated::`        | Yes | YYYY-MM-DD                                  |
| `pr::`             | No  | PR number/URL if applicable                 |
| `labels::`         | No  | CSV labels                                  |
| `external_refs::`  | No  | CSV external links                          |

## Hard Rules

1. **WORK_ITEM_ID_IMMUTABLE** — Never changes once assigned
2. **ISSUE_HAS_PROJECT** — Every issue references `project:: wi.*`
3. **FIELD_SET_SEPARATION** — Use `work_item_*`/`state` here, not `id`/`type`/`status`
4. **ORIENTATION_REQUIRED** — Every item needs `summary::` + `outcome::`

## Related

- [Documentation System](../docs/README.md)
- [Organization Plan](../docs/DOCS_ORGANIZATION_PLAN.md)
