---
id: pm.prod-reprovision-nodes-registry-reseed.2026-08-05
type: postmortem
title: Prod reprovision left the operator `nodes` registry empty — owner lost RLS ownership of all nodes
status: draft
trust: draft
severity: SEV3
duration: "~24h (reprovision 2026-08-04 → reseed 2026-08-05)"
services_affected: [operator]
summary: "A fresh production reprovision brought up an empty operator Postgres `nodes` registry, so the owner wallet had no RLS ownership of any node and could not see/manage them via the operator UI/API. Resolved by directly seeding 7 canonical node rows (owner resolved by wallet) and capturing a verified off-host encrypted pg_dump. Uncovered a second latent defect — the prod db-backup timer silently reports success while producing an empty app-cluster dump."
read_when: A node is missing from the operator after a reprovision, ownership/RLS visibility is wrong, or you are reseeding the `nodes` registry.
owner: flock-leader
created: 2026-08-05
verified: 2026-08-05
tags: [incident, reprovision, rls, nodes-registry, database, backup]
---

# Postmortem: Prod reprovision left the operator `nodes` registry empty

**Date**: 2026-08-05
**Severity**: SEV3
**Status**: Resolved
**Duration**: ~24h (latent from the 2026-08-04 reprovision until the 2026-08-05 reseed)

---

## Summary

The production fleet was reprovisioned onto a fresh VM (`5.199.162.44`) on 2026-08-04. Migrations
restored the operator Postgres schema + RLS policies, but the `nodes` **registry table came up empty** —
node rows are app-written state, not migration state, and (confirmed against the June-2026 prod backup)
were never persisted there in the first place. Because node ownership is a row in `nodes.owner_user_id`
enforced by RLS, the owner wallet (`0x0700…c949`) owned **zero** nodes and the operator UI/API could not
see or manage beacon/poly/blue/oss/habitat/etc. Resolved by direct-applying a non-destructive seed of 7
canonical node rows (owner resolved by wallet), proving RLS ownership, and capturing a verified off-host
encrypted `pg_dump`. Investigation also surfaced a latent defect: the prod `db-backup` timer emits
`db_backup.completed` while writing an **empty** app-cluster dump (DB auth failure, silently swallowed).

## Timeline

| Time (UTC)        | Event                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-04 ~19:00 | Prod reprovisioned onto fresh VM `5.199.162.44`; operator Postgres comes up fresh. `0037_seed_first_class_nodes.sql` runs but no-ops (see Root Cause).                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-05 ~16:xx | Investigation: promotions/management blocked; hypothesis = missing owner RLS on nodes.                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-05 17:2x  | Read-only prod recon via decrypted `.local/prod-art` artifacts. Initial `SELECT` as app role showed 0 users/nodes — later found to be RLS filtering, not truth.                                                                                                                                                                                                                                                                                                                          |
| 2026-08-05 17:4x  | Superuser read (BYPASSRLS): 38 users (1 real SIWE human + 37 agent-register probes), **`nodes` = 0**. Owner `users.id = c2f6cdc5…` confirmed to exist.                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-05 17:4x  | Direct-applied single-txn seed of 7 nodes (owner resolved by wallet, `ON CONFLICT (slug) DO UPDATE`). `INSERT 0 7`, COMMIT.                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-05 17:4x  | RLS ownership proof passed (owner sees 7; others see 0).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-05 17:50  | Triggered `cogni-db-backup.service` → reported `completed` but wrote **0-byte** app `globals.sql`. Investigation found the `postgres` superuser password had **drifted** from the declared value on the fresh reprovision (network auth as `postgres` fails; the app is unaffected because it uses the ESO-synced `app_operator` role). A first (false-positive) localhost test masked this — the container's `pg_hba` uses `trust` for `127.0.0.1`, so it "succeeds" with any password. |
| 2026-08-05 18:1x  | Healed: `ALTER ROLE postgres PASSWORD` to the declared `.env` value; network auth as `postgres` now succeeds.                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-05 18:24  | Re-ran `cogni-db-backup.service` → **real** dumps: `cogni_operator.dump` 158 KB (with the seeded nodes) + beacon/poly/node-template/litellm/openfga/globals, MANIFEST written. Seeded state durably captured through the infra.                                                                                                                                                                                                                                                          |
| 2026-08-05 18:2x  | Also captured a belt-and-suspenders off-host encrypted `pg_dump` (`.local/prod-art/…postseed…dump.enc`, valid `PGDMP`). Fixed `backup.sh` to fail-closed (this PR).                                                                                                                                                                                                                                                                                                                      |

## Root Cause

### What Happened

`nodes` registry rows are written by the app (node registration / `POST /api/v1/nodes`), not by
migrations. A fresh reprovision therefore starts with an empty `nodes` table. The pre-existing seed
migration `0037_seed_first_class_nodes.sql` resolves the owner via `WHERE wallet_address = '0x0700…'`,
but it ran during the initial migrate **before** the owner had a `users` row on the fresh DB, so its
`INSERT … SELECT` matched zero rows and silently no-op'd. Net: schema correct, registry empty, owner
owns nothing under the `tenant_isolation` RLS policy (`owner_user_id = current_setting('app.current_user_id')`).

