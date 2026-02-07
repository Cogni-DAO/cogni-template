---
id: spec.health-probes
type: spec
title: Liveness/Readiness Probe Separation Design
status: draft
spec_state: draft
trust: draft
summary: Separate liveness (`/livez`) from readiness (`/readyz`) probes for fast CI smoke tests without full env, while maintaining strict runtime validation for deploy gates.
read_when: Implementing health probes, CI test gates, or deployment validation
implements: []
owner: cogni-dev
created: 2025-12-10
verified: null
tags:
  - deployment
  - ci-cd
  - health-checks
---

# Liveness/Readiness Probe Separation Design

## Context

Health checks serve two distinct purposes in CI/CD pipelines:

1. **Fast-fail CI smoke tests** — detect if a Docker image boots at all (process alive)
2. **Deployment readiness gates** — validate full runtime requirements before serving traffic

Using a single `/health` endpoint that requires full env leads to:

- **Double-boot waste** in stack tests (boot once for livez, boot again for readyz)
- **Broken image publish** when /health requires env that CI doesn't have
- **Slow CI feedback** when /health checks DB connectivity during image smoke test

This spec defines `/livez` (liveness, <100ms, no deps) and `/readyz` (readiness, full env+secrets) as separate endpoints, enabling fast CI gates while preserving strict deployment validation.

## Goal

Enable separate health probe endpoints with:

- `/livez` for fast CI smoke tests (<100ms, no env/DB/secrets, just confirms HTTP responds)
- `/readyz` for deployment gates (full env validation, secrets check, DB connectivity with timeout budget)
- No double-boot in stack tests (poll `/livez` first, then `/readyz` on same running container)
- Livez implementation isolation (contract test verifies `/livez` works without AUTH_SECRET)
- Docker HEALTHCHECK uses `/readyz` (orchestrators have full runtime context)
- CI livez gate before push (prevents broken images reaching registry)

## Non-Goals

- **Not in scope (P0):** DB connectivity check in `/readyz` (future with explicit timeout budget)
- **Not in scope (P0):** Prometheus metrics for probe response times (P1)
- **Not in scope (P0):** Structured logging for readiness failures (P1)
- **Not in scope:** Kubernetes-specific features like startup probes (P2, do NOT build preemptively)
- **Not in scope:** Weakening `/readyz` checks with env toggles (use `/livez` instead)

## Core Invariants

1. **Probe Decoupling**: Liveness (`/livez`) checks only process aliveness (<100ms, no deps, no env validation); readiness (`/readyz`) validates full runtime requirements (env, secrets, DB connectivity with explicit timeout budget).

2. **No Double Boot**: CI and deploy both use stack containers with full env; `/livez` provides fast-fail signal, `/readyz` provides correctness gate—both against the same running container.

3. **No Env Toggles**: Readiness checks remain strict in all environments; validation depth is controlled by endpoint choice, not configuration flags.

4. **Docker HEALTHCHECK = Readiness**: Container orchestrators (Docker, K8s) use `/readyz` for healthcheck since they have full runtime context (env, DB, migrations).

5. **Livez Isolation**: `/livez` implementation must not import env validation code; verified by contract test that passes with missing AUTH_SECRET.

---

## Design

### Key Decisions

#### 1. Probe Endpoint Semantics

| Endpoint  | Purpose                    | Validation Depth                      | Response Time | Dependencies |
| --------- | -------------------------- | ------------------------------------- | ------------- | ------------ |
| `/livez`  | Liveness (process alive)   | None - just confirms HTTP responses   | <100ms        | None         |
| `/readyz` | Readiness (ready to serve) | Full env, secrets, DB connectivity    | <2s           | All runtime  |
| `/health` | **Removed**                | Deprecated in favor of explicit names | N/A           | N/A          |

**Rule:** Use `/livez` for fast CI smoke tests and K8s liveness probes; use `/readyz` for deployment gates and K8s readiness probes.

---

#### 2. CI Test Flow (Livez Gate Before Push)

```
┌─────────────────────────────────────────────────────────────────────┐
│ DOCKER BUILD (blocking)                                             │
│ ─────────────────────────                                           │
│ 1. Build app image (runner target)                                 │
│ 2. Build migrator image (migrator target)                           │
│ 3. Verify images exist locally                                      │
│ 4. Result: Images tagged and ready                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LIVEZ GATE (blocking, fast: 10-20s)                                │
│ ────────────────────────────                                        │
│ - test-image.sh: Boot container with minimal env                   │
│ - Poll /livez endpoint (10-20s budget)                             │
│ - Exit 1 if timeout or non-200 (prevents broken image publish)     │
│ - Exit 0 if livez responds 200                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (only if livez gate passes)
┌─────────────────────────────────────────────────────────────────────┐
│ PUSH TO REGISTRY (gated by livez)                                  │
│ ─────────────────────────                                           │
│ - Push app image to GHCR                                            │
│ - Push migrator image to GHCR                                       │
│ - Images now available for deployment                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (in check:full / stack tests)
┌─────────────────────────────────────────────────────────────────────┐
│ STACK TESTS (blocking for merge/deploy, single container boot)     │
│ ───────────────────────────────────────────────────────────         │
│ - docker:test:stack up (full env: DB, LiteLLM, migrations)        │
│ - Poll /livez FIRST (10-20s budget, fail-fast signal)              │
│ - Poll /readyz after livez passes (longer budget, correctness)     │
│ - Run test:stack:docker (validates both endpoints)                 │
│ - Docker HEALTHCHECK (/readyz) provides background validation      │
│ - All checks hit SAME running container (no double boot)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (in deploy job)
┌─────────────────────────────────────────────────────────────────────┐
│ DEPLOY VALIDATION (hard gate, fail rollout if not ready)           │
│ ──────────────────────────────────────────────────                  │
│ - wait-for-health.sh polls /readyz (NOT /livez)                    │
│ - Must return 200 + healthy status within timeout                   │
│ - Fail deployment if readiness not achieved                         │
│ - No double boot (deploy uses same container as healthcheck)        │
└─────────────────────────────────────────────────────────────────────┘
```

