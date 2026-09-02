# Spike: minimum-bespoke Akash GitOps with Crossplane + provider-http

**Thesis.** Instead of hand-rolling a Kubernetes controller to reconcile an Akash
workload, use **Crossplane** (the CNCF OSS reconcile engine) + the generic
**`crossplane-contrib/provider-http`** provider to reconcile a workload declared in
git by driving an operator **compute REST API**. The crash-safe Akash logic lives
server-side; Crossplane supplies only the generic reconcile / drift / retry / delete
loop. The net-new bespoke is meant to be an **XRD + a Composition (YAML) — nothing
more**.

This spike builds that end to end against a **mock** operator compute API (zero real
escrow) and runs it on a local **kind** cluster. It answers, with real command
output, whether provider-http genuinely gives you crash-safe adoption (lease
identity captured, no double-create) — the crux of the thesis.

---

## TL;DR verdict

**The thesis holds — with one precise, load-bearing condition.**

- ✅ **XRD + Composition is the ONLY net-new bespoke.** No custom Go controller. The
  Composition maps `XAkashWorkload` → a single provider-http `Request` whose
  Create/Observe/Update/Delete mappings hit `POST/GET/PUT/DELETE
  /api/v1/compute/deployments{,/{leaseId}}`.
- ✅ **Lease identity is captured as external state.** provider-http persists the
  `leaseId` returned by the create POST into the `Request`'s
  `status.response.body` and templates the Observe/Update/Delete URLs off
  `.response.body.leaseId`. A normal re-reconcile therefore **observes** the
  existing lease instead of re-creating it (crash window **A**, below). Proven live.
- ⚠️ **The hard crash window (B) is closed by the SERVER, not by provider-http.**
  provider-http has **no eagerly-persisted external-name**: the lease identity only
  exists after a successful create round-trip has been written back to
  `status.response`. If the provider dies *after* the POST succeeds server-side but
  *before* that status write (we reproduced this exact failure in the wild — see
  "Honest gaps"), provider-http **re-issues CREATE (POST)** on restart. The only
  thing preventing a second, double-paid lease is that the **operator POST is
  idempotent on a stable logical workload key**. The real operator already has this
  property server-side (`allocationCursor` + `findAllocationSince`, and an
  idempotency key of `namespace:name:uid:generation`); our mock reproduces it by
  keying on `nodeId` (the CRD enforces one paid workload per node/env). Proven live:
  after a forced status-loss, provider-http re-POSTs and the server returns the
  **same** lease.

**So:** minimum-bespoke (XRD + Composition, no custom provider) is a **genuine,
working option** *iff* the operator exposes an **idempotent** compute-create REST
seam. If it does not, you do not need a full custom controller either — you need a
**~100-line custom Crossplane provider `ExternalClient`** (or an idempotency shim in
front of the API) that wraps the same operator API and persists the leaseId as
Crossplane's external-name eagerly. See "If provider-http isn't enough".

---

## Architecture

```
   git (XAkashWorkload CR)
          │  kubectl apply / Argo
          ▼
   Crossplane XR ── Composition (function-go-templating) ──► provider-http Request
          ▲                                                        │
          │ status.leaseId (written back)                          │ HTTP + Bearer
          │                                                        ▼
          └──────────────────────────────  operator compute REST API  (MOCK here)
                     CREATE  POST   /api/v1/compute/deployments
                     OBSERVE GET    /api/v1/compute/deployments/{leaseId}
                     UPDATE  PUT    /api/v1/compute/deployments/{leaseId}
                     DELETE  DELETE /api/v1/compute/deployments/{leaseId}
                                     │  (real operator)
                                     ▼
                               Akash via Console  (/v1/deployments, /v1/bids, /v1/leases)
```

- **`XAkashWorkload` (XRD)** — spawn-facing fields mirroring the operator provision
  body: `nodeId`, `publicHost`, `services[]{name,image,cpuUnits,memoryMi,storageMi,
  port,visibility}`. Field names/shapes taken from the real port type
  `ProvisionSpec`/`DeclaredProvisionSpec`
  (`packages/ai-tools/src/capabilities/compute.ts`,
  `nodes/operator/app/src/ports/compute-workload.types.ts`).
