# Cogni-Template Architecture

**Core Mission**: A new Developer can fork + spawn a DAO-governed, AI-optimized, CI/CD-enabled service in one click: A crypto-metered AI infrastructure loop where Webapp chat is just one client (API, MCP, mobile app). DAO multi-sig → pays for GPU + OpenRouter/LiteLLM → users interact (chat/API) → users pay back in crypto → DAO multi-sig.

This codebase uses a Clean Architecture, hex-inspired layering model with strict, enforced boundaries: `app → features → ports → core`, and `adapters` implementing `ports` from the outside. Domain logic and errors live in `core`, feature services expose stable, per-feature contracts (including error algebras), and the `app` layer only talks to features, never directly to core. Dependency-cruiser enforces these rules (e.g. no `app → core`, no `adapters → core`, `/types` remain domain-agnostic). See [.dependency-cruiser.cjs](../.dependency-cruiser.cjs) for boundary rules, [tests/arch/AGENTS.md](../tests/arch/AGENTS.md) for enforcement tests, and [ARCHITECTURE_ENFORCEMENT_GAPS.md](ARCHITECTURE_ENFORCEMENT_GAPS.md) for current enforcement status.

Strict **Hexagonal (Ports & Adapters)** for a full-stack TypeScript app on **Next.js App Router**.  
Purpose: a **metered AI backend** with per-request logging, credit accounting, and crypto billing.  
**Web3 Enclosure** — all resources authenticated by connected wallets.  
**Crypto-only Accounting** — infrastructure, LLM usage, and deployments funded by DAO-controlled wallets.  
Every dependency points inward.

### Hexagonal Design

**What "Hexagonal (Ports & Adapters)" means:**

- **Core:** Pure domain logic with no framework dependencies or I/O
- **Ports:** Interfaces that define what the domain needs from the outside world
- **Adapters:** Implement ports using real technology (DB, HTTP, LLM, etc.)
- **Features:** Orchestrate core domain logic through ports
- **Delivery:** External entry points (app, mcp) that call features
- **Dependencies:** Always point inward toward the core

**Why we use it here:**

1. Swap infrastructure without touching domain logic
2. Test domain logic without network dependencies
3. Keep Next.js/MCP framework code out of business logic
4. Enable strict import enforcement by architectural layer

- Hexagonal: `app → features → ports → core` and `adapters → ports → core`. Dependencies point inward.
- 100% OSS stack. Strict lint/type/style. Env validated at boot. Contract tests required for every adapter.
- **Proof-of-Concept Scope** — implement minimal working integrations only; no product logic.

**References:**

