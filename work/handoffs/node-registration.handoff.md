---
id: node-registration
type: handoff
work_item_id: ""
status: active
created: 2026-08-05
updated: 2026-08-05
branch: main
last_commit: 793820d0c1
---

# Handoff: Register the production nodes in the operator DB (owner-scoped), so standard RBAC + deploy work

## Mission

Pickup: the Cherry fleet was reprovisioned from scratch on 2026-08-05 (candidate-a + preview are live; prod provisioned green but the operator app image is a placeholder → 502, needs a `/promote`). During that work we found the **real reason node bring-up keeps needing hand-patching**: **the operator `nodes` registry table is EMPTY.** The node _apps_ exist as infrastructure (per-node Postgres DBs `cogni_<node>`, k8s overlays, pods) but they were never **registered** as rows in the operator DB. Without a registry row, `resolveNodeRef` 404s, so the standard operator-managed paths — RBAC grants, self-serve secrets, deploy — **cannot target the node**, and the pod dies `CreateContainerConfigError` (missing ESO `<node>-env-secrets`, because no one authored its ExternalSecret leaf either). You own closing that gap **properly**: seed the existing production nodes as registry entries, **created by Derek's RLS user (a new owner account he will create)** — not raw SQL inserts — so ownership, RLS, RBAC, and deployment all line up.

## Goal

- The production node set exists as rows in the operator `nodes` table, **owned by Derek's new account** (RLS-correct — rows carry the real owner, not a system/service bypass).
- From that ownership, the **standard** flows work end-to-end for at least one node with **zero hand-patching**:
  - RBAC: `POST /nodes/{id}/access-requests` → owner approve → OpenFGA tuple → `node.flight` / `can_manage_secrets` succeed (see `rbac-expert`).
  - Secrets: `POST /nodes/{id}/secrets` (or `pnpm secrets:set`) resolves the node (no 404) and writes OpenBao.
  - Deploy: the node's ESO ExternalSecret leaf exists → `<node>-env-secrets` syncs → pod goes `1/1` (no `CreateContainerConfigError`).
- **Validation signal:** pick one prod node (e.g. `poly`), register it under Derek's account, then show its pod `1/1 Running` in `cogni-production` and `GET /api/v1/nodes` (as that owner) returning it — with **no** manual `bao kv patch` and **no** hand-authored leaf outside the sanctioned node-formation path.

## Start By Reading

- `docs/spec/` node-registry design (memory: `project_node_registry_v0` — Postgres `nodes` table = live-state SSOT, repo-spec.yaml = git manifestation, 6-state machine; the API is owner-scoped) + `reference_operator_node_registry_enumeration`.
- `node-setup` / `node-wizard-expert` skills + `docs/spec/node-formation.md` — **how a node is properly created/registered** (the operator App authors the row + repo + catalog + overlays + ESO leaf). This is the flow to reuse, not reinvent.
- `rbac-expert` skill — register → access-request → approve → OpenFGA; every gated route needs a registry node_id.
- `database-expert` skill §RLS + `docs/spec/database-rls.md` — `app_user` (RLS-enforced, session `app.current_user_id`) vs `app_service` (BYPASSRLS). **The nodes must be created as the owner via the RLS `app_user` path**, so rows are attributable — NOT inserted as `app_service` (which would bypass ownership and re-create the "orphan node" problem).
- `nodes/operator/app/src/.../nodes/route.ts` + `resolveNodeRef` — how node creation + resolution actually work (the code of record).
- `provision-env` skill Gotcha 18 — the ESO ExternalSecret leaf gap (the CCCE symptom); confirm whether node-formation authors leaves or whether that's still manual.

## Current State (facts)

- **Fleet reprovisioned 2026-08-05.** Merged to main: `#1963` (clean fresh-provision domino chain), `#1964` (doltgres superuser set-once), `#1965` (doltgres `--no-deps` fresh-init race). candidate-a + preview: operator `1/1`, `/readyz 200`, **poet passes**.
- **prod:** provision workflow **green** (`--no-deps` fix cleared doltgres), but `operator-node-app` = `Init:ImagePullBackOff` (**placeholder digest** → needs `/promote` to fill the real operator image) → `cognidao.org/readyz 502`. Prod operator DB is therefore **not yet migrated** (`relation "nodes" does not exist` on prod until operator starts). Getting prod operator live (a `/promote`) is a **prerequisite** to seeding prod's registry.
- **`nodes` table is EMPTY** on preview (0 rows) where the operator IS running. So registration was never done on ANY env — not a prod-only gap.
- **poly / node-template / beacon** deploy (overlays + pods) but sit `CreateContainerConfigError` on every env — missing `<node>-env-secrets` because **no ExternalSecret leaf exists in the repo for them** (only `operator` has leaves, for all envs). This is downstream of never being registered/formed.
- Per-node app DBs DO exist (`cogni_poly`, `cogni_node_template`, `cogni_beacon`, `cogni_operator`), so infra is half-there.
- VM access this session used decrypted init-artifacts (`gh run download <run> --name <env>-init-artifacts` → `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:<passphrase from ~/dev/cogni-template/.local/<env>-init-passphrase.txt>`). The `.local/<env>-vm-key` on disk is stale (reprovision rotates it — Gotcha 15).

