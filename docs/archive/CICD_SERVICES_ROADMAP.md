# CI/CD Services Roadmap

> [!CRITICAL]
> Services are first-class deployable products. CI builds images, CD applies manifests. No bespoke bash per service.

## Core Invariants

1. **SERVICE_AS_PRODUCT**: Each service owns Dockerfile + health endpoints + env schema + deploy manifest
2. **IMAGE_IMMUTABILITY**: Tags are `{env}-{sha}-{service}` or content-addressed fingerprints; never `:latest`
3. **MANIFEST_DRIVEN_DEPLOY**: Environment promotion = manifest change (GitOps), not rebuild
4. **NO_COUPLED_PIPELINES**: Service deploys independent of Next.js app pipeline
5. **ROLLBACK_BY_REVERT**: Deployments repo revert restores previous digest (GitOps rollback)

---

## Implementation Checklist

### P0: Bridge MVP (Current Tooling)

> Get scheduler-worker into production using existing SSH+Compose. Minimal changes.
>
> **Scope guard:** Only scheduler-worker. No generalized service loops.
>
> **Exemption:** Temporarily violates `NO_COUPLED_PIPELINES`—service build runs in app pipeline as bridge.

- [x] Add `build-service.sh` script (scheduler-worker only, uses `docker build` like app)
- [x] Extend `build-prod.yml` to build scheduler-worker after app
- [x] Extend `push.sh` to push service image, capture digest from push output or `docker inspect --format='{{index .RepoDigests 0}}'`
- [x] Pass SCHEDULER_WORKER_IMAGE as full digest ref (`ghcr.io/...@sha256:...`) through workflow outputs
- [x] Wire scheduler-worker into `deploy.sh` (env var substitution, same pattern as APP_IMAGE)
- [x] Add `/version` endpoint (returns `{ sha, service, buildTs, imageDigest }`)
- [ ] Validate `/livez` + `/readyz` in staging-preview E2E
- [ ] Add smoke test exercising real service behavior (beyond health endpoints)

#### Deploy Hygiene (P0)

- [x] Compose: `stop_grace_period: 30s` for scheduler-worker
- [x] Verify SIGTERM drain: ready=false before connections close
- [x] Log drain completion before exit
- [ ] **VM disk sizing**: Preview VM at 20GB insufficient for stack (litellm 4GB, sourcecred 2.6GB, postgres, temporal, app). Options: (a) upgrade Cherry Servers plan, (b) add block storage, (c) more aggressive image cleanup before pull
- [ ] **Deploy cleanup**: Add `docker image prune -f` to deploy.sh to remove dangling images from all services (not just cogni-template\*)
- [ ] **Deploy resilience**: Failed deployments must not take down the running site (currently preview.cognidao.org becomes unreachable on disk-full failures)

#### Service Contract (all services)

- [x] Health: `/livez` (liveness), `/readyz` (readiness)
- [x] Version: `/version` returns `{ sha, service, buildTs, imageDigest }`
- [x] Logging: pino JSON to stdout
- [x] Env: Zod-validated config with `HEALTH_PORT`
- [x] Shutdown: SIGTERM → ready=false → drain → exit

#### Chores

- [ ] Document service tagging in CI-CD.md
- [ ] Add scheduler-worker to SERVICES_ARCHITECTURE.md status table

### P1: GitOps Foundation

> Decouple deploy from app repo. Manifest-driven promotion.

- [ ] Extend digest-driven deploy to app+migrator (follow scheduler-worker pattern: CI resolves digest in `push.sh`, deploy uses `@sha256:` refs)
- [ ] Create `cogni-deployments` repo (or `deployments/` monorepo dir)
- [ ] Write Kustomize base for scheduler-worker (`base/scheduler-worker/`)
- [ ] Create overlays: `overlays/staging/`, `overlays/production/`
- [ ] OpenTofu: Provision k3s cluster (single node MVP)
- [ ] Install Argo CD on k3s
- [ ] Argo app-of-apps or ApplicationSet pattern for multi-service management
- [ ] Promotion flow: PR to change image digest in overlay → Argo syncs
- [ ] Kustomize images use `@sha256:` digests (foundational GitOps hygiene)
- [ ] Secrets strategy: SOPS/age for encrypted secrets in repo (single-node k3s MVP)
- [ ] Storage plan: PVCs for stateful deps (postgres data), backup strategy
- [ ] ArgoCD manages apps only; infra (k3s, ingress, cert-manager) via OpenTofu + bootstrap manifests
- [ ] Retire SSH deploy for services (keep for app until P2)

### P2: Supply Chain + Progressive Delivery

- [ ] Enable cosign keyless signing in CI
- [ ] Argo CD: Require signature verification before sync
- [ ] Optional: Argo Rollouts for canary/blue-green
- [ ] Migrate Next.js app to k3s (retire Compose entirely)

