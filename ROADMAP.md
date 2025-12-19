# Cogni Technical Roadmap

> [!CRITICAL]
> Node sovereignty is non-negotiable. All architecture decisions preserve fork freedom and DAO wallet custody.

## Mission

Cogni is a DAO-first "org factory." This repo ships the **Node** — a sovereign DAO+app that any organization can fork and run independently.

**Operator** services (git-review, git-admin) are value-add. Nodes can consume them, self-host OSS versions, or skip entirely.

→ See: [Node vs Operator Contract](docs/NODE_VS_OPERATOR_CONTRACT.md)

---

## Phase Checklist

- [ ] **Phase 0**: Node Formation MVP (manual steps remain)
- [ ] **Phase 0.5**: Freeze Node Template
- [ ] **Phase 1**: First LangGraph Graph + Evals Foundation
- [ ] **Phase 2**: Operator Services Scaffold
- [ ] **Phase 3**: git-review-daemon Live
- [ ] **Phase 4**: git-admin-daemon Live
- [ ] **Phase 5**: Operational Readiness
- [ ] **Phase 6**: Operator Repo Extraction

→ See: [MVP Deliverables](docs/MVP_DELIVERABLES.md) for scope lock

---

## Repository Structures

| Repo         | Key Directories                                                | Purpose                               |
| ------------ | -------------------------------------------------------------- | ------------------------------------- |
| **Node**     | `src/`, `packages/`, `smart-contracts/`, `platform/`, `evals/` | Sovereign DAO+app                     |
| **Operator** | `apps/operator/`, `services/*`, `packages/*`, `platform/k8s/`  | Meta-Node: control plane + data plane |

**Design Principle — Mirror Rails, Not Features:**
Operator shares CI/CD, observability, deploy invariants, and hex architecture with Node. Only domain logic differs.

**Self-Host Note:** Operator data plane services (git-review-daemon, git-admin-daemon) will be open-sourced as standalone deployables. Sovereign Nodes can run their own instances without any Cogni Operator account.

→ Full directory trees: [Node vs Operator Contract](docs/NODE_VS_OPERATOR_CONTRACT.md#directory-structures)
→ Migration details: [Services Migration Guide](docs/SERVICES_MIGRATION.md)

---

## Non-Negotiable Invariants

| Invariant               | Meaning                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Wallet Custody**      | Node's DAO wallet keys never touch Operator infrastructure                          |
| **Data Sovereignty**    | Node DB is source of truth; Operator may cache but never requires custody           |
| **Fork Freedom**        | Node repo forkable and runnable without Cogni accounts                              |
| **Repo-Spec Authority** | Node authors policy; Operator consumes snapshot+hash; Operator never invents policy |

→ Full list: [Node vs Operator Contract](docs/NODE_VS_OPERATOR_CONTRACT.md)

---

## Guardrails

- No Operator repo extraction until: one paid customer + one real cred-informed payout
- No per-service standalone UIs without paying users
- Every cross-boundary call via explicit, versioned contract
- LLM-facing changes require eval regression gates
- Same deploy path, different config: preview and prod use identical images
- `node_id` is canonical tenant key everywhere (never tenant/org/account_id synonyms)

---

## AI Architecture

| Layer         | Technology                            |
| ------------- | ------------------------------------- |
| Orchestration | LangGraph                             |
| Observability | OpenTelemetry (canonical)             |
| AI Platform   | Langfuse (prompt versioning, eval UI) |

→ See: [AI Architecture & Evals](docs/AI_EVALS.md)

---

## Phases (Summary)

### Phase 0: Node Formation MVP

Enable anyone to create their own Node (DAO + app). Manual steps remain for infra/GitHub setup.

- Create `packages/aragon-osx/` with Aragon OSx encoding + SetupPlan schemas
- Web wizard for DAO formation (wallet-signed, no private key env vars)
- Server-side tx receipt verification
- Export deployment record + repo-spec addresses

→ See: [Node Formation Spec](docs/NODE_FORMATION_SPEC.md)

### Phase 0.5: Freeze Node Template

Lock current hex architecture. Document what exists. All code is Node-owned.

### Phase 1: First LangGraph Graph + Evals Foundation

- Create first LangGraph graph in feature slice (`src/features/<feature>/ai/graphs/`)
- Create `evals/` with harness skeleton + initial fixtures
- Establish eval CI gate
- Packages NOT required; created only after proven cross-service reuse

→ See: [AI Setup Spec](docs/AI_SETUP_SPEC.md), [LangGraph AI](docs/LANGGRAPH_AI.md)

### Phase 2: Operator Services Scaffold

- Scaffold `services/git-review-daemon` (hex structure, no logic)
- Scaffold `services/git-admin-daemon` (hex structure, no logic)
- Create `packages/{contracts-public, schemas-internal, clients-internal}`
- Add dependency-cruiser rules for boundaries

### Phase 3: git-review-daemon Live

- Wire GitHub webhooks → LangGraph review workflow → PR comments
- Implement `/livez` + `/readyz` endpoints
- Publish OSS standalone version

### Phase 4: git-admin-daemon Live

- Wire DAO governance → authorized repo actions
- Implement `/livez` + `/readyz` endpoints
- Publish OSS standalone version

### Phase 5: Operational Readiness

- Add `/metrics` endpoints
- Graceful SIGTERM handling
- Migration Jobs per service
- K8s support (Helm charts) is Operator-owned and optional; Nodes use Docker Compose baseline

### Phase 6: Operator Repo Extraction

- Extract services to `cogni-platform` repo
- This repo becomes pure Node template
- Criteria: paid customer + real payout executed

---

## Appendix: K8s Readiness Contract

Every service MUST expose:

- `/livez` — liveness probe (process alive?)
- `/readyz` — readiness probe (can accept traffic?)
- `/metrics` — Prometheus metrics (Phase 5+)

Requirements:

- Graceful SIGTERM: drain in-flight, exit within timeout
- Statelessness: no local filesystem except ephemeral `/tmp`
- Migrations are one-shot Jobs, not startup tasks

---

## Appendix: Tenant Scoping

- **Canonical key**: `node_id` everywhere (headers, JWT claims, DB columns, events)
- **Internal JWTs**: 5-15 min TTL, rotating keys, clock skew tolerance 60-120s
- **Headers**: `X-Node-ID` required on internal API calls

---

## Related Docs

| Doc                                                            | Purpose                            |
| -------------------------------------------------------------- | ---------------------------------- |
| [Node vs Operator Contract](docs/NODE_VS_OPERATOR_CONTRACT.md) | Boundaries, invariants, boot seams |
| [MVP Deliverables](docs/MVP_DELIVERABLES.md)                   | Scope lock, success criteria       |
| [Node Formation Spec](docs/NODE_FORMATION_SPEC.md)             | DAO formation tooling (Phase 0)    |
| [AI Setup Spec](docs/AI_SETUP_SPEC.md)                         | AI P0/P1/P2 checklists, invariants |
| [LangGraph AI](docs/LANGGRAPH_AI.md)                           | How to create a graph in a feature |
| [AI Architecture & Evals](docs/AI_EVALS.md)                    | LangGraph, Langfuse, eval gates    |
| [Services Migration Guide](docs/SERVICES_MIGRATION.md)         | Implementation checklist           |
| [Architecture](docs/ARCHITECTURE.md)                           | Hex architecture details           |

---

**Last Updated**: 2025-12-19
**Status**: Design Approved
