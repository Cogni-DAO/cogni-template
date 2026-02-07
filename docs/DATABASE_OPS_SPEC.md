# Database Operations: Backups, Pooling & Credential Management

> [!CRITICAL]
> **No backup exists today.** A single `docker volume rm` or disk failure results in total data loss. This is the highest-priority gap in the current infrastructure.

---

## North Star

Postgres remains our database. We adopt **only** Supabase OSS building blocks (WAL-G, optionally Supavisor/pgBouncer) — not the full Supabase self-hosted platform. The application, RLS model, provisioner, and DSN contract are unchanged.

This initiative is part of the **enterprise readiness** posture: availability (backups), access control integrity (convergent credentials), and auditability (recorded backup/restore operations).

| Deliverable                | What Changes                                                                  | What Doesn't Change                          | Enterprise Control       |
| -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- | ------------------------ |
| **Backups (WAL-G)**        | New sidecar container + external object storage                               | Postgres image, volume layout, provision.sh  | Availability + integrity |
| **Connection pooler**      | New service in front of Postgres; DSN host changes from `postgres` → `pooler` | App code, RLS, DSN format                    | Access control boundary  |
| **Credential convergence** | provision.sh gains `ALTER ROLE ... PASSWORD`                                  | DSN-only runtime contract, secret generation | Access control integrity |

---

## Phased Rollout

### P0: Backups (data loss mitigation)

Add WAL-G continuous archiving to S3-compatible storage (Cloudflare R2, Backblaze B2, or MinIO).

#### Recovery Targets

| Target                  | Value      | Rationale                                                               |
| ----------------------- | ---------- | ----------------------------------------------------------------------- |
| **RPO** (max data loss) | ~5 minutes | Continuous WAL archiving; loss window = unarchived WAL since last flush |
| **RTO** (max downtime)  | < 1 hour   | Base backup restore + WAL replay to a fresh container                   |

These are initial targets for a single-VM deployment. Adjust when moving to managed Postgres or multi-region.

#### Retention Policy

| Artifact                | Retention         | Storage                                               |
| ----------------------- | ----------------- | ----------------------------------------------------- |
| Full base backups       | 7 daily, 4 weekly | S3-compatible (R2/B2)                                 |
| WAL archive segments    | 30 days           | Same bucket, `/wal/` prefix                           |
| Oldest restorable point | 30 days           | Determined by oldest retained base backup + WAL chain |

WAL-G's `delete retain` handles garbage collection of expired backups.

#### Compose Changes

