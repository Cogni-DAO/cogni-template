Cogni Technical Vision – Monorepo Org-Factory, Thin Core, Cred-First

1. Mission + Shape
   Cogni is a DAO-first “org factory”: a monorepo that ships one real Cogni node app (Next.js) plus a small set of headless AI/ops services and a cred engine, all optimized for forkability; federation and a separate “platform” repo only happen after: (a) at least one paid external AI service, and (b) at least one real payout executed using cred outputs.

2. Monorepo Layout + Boundaries (Apps, Services, Packages)

apps/cogni-node: the current cogni-template evolved into the first product app (auth, crypto payments, billing, admin UI, public APIs).

services/git-review-daemon, services/git-admin-daemon, services/broadcast-cogni, services/cognicred: headless workers/HTTP APIs, no full UI shells; each owns its domain logic and persistence.

packages/core-primitives: logging, env parsing, tracing, HTTP client utils, basic DB wrappers (no business logic).

packages/contracts-public: versioned public API contracts (HTTP DTOs, Webhook payloads, .cogni manifest schema).

packages/contracts-internal: faster-moving internal event schemas and service-to-service contracts.
Dependency rules (enforced via dependency-cruiser): services only import packages/_; apps can import packages/_ and call services strictly via client packages; packages/core-primitives depends on nothing else.

3. .cogni Manifest as Contract, Not Config Dump

Single file: .cogni/repo-spec.yml as manifest_version-tagged contract describing desired state for ONE Cogni node: repos/VCS providers, enabled services (git_review: true, cognicred: true), and high-level plan names (plan_tier: "pro"), but never secrets or mutable runtime account data.

JSON schema for manifest lives in packages/contracts-public, with strict validation, migration tooling, and compatibility guarantees; services treat it as untrusted input, validate on ingest, and store a normalized snapshot in their own DBs with explicit version and hash.

4. Events, Backbone, and Cognicred MVP

Choose an explicit backbone: start with DB outbox tables + polling consumers (or Postgres listen/notify) before any Kafka/NATS; every cross-service event is a contribution_event row with deterministic event_id, source, actor, repo, action, timestamp, raw_payload, normalized_payload, schema_version.

services/cognicred ingests these events idempotently, builds a contribution graph, and runs v0 scoring: weighted sums + time-decay + caps per identity, no CredRank; all scoring runs are versioned and replayable.

v0 cognicred interface (minimax): (1) score_per_participant, (2) breakdown/explanation per score, (3) payout suggestion set (who, how much, why), (4) signed snapshot hash for audit/replay; exported via simple HTTP JSON endpoints, not GraphQL.

5. AI Services: Git-Review, Git-Admin, Broadcast

services/git-review-daemon: owns VCS integrations (GitHub, later GitLab/etc.), code analysis pipelines, and emits contribution_events; exposed to apps/cogni-node via a typed client in packages/contracts-internal, while public API /api/v1/ai/git-review/\* is versioned per-product DTO in packages/contracts-public.

services/git-admin-daemon: owns high-privilege repo admin operations (branch protection, app install status), completely separated from git-review’s least-privilege role; it also emits governance and maintenance events into the same backbone.

services/broadcast-cogni: owns content generation (image/blog/snippet), with its own pricing plans and rate limits; it also emits contribution events (e.g., posts created, campaigns launched) into cognicred; no standalone UI until there is real usage—only minimal screens wired into apps/cogni-node.

6. Identity, Billing, and Payouts (Outside Manifest, Inside Ledgers)

Identities live in DB tables with auditable provenance: identities (GitHub, wallet, email, internal user ID), identity_links (human-approved mappings), billing_accounts, credit_ledger, payout_ledger; none of this lives in git-controlled manifests.

Payments and plans: manifest references symbolic plan tiers; real prices and entitlements live in DB/config with migration history; apps/cogni-node enforces crypto payments (USDC on-chain + Ponder gate) and credits, while services simply consume “you have X credits for product Y” from the ledger.

Payouts: cred outputs are suggestions; payout execution is a separate job or workflow that writes to payout_ledger and, in v1, may be manually enacted (off-chain) but must be recorded as “payout happened”; later, this job can be moved on-chain.

7. Extraction Path: From Product App to Templates and Platform

Phase 1 (now): consolidate logic in the monorepo, but keep strict boundaries; ship one paid AI service (git-review) via apps/cogni-node + Ponder-based crypto payments, and ship cognicred v0 producing real scores and at least one small real payout for that node.

Phase 2: identify what’s truly generic across apps/cogni-node and services (auth primitives, billing accounts, AI adapter ports, logging, test harness) and extract into packages/app-template-core; mirror that into a new, separate cogni-app-template repo that external orgs can fork to build arbitrary Cogni-like apps.

Phase 3: once 2–3 external Cogni DAOs exist and use cred/payouts, create cogni-platform as a separate repo with: (a) multi-tenant operator dashboard, (b) Loki/log aggregation and tracing across nodes/services, (c) setup-cogni CLI that scaffolds from cogni-app-template and registers the new node using the manifest contract, and (d) cross-DAO governance helpers.

8. Governance, Federation, and Non-Negotiable Guardrails

Governance: until at least 5–10 DAOs are live and earning, keep “co-op federation” as narrative only; decisions remain within each node; cred is advisory, not absolute; no central authority silently changes payouts via config.

Guardrails: no platform repo until one paid customer + one real cred-informed payout; no per-service standalone UIs without paying users; no jumping to complex cred algorithms; every cross-boundary call must be via an explicit, versioned contract, and packages/core-primitives must remain thin to avoid turning the monorepo into a soft monolith.

Appendix A: Daemon Isolation, Billing, and Security

Each daemon (git-review, git-admin, broadcast, cognicred, etc.) is a separate service with its own process, Docker image, env, and DB schema (or DB) and never writes to another service’s tables.

Security: every daemon owns its own credentials (GitHub Apps, API keys, wallets); no credential is shared across daemons, and admin-capable tokens (e.g., git-admin) are never available in review/broadcast/cognicred codepaths.

Ingress: each daemon exposes only a small, versioned HTTP surface (webhooks + /api/v1/...) and validates all calls (HMAC signatures for VCS, API keys/JWT for external clients, service-to-service tokens for internal calls).

Billing: daemons never talk directly to the Next.js app; they call a shared Billing/Entitlements API (or read model) via a typed client to check can_consume(product, node_id, amount) and to report usage (record_usage(...)).

Multi-tenancy: every daemon stores node_id (and provider installation IDs) with all state and events, so a single deployment can serve many Cogni nodes while keeping data logically separated.

Events: all daemons emit normalized contribution_events into the shared backbone using at-least-once delivery and idempotent event_id; cognicred consumes these without needing access to daemon-specific DBs.

Permissions: git-review runs with least-privilege repo read/comment scopes; git-admin runs with higher scopes in a distinct daemon; broadcast never sees admin tokens; cognicred has no VCS or admin permissions at all.

Auditing: each daemon logs security-sensitive actions (auth decisions, admin operations, billing checks) with node_id, actor, and correlation IDs, and these logs are shipped to the shared Loki/observability stack.

Extraction: if/when a daemon becomes its own product/org, you can lift its service directory and DB schema into a new repo without changing its external contracts, because billing, identity, and cred are already accessed via stable ports
