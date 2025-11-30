# Cogni Technical Roadmap

> DAO-first org factory: anyone can spawn a new DAO controlling a web2 application.
> This repo ships one Cogni node app + headless AI/ops services + cred engine, optimized for forkability.

## Phase Checklist

- [ ] **Phase 0**: Freeze Current Template
- [ ] **Phase 1**: Services Layer + Smart Contracts
- [ ] **Phase 2**: Git-Review Daemon Live
- [ ] **Phase 3**: Cognicred MVP Live
- [ ] **Phase 4**: Operational Readiness
- [ ] **Phase 5**: Extract App Template Core
- [ ] **Phase 6**: cogni-app-template Repo
- [ ] **Phase 7**: cogni-platform Repo
- [ ] **Phase 8**: Automated Template Updates

---

## 1. Mission

Cogni is a DAO-first "org factory." Federation and a separate "platform" repo only happen after:

- (a) at least one paid external AI service
- (b) at least one real payout executed using cred outputs

## 2. Monorepo Layout

```
src/                      → Cogni node app (Next.js) - stays here until Phase 5+
  contracts/              → (LEGACY) Zod API contracts - migrate to packages/contracts-public
services/
  git-review-daemon/      → VCS integrations, code analysis, emits contribution_events
  git-admin-daemon/       → High-privilege repo admin (separate credentials)
  broadcast-cogni/        → Content generation, own pricing/rate limits
  cognicred/              → Consumes events only, no VCS access
packages/
  contracts-public/       → Versioned public API contracts (HTTP DTOs, webhooks, manifest schema)
  schemas-internal/       → Internal event schemas (pure types only)
  clients-internal/       → Typed HTTP clients for service-to-service calls
  core-primitives/        → Logging, env parsing, tracing, DB wrappers (see charter below)
smart-contracts/          → Solidity DAO contracts + deploy scripts
```

**Dependency rules** (enforced via dependency-cruiser):

- `services/**` → imports only `packages/**`; never `src/**` or other `services/**`
- `src/**` → imports `packages/**`; calls services via HTTP clients only
- `packages/**` → no imports from `src/**` or `services/**`
- `packages/core-primitives` → depends on nothing else

**Two conceptual distributions** in this repo today:

- **Operator stack**: `src/` + `services/*` + `smart-contracts/` (what Cogni-DAO runs for itself)
- **Node template**: `src/` + `smart-contracts/` (what a spawned Cogni node would run; services are consumed remotely, not self-hosted by default)

**Monorepo tooling**: Turborepo for task graph + caching across `src/`, `services/`, `packages/`, `smart-contracts/`. Dependency-cruiser for import boundary enforcement. CI must pass without Turborepo cache (`turbo --no-cache` or plain `pnpm`); Turborepo is an optimization, not a correctness requirement.

### core-primitives Charter

`packages/core-primitives` is strictly infrastructure-only:

- **Allowed**: logging, env parsing, tracing/telemetry, HTTP client utils, basic DB connection wrappers
- **Forbidden**: domain concepts, DTOs, auth logic, billing logic, tenant logic, business rules
- **Size budget**: If >20 exports or >2000 LOC, split into focused packages
- **Review gate**: Any PR adding exports requires explicit justification

## 3. .cogni Manifest

Single file `.cogni/repo-spec.yml`: declarative desired state for ONE node.

Contains: repos, VCS providers, enabled services (`git_review: true`), plan tier (`plan_tier: "pro"`).

Never contains: secrets, mutable runtime data, identity/billing info.

Services validate on ingest, store normalized snapshot with version + hash.

## 4. Events & Cognicred

### DB Topology (v0)

Single Postgres instance with per-service schemas + role-based isolation:

- Each service owns a schema (`git_review`, `cognicred`, `billing`, etc.)
- Each service connects with a role that has USAGE/SELECT/INSERT/UPDATE/DELETE only on its schema
- Each service has its own outbox table (e.g., `git_review.outbox_events`)
- No service writes to another service's tables

### Outbox Table Schema

Each service's outbox table (`{schema}.outbox_events`):

| Column            | Type        | Description                                      |
| ----------------- | ----------- | ------------------------------------------------ |
| `event_id`        | UUID        | Deterministic idempotency key                    |
| `node_id`         | VARCHAR     | Tenant identifier (canonical tenant key)         |
| `payload`         | JSONB       | Full contribution_event envelope                 |
| `status`          | ENUM        | `pending` / `in_flight` / `done` / `dead`        |
| `attempts`        | INT         | Number of delivery attempts                      |
| `next_attempt_at` | TIMESTAMPTZ | When to retry (exponential backoff)              |
| `locked_until`    | TIMESTAMPTZ | Lease expiry for current worker                  |
| `worker_id`       | VARCHAR     | ID of worker currently processing (if in_flight) |
| `created_at`      | TIMESTAMPTZ | Event creation time                              |

### Event Backbone

**Backbone**: Per-service outbox tables + polling consumers (no Kafka/NATS for v0).