**Pipeline contract:** Livez gate before push prevents broken images reaching registry; stack tests poll livez then readyz on same container; deploy hard-gates on readyz.

---

#### 3. Validation Depth by Endpoint

**`/livez` checks:**

1. **Process is alive**: HTTP server responds to requests
2. **No env validation**: Does NOT call serverEnv() or any validation code
3. **No database**: Does not require DATABASE_URL or DB connectivity
4. **No secrets**: Does not require AUTH_SECRET or LITELLM_MASTER_KEY
5. **Implementation isolation**: Must not import env/db modules (verified by test)

**`/readyz` checks (current scope):**

1. **All env vars valid**: Zod schema validation passes (serverEnv())
2. **Runtime secrets present**: AUTH_SECRET, LITELLM_MASTER_KEY (assertRuntimeSecrets)
3. **EVM RPC config present**: EVM_RPC_URL set in non-test mode (assertEvmRpcConfig)
4. **EVM RPC connectivity**: getBlockNumber() succeeds (assertEvmRpcConnectivity, 3s timeout)
5. **Database reachable**: NOT yet implemented (future with explicit timeout budget)
6. **External services**: NOT yet implemented (future with explicit timeout budget)

**Timeout budgets:**

- EVM RPC connectivity: 3 seconds (single getBlockNumber() call)
- Future DB check: 5 seconds
- Future LiteLLM check: 3 seconds

**Never** add env toggles to weaken `/readyz` checks (e.g., `SKIP_DB_CHECK=true`). Use `/livez` instead.

---

#### 4. Stack Test Probe Sequence

**check:full.sh polling (after docker:test:stack up):**

1. **Poll /livez FIRST**: 10-20s budget, fail-fast if process not booting
2. **Poll /readyz after livez**: Longer budget, verify env+secrets validation working
3. **Run test:stack:docker**: Functional tests against both endpoints
4. **Docker HEALTHCHECK (/readyz)**: Runs in background, provides extra validation signal

**Livez gate in CI:** test-image.sh validates /livez before push (prevents broken image publish). Same logic used in stack tests but against running stack container.

---

## Acceptance Checks

**Automated:**

- `pnpm test tests/contract/livez-isolation.contract.test.ts` — Verify /livez works without AUTH_SECRET
- `pnpm test tests/stack/meta/meta-endpoints.stack.test.ts` — Test both `/livez` and `/readyz` endpoints
- CI workflow validation: test-image.sh polls /livez before push (staging-preview.yml, build-prod.yml)

**Manual (until automated):**

1. Verify `/livez` responds 200 with minimal env (NODE_ENV, APP_ENV, DATABASE_URL placeholder)
2. Verify `/readyz` fails with missing AUTH_SECRET (strict runtime validation)
3. Verify Docker HEALTHCHECK uses `/readyz` (check Dockerfile line 87-88)
4. Verify `check:full` polls `/livez` FIRST, then `/readyz` (scripts/check-full.sh)
5. Verify deploy scripts hard-gate on `/readyz` (deploy.sh, wait-for-health.sh)

## Open Questions

- [ ] Should DB connectivity check be added to `/readyz` in P0 or deferred to P1?
- [ ] What's the appropriate timeout budget for DB check? (5s proposed)
- [ ] Should LiteLLM connectivity check be added to `/readyz`? (3s timeout proposed)
- [ ] Should we add `/readyz?verbose=true` for K8s readiness gates in P2?

## Rollout / Migration

1. Create `/livez` endpoint (contract, route, test for AUTH_SECRET isolation)
2. Rename `/health` to `/readyz` (contract, route, maintain strict validation)
3. Update Docker HEALTHCHECK to use `/readyz`
4. Update `test-image.sh` to poll `/livez` with minimal env (pre-push gate)
5. Update CI workflows to use livez gate before push (staging-preview.yml, build-prod.yml)
6. Update `check:full` to poll `/livez` FIRST, then `/readyz` (single container boot)
7. Update deploy scripts to hard-gate on `/readyz` (deploy.sh, wait-for-health.sh)
8. Update all docker-compose files to use `/readyz` for healthcheck

**Breaking changes:**

- `/health` endpoint removed (replaced by `/livez` and `/readyz`)
- All health check references must be updated to use explicit endpoint

**Data migration:**

- None (endpoint changes only)

## Related

- [CI/CD & Services GitOps Initiative](../../work/initiatives/ini.cicd-services-gitops.md) — Health probe separation track
- [Check Full](./check-full.md) — CI-parity gate design
- [Services Architecture](./services-architecture.md) — Service health endpoint contract
