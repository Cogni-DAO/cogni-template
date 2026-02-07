# Code Gates

> Derived from [SUPABASE_EVALUATION.md](SUPABASE_EVALUATION.md). Two hard prerequisites before more agent/feature work.

## P0 — Required before new agent or feature work

**WAL-G** — Real backups. No more risking total data loss, no more inventing backup glue.

**OpenFGA** (or OPA, pick one) — One enforced deny-by-default authorization gate for tool and agent actions. No more shipping unsafe expansion behind spec-only policy.

## P1 — Adopt when the trigger fires, not before

| OSS                            | Trigger                                        |
| ------------------------------ | ---------------------------------------------- |
| pgBouncer / Supavisor          | Connection pressure (currently fine at max 10) |
| Keycloak / authentik / ZITADEL | Need MFA or SSO beyond SIWE                    |
| MinIO / Supabase Storage       | Need file uploads / signed URLs                |
| Supabase Realtime / NATS       | Need live dashboards / notifications           |
| gVisor / Kata Containers       | Docker hardening proven insufficient           |

## Ignore

- Tamper-evident audit ledger products.
- Full Supabase platform migration.
- Observability stack refactors.
