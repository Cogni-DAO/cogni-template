---
work_item_id: ini.agent-registry
work_item_type: initiative
title: Agent Registry & Multi-Adapter Discovery
state: Paused
priority: 2
estimate: 4
summary: Evolve agent discovery from single in-proc catalog to multi-adapter registry with LangGraph Server, Claude SDK, and n8n/Flowise providers
outcome: Unified agent discovery across all execution backends with stable defaultAgentId and LangGraph Server field alignment
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [ai-graphs]
---

# Agent Registry & Multi-Adapter Discovery

## Goal

Evolve the agent discovery pipeline from the current single in-proc LangGraph catalog provider to a multi-adapter registry supporting LangGraph Server runtime discovery, Claude SDK, and n8n/Flowise providers. Decouple `agentId` from `graphId` to support multi-assistant-per-graph scenarios.

## Roadmap

### Crawl (P0) — MVP Discovery (Complete)

**Goal:** Basic discovery pipeline with in-proc LangGraph catalog.

| Deliverable                                                                   | Status | Est | Work Item |
| ----------------------------------------------------------------------------- | ------ | --- | --------- |
| `AgentCatalogPort` interface in `src/ports/agent-catalog.port.ts`             | Done   | 1   | —         |
| `AgentDescriptor` with `agentId`, `graphId`, `name`, `description` (nullable) | Done   | 1   | —         |
| `LangGraphInProcAgentCatalogProvider` (discovery-only, no execution deps)     | Done   | 1   | —         |
| `AggregatingAgentCatalog` implementing `AgentCatalogPort`                     | Done   | 1   | —         |
| `/api/v1/ai/agents` route using `listAgentsForApi()` from bootstrap           | Done   | 1   | —         |
| `listGraphs()` removed from `GraphExecutorPort` (execution-only)              | Done   | 1   | —         |

### Walk (P1) — Discovery/Execution Split & LangGraph Server

**Goal:** Clean separation of discovery and execution registries; LangGraph Server runtime discovery.

| Deliverable                                                                   | Status      | Est | Work Item            |
| ----------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Create `createAgentCatalogProvidersForDiscovery()` factory in bootstrap       | Not Started | 1   | (create at P1 start) |
| Add bootstrap-time assertion: discovery providers never in execution registry | Not Started | 1   | (create at P1 start) |
| Add unit test: execution registry contains no discovery-only providers        | Not Started | 1   | (create at P1 start) |
| Make `defaultAgentId` app-configurable via env override                       | Not Started | 1   | (create at P1 start) |
| Validate `defaultAgentId` exists in returned agents                           | Not Started | 1   | (create at P1 start) |
| Create `LangGraphServerCatalogProvider` calling `/assistants/search`          | Not Started | 2   | (create at P1 start) |
| Add LangGraph Server provider to discovery registry                           | Not Started | 1   | (create at P1 start) |
| Handle server-discoverable graphs (runtime, not static catalog)               | Not Started | 2   | (create at P1 start) |

**LangGraph Server Field Alignment (P1+):**

| LangGraph Server Field                | Our Field        | P0 Status              | P1+ Target                        |
| ------------------------------------- | ---------------- | ---------------------- | --------------------------------- |
| `assistant_id` (UUID)                 | —                | Not exposed            | Expose when multi-assistant lands |
| `graph_id` (string)                   | `graphId` suffix | `langgraph:{graph_id}` | Same                              |
| `name`                                | `name`           | Aligned                | Same                              |
| `description`                         | `description`    | Aligned (nullable)     | Same                              |
| `config`                              | —                | Not exposed            | Expose if UI needs config         |
| `metadata`                            | —                | Not exposed            | Extensible metadata               |
| `version`, `created_at`, `updated_at` | —                | Not exposed            | Versioning support                |

### Run (P2+) — Multi-Adapter Discovery

**Goal:** Unified discovery across all execution backends.

| Deliverable                                                      | Status      | Est | Work Item            |
| ---------------------------------------------------------------- | ----------- | --- | -------------------- |
| Claude SDK catalog adapter (if/when available)                   | Not Started | 2   | (create at P2 start) |
| n8n/Flowise discovery (if demand materializes)                   | Not Started | 2   | (create at P2 start) |
| Add `providerRef` to `AgentDescriptor` for adapter-specific data | Not Started | 1   | (create at P2 start) |
| Decouple `agentId` from `graphId` for multi-assistant-per-graph  | Not Started | 2   | (create at P2 start) |

### Identity & Registration Track

> Source: `docs/AGENT_REGISTRY_SPEC.md` — Spec: [agent-registry.md](../../docs/spec/agent-registry.md)

#### P0: Canonical Schema + Offchain Registry

**Goal:** `AgentRegistrationDocument` schema, `AgentIdentityPort`, DB-backed offchain registry with content hashing.