- Add `wal-g` sidecar or cron container with access to `postgres_data` volume
- Add backup-specific env vars: `WALG_S3_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Nightly `pg_basebackup` + continuous WAL archiving
- Add `postgresql.conf` overrides: `archive_mode = on`, `archive_command` pointing to WAL-G

#### New Secrets (per environment)

| Secret                         | Description                |
| ------------------------------ | -------------------------- |
| `BACKUP_S3_ENDPOINT`           | S3-compatible endpoint URL |
| `BACKUP_S3_BUCKET`             | Bucket name                |
| `BACKUP_AWS_ACCESS_KEY_ID`     | Storage credentials        |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Storage credentials        |

#### Restore Runbook & Testing

A restore runbook must be written in `platform/runbooks/` covering:

1. Pull latest base backup from S3
2. Restore to throwaway container with WAL replay to target timestamp
3. Verify row counts / schema version / spot-check application data
4. Document restore time and any issues

**Restore test cadence:** Monthly. Each test produces evidence artifacts:

| Artifact                                                                                     | Purpose                      |
| -------------------------------------------------------------------------------------------- | ---------------------------- |
| Restore log (stdout capture)                                                                 | Proof that restore completed |
| Timestamp of backup used                                                                     | Proves RPO claim             |
| Wall-clock restore duration                                                                  | Proves RTO claim             |
| Schema version check (`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`) | Data integrity verification  |

Evidence is stored in the S3 bucket under `/restore-tests/YYYY-MM-DD/`.

**Scope boundary:** No app code changes. No DSN changes. No provisioner changes.

### P1: Credential Convergence

Already tracked in [DATABASE_RLS_SPEC.md](DATABASE_RLS_SPEC.md) P1:

> Credential rotation support: `provision.sh` should `ALTER ROLE ... PASSWORD` for existing roles, not skip them

This eliminates the "stale volume keeps old password" class of bugs (the exact issue that took down preview). Provision becomes convergent: create-or-update, not create-or-skip.

**Scope boundary:** `provision.sh` only. No app code changes.

### P2: Connection Pooler

Add pgBouncer (simpler, battle-tested) or Supavisor (if multi-tenant features needed later) between app and Postgres.

**Compose changes:**

- Add `pgbouncer` service on `internal` network
- Repoint DSN host: `postgres:5432` → `pgbouncer:6432`
- Postgres no longer directly reachable from app containers (hard trust boundary)

**Trust-boundary requirements:**

- App/migrate/scheduler-worker containers must not have network access to `postgres:5432` — only to `pgbouncer:6432`. Enforce via Docker network segmentation (pooler on `internal`, postgres on a `db-only` network).
- pgBouncer auth config (`userlist.txt` or `auth_query`) must not log or expose passwords. Use `auth_type = scram-sha-256`.
- pgBouncer admin console (`pgbouncer` virtual database) must be disabled or bound to localhost only.

**Why defer:** Current connection count is low (single app + scheduler-worker). Pooling becomes valuable at higher concurrency or if Postgres moves to managed/external hosting.

**Scope boundary:** DSN host changes + network topology. No app code changes. No RLS changes.

### P3: DSN-Only Provisioning

Already tracked in [DATABASE_URL_ALIGNMENT_SPEC.md](DATABASE_URL_ALIGNMENT_SPEC.md) P1-P2:

- Provisioner parses `DATABASE_ROOT_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL` with a real URL parser
- `APP_DB_*` component secrets deleted
- 3 DSNs become the only database secrets

**Scope boundary:** provision.sh rewrite + secret cleanup. No app code changes.

---

## Enterprise Readiness Alignment

This initiative covers the database segment of the enterprise security/privacy posture. Each phase maps to a control category:

| Control                                                                           | Phase                       | Evidence                                                                                   |
| --------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| **Availability** — data recoverable after failure                                 | P0 (backups)                | Monthly restore test artifacts (logs, timestamps, schema check)                            |
| **Access control integrity** — credentials converge to intended state             | P1 (credential convergence) | Provision logs show `ALTER ROLE` on every deploy, not just first run                       |
| **Access control boundary** — app cannot bypass pooler to reach Postgres directly | P2 (pooler)                 | Network segmentation in compose; no direct `postgres:5432` route from app                  |
| **Auditability** — high-risk DB ops are recorded                                  | P0+                         | Backup/restore operations logged to S3 with timestamps; deploy events already emit to Loki |

**Observability scope for DB ops:** Record backup runs, restore tests, and credential rotation events as structured log entries (Pino → Loki). Per-request/per-job actor context is already handled by the RLS `SET LOCAL` pattern. We do not add per-query audit logging — that's `pg_audit` territory (tracked in DATABASE_RLS_SPEC.md P1).

---

## What We Explicitly Do NOT Do

- **Self-host full Supabase stack.** We don't need their auth, storage, realtime, or API gateway. We already have Postgres + RLS + explicit DSNs + provisioner.
- **Move to managed Postgres (RDS, Supabase hosted, Neon).** Not ruled out long-term, but not required to solve the current gaps. If we do, P0-P2 still apply (backups become provider-managed, pooler becomes provider PgBouncer).
- **Change the RLS model.** The dual-role architecture (`app_user` + `app_service`) is correct and stays.

---

## Related Documents

- [DATABASE_RLS_SPEC.md](DATABASE_RLS_SPEC.md) — RLS design, P1 credential rotation item
- [DATABASE_URL_ALIGNMENT_SPEC.md](DATABASE_URL_ALIGNMENT_SPEC.md) — DSN-only end state roadmap
- [DATABASES.md](DATABASES.md) — Migration architecture, two-image strategy
- [INFRASTRUCTURE_SETUP.md](../platform/runbooks/INFRASTRUCTURE_SETUP.md) — Secret generation runbook
- [SUPABASE_EVALUATION.md](SUPABASE_EVALUATION.md) — Full codebase vs. Supabase capability audit
- [CODE_GATES.md](CODE_GATES.md) — P0 prerequisites (WAL-G, OpenFGA/OPA) before new feature work

---

**Last Updated**: 2026-02-06
**Status**: Initiative (not started). P0 backups are the critical path.
