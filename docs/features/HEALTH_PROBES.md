# Liveness/Readiness Probe Separation Design

> [!CRITICAL]
> Never let readiness requirements leak into liveness probes; avoid double-boot waste by checking both probes against the same running stack container.

## Core Invariants

1. **Probe Decoupling**: Liveness (`/livez`) checks only process aliveness (<100ms, no deps, no env validation); readiness (`/readyz`) validates full runtime requirements (env, secrets, DB connectivity with explicit timeout budget).

2. **No Double Boot**: CI and deploy both use stack containers with full env; `/livez` provides fast-fail signal, `/readyz` provides correctness gate—both against the same running container.

3. **No Env Toggles**: Readiness checks remain strict in all environments; validation depth is controlled by endpoint choice, not configuration flags.

4. **Docker HEALTHCHECK = Readiness**: Container orchestrators (Docker, K8s) use `/readyz` for healthcheck since they have full runtime context (env, DB, migrations).

5. **Livez Isolation**: `/livez` implementation must not import env validation code; verified by contract test that passes with missing AUTH_SECRET.

---

## Implementation Checklist

### P0: MVP Critical Path

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

#### Chores

- [ ] Add probe type labels to observability (future: duration histograms)
- [ ] Update all documentation references from `/health` to `/livez` or `/readyz`
- [ ] Search codebase for any remaining /health hardcoded strings

### P1: Enhanced Monitoring

- [ ] Add Prometheus metrics for probe response times
  - [ ] `app_livez_duration_seconds` histogram
  - [ ] `app_readyz_duration_seconds` histogram
  - [ ] `app_readyz_dependency_status` gauge (per dependency)

- [ ] Add structured logging for readiness failures
  - [ ] Log which dependency failed (DB, auth, env)
  - [ ] Include failure reason in response body

### P2: Kubernetes Readiness Gates (Future)

- [ ] **Do NOT build this preemptively**
- [ ] Evaluate when deploying to K8s
- [ ] Add `/readyz` dependency breakdown endpoint (`/readyz?verbose=true`)
- [ ] Add startup probe configuration (K8s 1.18+)

---

## File Pointers (P0 Scope)

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

---

## Design Decisions

### 1. Probe Endpoint Semantics

| Endpoint  | Purpose                    | Validation Depth                      | Response Time | Dependencies |
| --------- | -------------------------- | ------------------------------------- | ------------- | ------------ |
| `/livez`  | Liveness (process alive)   | None - just confirms HTTP responses   | <100ms        | None         |
| `/readyz` | Readiness (ready to serve) | Full env, secrets, DB connectivity    | <2s           | All runtime  |
| `/health` | **Removed**                | Deprecated in favor of explicit names | N/A           | N/A          |

**Rule:** Use `/livez` for fast CI smoke tests and K8s liveness probes; use `/readyz` for deployment gates and K8s readiness probes.

---

### 2. CI Test Flow (Livez Gate Before Push)

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

### 3. Validation Depth by Endpoint

**`/livez` checks:**

1. **Process is alive**: HTTP server responds to requests
2. **No env validation**: Does NOT call serverEnv() or any validation code
3. **No database**: Does not require DATABASE_URL or DB connectivity
4. **No secrets**: Does not require AUTH_SECRET or LITELLM_MASTER_KEY
5. **Implementation isolation**: Must not import env/db modules (verified by test)

**`/readyz` checks (MVP scope):**

1. **All env vars valid**: Zod schema validation passes (serverEnv())
2. **Runtime secrets present**: AUTH_SECRET, LITELLM_MASTER_KEY (assertRuntimeSecrets)
3. **Database reachable**: NOT in MVP (future with explicit timeout budget)
4. **External services**: NOT in MVP (future with explicit timeout budget)

**Future readiness deps (P1):** DB connectivity check (5s timeout), LiteLLM health check (3s timeout). Any new dep requires explicit budget + test coverage.

**Never** add env toggles to weaken `/readyz` checks (e.g., `SKIP_DB_CHECK=true`). Use `/livez` instead.

---

### 4. Stack Test Probe Sequence

**check:full.sh polling (after docker:test:stack up):**

1. **Poll /livez FIRST**: 10-20s budget, fail-fast if process not booting
2. **Poll /readyz after livez**: Longer budget, verify env+secrets validation working
3. **Run test:stack:docker**: Functional tests against both endpoints
4. **Docker HEALTHCHECK (/readyz)**: Runs in background, provides extra validation signal

**Livez gate in CI:** test-image.sh validates /livez before push (prevents broken image publish). Same logic used in stack tests but against running stack container.

---

**Last Updated**: 2025-12-10
**Status**: Design Approved
