---
id: clean-provision-canary
type: spec
title: Clean-Provision Canary — the fresh-init minesweeper
status: draft
trust: draft
summary: A scheduled fresh provision of a throwaway env, asserted against a golden AFTER-state, so fresh-provision-only rot cannot accumulate behind green re-deploys.
read_when: Designing or operating the provisioning safety net; understanding why the 2026-08-04 fleet reprovision hit a 4-bug chain.
owner: derekg1729
created: 2026-08-04
---

# Clean-Provision Canary

## Why this exists (the root cause it fixes)

On 2026-08-04 the Cherry fleet was reclaimed for non-payment and had to be reprovisioned from
scratch. The reprovision hit **four separate fresh-provision-only bugs in a row** — seed_kv `Code:404`,
`OPENFGA_DB_PASSWORD`/`TEMPORAL_DB_PASSWORD` producer gap, and Doltgres 0.56.3 fresh-init — each hidden
until the prior was fixed. Root cause of the *chain*: **no env had been cleanly provisioned in ~46 days.**
Every env re-deploy runs on a persisted volume + already-seeded OpenBao, so anything that only breaks on
a *fresh* substrate (a consumer wired without a producer, a version bump never fresh-inited, an
`operator-env-secrets`-gated read that's skipped on first boot) stays green on re-deploys and rots silently.

The four fixes are **landmine-clearing**. This canary is the **minesweeper**: it forces the fresh path to
run on a cadence, so this class of rot is caught the day it lands, not the next time the fleet dies.

## Invariant it depends on (and reinforces): PROVISIONING IS UNIFORM

`candidate-a == candidate-b == preview == production`, **modulo which nodes deploy**. The heavy provisioning
logic (`scripts/setup/provision-env-vm.sh`, `scripts/ci/deploy-infra.sh`, `scripts/setup/bootstrap.sh`)
carries **zero env-name behavioral branches** (audit 2026-08-04). Because the path is uniform, a clean
provision of a *throwaway* env **proves production's clean-provision path**. Forks are the enemy: every
`case $DEPLOY_ENV` that changes behavior creates an untested divergent path — exactly where rot hides.
Remaining forks to keep on the radar (reduce, don't grow):
- `provision-env-vm.sh` H7 deploy-branch force semantics (candidate auto-force vs preview/prod refuse) —
  **only fires on RE-provision**; a fresh env has no branches to force/refuse, so the canary (fresh) is
  representative of prod's fresh path.
- The `OPENBAO_RUNTIME_SSOT` fresh-vs-established read gate — a *state* fork; fix #2 removed it for DB creds.

## What it does

1. **Fresh provision** a dedicated throwaway env (`canary`, its own Cherry VM + fresh volumes + fresh OpenBao)
   via the SAME `provision-env.yml` (`mode=full`) — no adopt, no persisted state. This is the only way to
   exercise the fresh path the fleet-death reprovision hits.
2. **Assert the golden AFTER-state** (below). Any deviation = a fresh-provision regression → file as the next
   root fix, same discipline as the four this week. **Never fail-soft** — a hard-fail on missing substrate is
   the alarm, not a nuisance.
3. **Decommission** the throwaway (delete VM, prune Argo AppSet + DNS). NB: decommission is currently
   broken (orphaned AppSet, no prune — `project_fleet_capacity_reality_and_decommission_gap`); the canary
   both depends on and pressures fixing it. Until then, the canary re-forces one throwaway slot.

## Golden assertion set — SEEDED FROM THE FIRST CLEAN PROVISION

The first clean provision in 46 days (candidate-a run **30946042649**, 2026-08-04, all four fixes) is the
**seed artifact**: its verbatim AFTER-state becomes the canary's pass criteria. To capture on green:
- `kubectl get pods -n cogni-<env>` — every deployed node **1/1** (record the exact set).
- `kubectl get externalsecret -n cogni-<env>` — all `SecretSynced`.
- `curl https://<public-host>/version` → `.buildSha` matches the promoted SHA.
- **Full agent-api-validation gate** (`docs/guides/agent-api-validation.md`): register → `graph_name:poet`
  `status:"success"` (proves OpenRouter creds) → list runs → SSE stream → **knowledge-compounds diff**
  (proves Doltgres 0.57.3 fresh-init + the whole knowledge plane) → billing receipt + Loki marker.
- OpenBao paths present: `cogni/<env>/openfga/OPENFGA_DB_PASSWORD`, `cogni/<env>/_shared/TEMPORAL_DB_PASSWORD`,
  per-node secrets; Doltgres `postgres` connectable + knowledge DBs created.

If run 30946042649 instead hits **domino #5**, that failure is the canary earning its keep on day one:
log the terminal phase + Loki line → next root fix (not a fail-soft).

## Triggers / cadence

- `schedule:` weekly (fresh-provision cost = one short-lived VM).
- `pull_request` paths-filter on `scripts/setup/**`, `scripts/ci/deploy-infra.sh`, `infra/compose/**`,
  `infra/k8s/**`, `.github/workflows/provision-env.yml` — so a PR that breaks the fresh path is caught
  **pre-merge**, which is the whole point.
- `workflow_dispatch` for on-demand.

## Implementation status

Design first-class here; the workflow (`.github/workflows/provision-canary.yml`) + the reusable assertion
script land once run 30946042649 supplies the verbatim golden set. Dependencies: a `canary` env slot + a
working decommission path.