**Delivery**: At-least-once. Consumers MUST be idempotent. Dedupe by `event_id`.

**contribution_event envelope** (stored in `payload` column):

| Field                | Description                              |
| -------------------- | ---------------------------------------- |
| `event_id`           | Deterministic idempotency key            |
| `node_id`            | Tenant identifier (canonical tenant key) |
| `source`             | Emitting service                         |
| `actor`              | Who performed action                     |
| `repo`               | Repository context                       |
| `action`             | Event type                               |
| `timestamp`          | When it occurred                         |
| `value`              | Numeric weight (optional)                |
| `raw_payload`        | Original event data                      |
| `normalized_payload` | Standardized fields                      |
| `schema_version`     | Schema version for evolution             |

### Cognicred v0 Interface

1. `score_per_participant` - weighted sums + time-decay + caps
2. Breakdown/explanation per score
3. Payout suggestion set (who, how much, why)
4. Content hash for audit/replay (unsigned in v0; cryptographic signing deferred)

Replay from `raw_payload` mandatory for scoring verification.

## 5. Identity, Billing, Payouts

All in DB (never in manifest):

- `identities` (GitHub, wallet, email, internal user ID)
- `identity_links` (human-approved mappings)
- `billing_accounts`, `credit_ledger`, `payout_ledger`

**Payments**: Manifest references symbolic plan tiers; real prices in DB. Crypto payments via USDC on-chain + Ponder verification.

**Payouts**: Cred outputs are suggestions. Execution writes to `payout_ledger`. v1 may be manual (off-chain) but recorded. Later moves on-chain.

## 6. Non-Negotiable Guardrails

- No platform repo until: one paid customer + one real cred-informed payout
- No per-service standalone UIs without paying users
- No complex cred algorithms until v0 proves value
- Every cross-boundary call via explicit, versioned contract
- `packages/core-primitives` stays thin (see charter above)
- Federation is narrative-only until 5-10 DAOs are live and earning
- **Same deploy path, different config**: preview and prod use identical Docker images/scripts; only env vars differ
- **Canonical tenant key**: `node_id` everywhere (DB columns, event envelopes, headers, JWT claims); do not use tenant/org/account_id synonyms

## 7. Versioning Policy

**packages/contracts-public**:

- Semver: MAJOR for breaking changes, MINOR for additions, PATCH for fixes
- Breaking changes require: deprecation notice in prior minor, migration guide, 2-week window
- Compatibility matrix maintained in `packages/contracts-public/COMPATIBILITY.md`

**services**:

- Each service declares supported `contracts-public` version range
- CI validates compatibility before merge

---

## Detailed Phases

### Phase 0: Freeze Current Template

Lock current hex architecture and CI rules. Document what exists. Add dependency-cruiser rules for future `services/` boundaries.

→ See: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### Phase 1: Services Layer + Smart Contracts

- Scaffold `services/git-review-daemon` + `services/cognicred`
- Create `packages/{contracts-public, schemas-internal, clients-internal}`
- Add `smart-contracts/` with DAO deploy scripts (Token, Governor/Safe, PaymentReceiver)
- Enforce dependency rules via dependency-cruiser
- Configure Turborepo for task caching
- **Address books are environment-scoped** (see Appendix C)

→ See: [docs/SERVICES_MIGRATION.md](docs/SERVICES_MIGRATION.md)

### Phase 2: Git-Review Daemon Live

- Wire GitHub App webhooks → git-review-daemon → LLM → PR comments
- Add BillingPort client for usage tracking
- Expose `/api/v1/git-review/*` and admin UI in `src/`
- **Implement `/healthz` and `/readyz` endpoints** (required before Phase 4)

### Phase 3: Cognicred MVP Live

- Implement per-service outbox + ContributionEvent backbone
- Build cognicred scorer + HTTP GET `/api/v1/cred/scores`
- Display scores in `src/` + execute one real payout (ledger entry)
- **Implement `/healthz` and `/readyz` endpoints** (required before Phase 4)

### Phase 4: Operational Readiness

- Add `/metrics` endpoints to all services
- Graceful SIGTERM handling + drain timeout
- Migration Jobs per service (see Appendix A)
- Unified lint/test/build pipelines across `src/` + `services/`
- K8s manifests or Helm charts (optional until >1 paid node)

### Phase 5: Extract App Template Core

- Carve `packages/app-template-core` (auth, billing, AI ports, UI shell)
- Refactor `src/` to depend on it
- Migrate `src/contracts/` → `packages/contracts-public`
- No service-specific logic in core package

### Phase 6: cogni-app-template Repo

- New repo consuming `app-template-core`
- Strip `services/*` (stays in platform)
- Include `smart-contracts/` with DAO deploy scripts
- Default config points to hosted endpoints
- Publish `setup-cogni` CLI scaffold

### Phase 7: cogni-platform Repo

- Rename/split current repo
- Host multi-tenant services, K8s manifests, Loki, Ponder
- Operator's own cogni-node
- Treat app-template as external dependency

