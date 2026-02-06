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

## Constraints

- Build changes must not break CI — same canonical commands used in local dev, CI, and Docker
- DSN migration is phased: runtime is already DSN-only (P0 done), provisioning transitions in P1, secrets cleaned in P2
- `check:full` changes must maintain CI-parity — it runs the exact same test suite as CI

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

## As-Built Specs

- [build-architecture.md](../../docs/spec/build-architecture.md) — build order, Docker layering, TypeScript configs
- [check-full.md](../../docs/spec/check-full.md) — CI-parity gate design
- [database-url-alignment.md](../../docs/spec/database-url-alignment.md) — DSN source of truth, per-container env contract
- [services-architecture.md](../../docs/spec/services-architecture.md) — service structure contracts, invariants, import boundaries

## Design Notes

Content aggregated from original `docs/BUILD_ARCHITECTURE.md` (Known Issues + Future Improvements), `docs/CHECK_FULL.md` (Future Enhancements), `docs/DATABASE_URL_ALIGNMENT_SPEC.md` (P1/P2 roadmap), and `docs/SERVICES_ARCHITECTURE.md` (service spawning roadmap) during docs migration. The full `CICD_SERVICES_ROADMAP.md` roadmap doc will be merged into this initiative when migrated.
