---
work_item_id: fleet-reprovision
status: in_progress
branch: main
last_commit: 587415cb8d
---

# Fleet Reprovision — get preview + production live from-empty

## Mission

Pickup: the Cherry VM fleet was reclaimed for non-payment on 2026-08-04 (balance €0). It's re-funded (€199) and must be reprovisioned from scratch. A 6-domino chain of **fresh-provision-only** bugs blocked the first clean provision in 46 days; those fixes are **merged to main** (PR #1963). **candidate-a is live.** You own getting **preview** then **production** live — from main, unattended, via the `provision-env` skill. One live blocker remains (doltgres-provision race, below).

## Goal

All three envs serving, proven **unattended** (zero hand-patching — that's the proof the merged #5/#6 fixes work):

- **provision green** → `operator` pod **1/1** in `cogni-<env>` ns (WITHOUT you creating Postgres roles or Doltgres DBs by hand) → `https://<host>/readyz = 200` → agent-api gate `register → POST /api/v1/chat/completions {graph_name:"poet"} → status:"success"`.
- Hosts: candidate-a=`test.cognidao.org` (🟢 200 now), preview=`preview.cognidao.org` (🔴 502), production=`cognidao.org` (🔴 521).
- **Sequence discipline (hard):** preview must pass the full unattended bar **alone** BEFORE production is dispatched. Never fire preview+prod together — if a domino #7 exists it dies on preview with prod untouched. Prod's apex-cutover risk is moot (already 521).
- **NON-goals:** knowledge-compounds / Doltgres domain seeding (#8, dropped — operator boots without it); external nodes beacon/node-template/poly (not in the monorepo — `CreateContainerConfigError` is expected, separate concern).

## Start By Reading

- `docs/spec/provisioning-north-star.md` — the mission + Pillars (uniform path, run-from-empty, .ts migration). Read first.
- `.claude/skills/provision-env/SKILL.md` — operator playbook: dispatch, phase map, all gotchas. **Gotcha 4 (H7 deploy-branch divergence)** + Gotcha 5 (re-run passphrase) bit preview already.
- `docs/guides/agent-api-validation.md` — the e2e gate (poet `status:success` is the pass).
- `scripts/ci/deploy-infra.sh` — the live blocker is **line ~728** (`doltgres-provision`) + the doltgres bring-up/guard at `doltgres_in_compose()` (~L547) and the per-node db-provision loop (~L1163). `infra/compose/runtime/doltgres-init/provision.sh` connects `-d postgres`.
- `.context/reprovision-fix-review.md` (gitignored, this workspace) — my full working notes on the 6 dominoes.

## Current State (facts)

- **PR #1963 MERGED to main** (`587415cb8d`). 8 commits: seed_kv 404 fix (`a54f2480`), OPENFGA/TEMPORAL producer+ungated-read (`0b7c5f32`), **doltgres 0.56.3→0.57.3** (`e9dcefe3`, verified fresh-init works), per-node db-provision `NODE_TARGETS[@]`→`NODE_APP_TARGETS` (bug.5090, `fc2e2284`), doltgres bootstrap guard→static file grep (`fc2e2284`), two fail-loud guards (`1a024b3b`), + north-star spec.
- **candidate-a: LIVE** — operator 1/1, `test.cognidao.org/readyz=200`, poet gate passes (OpenRouter funded). BUT that run predated #5/#6, so I hand-created the per-node roles + Doltgres DBs to prove the substrate. VM `84.32.110.152` — **KEEP it**.
- **preview: BLOCKED** — VM up (`5.199.161.45`), edge up (`preview.cognidao.org=502`). Three dispatch attempts: (1) H7 deploy-branch divergence → cleared all 14 `deploy/preview*` refs; (2) transient `tofu init` provider-download timeout → retried; (3) **deploy-infra exit 2 at `doltgres-provision`: `FATAL: database "postgres" does not exist`.**
- **production: DOWN** (`cognidao.org=521`), not yet dispatched.
- Pre-flight for preview/prod is clean: minting secrets present, Cherry €199, OpenRouter/RPC/PostHog present. Passphrases saved to `~/dev/cogni-template/.local/{preview,production}-init-passphrase.txt` (preview exists; generate prod's).

## Design / Implementation Target

1. **Fix the preview doltgres-provision race.** 0.57.3 IS on main and fresh-inits a connectable `postgres` DB (verified in isolation) — so the failure is a **race**: doltgres reports compose-`healthy` (port-open) before fresh-init finishes creating `postgres`, and deploy-infra runs `doltgres-provision` immediately (deploy-infra.sh ~L728). On candidate-a I ran provision manually _later_ → it won. Fix: make deploy-infra **wait until `postgres` is actually connectable** (poll `psql -d postgres` / retry on `database "postgres" does not exist`) before `doltgres-provision`, OR tighten the doltgres healthcheck to assert DB-ready not port-open. First confirm on the VM (`5.199.161.45`) that doltgres is 0.57.3 and reproduce the race.
2. **No fail-soft.** A doltgres/db-provision failure stays loud (never green-with-dead-substrate — that pattern IS this incident). The two merged guards (NODE_APP_TARGETS non-empty; doltgres compose-file-exists) must stay loud.
3. **Unattended is the bar.** If preview needs ANY manual role/DB creation to boot the app layer, that's a #5/#6 regression — fix in code, do not hand-patch.
4. **Sequence:** preview unattended-green → THEN production, from main, same flow. Never both.
5. **Freeze:** `deploy-infra.sh` (~2270 lines) is frozen and must shrink — bug/guard fixes in-place OK; new behavior → `.ts` (`OperatorDeployPlanePort`) or substrate, never new deploy/promote/provision bash.

## Next Actions / Risks

- [ ] Diagnose+fix #1 on a new branch off main; validate on **preview** (re-dispatch from main). If a re-run's `deploy/preview*` diverge again, delete them first (Gotcha 4). Same-passphrase re-dispatch adopts the existing VM.
- [ ] Preview passes unattended (operator 1/1 + readyz 200 + poet success) → **then** dispatch production.
- ⚠️ **Monitoring (Gotcha 20):** a `gh run watch` background task **gets killed on session boundaries** — do NOT rely on it as your primary signal (this bit me twice). Make `ScheduleWakeup` the primary re-invoke; treat any `status=killed`/`stopped` task-notification as RE-ARM, not done. Provision runs are 20–45 min.
- ⚠️ Run-log step names are **secret-masked** (`boot***trap`) — grep the raw log by content, not step name. The real deploy-infra error is the `[FATAL] Script failed at line N` above the ERR-trap red-herring dump (litellm/alloy LOKI warnings are noise).
- ⚠️ H7 deploy-branch divergence + the prod apex cutover are known env state-forks (north-star Pillar 1) — expected for preview/prod reprovision, not bugs. De-forking them is a fast-follow, not this task.
