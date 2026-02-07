# Services Migration Guide

> [!CRITICAL]
> All current code is Node-owned. Operator components will be added to this repo first (monorepo phase), then extracted when criteria are met.

→ See: [Node vs Operator Contract](NODE_VS_OPERATOR_CONTRACT.md) for boundary definitions and full directory structures

---

## Monorepo Phase Additions

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

→ Full structures: [Node vs Operator Contract](NODE_VS_OPERATOR_CONTRACT.md#directory-structures)

---

## Current Port Ownership + Seams

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

---

## Migration Phases

### Phase 1a: AI Core Package

- [ ] Create `packages/ai-core/` structure
- [ ] Move/create LangGraph graph definitions
- [ ] Establish prompt template structure
- [ ] Configure Langfuse integration

→ See: [AI Architecture & Evals](AI_EVALS.md)

### Phase 1b: Evals Foundation

- [ ] Create `evals/` directory structure
- [ ] Create initial datasets for review workflow
- [ ] Implement eval harness
- [ ] Add eval CI gate to workflow

### Phase 2a: Operator Packages

- [ ] Create `packages/contracts-public/` with manifest schema
- [ ] Create `packages/schemas-internal/` with contribution_event schema
- [ ] Create `packages/clients-internal/` (empty scaffold)
- [ ] Create `packages/core-primitives/` with logging, env, tracing
- [ ] Add dependency-cruiser rules

### Phase 2b: Operator Control Plane Scaffold

- [ ] Create `apps/operator/` (hex structure, same pattern as Node `src/`)
- [ ] Scaffold core domains: billing, registry, federation
- [ ] Add Dockerfile for operator app

### Phase 2c: Operator Data Plane Scaffold

- [ ] Create `services/git-review-daemon/` (hex structure, no logic)
- [ ] Create `services/git-admin-daemon/` (hex structure, no logic)
- [ ] Add Dockerfiles for each service
- [ ] **Verify Node boots with Operator clients in stub mode**

---

## Dependency Rules

→ See: [Node vs Operator Contract — Dependency Rules](NODE_VS_OPERATOR_CONTRACT.md#dependency-rules)

**Summary:** Node (`src/`) and Operator (`apps/operator/` + `services/`) never import each other. Both import shared `packages/`.

---

## Service Internal Structure

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

---

## Required Endpoints

Every Operator service MUST implement:

| Endpoint   | Purpose            | Required From |
| ---------- | ------------------ | ------------- |
| `/livez`   | Liveness probe     | Phase 3       |
| `/readyz`  | Readiness probe    | Phase 3       |
| `/metrics` | Prometheus metrics | Phase 5       |

---

## Validation Checklist

Before each phase completion:

- [ ] `pnpm check` passes
- [ ] Dependency-cruiser rules enforced (no boundary violations)
- [ ] All packages build independently
- [ ] **Node boots with Operator clients in stub mode** (Phase 2+)
- [ ] No circular dependencies
- [ ] Eval regression suite passes (Phase 1b+)

---

## core-primitives Charter

`packages/core-primitives` is strictly infrastructure-only:

| Allowed                | Forbidden       |
| ---------------------- | --------------- |
| Logging                | Domain concepts |
| Env parsing            | DTOs            |
| Tracing/telemetry      | Auth logic      |
| HTTP client utils      | Billing logic   |
| DB connection wrappers | Business rules  |

**Size budget:** If >20 exports or >2000 LOC, split into focused packages.

---

## Appendix: API Route Inventory

Current Node API routes (inventory only — not architectural boundary):

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

---

## Related Docs

| Doc                                                       | Purpose                                      |
| --------------------------------------------------------- | -------------------------------------------- |
| [Node vs Operator Contract](NODE_VS_OPERATOR_CONTRACT.md) | Boundaries, invariants, directory structures |
| [MVP Deliverables](MVP_DELIVERABLES.md)                   | Scope lock                                   |
| [AI Architecture & Evals](AI_EVALS.md)                    | AI structure                                 |
| [ROADMAP](../ROADMAP.md)                                  | Phase overview                               |

---

**Last Updated**: 2025-01-13
**Status**: Design Approved