### Phase 8: Automated Template Updates

- Release pipeline: typed SDK + changelog from `app-template-core`
- Bot/Action opens PRs to downstream forks (opt-in)
- Version bumps + migration notes

---

## Appendix A: K8s Readiness Contract

Every service MUST expose (from Phase 2/3 onward):

- `/healthz` — liveness probe (is process alive?)
- `/readyz` — readiness probe (can accept traffic?)
- `/metrics` — Prometheus metrics (Phase 4+)

**Operational requirements**:

- Graceful SIGTERM: stop accepting requests, drain in-flight, exit within N seconds
- Statelessness: no local filesystem dependencies except ephemeral `/tmp`
- No shared volumes between services
- **Migrations are one-shot Jobs**: long-running services MUST NOT run migrations at startup

## Appendix B: Service Auth & Tenant Scoping

**Tenant key**: `node_id` is the canonical tenant identifier everywhere (headers, JWT claims, DB columns, event envelopes). Do not use synonyms like `tenant`, `org`, or `account_id`.

**Internal service JWTs**:

- Max TTL: 5–15 minutes
- Clock skew tolerance: 60–120 seconds
- Signed with rotating keys (key rotation policy TBD in Phase 4)
- Services MUST reject expired tokens

**Example internal JWT payload**:

```json
{
  "iss": "cogni-platform",
  "aud": "git-review-daemon",
  "sub": "billing-service",
  "node_id": "node_abc123",
  "iat": 1700000000,
  "exp": 1700000900
}
```

**Headers**: Every internal API call requires `X-Node-ID` header matching JWT `node_id` claim.

**mTLS**: Optional for later hardening. Never rely on network trust alone.

## Appendix C: Smart Contract Ownership

**Ownership**:

- app-template owns: DAO contracts, deploy scripts, canonical address book
- Platform contracts (registry/factory) are OPTIONAL; standalone deploy must work without platform

**Directory structure**:

```
smart-contracts/
  deploy/
    config/
      local.json      → Deploy params for local dev
      sepolia.json    → Deploy params for testnet
      base.json       → Deploy params for mainnet (no secrets)
  addresses/
    local.json        → Committed (dev deployed addresses)
    sepolia.json      → Committed (testnet deployed addresses)
    .gitignore        → Excludes prod files
```

**Separation of concerns**:

- `deploy/config/*.json` — deployment parameters (gas, constructor args, etc.)
- `addresses/*.json` — deployed contract addresses

**Runtime address precedence** (highest to lowest):

1. `ENV_OVERRIDE` (e.g., `CONTRACT_TOKEN_ADDRESS`)
2. Secure prod config/secret (e.g., Vault, sealed secret)
3. Committed dev/testnet file (`addresses/local.json`, `addresses/sepolia.json`)

**Update/distribution for spawned DAOs**:

- Versioned ABIs/types published as npm package
- Semver releases with upgrade notes + migration steps
- Bot/Action opens PRs to downstream forks (opt-in)

**Anti-patterns (FORBIDDEN)**:

- Platform checkout required to deploy a DAO
- Cross-repo mega deploy scripts
- Prod addresses only in platform (must also be in app runtime config)

## Appendix D: Daemon Isolation & Security

**Process isolation**: Each daemon has its own process, Docker image, env, and DB schema. Never writes to another service's tables.

**DB topology**: Single Postgres, per-service schemas, role-based access. Each service owns its outbox table (`{schema}.outbox_events`). Services connect with least-privilege roles.

**Outbox schema** (per service):

```sql
CREATE TABLE {schema}.outbox_events (
  event_id       UUID PRIMARY KEY,
  node_id        VARCHAR NOT NULL,
  payload        JSONB NOT NULL,
  status         VARCHAR NOT NULL DEFAULT 'pending',
  attempts       INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  locked_until   TIMESTAMPTZ,
  worker_id      VARCHAR,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON {schema}.outbox_events (status, next_attempt_at);
CREATE INDEX ON {schema}.outbox_events (node_id);
```

**Credential isolation**: Every daemon owns its own credentials (GitHub Apps, API keys, wallets). No credential sharing. Admin tokens (git-admin) never available in review/broadcast/cognicred codepaths.

**Ingress**: Small versioned HTTP surface (webhooks + `/api/v1/...`). Validates all calls (HMAC for VCS, API keys/JWT for external, service tokens for internal).

**Billing**: Daemons call shared Billing/Entitlements API via typed client. Never talk directly to Next.js app.

**Multi-tenancy**: Every daemon stores `node_id` with all state and events. Single deployment serves many nodes with logical separation.

**Permissions**:

- git-review: least-privilege (repo read/comment)
- git-admin: higher scopes, distinct daemon
- broadcast: no admin tokens
- cognicred: no VCS or admin permissions

**Extraction**: Daemon can be lifted to its own repo without changing external contracts (billing, identity, cred accessed via stable ports).
