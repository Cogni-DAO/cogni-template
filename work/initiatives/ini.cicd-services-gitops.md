---
work_item_id: ini.cicd-services-gitops
work_item_type: initiative
title: CI/CD & Services GitOps
state: Active
priority: 1
estimate: 5
summary: Build pipeline improvements (graph-scoped builds, env decoupling), check:full CLI enhancements, and DSN-only provisioning migration
outcome: Faster builds, better developer tooling, and a single source of truth for database secrets (3 DSNs only)
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [deployment, infra, ci-cd]
---

# CI/CD & Services GitOps

## Goal

Improve the build pipeline, local testing tooling, and database provisioning across three tracks: (1) make Docker builds graph-scoped and remove build-time env coupling, (2) enhance `check:full` with developer-friendly CLI options, and (3) complete the DSN source-of-truth migration from component vars to 3 DSNs.

## Roadmap

### Crawl (P0) — Current State

**Goal:** Baseline established — canonical builds, check:full gate, runtime DSN isolation.

| Deliverable                                                               | Status | Est | Work Item |
| ------------------------------------------------------------------------- | ------ | --- | --------- |
| Canonical `pnpm packages:build` (tsup + tsc -b + validation)              | Done   | 1   | —         |
| Manifest-first Docker layering for cache optimization                     | Done   | 1   | —         |
| `check:full` local CI-parity gate with trap-based cleanup                 | Done   | 1   | —         |
| `validate-dsns.sh` for runtime DSN isolation                              | Done   | 1   | —         |
| Runtime containers receive only `DATABASE_URL` and `DATABASE_SERVICE_URL` | Done   | 1   | —         |

### Walk (P1) — DSN-Only Provisioning & Build Improvements

**Goal:** Provisioner uses DSNs instead of component vars; build-time env coupling removed.

| Deliverable                                                                                                                                                                                                      | Status      | Est | Work Item            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Add `DATABASE_ROOT_URL` secret (admin DSN for provisioning)                                                                                                                                                      | Not Started | 1   | (create at P1 start) |
| Implement Node provisioner (`provision.ts`) that parses all 3 DSNs with `URL()` class                                                                                                                            | Not Started | 2   | (create at P1 start) |
| Update `db-provision` container env: only `DATABASE_ROOT_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL`                                                                                                            | Not Started | 1   | (create at P1 start) |
| Delete `APP_DB_*` usage from provisioner codepath                                                                                                                                                                | Not Started | 1   | (create at P1 start) |
| Runtime-only env validation: remove build-time env coupling by checking `NEXT_PHASE` or deferring validation (currently `AUTH_SECRET` required at build because Next.js page collection triggers env validation) | Not Started | 2   | (create at P1 start) |
| `check:full --only-stack`: skip unit/int, only run stack tests                                                                                                                                                   | Not Started | 1   | (create at P1 start) |
| `check:full --verbose`: show container logs on failure                                                                                                                                                           | Not Started | 1   | (create at P1 start) |

### Run (P2+) — Secret Cleanup, Graph-Scoped Builds, Advanced CLI

**Goal:** 3 DSNs are the only database secrets; builds are graph-scoped; check:full is fully featured.

