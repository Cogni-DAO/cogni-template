---
id: provisioning-north-star
type: spec
title: Provisioning & Deployment North Star — one uniform path, continuously exercised, migrating to .ts
status: draft
trust: draft
summary: >
  The target state for how any env is stood up and deployed: ONE provisioning code path parameterized
  only by node-set (candidate-a == candidate-b == preview == production), exercised from truly-empty on
  a cadence so fresh-init rot can't accumulate behind green re-deploys, with the bash/YAML deploy brain
  frozen and migrating into the typed .ts operator control plane.
read_when: >
  Designing or reviewing anything that provisions or deploys an env; deciding where new deploy/provision
  behavior lands; understanding why the 2026-08-04 fleet reprovision hit a 4-bug chain.
implements: []
spec_refs:
  - spec.cicd-platform-boundary
  - ci-cd-spec
  - operator-managed-deployments
owner: derekg1729
created: 2026-08-04
verified: 2026-08-04
tags: [ci-cd, provisioning, deployment, platform, north-star]
---

# Provisioning & Deployment North Star

Refines [`cicd-platform-boundary.md`](./cicd-platform-boundary.md) (the freeze) and
[`operator-managed-deployments.md`](../design/operator-managed-deployments.md) (the `.ts` target).
It does not duplicate them — it states the _destination_ the freeze protects and the `.ts` plane migrates toward.

## The lostness this fixes

