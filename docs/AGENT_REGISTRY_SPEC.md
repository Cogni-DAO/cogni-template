# Agent Registry Design

> [!CRITICAL]
> Cogni works fully without chain. On-chain publication (ERC-8004) is an export, never a prerequisite. AgentDescriptor is the canonical schema; adapters map to external specs.

## Core Invariants

1. **OFFCHAIN_FIRST**: All agent identity, discovery, and resolution works without any blockchain dependency. On-chain registries are optional publication targets.

2. **NO_SECRETS_ON_CHAIN**: Descriptors contain endpoints, capabilities, and metadata only. Never credentials, API keys, or connection secrets. Runtime auth uses `connectionId` via broker (see [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md)).

3. **STABLE_CANONICAL_SCHEMA**: `AgentDescriptor` is the Cogni-owned canonical schema, versioned internally. Adapters map to/from evolving external specs (ERC-8004, A2A, MCP). Core code never imports external schema types directly.

4. **DESCRIPTOR_CONTENT_HASHABLE**: Registration documents are deterministically serializable. `sha256(canonicalize(descriptor))` produces a stable fingerprint for integrity verification, on-chain hash commitments, and cache invalidation.

5. **SINGLE_IDENTITY_PORT**: All registration/resolution/publication flows go through `AgentIdentityPort`. No adapter-specific imports in features or app layers.

6. **AGENT_ID_STABLE**: `agentId` format remains `${providerId}:${graphName}` per existing [AGENT_DISCOVERY.md](AGENT_DISCOVERY.md) invariant. The registry adds a `registrationId` (content-hash-based) as a separate, portable identifier.

---

## Implementation Checklist

### P0: Canonical Schema + Offchain Registry

- [ ] Extend `AgentDescriptor` in `src/ports/agent-catalog.port.ts` with optional registry fields (`version`, `endpoints`, `registrationHash`)
- [ ] Create `AgentRegistrationDocument` type: full descriptor + `services[]` + `active` flag (aligns with ERC-8004 registration file shape)
- [ ] Create `AgentIdentityPort` in `src/ports/agent-identity.port.ts`: `register(doc)`, `resolve(agentId)`, `publish(agentId, target)`
- [ ] Implement `OffchainAgentRegistryAdapter` in `src/adapters/server/agent-registry/offchain.adapter.ts`: DB-backed, stores signed descriptors
- [ ] Create `agent_registrations` table in `@cogni/db-schema`: `id`, `agent_id`, `registration_hash`, `descriptor_json`, `signed_by`, `created_at`, `updated_at`
- [ ] Implement content-hash function: `computeRegistrationHash(doc: AgentRegistrationDocument) → string`
- [ ] Wire adapter into bootstrap composition root
- [ ] Publish hook stub: `AgentIdentityPort.publish()` returns `{ published: false, reason: 'no_target_configured' }` when no on-chain adapter present

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: ERC-8004 Identity Adapter

- [ ] Create `Erc8004IdentityRegistryAdapter` in `src/adapters/server/agent-registry/erc8004.adapter.ts`
- [ ] Map `AgentRegistrationDocument` → ERC-8004 registration file JSON (`type`, `name`, `description`, `image`, `services[]`, `active`, `registrations[]`)
- [ ] Implement `register()`: mint NFT via `IAgentIdentityRegistry.register(agentURI, metadata[])`
- [ ] Implement `publish()`: update `agentURI` via `setAgentURI(agentId, newURI)`
- [ ] Feature flag: `AGENT_REGISTRY_ERC8004_ENABLED` (default: false)
- [ ] Host registration file JSON at stable URI (IPFS or signed HTTP)

### P2: Trust Signals + Indexer (Future)

- [ ] Evaluate after P1 adoption and ERC-8004 mainnet stability
- [ ] Create `AgentTrustSignalsPort`: `submitFeedback()`, `queryReputation()`, `requestValidation()`
- [ ] Create `Erc8004ReputationAdapter` wrapping `IReputationRegistry`
- [ ] Create `IndexerAdapter` for cross-chain agent discovery (subgraph/ETL)
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                                     | Change                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/ports/agent-catalog.port.ts`                        | Extend `AgentDescriptor` with optional `version`, `endpoints`, `registrationHash` |
| `src/ports/agent-identity.port.ts`                       | New port: `register`, `resolve`, `publish`                                        |
| `src/adapters/server/agent-registry/offchain.adapter.ts` | DB-backed registry with signed descriptors                                        |
| `packages/db-schema/src/agent-registry.ts`               | `agent_registrations` table                                                       |
| `src/bootstrap/agent-registry.factory.ts`                | Composition root wiring                                                           |
| `src/contracts/agent-registry.v1.contract.ts`            | Zod schemas for registry API                                                      |

---

## Schema

### `agent_registrations` table

**Allowed columns:**

- `id` (uuid, PK) — Registration record ID
- `agent_id` (text, unique, not null) — Stable agent identifier (`providerId:graphName`)
- `registration_hash` (text, not null) — `sha256(canonicalize(descriptor))` for integrity
- `descriptor_json` (jsonb, not null) — Full `AgentRegistrationDocument` payload
- `signed_by` (text, nullable) — Wallet address or key ID of signer
- `signature` (text, nullable) — Detached signature over `registration_hash`
- `published_chain_id` (integer, nullable) — Chain ID if published on-chain
- `published_token_id` (text, nullable) — ERC-721 token ID if minted
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

**Forbidden columns:**

- `credentials`, `api_key`, `access_token` — per NO_SECRETS_ON_CHAIN
- `private_key`, `mnemonic` — never stored

**Why:** Registration is metadata + endpoints only. Credentials flow through the connection broker at invocation time.

**RLS:** `agent_registrations` is tenant-scoped via `billing_account_id` (added as FK). Follows dual DB client pattern per [DATABASE_RLS_SPEC.md](DATABASE_RLS_SPEC.md).

---

## `AgentRegistrationDocument` Shape

```typescript
/** Cogni canonical schema — adapters map to/from external specs */
interface AgentRegistrationDocument {
  /** Schema version for forward compatibility */
  schemaVersion: "1.0";
  /** Stable agent ID (same as AgentDescriptor.agentId) */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Description of agent capabilities */
  description: string | null;
  /** Agent service endpoints */
  services: AgentServiceEndpoint[];
  /** Whether the agent is currently active and accepting requests */
  active: boolean;
  /** On-chain registrations (populated after publish) */
  registrations: AgentChainRegistration[];
}

