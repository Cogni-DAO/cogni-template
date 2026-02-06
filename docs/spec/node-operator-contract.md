---
id: node-operator-contract-spec
type: spec
title: Node vs Operator Contract
status: active
spec_state: draft
trust: draft
summary: Sovereignty invariants, dependency rules, and deployment portability contracts between Node (sovereign DAO+app) and Operator (meta-node control+data plane).
read_when: Working on Node/Operator boundaries, import rules, deployment portability, or repo structure.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [meta, deployment]
---

# Node vs Operator Contract

## Context

Cogni architecture separates concerns into two autonomous entities: **Node** (a fully sovereign DAO+app) and **Operator** (a meta-node platform). Node sovereignty is non-negotiable — a Node must be forkable and runnable without any Cogni Operator account or service dependency. This spec defines the contracts that enforce that boundary.

## Goal

Establish enforceable invariants ensuring Node sovereignty, deployment portability, and clean import boundaries between Node and Operator codebases — so that Nodes can always operate independently while optionally consuming Operator services.

## Non-Goals

- Operator implementation details (control plane UX, billing, federation)
- Smart contract specifications (covered by chain-config spec)
- CI/CD pipeline specifics (covered by node-ci-cd-contract spec)

## Core Invariants

1. **WALLET_CUSTODY**: Node's DAO wallet keys never touch Operator infrastructure. Operator never gains treasury or key control.

2. **DATA_SOVEREIGNTY**: Node DB is source of truth. Operator may cache derived data but never requires custody of Node DB or funds.

3. **DEPLOY_INDEPENDENCE**: Node can deploy without Operator (manual or self-hosted CI). `docker compose up` must work as single-host baseline.

4. **FORK_FREEDOM**: Node repo is forkable and runnable without any Cogni Operator account.

5. **UPGRADE_AUTONOMY**: Node decides when/whether to pull upstream changes.

6. **REPO_SPEC_AUTHORITY**: Node authors `.cogni/repo-spec.yml`; Operator consumes snapshot+hash; Operator never invents policy.

7. **NO_CROSS_IMPORTS**: Node code (`src/`, `packages/`) must never import from Operator code (`services/`), and vice versa. Both may import from shared `packages/`.

8. **STATELESS_CONTAINERS**: No durable local filesystem dependencies except ephemeral `/tmp`. Same images across all environments; config via env vars.

9. **HEALTH_ENDPOINTS_REQUIRED**: All deployable services require `/livez` (liveness) and `/readyz` (readiness) endpoints.

10. **GRACEFUL_SHUTDOWN**: SIGTERM triggers drain of in-flight requests within timeout.

## Design

### Definitions

| Term         | Definition                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node**     | A fully sovereign DAO+app: closed-loop wallet control, crypto payments for deployment/inference/revenue, self-deployable infrastructure. This repo today.                  |
| **Operator** | A Meta-Node (Node++) with control plane + data plane. Same hex architecture and CI/CD rails as Node, but domain is platform governance rather than single-node operations. |

### Operator Architecture

| Layer             | Component        | Purpose                                                                       |
| ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| **Control Plane** | `apps/operator/` | Governance UX, billing/entitlements, node registry, federation, operator auth |
| **Data Plane**    | `services/*`     | Webhook ingest, PR review execution, repo admin, event processing             |

### Boot Seams Matrix

| Capability          | Node Owns                      | Operator Provides      | Call Direction       | Self-Host Option |
| ------------------- | ------------------------------ | ---------------------- | -------------------- | ---------------- |
| App deployment      | Infra keys, deploy scripts     | —                      | —                    | Always self-host |
| DAO wallet ops      | Wallet keys, signing           | —                      | —                    | Always self-host |
| Incoming payments   | PaymentReceiver contract       | —                      | —                    | Always self-host |
| AI inference (Node) | Provider keys, billing         | —                      | Node → Provider      | Always self-host |
| PR code review      | Manual review                  | git-review-daemon      | Operator → Node repo | OSS standalone   |
| Repo admin actions  | Manual via GitHub UI           | git-admin-daemon       | Operator → Node repo | OSS standalone   |
| Repo-spec policy    | Authors `.cogni/repo-spec.yml` | Consumes snapshot+hash | Operator reads Node  | —                |
| Cred scoring        | —                              | cognicred              | Operator internal    | vNext            |

**AI Inference Billing:**

- Node-run inference: Node owns provider keys and pays directly
- Operator-run services (git-review, etc.): Operator pays for inference as cost of service delivery

### Dependency Rules — Code Imports (Compile-Time)

| From                       | To                     | Allowed |
| -------------------------- | ---------------------- | ------- |
| Node (`src/`, `packages/`) | Operator (`services/`) | **NO**  |
| Operator (`services/`)     | Node (`src/`)          | **NO**  |
| Operator (`services/`)     | Shared (`packages/`)   | YES     |
| Node (`src/`)              | Shared (`packages/`)   | YES     |

### Dependency Rules — Runtime Calls

| From     | To                | Allowed        | Mechanism                    |
| -------- | ----------------- | -------------- | ---------------------------- |
| Node     | Operator services | YES (optional) | HTTP API with Node's API key |
| Operator | Node repo         | YES            | VCS API (GitHub/GitLab)      |
| Operator | Node DB           | **NO**         | Never direct access          |
| Operator | Node wallet       | **NO**         | Never custody                |