- **Composition** — Pipeline mode (Crossplane v2 removed native Resources mode),
  `function-go-templating` renders one `Request` + writes `status.leaseId` back onto
  the XR; `function-auto-ready` maps the Request's readiness to the XR.
- **`ProviderConfig`** — `credentials.source: Secret`; provider-http sets the
  Secret's value as the `Authorization` header on every call. The token comes from
  `OPERATOR_COMPUTE_TOKEN` at demo time, **never** hardcoded.
- **Mock operator API** (`mock/server.js`) — pure Node `http`, zero deps, in-memory,
  faithful to the `ProvisionOutput = {provider, leaseId, state, endpoints}` port
  contract, **idempotent on `nodeId`** (the no-double-spend property).

### Response-contract note (important, honest)

On current `main` the **public** Next.js routes `POST/GET/DELETE
/api/v1/compute/deployments*` are **deliberate `409 gitops_required` tombstones**
(`nodes/operator/app/src/app/api/v1/compute/deployments/*`). The operator has
**already chosen the declarative route this spike would compete with**: a
`ComputeWorkload` CRD reconciled by its **own** in-process controller
(`compute-workload-reconciler.ts`) that talks to the Akash **Console** API. So there
is no live imperative REST create/status/delete seam to reconcile today.

This spike therefore mocks the **port-level contract**
(`ProvisionSpec`→`ProvisionOutput`, with the real field names `provider / leaseId /
state / endpoints`) that such a REST seam *would* carry — i.e. the exact shapes the
operator's `ComputeResourcePort` already uses internally. The practical finding: to
adopt "minimum-bespoke Crossplane", the operator would need to **re-expose an
idempotent compute-create REST endpoint** (un-tombstone it, keep the server-side
adoption logic). That is the real work item this spike surfaces.

---

## Files

```
experiments/crossplane-akash/
├── README.md                       this file
├── demo.sh                         one-shot end-to-end demo (kind up → … → teardown)
├── cluster/
│   └── kind.yaml                   single-node kind cluster
├── crossplane/
│   ├── provider-http.yaml          Provider  crossplane-contrib/provider-http:v1.0.15
│   ├── runtimeconfig.yaml          DeploymentRuntimeConfig: --poll=15s (fast demo)
│   ├── function-go-templating.yaml Function  :v0.12.4  (renders the Request)
│   ├── function-auto-ready.yaml    Function  :v0.7.0   (XR readiness)
│   └── providerconfig.yaml         ProviderConfig: bearer from Secret (not hardcoded)
├── composition/
│   ├── xrd.yaml                    XAkashWorkload CompositeResourceDefinition
│   └── composition.yaml            XR → provider-http Request mapping (the crux)
├── examples/
│   └── xakashworkload.yaml         sample workload CR
└── mock/
    ├── server.js                   mock operator compute API (zero deps)
    ├── server.test.js              unit tests (node --test): 10 tests
    └── k8s.yaml                    Deployment+Service (server.js via ConfigMap)
```

Pinned versions: crossplane `2.4.0`, provider-http `v1.0.15`, function-go-templating
`v0.12.4`, function-auto-ready `v0.7.0`.

---

## Run it

Prereqs: `docker` (running), `kind`, `kubectl`, `helm`.

```bash
cd experiments/crossplane-akash

# mock unit tests (no cluster needed)
( cd mock && node --test )

# full end-to-end demo (~5 min; pulls images). Keeps the cluster up for poking:
KEEP_CLUSTER=1 ./demo.sh
# or let it tear the kind cluster down at the end:
./demo.sh
```

`OPERATOR_COMPUTE_TOKEN` (default `"Bearer mock-token"`) is injected into a Secret
and consumed by the ProviderConfig; the mock only checks the header is present.

The demo: kind up → crossplane + provider-http + functions → mock API → apply
`XAkashWorkload` → reconcile to **READY** → crash-safety in two parts:
**(A)** freeze the provider (crossplane `paused` annotation) and delete the leaseId it
saved, then unpause and show it **recovers to the same lease** (no second lease);
**(B)** replay the provider's exact re-issued CREATE POST twice against the live mock
and show **server idempotency** returns the same lease (window B closed) → **drift**
a field and show it **converge** (PUT, same lease) → **delete** and show the lease
**released** + balance recovered → teardown.

