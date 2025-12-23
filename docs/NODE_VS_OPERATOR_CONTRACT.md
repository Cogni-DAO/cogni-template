# Node vs Operator Contract

> [!CRITICAL]
> Node sovereignty is non-negotiable. A Node must be forkable and runnable without any Cogni Operator account or service dependency.

## Definitions

| Term         | Definition                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node**     | A fully sovereign DAO+app: closed-loop wallet control, crypto payments for deployment/inference/revenue, self-deployable infrastructure. This repo today.                  |
| **Operator** | A Meta-Node (Node++) with control plane + data plane. Same hex architecture and CI/CD rails as Node, but domain is platform governance rather than single-node operations. |

### Operator Architecture

| Layer             | Component        | Purpose                                                                       |
| ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| **Control Plane** | `apps/operator/` | Governance UX, billing/entitlements, node registry, federation, operator auth |
| **Data Plane**    | `services/*`     | Webhook ingest, PR review execution, repo admin, event processing             |

---

## Sovereignty Invariants

These hold **regardless of Operator availability**:

| Invariant               | Meaning                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Wallet Custody**      | Node's DAO wallet keys never touch Operator infrastructure                                                 |
| **Data Sovereignty**    | Node DB is source of truth; Operator may cache derived data but never requires custody of Node DB or funds |
| **Deploy Independence** | Node can deploy without Operator (manual or self-hosted CI)                                                |
| **Fork Freedom**        | Node repo forkable and runnable without Cogni Operator account                                             |
| **Upgrade Autonomy**    | Node decides when/whether to pull upstream changes                                                         |
| **Repo-Spec Authority** | Node authors `.cogni/repo-spec.yml`; Operator consumes snapshot+hash; Operator never invents policy        |

---

## Deployment Portability Invariants

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

---

## Boot Seams Matrix

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

---

## Dependency Rules

### Code Imports (Compile-Time)

| From                       | To                     | Allowed |
| -------------------------- | ---------------------- | ------- |
| Node (`src/`, `packages/`) | Operator (`services/`) | **NO**  |
| Operator (`services/`)     | Node (`src/`)          | **NO**  |
| Operator (`services/`)     | Shared (`packages/`)   | YES     |
| Node (`src/`)              | Shared (`packages/`)   | YES     |

### Runtime Calls

| From     | To                | Allowed        | Mechanism                    |
| -------- | ----------------- | -------------- | ---------------------------- |
| Node     | Operator services | YES (optional) | HTTP API with Node's API key |
| Operator | Node repo         | YES            | VCS API (GitHub/GitLab)      |
| Operator | Node DB           | **NO**         | Never direct access          |
| Operator | Node wallet       | **NO**         | Never custody                |

**Operator Node Registry:** Operator maintains a derived `node_registry_nodes` table for control-plane routing. This is rebuildable from on-chain receipts + repo-spec snapshots. `node_id` (UUID) is the canonical tenant key in Operator APIs/headers/claims. See [Node Formation Spec §9](NODE_FORMATION_SPEC.md#9-operator-node-registry-p1).

---

## Directory Structures

### Node Repo (cogni-app-template)

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

### Operator Repo (cogni-platform) — Future

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

---

## Current State

- **All existing code is Node-owned** — no Operator functionality implemented yet
- Services will be added to this repo first (monorepo phase), then extracted to Operator repo when ready
- Extraction criteria: at least one paid external customer + one real cred-informed payout

---

## Related Docs

- [Node CI/CD Contract](NODE_CI_CD_CONTRACT.md) - CI/CD invariants, portability, Jenkins path
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - VM provisioning, Docker Compose stack

---

**Last Updated**: 2025-12-23
**Status**: Design Approved