interface AgentServiceEndpoint {
  /** Service name (e.g., "chat", "code-review") */
  name: string;
  /** Endpoint URL */
  endpoint: string;
  /** Protocol: "a2a" | "mcp" | "http" */
  protocol: string;
}

interface AgentChainRegistration {
  /** ERC-8004 token ID */
  agentId: number;
  /** Registry identifier: "eip155:{chainId}:{registryAddress}" */
  agentRegistry: string;
}
```

**Mapping to ERC-8004 registration file:**

| Cogni field       | ERC-8004 field    | Notes                                                               |
| ----------------- | ----------------- | ------------------------------------------------------------------- |
| `schemaVersion`   | `type`            | Maps to `"https://eips.ethereum.org/EIPS/eip-8004#registration-v1"` |
| `name`            | `name`            | Direct                                                              |
| `description`     | `description`     | Direct                                                              |
| —                 | `image`           | Generated or placeholder; not in Cogni canonical                    |
| `services[]`      | `services[]`      | Same shape; Cogni adds `protocol` field                             |
| `active`          | `active`          | Direct                                                              |
| `registrations[]` | `registrations[]` | Same shape                                                          |

---

## Design Decisions

### 1. Extending AgentDescriptor vs. New Type

`AgentDescriptor` (from [AGENT_DISCOVERY.md](AGENT_DISCOVERY.md)) remains the discovery type — minimal, used by UI. `AgentRegistrationDocument` is the full registration type — used for persistence and publication. Relationship:

| Type                          | Purpose                   | Where used                      |
| ----------------------------- | ------------------------- | ------------------------------- |
| **AgentDescriptor**           | Discovery + UI display    | `AgentCatalogPort.listAgents()` |
| **AgentRegistrationDocument** | Persistence + publication | `AgentIdentityPort.register()`  |

**Rule:** `AgentRegistrationDocument` can always produce an `AgentDescriptor` (projection). Never the reverse.

---

### 2. Publication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ REGISTRATION (offchain, always available)                           │
│ ─────────────────────────────────                                   │
│ 1. Agent code defines descriptor in graph manifest                  │
│ 2. Bootstrap builds AgentRegistrationDocument from catalog          │
│ 3. OffchainAdapter stores in agent_registrations table              │
│ 4. computeRegistrationHash() for integrity fingerprint              │
│ 5. Result: REGISTERED (offchain)                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if ERC-8004 adapter enabled)
┌─────────────────────────────────────────────────────────────────────┐
│ PUBLICATION (on-chain, feature-flagged)                              │
│ ───────────────────────────                                         │
│ - Map AgentRegistrationDocument → ERC-8004 JSON                     │
│ - Host registration file at stable URI                              │
│ - Call IAgentIdentityRegistry.register(agentURI) or setAgentURI()   │
│ - Store returned tokenId in agent_registrations.published_token_id  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DISCOVERY (never blocking on chain)                                 │
│ ─────────────────────────                                           │
│ - AgentCatalogPort.listAgents() reads from offchain registry        │
│ - On-chain data is supplementary (enrichment), not required         │
│ - Existing discovery pipeline unchanged                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Why offchain-first?** ERC-8004 is still draft. Chain availability must never gate agent operation. Registration hash enables integrity verification without chain dependency.

---

### 3. Content Hashing Strategy

Deterministic serialization via JSON Canonicalization Scheme (RFC 8785):

1. `canonicalize(doc)` → deterministic JSON string (sorted keys, no whitespace)
2. `sha256(canonicalized)` → hex digest
3. Hash used for: DB uniqueness, on-chain `feedbackHash` / `requestHash`, cache keys

**Never** hash non-deterministic representations (pretty-printed JSON, objects with insertion-order keys).

---

### 4. Adapter Selection

**Feature flags:**

- `AGENT_REGISTRY_OFFCHAIN_ENABLED` — always true (hardcoded)
- `AGENT_REGISTRY_ERC8004_ENABLED` — default false, opt-in per environment

**Composition root** wires adapters based on flags. `AgentIdentityPort.publish()` delegates to enabled adapters. If no on-chain adapter, publish is a no-op that returns `{ published: false }`.

---

## Relationship to Existing Specs

| Spec                                                     | Relationship                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [AGENT_DISCOVERY.md](AGENT_DISCOVERY.md)                 | `AgentDescriptor` is a projection of `AgentRegistrationDocument`. Discovery pipeline unchanged. |
| [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) | Descriptors never contain credentials. Runtime auth via `connectionId` + broker.                |
| [NODE_FORMATION_SPEC.md](NODE_FORMATION_SPEC.md)         | P3 federation enrollment may reference agent registrations for DAO-published agents.            |
| [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md)                     | Tool capabilities advertised in `services[].skills` align with tool catalog.                    |

---

**Last Updated**: 2026-02-04
**Status**: Draft