## Design / Implementation Target

1. **Register nodes through the sanctioned owner-scoped path, as Derek's new account** — reuse node-formation/`resolveNodeRef` creation, RLS `app_user` (session `app.current_user_id` = Derek's user). Rows must be owner-attributable. **Do NOT `INSERT` as `app_service`/BYPASSRLS** — that recreates orphan nodes with no owner → RBAC can't grant, ownership queries 404.
2. **One creation path, not two.** Determine whether the existing nodes (with DBs + overlays but no registry row) should be (a) adopted into the registry, or (b) re-formed cleanly. Whichever — pick ONE and make it repeatable; a "seed script" that diverges from the formation API is the trap.
3. **Registration must produce the ESO leaf** (or the follow-up that does). A registered node whose pod still `CreateContainerConfigError`s isn't done. If node-formation doesn't yet author the per-(node,env) ExternalSecret leaf, that's the concrete code gap to close (provision-env Gotcha 18 — the durable fix is codegen leaves from the catalog).
4. **No regressions:** don't hand-patch OpenBao or hand-author leaves as "the fix" — those are the non-standard workarounds this task exists to eliminate. Don't touch candidate-a/preview live-serving pods.

## Next Actions / Risks

- [ ] Derek creates the new owner account; capture its `userId` (the RLS owner for all prod nodes).
- [ ] Research the node-formation create path; decide adopt-existing vs re-form (Design target #2). Write the decision as prose before coding.
- [ ] Get prod operator live first (`/promote` a real operator digest) so its DB migrates and the `nodes` table exists on prod.
- [ ] Register ONE prod node (poly) under Derek's account via the sanctioned path; drive its pod to `1/1` with zero hand-patching — that's the E2E proof.
- [ ] Confirm the ExternalSecret leaf is produced by the flow (or file/fix the gap); then batch the rest of the prod node set.
- ⚠️ Determine the **real** intended prod node set (repo-spec.yaml / catalog) — the `deploy/production-*` branches listed operator/poly/node-template/beacon/blue/games/habitat/oss/red; some may be dead. Don't register ghosts.
- ⚠️ `beacon` (and blue/habitat/oss) are **external** nodes (own repos/knowledge stores) — confirm they belong on the operator fleet vs. their own pipeline before registering.
- ⚠️ RLS trap: creating as the wrong principal silently bypasses ownership — verify each row carries Derek's `owner`/`created_by` and that `GET /api/v1/nodes` returns it **as that user**.

## Pointers

| File / Resource                                                                      | Why it matters                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| operator `nodes` Postgres table (`cogni_operator` DB)                                | The registry SSOT — currently empty; the thing to seed                              |
| `nodes/operator/app/src/app/api/v1/nodes/route.ts` + `resolveNodeRef`                | Node create + resolution code of record; owner scoping                              |
| `docs/spec/node-formation.md`, `node-setup`/`node-wizard-expert` skills              | The sanctioned create/register flow to reuse                                        |
| `docs/spec/database-rls.md`, `database-expert` skill                                 | `app_user` (RLS) vs `app_service` (BYPASSRLS) — create as the owner, not the bypass |
| `rbac-expert` skill                                                                  | register→approve→OpenFGA; why a registry row is required for any grant              |
| `nodes/operator/k8s/external-secrets/<env>/`                                         | The ESO leaf pattern (only operator has it); missing leaf = CCCE (Gotcha 18)        |
| `/promote` skill                                                                     | Fill prod operator's real image digest (prereq to prod DB migrate)                  |
| `.local/*-init-passphrase.txt` + `gh run download <run> --name <env>-init-artifacts` | VM/kube access (on-disk keys are stale post-reprovision)                            |