> Why two parts: you cannot crash-test provider-http by scaling its Deployment to 0 —
> the crossplane package manager keeps it at `replicas=1`. And forcing the "lost
> leaseId" state at the k8s level races provider-http's informer cache (it frequently
> recovers by re-observing its cached id rather than re-POSTing). Part **B** pins the
> actually-load-bearing property (server idempotency) deterministically; part **A**
> shows the end-to-end invariant (same lease, no double-spend) holds regardless of
> which recovery path provider-http takes.

---

## What this does NOT cover (scope)

- **No real Akash / no escrow.** Everything hits the in-cluster mock. The mock speaks
  the port-level `ProvisionOutput` contract, not the multi-step Akash **Console**
  wire protocol (`/v1/bids`, `/v1/leases`, SDL rendering) — those stay server-side in
  the real operator.
- **No Argo.** The CR is applied with `kubectl`; Argo would be a drop-in for the
  git→cluster edge.
- **No DNS / secret-resolution / wallet-allocation.** The real reconciler also owns a
  public-host CNAME finalizer, `secretRefs` resolution, and wallet-slot claiming
  (`compute-workload-reconciler.ts`). None of that is modeled; a real Composition
  would either keep those server-side (preferred) or add more Request steps.
- **No auth beyond "header present".** Real calls need a node-scoped agent key with
  `node.flight`.
- **Single workload / happy path + the two crash windows.** No load, no concurrent
  XRs, no provider-rejection/`OrphanRisk` paths.

---

## Honest gaps found

1. **provider-http has no eager external-name.** Unlike typical CRUD providers that
   persist an external-name *before/around* the create call, provider-http's identity
   is `status.response.body.<idField>`, written only *after* a successful create
   round-trip. The window between "POST succeeded on the server" and "status
   persisted in k8s" is **not** covered by provider-http itself.
2. **We hit that window organically.** While reproducing the crash, provider-http's
   own status write lost an optimistic-concurrency race
   (`failed to update status: the object has been modified …` → "Cannot create
   external resource"), so on the next tick it **re-issued the POST** — and the mock
   returned the same lease (`activeLeaseIds` length stayed 1). That is window (B) in
   the wild, and it is precisely why the **server** must be idempotent. It is.
3. **You can't crash-test provider-http by scaling it down.** The crossplane package
   manager owns the provider Deployment and restores `replicas=1` within seconds, so
   the provider never actually stops (a genuine robustness property). And forcing the
   lost-leaseId state at the k8s level races provider-http's informer cache — it
   often recovers by re-observing its cached id rather than re-POSTing. Hence the
   demo proves the load-bearing property (server idempotency) with a deterministic
   replay (part B) and asserts only the true invariant (same lease, no second lease)
   for the k8s recovery (part A).
4. **Drift detection is value-comparison, not spec-hash.** The Composition's
   `expectedResponseCheck` compares the server's echoed `services`/`publicHost`
   against the desired body. That requires the status read to echo desired fields
   (the real `status.resource` does not — it carries only
   `{provider,id,state,endpoints}`). A production seam would either echo the spec or
   expose an ETag/generation to diff against.
5. **The seam we target is currently a tombstone** (see "Response-contract note").

---

## If provider-http isn't enough (the minimal fallback)

If you are unwilling to rely on server-side idempotency (e.g. the operator can't
guarantee an idempotency key), the fallback is **still not a hand-rolled 1,500-line
controller**. It is a **~100-line custom Crossplane provider** whose
`managed.ExternalClient` wraps the same operator API:

- `Observe`: `GET /deployments/{external-name}`; `ResourceExists` iff found.
- `Create`: `POST /deployments`; **immediately** `meta.SetExternalName(cr,
  resp.leaseId)` and return — Crossplane persists the external-name annotation on the
  CR *before* the next reconcile, closing window (B) on the client side.
- `Update`/`Delete`: `PUT`/`DELETE /deployments/{external-name}`.

You inherit Crossplane's reconcile/retry/backoff/finalizer machinery for free and
write only the four thin methods. That is the honest "minimum-bespoke" floor if
idempotency can't live in the API.