> P2 adds signing on top of P0/P1 digest pinning.

### P3: CI Portability (Dagger)

> Replace YAML+bash with pipelines-as-code. Avoids GitHub Actions vendor lock-in.

- [ ] Spike: Audit all `.github/workflows/*.yml` and `platform/ci/scripts/*.sh`; identify core logic to extract into Dagger modules
- [ ] Refactor build logic (app, migrator, services) into Dagger
- [ ] Refactor test/lint/typecheck into Dagger
- [ ] Dagger step: Auto-PR image digest to deployments repo
- [ ] Simplify GitHub Actions to thin wrappers (`dagger call build`, `dagger call test`)
- [ ] Validate: Same pipeline runs locally and in CI

**Scope:** Dagger = CI (build/test/push). ArgoCD = CD (state reconciliation). Do NOT use Dagger for push-based deploy.

### P4: CI Acceleration (NX)

> Optimize CI task selection/caching. Only after CD is stable.

- [ ] Spike: Evaluate NX vs Turborepo (NX preferred for structure enforcement + affected graph)
- [ ] Add NX targets for build/test/lint per package/service
- [ ] Implement affected-only task execution (`nx affected:build`)
- [ ] Add remote cache (NX Cloud or self-hosted)
- [ ] Keep image builds explicit initially; integrate with Dagger later

**Why deferred:** NX solves CI time/cost, not deployment correctness. GitOps must be stable first.

---

## File Pointers (P0 Scope)

| File                                      | Change                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `platform/ci/scripts/build-service.sh`    | New: build scheduler-worker Dockerfile                                         |
| `platform/ci/scripts/push.sh`             | Push scheduler-worker, capture digest via inspect                              |
| `platform/ci/scripts/deploy.sh`           | Accept SCHEDULER_WORKER_IMAGE env var, wire into compose                       |
| `.github/workflows/build-prod.yml`        | Add scheduler-worker build+push, output digest ref                             |
| `.github/workflows/deploy-production.yml` | Accept SCHEDULER_WORKER_IMAGE digest input                                     |
| `services/scheduler-worker/src/health.ts` | Add `/version` endpoint                                                        |
| `docker-compose.yml`                      | Add scheduler-worker service with `$SCHEDULER_WORKER_IMAGE`, stop_grace_period |

---

## Tagging Strategy

| Image Type | Tag Format              | Example                         |
| ---------- | ----------------------- | ------------------------------- |
| App        | `{env}-{sha}`           | `prod-abc1234`                  |
| Migrator   | `{env}-{sha}-migrate`   | `prod-abc1234-migrate`          |
| Service    | `{env}-{sha}-{service}` | `prod-abc1234-scheduler-worker` |

Future (P1+): Content fingerprinting like migrator (`{service}-{fingerprint}`).

---

## Target Architecture (P1+)

```
┌─────────────────────────────────────────────────────────────┐
│ cogni-template (app repo)                                   │
│ ─────────────────────────                                   │
│ • Build + test + push OCI images to GHCR                    │
│ • CI outputs: image tags/digests                            │
│ • NO deploy logic                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (image pushed)
┌─────────────────────────────────────────────────────────────┐
│ cogni-deployments (GitOps repo)                             │
│ ───────────────────────────────                             │
│ • Kustomize bases + overlays per env                        │
│ • Argo Applications/ApplicationSets                         │
│ • Promotion = PR changing image tag in overlay              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Argo syncs)
┌─────────────────────────────────────────────────────────────┐
│ k3s Cluster (OpenTofu-provisioned)                          │
│ ──────────────────────────────────                          │
│ • Argo CD watches deployments repo                          │
│ • Applies manifests on change                               │
│ • Rollback = revert PR                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Non-Goals

- **No per-service explicit workflow jobs**: Use reusable workflow + path filters (not toil)
- **No SSH deploy past P1**: GitOps replaces imperative deploy
- **No coupled service/app deploys**: Services deploy independently (after P0 bridge)
- **No vendor lock-in**: Kustomize portable across k8s distributions

---

## Recommended Stack

| Concern   | Tool           | Notes                                 |
| --------- | -------------- | ------------------------------------- |
| IaC       | OpenTofu       | OSS Terraform fork                    |
| Runtime   | k3s            | Lightweight k8s for single-node start |
| CI        | Dagger (P3)    | Pipelines-as-code, runner-agnostic    |
| CD        | Argo CD        | GitOps, state reconciliation          |
| Manifests | Kustomize      | Overlay model, minimal patches        |
| Signing   | cosign keyless | OIDC-based, no key management         |

---

**Last Updated**: 2026-01-22
**Status**: Draft
