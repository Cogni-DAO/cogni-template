# Node CI/CD Contract

> [!CRITICAL]
> Node sovereignty is non-negotiable. CI must run from repo with zero operator dependencies.

## Core Invariants

1. **Fork Freedom**: CI runs without secrets; CD (build/deploy) is gated and skippable on forks
2. **Policy Stays Local**: ESLint/depcruise/prettier/tsconfig never centralized
3. **Local Gate Parity**: `pnpm check` runs same assertions as CI, different execution (sequential vs parallel)
4. **No Runtime Fetches**: Workflows never fetch config from outside repo
5. **Scripts Are the API**: Workflows orchestrate by calling named pnpm scripts; no inline command duplication

### Merge Gate (Required for PR Merge)

| Check                               | Local | CI              |
| ----------------------------------- | ----- | --------------- |
| `pnpm typecheck`                    | ✓     | static job      |
| `pnpm lint`                         | ✓     | static job      |
| `pnpm format:check`                 | ✓     | unit job        |
| `pnpm test:ci` (unit/contract/meta) | ✓     | unit job        |
| `pnpm arch:check`                   | ✓     | static job      |
| `pnpm test:int`                     | ✓     | integration job |

**Optional** (not blocking): `pnpm test:stack:docker`, e2e, coverage upload

---

## Update Flow

**Now (P0)**: No shared kit. Each node owns its workflows directly.

**P1 (In-Repo Seam)**:

- Thin caller (`ci.yaml`) → reusable impl (`_rails-node-ci.yml`)
- Updates: edit `_rails-node-ci.yml`, all callers get changes immediately

**P3 (External Kit)**:

- Nodes pin to versioned ref: `uses: cogni-dao/cogni-rails/.github/workflows/node-ci.yml@v1.2.0`
- Updates: bump ref in caller, test, merge

---

## Implementation Checklist

### P0: Document Current State (This PR)

- [x] Scan CI entrypoints and classify files
- [x] Document canonical commands (`pnpm check`, `pnpm check:full`)
- [x] Classify portable vs node-owned files
- [ ] Add to AGENTS.md pointers

### P1: In-Repo Reusable Workflow Seam

**Gate**: Only proceed if Node #2 planned within 30 days OR CI drift pain exists

- [ ] Create `.github/workflows/_rails-node-ci.yml` with `on: workflow_call`
- [ ] Move static job steps (checkout, setup-node, pnpm install, typecheck, lint)
- [ ] Move unit job steps (format, tests, coverage upload)
- [ ] Move integration job steps (test:int)
- [ ] Convert `ci.yaml` to thin caller with `uses: ./.github/workflows/_rails-node-ci.yml`
- [ ] Verify: same commands, same order, same pass/fail behavior

### P2: Jenkins Migration (Future)

**Gate**: Paid customer exists OR GitHub Actions costs become prohibitive

- [ ] Create `Jenkinsfile` declarative pipeline
- [ ] Create Jenkins shared library from `_rails-node-ci.yml` logic
- [ ] Replace GHCR with generic container registry
- [ ] Replace GitHub secrets with Vault/generic secrets manager
- [ ] Deprecate GitHub Actions workflows

### P3: External Rails Kit Repo (Future)

**Gate**: 2+ nodes exist AND workflow drift maintenance burden proven

**Sovereignty Safeguards:**

- External rails are opt-in and version-pinned (prefer commit SHA)
- Node MUST retain a vendored fallback (committed) sufficient to run CI/CD if upstream rails are unavailable
- Upgrades occur only via explicit bump/regeneration; Node controls timing

- [ ] Extract `_rails-node-ci.yml` to `cogni-rails` repo
- [ ] Extract composite actions (`loki-ci-telemetry`, `loki-push`)
- [ ] Extract `platform/ci/scripts/` portable scripts
- [ ] Nodes pin to versioned refs
- [ ] **Do NOT extract** lint/depcruise/prettier configs

---

## File Pointers

### Workflow Entrypoints (Current)

| File                                      | Type | Secrets | Trigger               | Commands                                               |
| ----------------------------------------- | ---- | ------- | --------------------- | ------------------------------------------------------ |
| `.github/workflows/ci.yaml`               | CI   | No      | PR, push staging/main | typecheck, lint, format, test:ci, test:int, arch:check |
| `.github/workflows/build-prod.yml`        | CD   | Yes     | push main             | build.sh, test-image.sh, push.sh                       |
| `.github/workflows/staging-preview.yml`   | CD   | Yes     | push staging          | pnpm check, build.sh, deploy.sh, e2e                   |
| `.github/workflows/deploy-production.yml` | CD   | Yes     | workflow_run          | deploy.sh                                              |

### Local Gates

| Command           | Script                  | Purpose                                                                 |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| `pnpm check`      | `scripts/check-fast.sh` | Fast gate: typecheck + lint + format + unit/contract/meta + docs + arch |
| `pnpm check:full` | `scripts/check-full.sh` | CI parity: Docker build + stack + all test suites                       |

**Note**: `ci.yaml` runs the same checks as `pnpm check` but parallelized across jobs (static → unit/integration). Local gate runs sequentially for simplicity.

### Rails-Eligible (Extract at P3)

Portable plumbing scripts. Currently local, but candidates for future shared kit extraction. Not node policy—just implementation.

| Path                                 | Purpose              |
| ------------------------------------ | -------------------- |
| `.github/actions/loki-ci-telemetry/` | CI telemetry capture |
| `.github/actions/loki-push/`         | Loki push            |
| `platform/ci/scripts/build.sh`       | Docker build         |
| `platform/ci/scripts/push.sh`        | GHCR push            |
| `platform/ci/scripts/test-image.sh`  | Image liveness test  |

### Node-Owned (Never Centralize)

| Path                           | Why                         |
| ------------------------------ | --------------------------- |
| `.dependency-cruiser.cjs`      | Hex architecture boundaries |
| `eslint.config.mjs`, `eslint/` | UI/chain governance rules   |
| `biome.json`, `biome/`         | Lint rules                  |
| `.prettierrc`                  | Formatting                  |
| `tsconfig*.json`               | Path aliases                |
| `scripts/check-*.sh`           | Local gate definitions      |
| `Dockerfile`                   | Image definition            |

**Ownership split**: Nodes own scripts and policy configs. Kit owns invocation conventions (when to call, how to parallelize, what to cache). This prevents kit from becoming a jail cell.

---

## Design Decisions

### 1. Why Jenkins Is an Option

| Concern        | GitHub Actions     | Jenkins      |
| -------------- | ------------------ | ------------ |
| OSS            | Proprietary runner | Fully OSS    |
| Self-host      | Limited            | Full control |
| Cost at scale  | Per-minute billing | Own infra    |
| Vendor lock-in | GitHub-specific    | Portable     |

**Key driver**: Dolt CI/CD (database merkle tree memory) requires persistent state, branch-aware pipelines, and merge conflict resolution that GitHub Actions cannot provide. Jenkins is essential for this use case. Migration is gated (P2) until Dolt integration begins.

### 2. Why In-Repo Seam First?

Extracting to external repo too early causes:

- Version pinning overhead before patterns stabilize
- False abstraction boundaries
- Reduced iteration speed

In-repo `_rails-node-ci.yml` provides seam without extraction cost.

### 3. Why Policy Stays Node-Owned?

Centralizing lint/depcruise configs causes:

- Fork friction (must accept upstream rules)
- Policy fights across nodes
- Loss of sovereignty

Rails kit provides **orchestration defaults**, not **policy mandates**.

---

**Last Updated**: 2025-12-22
**Status**: Design Approved
