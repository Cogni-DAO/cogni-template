---
work_item_id: ini.maximize-oss-tools
work_item_type: initiative
title: Maximize OSS Tools
state: Active
priority: 2
estimate: 5
summary: Adopt best-in-class OSS tools for infrastructure gaps instead of building from scratch
outcome: Each infrastructure gap filled by a vetted OSS tool with clear adoption trigger
assignees: derekg1729
created: 2026-02-08
updated: 2026-02-08
labels: [infra, tooling]
---

# Maximize OSS Tools

> Source: docs/CODE_GATES.md (snapshot extracted during docs migration)

## Goal

Adopt proven OSS tools for infrastructure gaps rather than building bespoke solutions. Each tool has a clear adoption trigger — adopt when the trigger fires, not before.

## Roadmap

### OSS Tool Adoption Table

| OSS Tool                           | Gap / Technology Need                                           | Trigger                                        | Priority | Status      | Initiative                                      |
| ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- | -------- | ----------- | ----------------------------------------------- |
| **WAL-G**                          | Postgres backups — no backup exists today, total data loss risk | **Now** (P0 prerequisite)                      | P0       | Not Started | [ini.database-ops](ini.database-ops.md)         |
| **OpenFGA** (or OPA)               | Deny-by-default authorization gate for tool and agent actions   | **Now** (P0 prerequisite)                      | P0       | Not Started | [ini.rbac-hardening](ini.rbac-hardening.md)     |
| **pgBouncer** / Supavisor          | Connection pooling                                              | Connection pressure (currently fine at max 10) | P1       | Not Started | [ini.database-ops](ini.database-ops.md)         |
| **Keycloak** / authentik / ZITADEL | MFA or SSO                                                      | Need MFA or SSO beyond SIWE                    | P1       | Not Started | —                                               |
| **MinIO** / Supabase Storage       | File uploads, signed URLs                                       | Need file uploads / signed URLs                | P1       | Not Started | —                                               |
| **Supabase Realtime** / NATS       | Live dashboards, notifications                                  | Need live dashboards / notifications           | P1       | Not Started | —                                               |
| **gVisor** / Kata Containers       | Docker hardening                                                | Docker hardening proven insufficient           | P1       | Not Started | [ini.sandboxed-agents](ini.sandboxed-agents.md) |
| **pgAdmin** / Drizzle Studio       | Database admin UI, data browser                                 | Need visual DB inspection beyond CLI           | P2       | Not Started | —                                               |

## Explicitly Not Adopting

- Tamper-evident audit ledger products
- Full Supabase platform migration
- Observability stack refactors (current stack sufficient)

## Constraints

- Adopt when the trigger fires, not before — avoid premature complexity
- Prefer tools that integrate with existing Docker Compose stack
- Each adoption should be its own issue/PR, not bundled

## Dependencies

- [x] Existing infrastructure (Postgres, Docker Compose, LiteLLM)

## As-Built Specs

- (none yet — specs created when tools are adopted)

## Design Notes

- Derived from [Supabase Evaluation](../../docs/research/supabase-evaluation.md) — full codebase vs. Supabase capability audit
- WAL-G and pgBouncer plans detailed in [ini.database-ops](ini.database-ops.md)