### Contributing Factors

1. **Proximate cause**: `nodes` rows are app-state, not migration-state, and were never seeded/backed up — a fresh DB has none.
2. **Contributing factor**: `0037` seeds the owner-by-wallet but no-ops when the owner `users` row doesn't yet exist at migrate time; nothing later reconciles it.
3. **Systemic factor**: no reproducible "reconcile catalog → nodes registry" step, and the prod DB backup that _should_ make this recoverable was itself broken two ways — (a) the `postgres` superuser password drifted from the declared value on the fresh reprovision (same DB-cred-SSoT divergence class as bug.5002; here it's the superuser, which — unlike `app_operator` — is not ESO-synced), and (b) `backup.sh` swallowed the resulting auth failure and still logged `db_backup.completed` (a silent-success: `set -e` is neutered inside `run_once`'s `backup_cluster … || failed=1`). Both fixed (see Action Items).

## Detection & Response

### What Worked

- Read-only recon from the decrypted reprovision artifacts (`.local/prod-art/*.enc`, OpenSSL, reused passphrase) reached the live prod DB + OpenFGA quickly.
- The `0037` migration was a ready-made, correct pattern to mirror.
- Non-destructive `ON CONFLICT` seed + explicit RLS ownership proof gave high confidence with zero data loss.

### What Didn't Work

- First DB read as the RLS-enforced app role returned 0 rows and was **misread as "empty DB / no account"** — RLS silently filters without `app.current_user_id`. Corrected by reading as a BYPASSRLS superuser.
- The automated `db-backup` timer reported success but produced an empty app dump — a silent-success anti-pattern that would have made "the backup captures the seed" a false claim.

## Impact

### Customer Impact

- None external. The owner (operator/DAO admin) could not view or operator-manage nodes on prod; node app pods were unaffected by this specific issue.

### Technical Impact

- Operator UI/API showed no owned nodes on prod; owner-gated flows (approvals, and by extension operator-mediated promotes) were blocked pending ownership.
- Discovered + fixed: prod had **no working automated DB backup** for the app cluster (superuser password drift → empty dumps despite `completed`). Superuser password re-aligned, backup re-run producing real dumps, and `backup.sh` hardened to fail-closed.

## Lessons Learned

### What Went Well

1. Wallet-resolved ownership (not hardcoded uuid) made the seed correct regardless of the fresh-DB user id.
2. Canonical `node_id`s were pinned from `.cogni/repo-spec.yaml`, and stale forks reusing operator's id (`standalone-node`, `cogni-poly`) were caught before a PK collision.

### What Went Wrong

1. Registry state is neither migration-seeded nor reliably backed up, so a reprovision loses it invisibly.
2. RLS-filtered reads were briefly mistaken for ground truth.

### Where We Got Lucky

1. The reprovision-artifact passphrase was reused, so live prod access was possible without a fresh-cred fetch.
2. The owner `users` row already existed (prior SIWE login), so no user re-creation was needed.

## Action Items

| Pri | Action                                                                                                                                                                                                                                                                | Owner        | Work Item    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| P0  | **DONE (this PR + prod op):** `backup.sh` now fails-closed (non-zero exit, `db_backup.failed`, no `completed` on any dump error, so a future drift is LOUD not silent); prod `postgres` superuser password re-aligned; backup re-run → real non-empty dumps verified. | flock-leader | this PR      |
| P0  | **DONE (this PR):** off-host durability = a **periodic local pull** of the newest backup (recipe in `database-expert`). Same-VM backup + local pull IS the recovery story — no S3 sink needed.                                                                        | flock-leader | this PR      |
| P1  | Promote the merged ExternalSecret node-overlay fix (#1969) to prod so beacon/poly/node-template pods leave `CreateContainerConfigError` (the live fleet-health gap — needs an owner-gated prod promote)                                                               | Derek        | —            |
| P2  | Grant the owner OpenFGA `production_promoter`/`admin` on the seeded nodes via the API grant loop so operator-API promotes work (workflow-dispatch promotes already work without it)                                                                                   | flock-leader | (file /task) |
| P3  | _Optional hardening (not blocking — fail-closed makes drift loud):_ ESO-sync the superuser/backup credential + a `0040_seed_registry_nodes.sql` migration so a future fresh DB self-heals both the backup cred and the registry ownership                             | flock-leader | (file /task) |

## Related

- `.claude/skills/database-expert/SKILL.md` § "Reseeding the operator `nodes` registry after a fresh reprovision" (durable how-to + the RLS-read gotcha)
- `nodes/operator/app/src/adapters/server/db/migrations/0037_seed_first_class_nodes.sql` (seed pattern)
- PR #1969 — node ExternalSecret fleet heal (the parallel node-overlay fix)
