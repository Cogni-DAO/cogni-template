# Cogni-Template Architecture

**Core Mission**: A crypto-metered AI infrastructure loop where chat is just one client. DAO multi-sig → pays for GPU + OpenRouter/LiteLLM → users interact (chat/API) → users pay back in crypto → DAO multi-sig.

This codebase uses a Clean Architecture, hex-inspired layering model with strict, enforced boundaries: `app → features → ports → core`, and `adapters` implementing `ports` from the outside. Domain logic and errors live in `core`, feature services expose stable, per-feature contracts (including error algebras), and the `app` layer only talks to features, never directly to core. ESLint boundaries codify these rules (e.g. no `app → core`, no `adapters → core`, `shared/types` remain domain-agnostic).

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
- Accounts & Credits: [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md)
- API Endpoints: [ACCOUNTS_API_KEY_ENDPOINTS.md](ACCOUNTS_API_KEY_ENDPOINTS.md)
- Wallet Integration: [INTEGRATION_WALLETS_CREDITS.md](INTEGRATION_WALLETS_CREDITS.md)
- Billing Evolution: [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)

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

## Configuration Directories

**Committed dotfolders:**

- **.allstar/** → GitHub Allstar security policy enforcement
- **.claude/, .cursor/** → Code AI assistant configuration
- **.cogni/** → DAO governance (`repo-spec.yaml`, policies, AI code review files)
- **.github/workflows/** → CI/CD automation (lint, test, build, deploy gates)
- **.husky/** → Git hooks (pre-commit, commit-msg validation)

---

## Directory & Boundary Specification

[x] .env.example # sample env vars for all services
[x] .env.local.example # local-only env template (never committed)
[x] .gitignore # standard git ignore list
[x] .nvmrc # node version pin (e.g., v20)
[x] .editorconfig # IDE whitespace/newline rules
[x] .prettierrc # code formatting config
[x] .prettierignore # exclude build/artifacts
[x] eslint.config.mjs # eslint config (boundaries, tailwind, import rules)
[x] commitlint.config.cjs # conventional commits enforcement
[x] tailwind.config.ts # Tailwind theme + presets
[x] tsconfig.json # typescript + alias paths
[x] tsconfig.eslint.json # eslint typescript config
[x] package.json # deps, scripts, engines (db scripts added)
[x] drizzle.config.ts # database migrations config
[x] Dockerfile # reproducible build
[x] .dockerignore # ignore node_modules, artifacts, .env.\*
[x] LICENSE # OSS license
[x] CODEOWNERS # review ownership
[x] SECURITY.md # disclosure policy
[x] CONTRIBUTING.md # contribution standards
[x] README.md # overview
[ ] CHANGELOG.md # releases
[x] src/proxy.ts # Auth proxy for /api/v1/ai/\* routes
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
[x] ├── IMPLEMENTATION_PLAN.md # implementation roadmap
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
[x] ├── bootstrap/ # composition root (DI)
[x] │ ├── container.ts # wires adapters → ports
[ ] │ └── config.ts # Zod-validated env
[ ] │
[x] ├── contracts/ # operation contracts (edge IO)
[x] │ ├── AGENTS.md
[x] │ ├── http/ # HTTP route contracts
[x] │ ├── admin.accounts.register.v1.contract.ts # account registration
[x] │ ├── admin.accounts.topup.v1.contract.ts # credit top-up
[x] │ ├── wallet.link.v1.contract.ts # wallet-to-account linking
[x] │ └── \*.contract.ts # individual operation contracts
[ ] │
[x] ├── mcp/ # MCP host (future)
[x] │ ├── AGENTS.md
[x] │ └── server.stub.ts
[ ] │
[x] ├── app/ # delivery (Next UI + routes)
[x] │ ├── layout.tsx
[x] │ ├── page.tsx
[x] │ ├── \_lib/ # private app-level helpers
[x] │ │ └── auth/ # session helpers
[x] │ │ └── session.ts
[x] │ ├── providers/ # Client-side provider composition (wagmi, RainbowKit, React Query)
[x] │ │ ├── AGENTS.md
[x] │ │ ├── app-providers.client.tsx
[x] │ │ ├── wallet.client.tsx
[x] │ │ ├── query.client.tsx
[x] │ │ └── wagmi-config-builder.ts
[x] │ ├── wallet-test/ # Dev wallet test harness
[ ] │ ├── (public)/ # public, unauthenticated pages
[ ] │ ├── (app)/ # protected, authenticated pages
[x] │ └── api/
[x] │ ├── auth/[...nextauth]/ # Auth.js routes (signin, session, signout, csrf)
[x] │ ├── v1/ai/completion/ # AI completion endpoint (session-protected)
[x] │ └── admin/ # admin control plane endpoints (removed wallet/link in auth refactor)
[ ] │ ├── balance/route.ts # exposes credits
[ ] │ ├── keys/create/route.ts # API-key issuance
[ ] │ └── web3/verify/route.ts # calls wallet verification port
[ ] │
[x] ├── features/ # application services
[x] │ ├── home/ # home page data
[x] │ ├── ai/ # AI completion services
[x] │ │ └── services/
[x] │ ├── accounts/ # account management feature
[x] │ │ ├── public.ts # feature public API (single entrypoint)
[x] │ │ ├── errors.ts # feature error types and guards
[x] │ │ └── services/
[x] │ │ └── adminAccounts.ts # admin account operations
[x] │ ├── site-meta/ # meta services (health, routes)
[x] │ │ └── services/
[ ] │ ├── chat/ # wallet-linked chat feature (Step 4)
[ ] │ │ ├── components/
[ ] │ │ ├── hooks/
[ ] │ │ └── services/
[ ] │ ├── payments/ # on-chain payment processing (Stage 7)
[ ] │ │ └── services/
[ ] │ ├── auth/
[ ] │ │ ├── actions.ts
[ ] │ │ └── services/
[ ] │ └── proposals/
[ ] │ ├── actions.ts
[ ] │ ├── services/
[ ] │ ├── components/
[ ] │ ├── hooks/
[ ] │ ├── types.ts
[ ] │ ├── constants.ts
[ ] │ └── index.ts
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
[x] │ └── index.ts # port exports
[ ] │ ├── wallet.port.ts # WalletService { verifySignature(...) }
[ ] │ ├── auth.port.ts # AuthService { issueNonce, verifySiwe, session }
[ ] │ ├── apikey.port.ts # ApiKeyRepo { create, revoke, findByHash }
[ ] │ ├── usage.port.ts # UsageRepo { recordUsage, findByApiKey }
[ ] │ ├── telemetry.port.ts # Telemetry { trace, event, span }
[ ] │ ├── ratelimit.port.ts # RateLimiter { take(key, points) }
[ ] │ └── rng.port.ts # Rng { uuid(): string }
[ ] │
[x] ├── adapters/ # infrastructure implementations (no UI)
[x] │ ├── server/
[x] │ │ ├── ai/litellm.adapter.ts # LLM service impl
[x] │ │ ├── accounts/ # account service implementation
[x] │ │ │ └── drizzle.adapter.ts # database-backed AccountService
[x] │ │ ├── db/ # database client and connection
[x] │ │ │ ├── drizzle.client.ts # drizzle instance
[x] │ │ │ ├── client.ts # main database client export
[x] │ │ │ └── index.ts # db exports
[x] │ │ ├── time/system.adapter.ts # system clock
[x] │ │ └── index.ts # server adapter exports
[x] │ └── test/ # fake implementations for CI
[x] │ ├── AGENTS.md # test adapter documentation
[x] │ ├── ai/fake-llm.adapter.ts # test LLM adapter
[x] │ └── index.ts # test adapter exports
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
[x] │ │ ├── schema.ts # Drizzle schema definitions
[x] │ │ └── index.ts
[x] │ ├── constants/
[x] │ │ └── index.ts
[x] │ ├── errors/
[x] │ │ └── index.ts
[x] │ ├── util/
[x] │ │ ├── cn.ts # className utility
[x] │ │ ├── accountId.ts # stable account ID derivation from API key
[x] │ │ └── index.ts
[x] │ └── index.ts
[ ] │ ├── schemas/
[ ] │ │ ├── api.ts # request/response DTOs
[ ] │ │ ├── usage.ts # usage schema
[ ] │ │ └── mappers.ts # DTO ↔ domain translators
[ ] │ └── crypto.ts
[ ] │
[x] ├── components/ # shared presentational UI
[x] │ ├── kit/
[x] │ │ ├── layout/ # Container
[x] │ │ ├── data-display/ # Avatar, TerminalFrame
[x] │ │ ├── animation/ # Reveal
[x] │ │ └── typography/ # Prompt
[x] │ ├── vendor/
[x] │ │ └── ui-primitives/
[x] │ │ └── shadcn/ # button, avatar, card, \_vendor_utils
[x] │ └── index.ts
[ ] │
[x] ├── styles/
[x] │ ├── tailwind.preset.ts
[x] │ ├── tailwind.css
[x] │ ├── theme.ts
[x] │ └── ui/
[ ] │
[ ] ├── types/
[ ] │ ├── index.d.ts
[ ] │ └── global.d.ts
[ ] │
[ ] └── assets/
[ ] ├── icons/
[ ] └── images/

[x] tests/
[x] ├── \_fakes/ # deterministic test doubles (stubs only)
[x] ├── \_fixtures/ # static test data including wallet test data
[x] ├── unit/ # core rules + features with mocked ports
[x] ├── stack/ # stack tests against dev infrastructure
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
[x] ├── check-all.sh # structured check workflow with auto-fix mode
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

- **Imports**
  - `core` → only `core` (standalone).
  - `ports` → `@/core`, `@/types`.
  - `features` → `@/core|@/ports|@/shared|@/types|@/components` (never adapters|bootstrap|deep paths).
  - `app` → `@/features/*/services/*|@/bootstrap/container|@/contracts/*|@/shared|@/ports|@/styles` (never adapters|core).
  - `adapters` → `@/ports|@/shared|@/types` (never `app|features|core`).
  - `contracts` → `@/shared|@/types` only. Never imported by `features|ports|core`.
  - `bootstrap` → `@/adapters/server|@/ports` (DI composition only).
  - `mcp` → `@/contracts|@/bootstrap|@/features/*/services/*|@/ports` (never `app|components`).
- **ESLint**: flat config with path rules; `eslint-plugin-boundaries`.
- **Dependency-cruiser**: optional CI gate for graph violations.
- **Contracts**: `tests/contract` must pass for any adapter.
- **Env**: Zod-validated; build fails on invalid/missing.
- **Security**: middleware sets headers, verifies session or API key, rate-limits.
- **Financial Rails**: `NEXT_PUBLIC_DAO_WALLET_ADDRESS` is immutable and must match `repo-spec.yaml`. Validated by `scripts/validate-chain-config.ts`. Any payment logic must use this address.

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
- **Auth is centralized.** Use one `guard()` for session/API-key scopes, rate-limit, idempotency. No per-route ad-hoc checks.
- **Observability is mandatory.** Trace every call with `contractId`, `subject`, and cost/usage. Log denials.
- **Adapters are pure infra.** No UI, no business rules. Implement ports only. Promote creeping helpers into ports or core.

---

## Related Documentation

- [Environment & Stack Deployment Modes](ENVIRONMENTS.md) - All 6 deployment modes, environment variables, and when to use each
- [Database & Migration Architecture](DATABASES.md) - Database organization, migration strategies, and URL construction
- [Testing Strategy](TESTING.md) - Environment-based test adapters and stack testing approaches
- [Error Handling Architecture](ERROR_HANDLING_ARCHITECTURE.md) - Layered error translation patterns and implementation guidelines
- [CI/CD Pipeline Flow](CI-CD.md) - Branch model, workflows, and deployment automation
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - Infrastructure and deployment details