| Deliverable                                                                                                                                                 | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Extend `AgentDescriptor` in `src/ports/agent-catalog.port.ts` with optional registry fields (`version`, `endpoints`, `registrationHash`)                    | Not Started | 1   | —         |
| Create `AgentRegistrationDocument` type: full descriptor + `services[]` + `active` flag (aligns with ERC-8004 registration file shape)                      | Not Started | 1   | —         |
| Create `AgentIdentityPort` in `src/ports/agent-identity.port.ts`: `register(doc)`, `resolve(agentId)`, `publish(agentId, target)`                           | Not Started | 1   | —         |
| Implement `OffchainAgentRegistryAdapter` in `src/adapters/server/agent-registry/offchain.adapter.ts`: DB-backed, stores signed descriptors                  | Not Started | 2   | —         |
| Create `agent_registrations` table in `@cogni/db-schema`: `id`, `agent_id`, `registration_hash`, `descriptor_json`, `signed_by`, `created_at`, `updated_at` | Not Started | 1   | —         |
| Implement content-hash function: `computeRegistrationHash(doc: AgentRegistrationDocument) → string`                                                         | Not Started | 1   | —         |
| Wire adapter into bootstrap composition root                                                                                                                | Not Started | 1   | —         |
| Publish hook stub: `AgentIdentityPort.publish()` returns `{ published: false, reason: 'no_target_configured' }` when no on-chain adapter                    | Not Started | 1   | —         |
| Observability instrumentation                                                                                                                               | Not Started | 1   | —         |
| Documentation updates                                                                                                                                       | Not Started | 1   | —         |

#### P1: ERC-8004 Identity Adapter

**Goal:** On-chain publication via ERC-8004 identity registry, feature-flagged.

| Deliverable                                                                                                                                           | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `Erc8004IdentityRegistryAdapter` in `src/adapters/server/agent-registry/erc8004.adapter.ts`                                                    | Not Started | 2   | —         |
| Map `AgentRegistrationDocument` → ERC-8004 registration file JSON (`type`, `name`, `description`, `image`, `services[]`, `active`, `registrations[]`) | Not Started | 1   | —         |
| Implement `register()`: mint NFT via `IAgentIdentityRegistry.register(agentURI, metadata[])`                                                          | Not Started | 2   | —         |
| Implement `publish()`: update `agentURI` via `setAgentURI(agentId, newURI)`                                                                           | Not Started | 1   | —         |
| Feature flag: `AGENT_REGISTRY_ERC8004_ENABLED` (default: false)                                                                                       | Not Started | 1   | —         |
| Host registration file JSON at stable URI (IPFS or signed HTTP)                                                                                       | Not Started | 2   | —         |

#### P2: Trust Signals + Indexer (Future)

**Goal:** Reputation layer and cross-chain discovery. Do NOT build preemptively — evaluate after P1 adoption and ERC-8004 mainnet stability.

| Deliverable                                                                                    | Status      | Est | Work Item |
| ---------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `AgentTrustSignalsPort`: `submitFeedback()`, `queryReputation()`, `requestValidation()` | Not Started | 2   | —         |
| Create `Erc8004ReputationAdapter` wrapping `IReputationRegistry`                               | Not Started | 2   | —         |
| Create `IndexerAdapter` for cross-chain agent discovery (subgraph/ETL)                         | Not Started | 3   | —         |

## Constraints

- Discovery providers must NOT require execution infrastructure (no `CompletionStreamFn`, no tool runners)
- `agentId` format `${providerId}:${graphName}` must remain stable across backend changes
- `DEDUPE_BY_AGENTID`: if multiple providers return the same `agentId`, log error and prefer first in registry order
- `SORT_FOR_STABILITY`: output sorted by `name` for stable UI rendering

## Dependencies

- [ ] LangGraph Server deployment for runtime discovery (P1)
- [ ] Claude SDK availability for catalog adapter (P2)
- [ ] n8n/Flowise integration decision (P2)

## As-Built Specs

- [agent-discovery.md](../../docs/spec/agent-discovery.md) — discovery pipeline invariants, provider types, AgentDescriptor shape
- [agent-registry.md](../../docs/spec/agent-registry.md) — registration schema, identity port, content hashing, ERC-8004 mapping (draft)

## Design Notes

Discovery track content extracted from original `docs/AGENT_DISCOVERY.md` (Phase 1-3 checklists + LangGraph Server Alignment Roadmap) during docs migration. Identity & Registration track content extracted from `docs/AGENT_REGISTRY_SPEC.md` (P0-P2 implementation checklists).

**P0 simplifications (current):**

- `agentId === graphId` (one agent per graph, no assistant variants)
- No `capabilities` field (was bespoke, not LangGraph Server aligned)
- No `providerRef` (deferred to P3 multi-adapter)