**Operator Node Registry:** Operator maintains a derived `node_registry_nodes` table for control-plane routing. This is rebuildable from on-chain receipts + repo-spec snapshots. `node_id` (UUID) is the canonical tenant key in Operator APIs/headers/claims. See [Node Formation Spec §9](../NODE_FORMATION_SPEC.md#9-operator-node-registry-p1).

### Deployment Portability

Node is **container-native / K8s-ready** but not Kubernetes-dependent:

| Invariant                   | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| **Docker Compose Runnable** | Single-host baseline; `docker compose up` must work         |
| **Stateless Containers**    | No durable local FS deps except ephemeral `/tmp`            |
| **Env-Var Configuration**   | Same images across all environments; config via env vars    |
| **Health Endpoints**        | Required `/livez` (liveness) and `/readyz` (readiness)      |
| **Graceful Shutdown**       | SIGTERM triggers drain of in-flight requests within timeout |

**Operator Hosting (vNext):**

- Operator may offer multi-tenant Node hosting on Kubernetes
- Helm charts and K8s manifests are Operator-owned deployment artifacts
- Hosting must not violate custody: Operator never gains treasury or key control

### Directory Structures

**Node Repo (cogni-app-template):**

```
src/                      # Next.js app (App Router)
  app/                    # Routes, pages, API routes
  core/                   # Domain logic
  ports/                  # Port interfaces
  adapters/               # Infrastructure implementations
  features/               # Vertical slices
  contracts/              # Zod API contracts
packages/
  ai-core/                # Executor-agnostic AI primitives (AiEvent, UsageFact, tool schemas)
  langgraph-server/       # LangGraph Server service code (Node.js/LangGraph.js)
  langgraph-graphs/       # Feature-sliced graph definitions + prompts
    graphs/<feature>/     # Graph definitions (Next.js must NOT import)
    prompts/<feature>/    # Prompt templates
smart-contracts/          # Per-node DAO contracts
  src/                    # Token.sol, Governor.sol, PaymentReceiver.sol
  deploy/                 # Deploy scripts + config
  addresses/              # Deployed addresses (env-scoped)
platform/                 # Deployment + CD infrastructure
  infra/services/runtime/ # Docker Compose (postgres, litellm, langgraph-server)
  opentofu/               # IaC for cloud deployment
evals/                    # AI evaluation datasets + regression harness
tests/                    # Test suites
e2e/                      # End-to-end tests
scripts/                  # Build + automation scripts
.husky/                   # Git hooks
.cogni/
  repo-spec.yml           # Node's declarative policy
```

**Operator Repo (cogni-platform) — Future:**

```
apps/
  operator/                 # Control plane - Next.js app (same hex as Node)
    src/
      app/                  # Routes, pages, API routes
      core/                 # Domain logic (billing, registry, federation)
      ports/                # Port interfaces
      adapters/             # Infrastructure
      features/             # Vertical slices
      contracts/            # Zod API contracts
services/                   # Data plane - independently deployable
  git-review-daemon/        # PR review (OSS standalone available)
  git-admin-daemon/         # Repo admin (OSS standalone available)
  cognicred/                # Cred scoring engine
  node-launcher/            # One-click Node deployment (vNext)
packages/
  contracts-public/         # Versioned API contracts (npm published)
  schemas-internal/         # Internal event schemas
  clients-internal/         # Service-to-service clients
  core-primitives/          # Logging, env, tracing
smart-contracts/            # Operator-level contracts (vNext)
  src/                      # Registry.sol, Factory.sol
platform/
  docker/                   # App + services containers
  k8s/                      # Helm charts (Operator-owned)
  opentofu/                 # Operator infrastructure
evals/                      # Control plane + service evals
tests/
e2e/
scripts/
.husky/
```

**Design Principle — Mirror Rails, Not Features:**
Operator shares CI/CD, observability, deploy invariants, and hex architecture with Node. Only domain logic differs.

**Self-Host Note:** Operator data plane services (git-review-daemon, git-admin-daemon) will be open-sourced as standalone deployables. Sovereign Nodes can run their own instances without any Cogni Operator account.

### Current State

- **All existing code is Node-owned** — no Operator functionality implemented yet
- Services will be added to this repo first (monorepo phase), then extracted to Operator repo when ready
- Extraction criteria: at least one paid external customer + one real cred-informed payout

### File Pointers

| File                                                 | Purpose                            |
| ---------------------------------------------------- | ---------------------------------- |
| `.cogni/repo-spec.yml`                               | Node's declarative policy          |
| `src/`                                               | Next.js app (Node-owned)           |
| `packages/`                                          | Shared pure libraries              |
| `platform/infra/services/runtime/docker-compose.yml` | Docker Compose deployment baseline |

## Acceptance Checks

**Manual:**

1. Verify `packages/` code has no imports from `src/` or `services/`
2. Verify `services/` code has no imports from `src/`
3. Verify `docker compose up` works without any Operator dependencies
4. Verify `.cogni/repo-spec.yml` exists and is Node-authored

**Automated:**

- `pnpm check` — dependency-cruiser enforces import boundary rules

## Open Questions

_(none)_

## Related

- [Node CI/CD Contract](../NODE_CI_CD_CONTRACT.md) — CI/CD invariants, portability, Jenkins path
- [Deployment Architecture](../../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) — VM provisioning, Docker Compose stack
- [Packages Architecture](./packages-architecture.md) — Pure library boundaries
- [Services Architecture](./services-architecture.md) — Deployable service contracts