On 2026-08-04 the Cherry fleet was reclaimed for non-payment and had to be reprovisioned from scratch.
The reprovision hit a **six-deep chain of fresh-provision-only bugs** — seed*kv `Code:404`,
`OPENFGA_DB_PASSWORD`/`TEMPORAL_DB_PASSWORD` producer gap, Doltgres 0.56.3 fresh-init, then (surfaced only
after the provision \_reported green*) the per-node db-provision loop never running and doltgres-provision
skipping on a detection race (#5/#6, below) — each hidden until the prior was cleared. Root cause of the
_chain_: **no env had been cleanly provisioned in ~46 days.**
Every env re-deploy runs on a persisted volume + already-seeded OpenBao, so anything that only breaks on a
_fresh_ substrate stayed green on re-deploys and rotted silently. We were lost because the path that matters
most in an outage — provision-from-empty — was the one path nothing ever ran until the outage.

## Trustworthy, defined as a number

> **Trustworthy provisioning = the interval between "a fresh-provision bug lands" and "we detect it" is bounded by a schedule, not by the next fleet-death.**

Metric: **days-since-last-green-clean-provision.** On 2026-08-04 it was **46** (last success 2026-06-19).
That number being 46 _is_ why we were lost. **Target ≤ 7, automatically.**
Secondary metrics: (a) count of `provision-env` skill gotchas with no regression assertion (~20 → 0);
(b) `deploy-infra.sh` line count (**2,264** and rising → must ratchet DOWN, not up).

## Pillar 1 — Provisioning is UNIFORM (forks are the enemy)

`candidate-a == candidate-b == preview == production`, **modulo which nodes deploy**. Nothing else differs.

**Good news, audited 2026-08-04:** the heavy scripts (`provision-env-vm.sh`, `deploy-infra.sh`,
`bootstrap.sh`) already carry **zero env-name behavioral branches**. We are close. The remaining forks are
**state**-forks (fresh vs re-provision), not env-forks, and both are on the reduce-don't-grow list:

| Fork                                                                        | Where                          | Class                     | Disposition                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Deploy-branch force semantics (candidate auto-force vs preview/prod refuse) | `provision-env-vm.sh` H7       | state (re-provision only) | Fresh env has no branches to force → the fresh path is env-uniform. Collapse to one rule when H7 is redesigned. |
| `OPENBAO_RUNTIME_SSOT` fresh-vs-established read gate                       | `deploy-infra.sh` secret reads | state (first-boot)        | Fix #2 already removed it for DB creds; extend that pattern (ungated `${env}-db-reader`) to the rest.           |
| Apex-is-zone-root only for `production`                                     | `provision-env-vm.sh:715`      | env                       | Blue-green the apex flip so prod's provision path == the others (see Gotcha 1, `provision-env` skill).          |

**Rule:** any _new_ `case $DEPLOY_ENV` that changes behavior is a regression against this spec. Node-set is
the only permitted parameter. A fork is an untested divergent path — exactly where the next domino hides.

## Pillar 2 — The fresh path runs on a cadence (no new platform, no "canary")

There is **no `canary` env** — we have candidate-a / candidate-b / preview / production. The minesweeper is
not a new thing to build; it is **the real provision, run from-empty against a throwaway slot, on a schedule.**

- **Env:** `candidate-b` (the designated second slot, `provision-env.yml` already offers it; `ci-cd.md` §env).
  Its own Cherry VM + fresh volumes + fresh OpenBao — no adopt, no persisted state. That is the _only_ way to
  exercise the path a fleet-death reprovision hits.
- **Mechanism (freeze-compatible):** a scheduled **routine** (`/schedule`) that `workflow_dispatch`es the
  EXISTING `provision-env.yml` with `env=candidate-b`. **No new workflow file, no new `scripts/ci/*.sh`** —
  both are frozen platform surfaces (`cicd-platform-boundary.md`; devops-expert anti-pattern "new
  deploy/promote/provision workflow"). If a `schedule:` + paths-filter trigger is instead added to
  `provision-env.yml` directly, that is a trigger, not new platform logic — acceptable, but the routine is
  cleaner and touches zero frozen files. Cadence: weekly + on-demand `workflow_dispatch`.
- **HARD PREREQUISITE — decommission must work first, or the minesweeper becomes the mine.** A weekly fresh
  provision that cannot tear itself down accumulates one Cherry VM per week → the exact silent balance drain
  (`€0`, non-payment reclaim) that _started_ the 2026-08-04 incident. The scheduled run is **BLOCKED** until
  (a) decommission reliably deletes VM + Argo AppSet + DNS (`project_fleet_capacity_reality_and_decommission_gap`),
  and (b) a spend guard alerts before balance can silently reach zero. On-demand `workflow_dispatch` (with
  manual teardown) is fine now; the _schedule_ waits on both.
- **Pre-merge guard:** the same run, gated on a PR paths-filter for `scripts/setup/**`,
  `scripts/ci/deploy-infra.sh`, `infra/compose/**`, `infra/k8s/**`, `provision-env.yml`, so a PR that breaks
  the fresh path is caught **before merge** — the whole point.
- **Assertion = the EXISTING gate, not a bespoke script.** Pass criterion is
  [`agent-api-validation.md`](../guides/agent-api-validation.md) run against the throwaway's public host,
  plus the provision-env skill's AFTER bar (pods 1/1, `/version.buildSha`, ExternalSecrets `SecretSynced`).
  **Never fail-soft** — a hard-fail on missing substrate is the alarm.

**Static complement (cheapest, catches the biggest class without provisioning anything):** an `arch:check`
lint that fails CI when a secret is _read_ (`source_openbao_runtime_key required` / `openbao_get_field`) but
never _produced_ (no Phase 5c seed / bootstrap gen). That is the exact PR-1613 consumer-without-producer bug,
caught deterministically at PR time. **Policy:** a `provision-env` gotcha isn't "closed" until it is either
asserted by the scheduled fresh run OR caught by this lint. The 20-item gotcha list becomes a shrinking test
backlog, not growing oral tradition.

## Golden assertion set — the pass criteria (NOT the provision's own green)

This is the **target** AFTER-state every clean provision must satisfy — and **we have not hit it yet.**
Run **30946042649** (2026-08-04, the first provision attempt in 46 days) reported green while the app layer
was broken (dominoes #5/#6, below). It was then made to serve `/readyz 200` by **hand-clearing #5/#6 over
write-mode SSH** — which is itself the anti-pattern (`No manual VM state`; devops-expert Principle 1): a
hand-patched VM proves the _app image_ runs, and proves **nothing** about whether provisioning produces a
healthy env. **There is no golden seed until an UNATTENDED, zero-touch run passes every criterion below.**
The criteria (what a hands-off run must produce on its own once #5/#6 are fixed _in code_):

- `kubectl get pods -n cogni-<env>` — every deployed node **1/1** (record the exact set).
- `kubectl get externalsecret -n cogni-<env>` — all `SecretSynced`.
- `curl https://<public-host>/version` → `.buildSha` matches the promoted SHA.
- **Full agent-api-validation gate:** register → `graph_name:poet` `status:"success"` (OpenRouter creds) →
  list runs → SSE stream → **knowledge-compounds diff** (proves Doltgres 0.57.3 fresh-init + knowledge plane)
  → billing receipt + Loki marker.
- OpenBao paths present: `cogni/<env>/openfga/OPENFGA_DB_PASSWORD`, `cogni/<env>/_shared/TEMPORAL_DB_PASSWORD`,
  per-node secrets; Doltgres `postgres` connectable + knowledge DBs created.

**What actually happened (2026-08-04, run 30946042649):** the provision reported **GREEN** — yet the app
layer was broken, exposing **dominoes #5 and #6 that the green provision hid**: (#5) deploy-infra's per-node
Postgres db-provision loop never ran (only the INFRA*ONLY pass) → no `app*<node>`roles → operator migrate`28P01`; (#6) doltgres-provision was **skipped** on a `Doltgres not present in compose config`detection race
(checked before doltgres started) → no`knowledge\_<node>`DBs → migrate-doltgres`3D000`. Both were cleared
by hand to prove the substrate (operator reached `1/1`, `https://test.cognidao.org/readyz = 200`); both need
code fixes. **This is the load-bearing lesson: `provision-green`≠`env-healthy`.** Phase 9 `/readyz` is soft,
so a green provision can ship dead app pods. Therefore the assertion MUST be the full agent-api gate
(register → poet → knowledge-compounds), not the provision's own conclusion — exactly Pillar 2. A green run
that fails the gate is the mechanism earning its keep: log the terminal phase + Loki line → next root fix,
never a fail-soft.

## Pillar 3 — The deploy brain migrates to `.ts` (shrink, don't grow, the bash)

The target — deploy writes move into the typed `.ts` `OperatorDeployPlanePort` (Argo reconciles; no SSH, no
scripts) — is **already specified**, not re-litigated here: see [`cicd-platform-boundary.md`](./cicd-platform-boundary.md)
(the freeze + surface classification + request→home table) and [`operator-managed-deployments.md`](../design/operator-managed-deployments.md)
(the READ/WRITE-to-git model). This spec adds only the **measurable line this incident earned:**

- `deploy-infra.sh` grew **~97 lines this week (2,167 → 2,264) from _correct_ bug-fixes.** Even good bash edits
  compound the frozen pseudo-platform. So: **line count must trend DOWN release-over-release** — that is the
  concrete signal Pillar 3 is progressing, and the metric the freeze doc lacks.

## Open dependencies

- **Decommission is broken** (orphaned AppSet, no prune — `project_fleet_capacity_reality_and_decommission_gap`).
  The scheduled fresh run both depends on and pressures fixing it; until then it re-forces one throwaway slot.
- **H7 deploy-branch semantics** need the one-rule redesign (Pillar 1) to fully de-fork re-provision.
- **The `.ts` `OperatorDeployPlanePort`** is design-stage (`operator-managed-deployments.md`); Pillar 3 is the
  multi-quarter arc, not this PR.