| Deliverable                                                                                                                                                                                                                 | Status      | Est | Work Item            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Delete `APP_DB_*` secrets from GitHub                                                                                                                                                                                       | Not Started | 1   | (create at P2 start) |
| Delete `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD` secrets from GitHub                                                                                                                                                   | Not Started | 1   | (create at P2 start) |
| Update docs: "Only 3 DSNs exist"                                                                                                                                                                                            | Not Started | 1   | (create at P2 start) |
| Add `DATABASE_ROOT_URL` to INFRASTRUCTURE_SETUP.md secret table                                                                                                                                                             | Not Started | 1   | (create at P2 start) |
| Graph-scoped builds: adopt `turbo prune --docker` or `pnpm deploy` for minimal build context (currently builds all packages even if app doesn't depend on them — acceptable for 2 packages, revisit if package count grows) | Not Started | 3   | (create at P2 start) |
| App as workspace package: move app to `apps/web` for proper filter targeting (`pnpm --filter web... build`)                                                                                                                 | Not Started | 2   | (create at P2 start) |
| `check:full --watch`: re-run on file changes                                                                                                                                                                                | Not Started | 2   | (create at P2 start) |
| Parallel test execution in check:full (once isolation is proven stable)                                                                                                                                                     | Not Started | 2   | (create at P2 start) |

### Future — IaC Lane

Terraform/OpenTofu can manage role creation as an alternative to CD-time provisioning. This is the preferred long-term approach for production, but CD-time provisioner remains valid if convergent (idempotent).

### Services Deployment & GitOps Track

> Source: `docs/CICD_SERVICES_ROADMAP.md`

#### P0: Bridge MVP (Current Tooling) — Partially Complete

**Goal:** Get scheduler-worker into production using existing SSH+Compose. Minimal changes. **Scope guard:** Only scheduler-worker. No generalized service loops. **Exemption:** Temporarily violates `NO_COUPLED_PIPELINES` — service build runs in app pipeline as bridge.

| Deliverable                                                               | Status      | Est | Work Item |
| ------------------------------------------------------------------------- | ----------- | --- | --------- |
| `build-service.sh` script (scheduler-worker only)                         | Done        | 1   | —         |
| Extend `build-prod.yml` to build scheduler-worker after app               | Done        | 1   | —         |
| Extend `push.sh` to push service image, capture digest                    | Done        | 1   | —         |
| Pass `SCHEDULER_WORKER_IMAGE` as full digest ref through workflow outputs | Done        | 1   | —         |
| Wire scheduler-worker into `deploy.sh` (env var substitution)             | Done        | 1   | —         |
| Add `/version` endpoint (`{ sha, service, buildTs, imageDigest }`)        | Done        | 1   | —         |
| Validate `/livez` + `/readyz` in staging-preview E2E                      | Not Started | 1   | —         |
| Add smoke test exercising real service behavior                           | Not Started | 1   | —         |
| VM disk sizing: Preview VM at 20GB insufficient for full stack            | Not Started | 1   | —         |
| Deploy cleanup: `docker image prune -f` in deploy.sh                      | Not Started | 1   | —         |
| Deploy resilience: failed deploys must not take down running site         | Not Started | 1   | —         |
| Document service tagging in CI-CD.md                                      | Not Started | 1   | —         |
| Add scheduler-worker to SERVICES_ARCHITECTURE.md status table             | Not Started | 1   | —         |

**Service Contract (all services — Done):**

| Requirement                                             | Status |
| ------------------------------------------------------- | ------ |
| Health: `/livez` (liveness), `/readyz` (readiness)      | Done   |
| Version: `/version` returns `{ sha, service, buildTs }` | Done   |
| Logging: pino JSON to stdout                            | Done   |
| Env: Zod-validated config with `HEALTH_PORT`            | Done   |
| Shutdown: SIGTERM → ready=false → drain → exit          | Done   |

#### P1: GitOps Foundation

**Goal:** Decouple deploy from app repo. Manifest-driven promotion.

| Deliverable                                                                    | Status      | Est | Work Item |
| ------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Extend digest-driven deploy to app+migrator                                    | Not Started | 1   | —         |
| Create `cogni-deployments` repo (or `deployments/` monorepo dir)               | Not Started | 2   | —         |
| Write Kustomize base for scheduler-worker (`base/scheduler-worker/`)           | Not Started | 1   | —         |
| Create overlays: `overlays/staging/`, `overlays/production/`                   | Not Started | 1   | —         |
| OpenTofu: Provision k3s cluster (single node MVP)                              | Not Started | 2   | —         |
| Install Argo CD on k3s                                                         | Not Started | 1   | —         |
| Argo app-of-apps or ApplicationSet pattern for multi-service management        | Not Started | 2   | —         |
| Promotion flow: PR to change image digest in overlay → Argo syncs              | Not Started | 1   | —         |
| Kustomize images use `@sha256:` digests                                        | Not Started | 1   | —         |
| Secrets strategy: SOPS/age for encrypted secrets in repo (single-node k3s MVP) | Not Started | 2   | —         |
| Storage plan: PVCs for stateful deps (postgres data), backup strategy          | Not Started | 2   | —         |
| ArgoCD manages apps only; infra via OpenTofu + bootstrap manifests             | Not Started | 1   | —         |
| Retire SSH deploy for services (keep for app until P2)                         | Not Started | 1   | —         |

#### P2: Supply Chain + Progressive Delivery

**Goal:** Signed images + optional canary deployment.

| Deliverable                                          | Status      | Est | Work Item |
| ---------------------------------------------------- | ----------- | --- | --------- |
| Enable cosign keyless signing in CI                  | Not Started | 2   | —         |
| Argo CD: Require signature verification before sync  | Not Started | 2   | —         |
| Optional: Argo Rollouts for canary/blue-green        | Not Started | 2   | —         |
| Migrate Next.js app to k3s (retire Compose entirely) | Not Started | 3   | —         |

#### P3: CI Portability (Dagger)

**Goal:** Pipelines-as-code. Avoids GitHub Actions vendor lock-in. **Scope:** Dagger = CI (build/test/push). ArgoCD = CD (state reconciliation). Do NOT use Dagger for push-based deploy.

| Deliverable                                                                                    | Status      | Est | Work Item |
| ---------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Spike: Audit all `.github/workflows/*.yml` and `platform/ci/scripts/*.sh` for Dagger migration | Not Started | 2   | —         |
| Refactor build logic (app, migrator, services) into Dagger                                     | Not Started | 3   | —         |
| Refactor test/lint/typecheck into Dagger                                                       | Not Started | 2   | —         |
| Dagger step: Auto-PR image digest to deployments repo                                          | Not Started | 1   | —         |
| Simplify GitHub Actions to thin wrappers (`dagger call build`, `dagger call test`)             | Not Started | 1   | —         |
| Validate: Same pipeline runs locally and in CI                                                 | Not Started | 1   | —         |

#### P4: CI Acceleration (NX)

**Goal:** Optimize CI task selection/caching. Only after CD is stable. **Why deferred:** NX solves CI time/cost, not deployment correctness. GitOps must be stable first.

| Deliverable                                                                   | Status      | Est | Work Item |
| ----------------------------------------------------------------------------- | ----------- | --- | --------- |
| Spike: Evaluate NX vs Turborepo (NX preferred for structure + affected graph) | Not Started | 2   | —         |
| Add NX targets for build/test/lint per package/service                        | Not Started | 2   | —         |
| Implement affected-only task execution (`nx affected:build`)                  | Not Started | 2   | —         |
| Add remote cache (NX Cloud or self-hosted)                                    | Not Started | 1   | —         |
| Keep image builds explicit initially; integrate with Dagger later             | Not Started | 1   | —         |

## Constraints

- Build changes must not break CI — same canonical commands used in local dev, CI, and Docker
- DSN migration is phased: runtime is already DSN-only (P0 done), provisioning transitions in P1, secrets cleaned in P2
- `check:full` changes must maintain CI-parity — it runs the exact same test suite as CI
- **SERVICE_AS_PRODUCT**: Each service owns Dockerfile + health endpoints + env schema + deploy manifest
- **IMAGE_IMMUTABILITY**: Tags are `{env}-{sha}-{service}` or content-addressed fingerprints; never `:latest`
- **MANIFEST_DRIVEN_DEPLOY**: Environment promotion = manifest change (GitOps), not rebuild
- **NO_COUPLED_PIPELINES**: Service deploys independent of Next.js app pipeline (after P0 bridge)
- **ROLLBACK_BY_REVERT**: Deployments repo revert restores previous digest (GitOps rollback)
- No per-service explicit workflow jobs — use reusable workflow + path filters
- No SSH deploy past P1 — GitOps replaces imperative deploy
- No vendor lock-in — Kustomize portable across k8s distributions

## Dependencies

- [ ] GitHub Secrets access for P2 cleanup
- [ ] Turbo or pnpm deploy evaluation for graph-scoped builds
- [ ] Container test isolation proof for parallel execution

### Service Spawning & CI Wiring

**Goal:** Reduce the 10-step manual checklist for creating a new service to a single scaffolding command, and automate CI/CD wiring for new services.

| Deliverable                                                                                                       | Status      | Est | Work Item            |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| `pnpm create:service <name>` scaffold CLI (generates workspace, tsconfig, tsup, Dockerfile, health, config, main) | Not Started | 3   | (create at P1 start) |
| Auto-add dependency-cruiser rules for new services                                                                | Not Started | 1   | (create at P1 start) |
| Auto-wire service into `docker-compose.dev.yml`                                                                   | Not Started | 1   | (create at P1 start) |
| CI matrix: auto-discover `services/*/Dockerfile` for build+push                                                   | Not Started | 2   | (create at P2 start) |
| Service health smoke test in CI (build image → start → curl /livez → teardown)                                    | Not Started | 2   | (create at P2 start) |
| GitOps deploy manifests: auto-generate K8s Deployment from service Dockerfile + env schema                        | Not Started | 3   | (create at P2 start) |

### Health Probe Separation (Livez/Readyz) Track

> Source: docs/features/HEALTH_PROBES.md
> Related spec: [health-probes.md](../../docs/spec/health-probes.md)

**Goal:** Separate liveness (`/livez`) from readiness (`/readyz`) probes to enable fast CI smoke tests without full env, while maintaining strict runtime validation for deploy gates. Avoid double-boot waste by checking both probes against the same running stack container.

#### P0: MVP Critical Path

| Deliverable                                                                               | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `/livez` endpoint (liveness probe, <100ms, no deps)                                | Not Started | 1   | —         |
| Rename `/health` to `/readyz` (readiness probe, full env+secrets validation)              | Not Started | 1   | —         |
| Update Docker HEALTHCHECK to use `/readyz`                                                | Not Started | 1   | —         |
| Update `test-image.sh` to poll `/livez` with minimal env (pre-push gate)                  | Not Started | 1   | —         |
| Update CI workflows to use livez gate before push (staging-preview.yml, build-prod.yml)   | Not Started | 1   | —         |
| Update stack test validation: poll `/livez` FIRST, then `/readyz` (single container boot) | Not Started | 1   | —         |
| Update deploy validation to hard-gate on `/readyz` (deploy.sh, wait-for-health.sh)        | Not Started | 1   | —         |
| Chores: observability labels, doc updates, search for /health hardcoded strings           | Not Started | 1   | —         |

**P0 Detailed Checklist:**

- [ ] Create `/livez` endpoint (liveness probe)
  - [ ] Contract: `src/contracts/meta.livez.read.v1.contract.ts`
  - [ ] Route: `src/app/(infra)/livez/route.ts` (ISOLATED: no env/db imports)
  - [ ] No env validation, no DB, no external deps
  - [ ] Always returns 200 if process is alive
  - [ ] Contract test: Must pass with missing AUTH_SECRET (verifies isolation)
- [ ] Rename `/health` to `/readyz` (readiness probe)
  - [ ] Contract: Rename `meta.health.read.v1.contract.ts` to `meta.readyz.read.v1.contract.ts`
  - [ ] Route: Move `src/app/(infra)/health/route.ts` to `src/app/(infra)/readyz/route.ts`
  - [ ] MVP scope: env validation + runtime secrets only (no DB check yet)
  - [ ] Future: Add DB connectivity check with explicit timeout budget
  - [ ] Any new deps MUST update budget + tests (prevent unbounded growth)
- [ ] Update Docker HEALTHCHECK to use `/readyz`
  - [ ] Modify `Dockerfile` HEALTHCHECK command
  - [ ] Keep strict runtime validation (requires full env)
- [ ] Update `test-image.sh` to fast livez gate (pre-push validation)
  - [ ] Boot container with minimal env (NODE_ENV, APP_ENV, DATABASE_URL placeholder)
  - [ ] Poll `/livez` for 10-20s (fail-fast if process not booting)
  - [ ] Do NOT rely on Docker HEALTHCHECK (requires full env for /readyz)
  - [ ] Exit 0 if livez responds 200, exit 1 if timeout
  - [ ] Used in CI BEFORE pushing images to registry (prevents broken image publish)
- [ ] Update CI workflows (livez gate before push)
  - [ ] `staging-preview.yml`: Keep test-image.sh step (line 75-79), validates /livez
  - [ ] `build-prod.yml`: Keep test-image.sh step (line 53-54), validates /livez
  - [ ] Images only push to registry if livez gate passes
- [ ] Update stack test validation (single boot, livez then readyz)
  - [ ] Modify `check:full` to poll `/livez` FIRST (10-20s budget, fail-fast)
  - [ ] Then poll `/readyz` after livez passes (longer budget, correctness gate)
  - [ ] Both checks hit the SAME already-running stack container
  - [ ] Docker HEALTHCHECK (/readyz) runs in background as extra signal
- [ ] Update deploy validation to hard-gate on `/readyz`
  - [ ] `platform/ci/scripts/deploy.sh`: Must poll `/readyz` and fail deploy if not ready
  - [ ] `platform/infra/files/scripts/wait-for-health.sh`: Switch to `/readyz`
- [ ] Chores
  - [ ] Add probe type labels to observability (future: duration histograms)
  - [ ] Update all documentation references from `/health` to `/livez` or `/readyz`
  - [ ] Search codebase for any remaining /health hardcoded strings

#### P1: Enhanced Monitoring

| Deliverable                                                                             | Status      | Est | Work Item |
| --------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Add Prometheus metrics for probe response times (histograms + dependency status gauge)  | Not Started | 2   | —         |
| Add structured logging for readiness failures (which dependency failed, failure reason) | Not Started | 1   | —         |

- [ ] Add Prometheus metrics for probe response times
  - [ ] `app_livez_duration_seconds` histogram
  - [ ] `app_readyz_duration_seconds` histogram
  - [ ] `app_readyz_dependency_status` gauge (per dependency)
- [ ] Add structured logging for readiness failures
  - [ ] Log which dependency failed (DB, auth, env)
  - [ ] Include failure reason in response body

#### P2: Kubernetes Readiness Gates (Future)

| Deliverable                                                          | Status      | Est | Work Item |
| -------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `/readyz` dependency breakdown endpoint (`/readyz?verbose=true`) | Not Started | 1   | —         |
| Add startup probe configuration (K8s 1.18+)                          | Not Started | 1   | —         |

**Note:** Do NOT build this preemptively. Evaluate when deploying to K8s.

**File Pointers (P0 Scope):**

| File                                                     | Change                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/contracts/meta.livez.read.v1.contract.ts`           | **Create**: Liveness contract (status: alive, no deps)             |
| `src/contracts/meta.readyz.read.v1.contract.ts`          | **Rename from**: `meta.health.read.v1.contract.ts` (strict checks) |
| `src/app/(infra)/livez/route.ts`                         | **Create**: Fast liveness endpoint (ISOLATED, no env imports)      |
| `src/app/(infra)/readyz/route.ts`                        | **Rename from**: `health/route.ts` (MVP: env+secrets only)         |
| `src/contracts/http/router.v1.ts`                        | **Update**: Register `/livez` and `/readyz` routes                 |
| `tests/contract/livez-isolation.contract.test.ts`        | **Create**: Verify /livez works without AUTH_SECRET                |
| `Dockerfile`                                             | **Update**: HEALTHCHECK to use `/readyz` (line 87-88)              |
| `platform/ci/scripts/test-image.sh`                      | **Update**: Poll /livez with minimal env (pre-push gate)           |
| `.github/workflows/staging-preview.yml`                  | **Keep**: test-image.sh validates /livez before push (line 75-79)  |
| `.github/workflows/build-prod.yml`                       | **Keep**: test-image.sh validates /livez before push (line 53-54)  |
| `scripts/check-full.sh`                                  | **Update**: Poll /livez then /readyz on running stack (step 4)     |
| `tests/stack/meta/meta-endpoints.stack.test.ts`          | **Update**: Test both `/livez` and `/readyz` endpoints             |
| `platform/infra/files/scripts/wait-for-health.sh`        | **Update**: Use `/readyz` for deployment validation                |
| `platform/ci/scripts/deploy.sh`                          | **Update**: Hard-gate on `/readyz` (fail deploy if not ready)      |
| `platform/infra/services/runtime/docker-compose.yml`     | **Update**: Service healthcheck to use `/readyz`                   |
| `platform/infra/services/runtime/docker-compose.dev.yml` | **Update**: Service healthcheck to use `/readyz`                   |

## As-Built Specs

- [build-architecture.md](../../docs/spec/build-architecture.md) — build order, Docker layering, TypeScript configs
- [check-full.md](../../docs/spec/check-full.md) — CI-parity gate design
- [database-url-alignment.md](../../docs/spec/database-url-alignment.md) — DSN source of truth, per-container env contract
- [health-probes.md](../../docs/spec/health-probes.md) — liveness/readiness probe separation, CI test flow, validation depth
- [services-architecture.md](../../docs/spec/services-architecture.md) — service structure contracts, invariants, import boundaries

## Design Notes

Content aggregated from original `docs/BUILD_ARCHITECTURE.md` (Known Issues + Future Improvements), `docs/CHECK_FULL.md` (Future Enhancements), `docs/DATABASE_URL_ALIGNMENT_SPEC.md` (P1/P2 roadmap), `docs/SERVICES_ARCHITECTURE.md` (service spawning roadmap), `docs/CICD_SERVICES_ROADMAP.md` (P0–P4 services deployment & GitOps track), `docs/SERVICES_MIGRATION.md` (Node → Operator migration track), and `docs/features/HEALTH_PROBES.md` (liveness/readiness probe separation track) during docs migration.

### Tagging Strategy (from CICD_SERVICES_ROADMAP.md)

| Image Type | Tag Format              | Example                         |
| ---------- | ----------------------- | ------------------------------- |
| App        | `{env}-{sha}`           | `prod-abc1234`                  |
| Migrator   | `{env}-{sha}-migrate`   | `prod-abc1234-migrate`          |
| Service    | `{env}-{sha}-{service}` | `prod-abc1234-scheduler-worker` |

Future (P1+): Content fingerprinting like migrator (`{service}-{fingerprint}`).

### Target Architecture (P1+, from CICD_SERVICES_ROADMAP.md)

```
cogni-template (app repo)
  • Build + test + push OCI images to GHCR
  • CI outputs: image tags/digests
  • NO deploy logic
       │
       ▼ (image pushed)
cogni-deployments (GitOps repo)
  • Kustomize bases + overlays per env
  • Argo Applications/ApplicationSets
  • Promotion = PR changing image tag in overlay
       │
       ▼ (Argo syncs)
k3s Cluster (OpenTofu-provisioned)
  • Argo CD watches deployments repo
  • Applies manifests on change
  • Rollback = revert PR
```

### Recommended Stack (from CICD_SERVICES_ROADMAP.md)

| Concern   | Tool           | Notes                                 |
| --------- | -------------- | ------------------------------------- |
| IaC       | OpenTofu       | OSS Terraform fork                    |
| Runtime   | k3s            | Lightweight k8s for single-node start |
| CI        | Dagger (P3)    | Pipelines-as-code, runner-agnostic    |
| CD        | Argo CD        | GitOps, state reconciliation          |
| Manifests | Kustomize      | Overlay model, minimal patches        |
| Signing   | cosign keyless | OIDC-based, no key management         |

### File Pointers (P0 Scope, from CICD_SERVICES_ROADMAP.md)

| File                                      | Change                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `platform/ci/scripts/build-service.sh`    | Build scheduler-worker Dockerfile                                          |
| `platform/ci/scripts/push.sh`             | Push service image, capture digest via inspect                             |
| `platform/ci/scripts/deploy.sh`           | Accept SCHEDULER_WORKER_IMAGE env var, wire into compose                   |
| `.github/workflows/build-prod.yml`        | Add scheduler-worker build+push, output digest ref                         |
| `.github/workflows/deploy-production.yml` | Accept SCHEDULER_WORKER_IMAGE digest input                                 |
| `services/scheduler-worker/src/health.ts` | `/version` endpoint                                                        |
| `docker-compose.yml`                      | scheduler-worker service with `$SCHEDULER_WORKER_IMAGE`, stop_grace_period |

### Node → Operator Migration Track

> Source: docs/SERVICES_MIGRATION.md
> Related spec: [node-operator-contract.md](../../docs/spec/node-operator-contract.md)

All current code is Node-owned. Operator components will be added to this repo first (monorepo phase), then extracted when criteria are met.

#### Monorepo Phase Additions

During monorepo phase, these are ADDED to the Node repo:

| Addition                      | Purpose                                            | Owner    |
| ----------------------------- | -------------------------------------------------- | -------- |
| `apps/operator/`              | Operator control plane (Next.js, same hex as Node) | Operator |
| `services/git-review-daemon/` | PR review execution                                | Operator |
| `services/git-admin-daemon/`  | Repo admin execution                               | Operator |
| `packages/contracts-public/`  | Versioned API contracts (npm published)            | Operator |
| `packages/schemas-internal/`  | Internal event schemas                             | Operator |
| `packages/clients-internal/`  | Service-to-service clients                         | Operator |
| `packages/core-primitives/`   | Logging, env, tracing                              | Operator |

Existing Node code (`src/`, `packages/ai-core/`, `smart-contracts/`) remains unchanged.

#### Phase 1a: AI Core Package

- [ ] Create `packages/ai-core/` structure
- [ ] Move/create LangGraph graph definitions
- [ ] Establish prompt template structure
- [ ] Configure Langfuse integration

#### Phase 1b: Evals Foundation

- [ ] Create `evals/` directory structure
- [ ] Create initial datasets for review workflow
- [ ] Implement eval harness
- [ ] Add eval CI gate to workflow

#### Phase 2a: Operator Packages

- [ ] Create `packages/contracts-public/` with manifest schema
- [ ] Create `packages/schemas-internal/` with contribution_event schema
- [ ] Create `packages/clients-internal/` (empty scaffold)
- [ ] Create `packages/core-primitives/` with logging, env, tracing
- [ ] Add dependency-cruiser rules

#### Phase 2b: Operator Control Plane Scaffold

- [ ] Create `apps/operator/` (hex structure, same pattern as Node `src/`)
- [ ] Scaffold core domains: billing, registry, federation
- [ ] Add Dockerfile for operator app

#### Phase 2c: Operator Data Plane Scaffold

- [ ] Create `services/git-review-daemon/` (hex structure, no logic)
- [ ] Create `services/git-admin-daemon/` (hex structure, no logic)
- [ ] Add Dockerfiles for each service
- [ ] **Verify Node boots with Operator clients in stub mode**

#### Migration Validation Checklist

Before each phase completion:

- [ ] `pnpm check` passes
- [ ] Dependency-cruiser rules enforced (no boundary violations)
- [ ] All packages build independently
- [ ] **Node boots with Operator clients in stub mode** (Phase 2+)
- [ ] No circular dependencies
- [ ] Eval regression suite passes (Phase 1b+)

#### Current Port Ownership

Ports define architectural boundaries. This table tracks ownership and future seams:

| Port                       | Purpose                       | Owner | Current Adapter | Future Seam                    |
| -------------------------- | ----------------------------- | ----- | --------------- | ------------------------------ |
| `accounts.port.ts`         | User account management       | Node  | `server/`       | Node-only                      |
| `clock.port.ts`            | Time abstraction              | Node  | `server/`       | Node-only                      |
| `llm.port.ts`              | LLM inference                 | Node  | `server/`       | Node-only (Node pays provider) |
| `metrics-query.port.ts`    | Metrics/analytics queries     | Node  | `server/`       | Node-only                      |
| `onchain-verifier.port.ts` | On-chain payment verification | Node  | `server/`       | Node-only                      |
| `payment-attempt.port.ts`  | Payment processing            | Node  | `server/`       | Node-only                      |
| `treasury-read.port.ts`    | Treasury balance reads        | Node  | `server/`       | Node-only                      |
| `usage.port.ts`            | Usage tracking                | Node  | `server/`       | Node-only                      |

**Invariant:** Ports are local to a bounded context. Never import Node ports into Operator or services. Cross-boundary communication uses `packages/contracts-public` + HTTP clients.

#### Service Internal Structure

Each Operator service follows hex architecture:

```
services/{name}/src/
  core/             # Pure domain logic, no I/O
  ports/            # Interface definitions (local to service)
  adapters/
    server/         # Production adapters
    stub/           # Stub adapters for testing / standalone Node
  bootstrap/        # DI container
  entrypoint.ts     # HTTP server
```

**Stub Adapters:** Every Operator client in Node must have a stub adapter. Node can boot and function (with degraded features) when Operator is unavailable.

#### Required Service Endpoints

Every Operator service MUST implement:

| Endpoint   | Purpose            | Required From |
| ---------- | ------------------ | ------------- |
| `/livez`   | Liveness probe     | Phase 3       |
| `/readyz`  | Readiness probe    | Phase 3       |
| `/metrics` | Prometheus metrics | Phase 5       |

#### core-primitives Charter

`packages/core-primitives` is strictly infrastructure-only:

| Allowed                | Forbidden       |
| ---------------------- | --------------- |
| Logging                | Domain concepts |
| Env parsing            | DTOs            |
| Tracing/telemetry      | Auth logic      |
| HTTP client utils      | Billing logic   |
| DB connection wrappers | Business rules  |

**Size budget:** If >20 exports or >2000 LOC, split into focused packages.

#### API Route Inventory (Current Node)

| Route                              | Purpose                  |
| ---------------------------------- | ------------------------ |
| `/api/auth/[...nextauth]`          | Authentication           |
| `/api/v1/ai/chat`                  | AI chat completion       |
| `/api/v1/ai/completion`            | AI completion            |
| `/api/v1/ai/models`                | Available AI models      |
| `/api/v1/activity`                 | User activity feed       |
| `/api/v1/payments/intents`         | Payment intent creation  |
| `/api/v1/payments/attempts/*`      | Payment attempt handling |
| `/api/v1/payments/credits/*`       | Credit management        |
| `/api/v1/public/analytics/summary` | Public analytics         |
| `/api/v1/public/treasury/snapshot` | Treasury status          |
| `/api/metrics`                     | Prometheus metrics       |

All routes are Node-owned. Routes are framework artifacts; architectural boundaries are defined by Ports.

#### Dependency Rules

Node (`src/`) and Operator (`apps/operator/` + `services/`) never import each other. Both import shared `packages/`. See [Node vs Operator Contract](../../docs/spec/node-operator-contract.md) for full rules.