- Hexagonal: [Alistair Cockburn's System Design](https://www.geeksforgeeks.org/system-design/hexagonal-architecture-system-design/)
- Infrastructure: [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md)
- Chain Configuration: [CHAIN_CONFIG.md](CHAIN_CONFIG.md)
- Accounts & Credits: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API Endpoints: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet Integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- Billing Evolution: [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)
- Activity Metrics: [ACTIVITY_METRICS.md](ACTIVITY_METRICS.md)

### Vertical slicing

- Each feature is a slice under **features/** with its own `actions/`, `services/`, `components/`, `hooks/`, `types/`, `constants/`.
- Slices may depend on **core** and **ports** only. Never on other slices or **adapters**.
- Public surface changes in a slice must update that slice's `AGENTS.md` and pass contract tests.

### SSR-unsafe libraries

Libraries accessing browser APIs (IndexedDB, localStorage) at module load cause `ReferenceError` during Next.js SSR/build. Solution: dynamic import inside client-side `useEffect`, cache config in React state. See `src/app/providers/wallet.client.tsx` for WalletConnect example.

---

## System Layers (by directory)

- **src/bootstrap/** → Composition root (DI/factories), env (Zod), exports a container/getPort().
- **platform/** → Infrastructure tooling, CI/CD scripts, deployment automation, dev setup.
- **src/contracts/** → Operation contracts (id, Zod in/out, scopes, version). No logic.
- **src/mcp/** → MCP host bootstrap. Registers tools mapped 1:1 to contracts.
- **src/app/** → Delivery/UI + Next.js API routes. Includes `providers/` for client-side context composition (wagmi, RainbowKit, React Query).
- **src/features/** → Vertical slices (use cases): `proposals/`, `auth/`… See import rules below.
- **src/ports/** → Contracts/interfaces only.
- **src/core/** → Pure domain. No I/O/time/RNG; inject via ports.
- **src/adapters/** → Infra implementations of ports. No UI.
  - `server/` (drizzle, langfuse, pino, siwe, viem, litellm, rate-limit, clock, rng)
  - `test/` (fake implementations for CI; selected via `APP_ENV=test`)
  - `worker/`, `cli/` (future)
- **src/shared/** → Small, pure utilities: env/, schemas/ (DTOs, mappers), constants/, util/.
- **src/components/** → Shared presentational UI.
- **src/styles/** → Tailwind preset, globals, theme tokens.
- **src/types/** → Global TS types.
- **src/assets/** → Icons/images imported by code.

- **public/** → Static files.
- **infra/** → Docker Compose, LiteLLM config, Langfuse, Terraform/OpenTofu → Akash.
- **docs/** → ARCHITECTURE, IMPLEMENTATION_PLAN, ADRs.
- **tests/** → Unit (core/features with mocked ports), integration (adapters), contract (port compliance), setup.
- **e2e/** → Playwright API/UI specs.
- **scripts/** → Migrations, seeds, generators.
- **packages/** → Internal shared packages (pure libraries, no `src/` imports).

## Configuration Directories

**Committed dotfolders:**

- **.allstar/** → GitHub Allstar security policy enforcement
- **.claude/, .cursor/** → Code AI assistant configuration
- **.cogni/** → DAO governance (`repo-spec.yaml`, policies, AI code review files)
- **.github/workflows/** → CI/CD automation (lint, test, build, deploy gates)
- **.husky/** → Git hooks (pre-commit, commit-msg validation)

---

## Directory & Boundary Specification

[x] .env.local.example # local development env template (never commit .env.local)
[x] .gitignore # standard git ignore list
[x] .nvmrc # node version pin (e.g., v20)
[x] .editorconfig # IDE whitespace/newline rules
[x] .dependency-cruiser.cjs # hex architecture boundary rules
[x] .prettierrc # code formatting config
[x] .prettierignore # exclude build/artifacts
[x] eslint.config.mjs # eslint config (tailwind, UI governance, import rules)
[x] commitlint.config.cjs # conventional commits enforcement
[x] src/styles/tailwind.css # Tailwind v4 CSS-first config (@theme, @utility, @custom-variant)
[x] tsconfig.json # typescript + alias paths
[x] tsconfig.eslint.json # eslint typescript config
[x] package.json # deps, scripts, engines (db scripts added)
[x] drizzle.config.ts # database migrations config
[x] Dockerfile # reproducible build
[x] .dockerignore # ignore node*modules, artifacts, .env.\*
[x] LICENSE # OSS license
[x] CODEOWNERS # review ownership
[x] SECURITY.md # disclosure policy
[x] CONTRIBUTING.md # contribution standards
[x] README.md # overview
[ ] CHANGELOG.md # releases
[x] src/proxy.ts # Auth proxy for /api/v1/* (except /api/v1/public/\_)
[x] vitest.config.mts # unit/integration
[x] vitest.api.config.mts # API integration tests
[x] playwright.config.ts # UI/e2e

[x] docs/
[x] ├── AUTHENTICATION.md # SIWE and session management architecture
[x] ├── ARCHITECTURE.md # narrative + diagrams (longform)
[x] ├── ACCOUNTS_DESIGN.md # accounts & credits system design
[x] ├── ACCOUNTS_API_KEY_ENDPOINTS.md # API endpoint contracts
[x] ├── INTEGRATION_WALLETS_CREDITS.md # wallet connectivity (Steps 1-4)
[x] ├── BILLING_EVOLUTION.md # billing system evolution (Stages 5-7)
[x] ├── DATABASES.md # database architecture
[x] ├── ENVIRONMENTS.md # environment configuration
[x] ├── ERROR_HANDLING_ARCHITECTURE.md # error handling patterns
[x] ├── FEATURE_DEVELOPMENT_GUIDE.md # feature development workflows
[x] ├── SETUP.md # developer setup guide
[x] ├── STYLE.md # code style guide
[x] ├── TESTING.md # testing strategy
[x] ├── UI_IMPLEMENTATION_GUIDE.md # practical UI development workflows
[x] ├── CI-CD.md # CI/CD documentation
[x] └── templates/ # document templates

[x] platform/ # platform tooling and infrastructure
[x] ├── infra/ # Infrastructure as Code and deployment configs
[x] │ ├── providers/
[x] │ │ ├── cherry/ # Cherry Servers provider
[x] │ │ │ ├── base/ # VM + static bootstrap (immutable)
[ ] │ │ │ └── app/ # SSH deploy + health gate (mutable)
[x] │ │ └── akash/ # Akash provider configs
[x] │ ├── services/
[x] │ │ ├── runtime/ # Docker Compose for local dev (postgres, litellm)
[x] │ │ ├── sourcecred/ # SourceCred instance (cred analysis)
[x] │ │ └── loki-promtail/ # Log aggregation stack
[ ] │ ├── stacks/
[ ] │ │ └── local-compose/ # Local development stack
[x] │ └── files/ # Shared templates and utility scripts
[x] ├── ci/ # CI/CD automation
[x] ├── bootstrap/ # One-time dev machine setup installers
[x] │ ├── install/ # Focused installer scripts (tofu, pnpm, docker, reuse)
[x] │ └── README.md # Installation instructions
[x] └── runbooks/ # Deploy, rollback, incident docs

[ ] public/
[ ] ├── robots.txt
[ ] ├── sitemap.xml
[ ] ├── manifest.json
[ ] ├── fonts/
[ ] └── images/

[x] src/
[x] ├── auth.ts # Auth.js configuration (SIWE credentials provider)
[x] ├── proxy.ts # Auth proxy for /api/v1/_ (except /api/v1/public/_)
[x] ├── bootstrap/ # composition root (DI)
[x] │ ├── container.ts # wires adapters → ports
[ ] │ └── config.ts # Zod-validated env
[ ] │
[x] ├── contracts/ # operation contracts (edge IO)
[x] │ ├── AGENTS.md
[x] │ ├── http/ # HTTP route contracts (openapi.v1.ts)
[x] │ ├── ai.chat.v1.contract.ts # streaming chat
[x] │ ├── ai.completion.v1.contract.ts # AI completion
[x] │ ├── payments.intent.v1.contract.ts # payment intent creation
[x] │ ├── payments.submit.v1.contract.ts # payment submission
[x] │ ├── payments.status.v1.contract.ts # payment status
[x] │ ├── payments.credits.\_.v1.contract.ts # credits summary/confirm
[x] │ └── meta.\*.v1.contract.ts # health, route-manifest
[ ] │
[x] ├── mcp/ # MCP host (future)
[x] │ ├── AGENTS.md
[x] │ └── server.stub.ts
[ ] │
[x] ├── app/ # delivery (Next UI + routes)
[x] │ ├── layout.tsx
[x] │ ├── page.tsx
[x] │ ├── \_lib/ # private app-level helpers
[x] │ │ └── auth/session.ts
[x] │ ├── \_facades/ # route facade helpers
[x] │ │ ├── ai/
[x] │ │ └── payments/
[x] │ ├── providers/ # Client-side provider composition (wagmi, RainbowKit, React Query)
[x] │ │ ├── AGENTS.md
[x] │ │ ├── app-providers.client.tsx
[x] │ │ ├── wallet.client.tsx
[x] │ │ ├── query.client.tsx
[x] │ │ └── wagmi-config-builder.ts
[x] │ ├── wallet-test/ # Dev wallet test harness
[x] │ ├── (public)/ # public, unauthenticated pages
[x] │ ├── (app)/ # protected, authenticated pages
[x] │ └── api/
[x] │ ├── auth/[...nextauth]/ # Auth.js routes
[x] │ └── v1/
[x] │ ├── ai/completion/ # AI completion (credit-metered)
[x] │ ├── ai/chat/ # streaming chat (credit-metered)
[x] │ └── payments/ # payment endpoints (intents, attempts, credits)
[ ] │
[x] ├── features/ # application services
[x] │ ├── home/ # home page data
[x] │ ├── ai/ # AI services
[x] │ │ ├── services/ # completion service, llmPricingPolicy
[x] │ │ ├── chat/ # streaming chat (assistant-ui)
[x] │ │ │ ├── providers/
[x] │ │ │ └── components/
[x] │ │ ├── components/ # ModelPicker, ChatComposerExtras
[x] │ │ ├── config/ # provider icons registry
[x] │ │ ├── hooks/ # useModels
[x] │ │ ├── icons/ # provider SVG components
[x] │ │ │ └── providers/
[x] │ │ └── preferences/ # model localStorage
[x] │ ├── accounts/ # account management feature
[x] │ │ └── services/
[x] │ ├── site-meta/ # meta services (health, routes)
[x] │ │ └── services/
[x] │ ├── payments/ # USDC payment processing
[x] │ │ ├── services/
[x] │ │ ├── hooks/
[x] │ │ ├── api/
[x] │ │ └── utils/
[ ] │ ├── auth/ # (not implemented)
[ ] │ └── proposals/ # (not implemented)
[ ] │
[x] ├── core/ # domain: entities, rules, invariants
[x] │ ├── chat/ # chat domain model
[x] │ │ ├── model.ts
[x] │ │ ├── rules.ts
[x] │ │ └── public.ts
[x] │ ├── accounts/ # account domain model
[x] │ │ ├── model.ts # account entities and business rules
[x] │ │ ├── errors.ts # domain errors (InsufficientCreditsError)
[x] │ │ └── public.ts # domain exports
[x] │ ├── billing/ # billing domain logic
[x] │ │ └── pricing.ts # credit cost calculations
[x] │ ├── payments/ # payment domain model
[x] │ │ ├── model.ts # PaymentAttempt entity
[x] │ │ ├── rules.ts # state machine transitions
[x] │ │ ├── errors.ts # PaymentErrorCode enum
[x] │ │ └── public.ts
[x] │ └── public.ts # core exports
[ ] │ ├── auth/
[ ] │ │ ├── session.ts
[ ] │ │ └── rules.ts
[ ] │ ├── credits/
[ ] │ │ ├── ledger.ts # credit/debit invariants
[ ] │ │ └── rules.ts
[ ] │ └── proposal/
[ ] │ ├── model.ts
[ ] │ └── rules.ts
[ ] │
[x] ├── ports/ # contracts (minimal interfaces)
[x] │ ├── llm.port.ts # LLM service interface (LlmCaller)
[x] │ ├── clock.port.ts # Clock { now(): Date }
[x] │ ├── accounts.port.ts # AccountService interface (create, debit, credit)
[x] │ ├── payment-attempt.port.ts # PaymentAttemptRepository interface
[x] │ ├── onchain-verifier.port.ts # OnChainVerifier interface (real EVM RPC verification)
[x] │ └── index.ts # port exports
[ ] │ ├── wallet.port.ts # WalletService { verifySignature(...) }
[ ] │ ├── auth.port.ts # AuthService { issueNonce, verifySiwe, session }
[ ] │ ├── apikey.port.ts # ApiKeyRepo { create, revoke, findByHash }
[x] │ ├── usage.port.ts # UsageService, ActivityUsagePort (Activity dashboard)
[ ] │ ├── telemetry.port.ts # Telemetry { trace, event, span }
[ ] │ ├── ratelimit.port.ts # RateLimiter { take(key, points) }
[ ] │ └── rng.port.ts # Rng { uuid(): string }
[ ] │
[x] ├── adapters/ # infrastructure implementations (no UI)
[x] │ ├── server/
[x] │ │ ├── ai/litellm.adapter.ts # LLM completion service
[x] │ │ ├── ai/litellm.activity-usage.adapter.ts # Activity dashboard (LiteLLM /spend/logs)
[x] │ │ ├── ai/litellm.usage-service.adapter.ts # UsageService bridge
[x] │ │ ├── accounts/ # account service implementation
[x] │ │ │ └── drizzle.adapter.ts # database-backed AccountService
[x] │ │ ├── db/ # database client and connection
[x] │ │ │ ├── drizzle.client.ts # drizzle instance
[x] │ │ │ ├── client.ts # main database client export
[x] │ │ │ ├── migrations/ # schema migrations (see shared/db/schema.\*.ts)
[x] │ │ │ └── index.ts # db exports
[x] │ │ ├── payments/ # payment adapters
[x] │ │ │ ├── drizzle-payment-attempt.adapter.ts
[x] │ │ │ └── ponder-onchain-verifier.adapter.ts # legacy stub (replaced by evm-rpc-onchain-verifier.adapter.ts)
[x] │ │ ├── time/system.adapter.ts # system clock
[x] │ │ └── index.ts # server adapter exports
[x] │ └── test/ # fake implementations for CI
[x] │ ├── AGENTS.md
[x] │ ├── ai/fake-llm.adapter.ts
[x] │ ├── payments/fake-onchain-verifier.adapter.ts
[x] │ └── index.ts
[ ] │ ├── auth/siwe.adapter.ts # nonce + session store
[ ] │ ├── wallet/verify.adapter.ts # viem-based signature checks
[ ] │ ├── apikey/drizzle.repo.ts # API keys persistence
[ ] │ ├── telemetry/langfuse.adapter.ts # traces + spans
[ ] │ ├── logging/pino.adapter.ts # log transport
[ ] │ ├── ratelimit/db-bucket.adapter.ts # simple token-bucket
[ ] │ └── rng/uuid.adapter.ts # uuid generator
[ ] │ ├── worker/ # background jobs (future)
[ ] │ └── cli/ # command-line adapters (future)
[ ] │
[x] ├── shared/ # small, pure, framework-agnostic
[x] │ ├── auth/ # shared types and pure helpers for auth
[x] │ │ ├── AGENTS.md
[x] │ │ ├── session.ts
[x] │ │ └── wallet-session.ts
[x] │ ├── env/
[x] │ │ ├── server.ts # Zod-validated private vars
[x] │ │ ├── client.ts # validated public vars
[x] │ │ ├── build.ts # build-time env
[x] │ │ └── index.ts
[x] │ ├── db/ # database schema
[x] │ │ ├── AGENTS.md
[x] │ │ ├── schema.ts # schema exports
[x] │ │ ├── schema.auth.ts # auth tables
[x] │ │ ├── schema.billing.ts # billing tables (billing_accounts, credit_ledger, charge_receipts)
[x] │ │ └── index.ts
[x] │ ├── constants/
[x] │ │ └── index.ts
[x] │ ├── errors/
[x] │ │ └── index.ts
[x] │ ├── util/
[x] │ │ ├── cn.ts # className utility
[x] │ │ └── index.ts
[x] │ ├── observability/ # logging and context
[x] │ │ ├── logging/ # Pino structured logging
[x] │ │ └── context/ # RequestContext pattern
[x] │ ├── web3/ # chain config, USDC addresses
[x] │ ├── config/ # repo-spec config helpers
[x] │ └── index.ts
[x] │ ├── schemas/
[x] │ │ └── litellm.spend-logs.schema.ts # Zod schemas for LiteLLM /spend/logs API
[ ] │ └── crypto.ts
[ ] │
[x] ├── components/ # shared presentational UI
[x] │ ├── kit/
[x] │ │ ├── layout/
[x] │ │ ├── data-display/
[x] │ │ ├── animation/
[x] │ │ ├── typography/
[x] │ │ ├── inputs/
[x] │ │ ├── navigation/
[x] │ │ ├── feedback/
[x] │ │ ├── auth/
[x] │ │ ├── chat/
[x] │ │ ├── payments/
[x] │ │ ├── sections/
[x] │ │ └── theme/
[x] │ ├── vendor/
[x] │ │ ├── shadcn/ # shadcn/ui primitives
[x] │ │ └── assistant-ui/ # assistant-ui components
[x] │ └── index.ts
[ ] │
[x] ├── styles/
[x] │ ├── tailwind.css # v4 CSS-first config (@theme/@utility)
[x] │ ├── theme.ts # token key types
[x] │ └── ui/ # CVA styling factories
[ ] │
[x] ├── lib/ # additional library helpers
[x] │ └── auth/ # auth mapping and server helpers
[ ] │
[ ] ├── types/
[ ] │ ├── index.d.ts
[ ] │ └── global.d.ts
[ ] │
[ ] └── assets/
[ ] ├── icons/
[ ] └── images/

[x] tests/
[x] ├── \_fakes/ # deterministic test doubles
[x] ├── \_fixtures/ # static test data and setup helpers
[x] ├── unit/ # core rules + features with mocked ports
[x] ├── stack/ # stack tests against dev infrastructure (auth, ai, payments)
[x] ├── integration/ # adapters against local services (stubs only)
[x] ├── contract/ # reusable port contract harness (stubs only)
[x] ├── ports/ # port contract tests
[x] ├── security/ # security validation tests
[x] ├── lint/ # ESLint rule tests
[x] └── setup.ts

[x] e2e/
[ ] ├── auth.spec.ts
[ ] └── ai.spec.ts

[x] scripts/
[x] ├── validate-agents-md.mjs # validates AGENTS.md files
[x] ├── validate-doc-headers.ts # validates doc headers
[x] ├── check-fast.sh # structured check workflow with auto-fix mode
[x] ├── check-root-layout.ts # validates root directory structure
[x] ├── setup/ # setup scripts
[x] ├── eslint/ # custom ESLint plugins
[x] │ └── plugins/ui-governance.cjs
[ ] ├── db/ # database scripts
[ ] │ ├── seed.ts
[ ] │ └── migrate.ts
[ ] └── generate-types.ts

---

## Enforcement Rules

- **Layer Boundaries:** All hexagonal layers enforce dependency direction (57 tests passing).
- **Entry Points:**
  - `@/ports` → must use `index.ts` (blocks internal port files)
  - `@/core` → must use `public.ts` (blocks internal core files)
  - `@/adapters/server` → must use `index.ts` (blocks internal adapter files, exception: `auth.ts`)
  - `@/adapters/test` → must use `index.ts` (blocks internal test adapter files)
  - `@/features/*` → external code must use `services/` or `components/` (blocks `mappers/utils/constants/` from outside `src/features/`; cross-feature internals still a known gap)
- **Types Layer:** Bottom-of-tree, type-only; may only import from `@//types`, but _all other layers_ are allowed to import it.
- **Contracts Layer:** API surface; `contracts` may import only `/types`, and are valid import targets for `features` (and adapters where needed), but **never** for `core` or `ports`.
- **Config Hygiene:** Phantom layer detection tests prevent undefined layer drift.
- **Imports**
  - `core` → `@/core`, `@/types`.
  - `ports` → `@/core`, `@/types`.
  - `features` → `@/core|@/ports|@/shared|@/types|@/components|@/contracts`.
  - `app` → `@/features/*/services/*|@/bootstrap/container|@/contracts/*|@/shared|@/ports|@/styles` (never adapters|core).
  - `adapters` → `@/ports|@/shared|@/types` (never `app|features|core|contracts`).
  - `contracts` → `@/shared|@/types`.
  - `types` → `@/types` only (bottom layer).
  - `bootstrap` → `@/adapters/server|@/ports`.
  - `mcp` → `@/contracts|@/bootstrap|@/features/*/services/*|@/ports`.
- **ESLint**: flat config for UI governance and Tailwind rules.
- **Dependency-cruiser**: enforces hexagonal architecture boundaries; CI gate for import violations. Arch probes in `src/**/__arch_probes__/` validate boundaries via tests; excluded from builds (tsconfig, .dockerignore).
- **Contracts**: `tests/contract` must pass for any adapter.
- **Env**: Zod-validated; build fails on invalid/missing.
- **Security**: middleware sets headers, verifies session or API key, rate-limits.
- **Financial Rails**: DAO receiving wallet + chain live in `.cogni/repo-spec.yaml` (no env override). `scripts/validate-chain-config.ts` enforces chain_id alignment with `@/shared/web3/CHAIN_ID`; widget config is read server-side and passed to clients as props.

### Styling Invariants

- **Component architecture:** `src/components/kit/*` provides reusable UI components. `src/features/*/components` contains feature-specific components.
- **Vendor isolation:** Only kit wrappers may import from `src/components/vendor/ui-primitives/shadcn/**`. `no-vendor-imports-outside-kit` enforces this boundary.
- **Layout flexibility:** Kit components can expose `className?: string` for layout/composition overrides (flex/grid/gap/margin). Feature components may use standard Tailwind utilities.

---

## MVP Vertical Slice

1. **Wallet sign-in** (SIWE) → session.
2. **API key creation** bound to wallet.
3. **AI request** via LiteLLM/OpenRouter with key.
4. **Atomic usage + debit** in DB.
5. **Telemetry** to Langfuse and logs to Pino.
6. **Balance view** in protected UI.

LangGraph, Loki/Grafana, Akash/IaC move to v2.

---

## Testing Strategy

**Core (unit):** pure domain tests in `tests/unit/core/**`.  
**Features (unit):** use-case tests with mocked ports in `tests/unit/features/**`.  
**Contract (ports):** reusable contract harness per port in `tests/contract/<port-name>.contract.ts`; every adapter must pass it.  
**Contract (edge):** each `src/contracts/*.contract.ts` has a contract test run against the HTTP route (and MCP later).  
**Adapters (integration):** run contract + real-service tests in `tests/integration/<adapter-area>/**`.  
**Routes (API e2e):** HTTP-level tests hitting Next API routes in `e2e/**`.  
**Fake Adapters (CI):** `APP_ENV=test` triggers deterministic test adapters (`src/adapters/test/`) via `bootstrap/container` for CI testing without external dependencies.  
**Setup:** common mocks and config in `tests/setup.ts`.

---

## Implementing a New Feature (5-Step Flow)

1. **Define Contract:**  
   Create `src/contracts/<feature>.<action>.v1.contract.ts` with Zod input, output, and scopes.

2. **Add Use-Case Logic:**  
   Implement `src/features/<feature>/services/<action>.ts` — pure logic calling domain ports only.

3. **Expose Route:**  
   In `src/app/api/<feature>/<action>/route.ts`, import the contract, validate input, call the use-case, validate output.

4. **Adapter Support (if needed):**  
   Add or update a `src/adapters/server/...` implementation to satisfy any ports the feature requires.

5. **Test + Document:**  
   Add a `tests/contract/<feature>.<action>.contract.ts` verifying the route matches the contract, then update that feature's AGENTS.md.

---

## Notes

- **Contracts are edge-only.** Inner layers never import `src/contracts/**`. Breaking change → new `...vN` id.
- **Routes must validate IO.** Parse input before calling the use-case. Parse output before responding. Fail closed.
- **Auth is centralized.** `src/proxy.ts` enforces session auth on `/api/v1/*` except `/api/v1/public/*`. Public routes MUST use `wrapPublicRoute()` (auto-applies rate limiting + cache headers). No per-route ad-hoc auth.
- **Public API namespace (`/api/v1/public/*`).** All routes here use `wrapPublicRoute()` for mandatory rate limiting (10 req/min/IP), cache headers, and metrics. CI enforcement via `tests/meta/public-route-enforcement.test.ts`. No sensitive data access allowed.
- **Observability is mandatory.** Trace every call with `contractId`, `subject`, and cost/usage. Log denials.
- **Adapters are pure infra.** No UI, no business rules. Implement ports only. Promote creeping helpers into ports or core.

---

## Related Documentation

- [Architecture Enforcement Status](ARCHITECTURE_ENFORCEMENT_GAPS.md) - Current boundary enforcement coverage and known gaps
- [Packages Architecture](PACKAGES_ARCHITECTURE.md) - Internal packages, isolation boundaries, and CI/CD setup
- [Environment & Stack Deployment Modes](ENVIRONMENTS.md) - All 6 deployment modes, environment variables, and when to use each
- [Observability](OBSERVABILITY.md) - Structured logging, Prometheus metrics, and Grafana Cloud integration
- [Database & Migration Architecture](DATABASES.md) - Database organization, migration strategies, and URL construction
- [Testing Strategy](TESTING.md) - Environment-based test adapters and stack testing approaches
- [Error Handling Architecture](ERROR_HANDLING_ARCHITECTURE.md) - Layered error translation patterns and implementation guidelines
- [Model Selection](MODEL_SELECTION.md) - Dynamic model fetching from LiteLLM, validation, and UI integration
- [CI/CD Pipeline Flow](CI-CD.md) - Branch model, workflows, and deployment automation
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - Infrastructure and deployment details
