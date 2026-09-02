---
work_item_id: task.5056
status: in_progress
branch: agent/story5016-proof
last_commit: fb8e266c7e
---

# Handoff: Akash pipeline lane — one provider error from a live URL

**Pickup:** you own landing story.5016's Akash lane end-to-end. The entire pipeline
is proven except the last hop: the controller is live on candidate-a, creates real
Akash deployments through the managed rail, and the provider is rejecting them
(`ProviderRejected`). Diagnose that rejection, get `toks4-test.cognidao.org` serving,
then run the lifecycle matrix and merge the stack.

## Goal

A node whose catalog row says `deployment_provider: candidate-a: akash` deploys via the
EXISTING candidate-flight → Argo → ComputeWorkload → controller → Akash path, with no
bespoke steps. E2E validation, in order:

1. `https://test.cognidao.org/version` `.buildSha == 275f737f452c…` — **DONE, proven**
   (operator + controller flighted via candidate-flight run 33577032982).
2. `https://toks4-test.cognidao.org/version` `.buildSha == fbcbaee8f43a57b094bf51a95e4c38248e0515bb`
   and `/readyz` 200 — **THE REMAINING GATE** (currently 502; lease pending/rejected).
3. `/deployment-proof` 200 with the private echo-sidecar response; sidecar has NO public ingress.
4. Lifecycle, each step a Git commit + one flight (separate runs): annotation change →
   operator flight → same lease id; catalog akash→k3s → toks4 flight → lease closed +
   controller-owned DNS removed; revert → new lease, same URL healthy.
5. Then: post `/validate-candidate` scorecard → merge component PRs → all future flights
   via `POST /api/v1/vcs/flight` at main (the rail can't carry the unmerged lane — that's
   the only reason proof flights used `workflowRef=agent/story5016-proof`).

## Start By Reading

- `work/handoffs/task.5056.handoff.md` (this file), then story.5016 + task.5056 via
  `GET https://cognidao.org/api/v1/work/items/{id}` (auth: `.env.cogni`).
- `nodes/operator/app/src/features/compute/compute-workload-reconciler.ts` — controller loop.
- `nodes/operator/app/src/adapters/server/compute/akash-compute.adapter.ts` — managed rail;
  provider mandate/bid screening (task.5051) lives here — prime `ProviderRejected` suspect.
- `.github/workflows/candidate-flight.yml` external lane + `.github/actions/materialize-compute-workload/`.
- `docs/spec/cicd-platform-boundary.md` — freeze policy (bash deploy brain: bug fixes only).
- Skills: `git-app-expert`, `devops-expert`, `promote`.

## Current State

- **Stack:** proof branch `agent/story5016-proof` (tip `fb8e266c7e`, PR #2102 draft,
  PROOF-ONLY, >50-file review limit — never the merge vehicle). Component PRs: #2099
  (`adb2ff51`), #2100 (`c7b89dfa`), #2101 (`2931ad32` — carries 3 ported fixes), plus a
  to-be-cut task.5056 PR for the integration delta. node-template #112, toks4 #16 green.
- **Stage 1 DONE:** candidate-a operator serves `275f737f…`; controller 1/1 Ready, holds
  the `compute-workload-controller` Lease; CRD installed; ESO projected
  `toks4-compute-env-secrets` (incl. `LITELLM_VIRTUAL_KEY` after the substrate lane ran).
- **Stage 2 90%:** flight run 33577821517 succeeded; Argo applied the ComputeWorkload
  (`72aa130b… = toks4`); controller created Akash deployment `1788311231154`, retried as
  `1788311688177`; status now `Progressing / pending / ProviderRejected: external compute
  provider rejected the operation`. `toks4-test.cognidao.org` = 502.
- **Five real bugs found + fixed this cycle** (all on proof branch; controller fixes ported
  to #2101): SSH arg-flattening in `assert-target-substrate.sh` (%q); CRD inadmissible
  (CEL `metadata.labels` + cost budget — proven via `kubectl --dry-run=server`); Lease
  MicroTime 400 (6-digit fractional seconds — proven via in-pod dryRun create); jsonpath
  literal-`\n` in the (since-deleted) bash CR poll; candidate-a operator rollout wedged at
  91% memory (now `maxSurge:0/maxUnavailable:1` in the candidate-a overlay).
- **Funding:** managed account $0.99, deposit min $0.50 — one lease at a time; escrow
  refunds on close. Read via `GET /api/v1/compute/balances` (works on prod + candidate).
- **Known gaps (post-merge follow-ups):** argocd-cm ComputeWorkload health Lua ships in
  `infra/k8s/argocd/argocd-cm-patch.yaml` but is NOT applied on candidate-a (provision
  refresh lane); pr-manager `core__vcs_flight_candidate` denies both agent API keys
  (file a bug); node-template #112 merge requires prod operator to carry the
  `canonical-fork-sync.server.ts` path-set extension first (`canonical_missing` fleet risk).

## Design / Implementation Target

1. Zero new workflows/branch types; placement is catalog-driven (`deployment_provider`),
   invisible to PR authors; k3s lane stays byte-identical.
2. Frozen bash gets bug fixes only; platform logic lives in the typed materializer +
   controller (TS) and the substrate (catalog/overlay/Argo/ESO).
3. Secrets: value-free `secretRefs` only; ESO projects declared keys into
   `<node>-compute-env-secrets`; custody keys denied (`node-secrets-reserved.data.ts`);
   per-node `LITELLM_VIRTUAL_KEY`, never the master.
4. Acceptance mutations are Git-only — manual kubectl/Console/SSH-write/chain-close
   invalidates the proof. SSH to candidate-a is read-only diagnosis.
5. Live proof = external URL `/version` SHA match, never workflow-green alone.
6. After merge: flights only via the operator rail; equivalence-check main vs the flighted
   proof tree over touched paths before closing PR #2102.

## Next Actions / Risks

- [ ] Diagnose `ProviderRejected`: controller logs
      (`kubectl -n cogni-candidate-a logs deploy/operator-compute-workload-controller`),
      K8s Events, Loki `cogni-candidate-a`. Suspects: provider mandate/bid screening
      (task.5051) vs the zencloud-only allowlist (`AKASH_ALLOWED_PROVIDERS` overlay env) —
      zencloud may not be bidding or bids fail the mandate; SDL/pricing; deposit.
      Note controller recovery limit is 3 — the CR may reach `RecoveryLimitExceeded`
      and need a Git-driven nudge (new generation) after the fix.
- [ ] Fix on the proof branch (TS/catalog/overlay preferred), ONE re-flight of toks4 at the
      frozen tip, then the matrix (Goal 2-4).
- [ ] Scorecard → merge order: #2100 → #2099 → #2101 → task.5056 PR → (prod promote gate)
      → node-template #112 promptly after → close toks4 #16.
- [ ] Risks: single candidate slot (concurrency group cancels re-dispatches of the same
      slug+sha); VM memory at ~91% (don't add tenants); mid-run static-digest window in
      `prepare-substrate-deploy-branch` (pre-existing; note only); Derek red line: nothing
      unvalidated merges, prod promote is a human gate.
