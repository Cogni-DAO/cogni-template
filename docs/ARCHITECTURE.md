# Cogni-Template Architecture

Strict **Hexagonal (Ports & Adapters)** for a full-stack TypeScript app on **Next.js App Router**.  
Purpose: a **fully open-source, crypto-only AI Application** with clean domain boundaries.  
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
Alistair Cockburn's [Hexagonal Architecture (System Design)](https://www.geeksforgeeks.org/system-design/hexagonal-architecture-system-design/)  
[Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - Infrastructure and CI/CD overview

### Vertical slicing

- Each feature is a slice under **features/** with its own `actions/`, `services/`, `components/`, `hooks/`, `types/`, `constants/`.
- Slices may depend on **core** and **ports** only. Never on other slices or **adapters**.
- Public surface changes in a slice must update that slice’s `AGENTS.md` and pass contract tests.

---

## System Layers (by directory)

- **src/bootstrap/** → Composition root (DI/factories), env (Zod), exports a container/getPort().
- **platform/** → Infrastructure tooling, CI/CD scripts, deployment automation, dev setup.
- **src/contracts/** → Operation contracts (id, Zod in/out, scopes, version). No logic.
- **src/mcp/** → MCP host bootstrap. Registers tools mapped 1:1 to contracts.
- **src/app/** → Delivery/UI + Next.js API routes. See import rules below.
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

[ ] .env.example # sample env vars for all services
[ ] .env.local.example # local-only env template (never committed)
[ ] .gitignore # standard git ignore list
[x] .nvmrc # node version pin (e.g., v20)
[x] .editorconfig # IDE whitespace/newline rules
[x] .prettierrc # code formatting config
[x] .prettierignore # exclude build/artifacts
[x] eslint.config.mjs # eslint config (boundaries, tailwind, import rules)
[x] commitlint.config.cjs # conventional commits enforcement
[x] tailwind.config.ts # Tailwind theme + presets
[x] tsconfig.json # typescript + alias paths
[x] tsconfig.eslint.json # eslint typescript config
[ ] package.json # deps, scripts, engines
[ ] Dockerfile # reproducible build
[ ] .dockerignore # ignore node_modules, artifacts, .env.\*
[x] LICENSE # OSS license
[x] CODEOWNERS # review ownership
[x] SECURITY.md # disclosure policy
[x] CONTRIBUTING.md # contribution standards
[ ] README.md # overview
[ ] CHANGELOG.md # releases
[ ] middleware.ts # headers, session/API-key guard, basic rate-limit
[x] vitest.config.mts # unit/integration
[x] playwright.config.ts # UI/e2e

[x] docs/
[x] ├── ARCHITECTURE.md # narrative + diagrams (longform)
[x] └── UI_IMPLEMENTATION_GUIDE.md # practical UI development workflows

[ ] platform/ # platform tooling and infrastructure
[ ] ├── infra/ # Infrastructure as Code and deployment configs
[ ] │ ├── providers/
[ ] │ │ ├── cherry/
[ ] │ │ │ ├── base/ # VM + static bootstrap (immutable)
[ ] │ │ │ └── app/ # SSH deploy + health gate (mutable)
[ ] │ │ └── akash/ # FUTURE provider
[ ] │ ├── services/
[ ] │ │ ├── litellm/ # LLM model routing + budgets
[ ] │ │ ├── langfuse/ # Observability stack
[ ] │ │ └── postgres/ # Database configs
[ ] │ ├── stacks/
[ ] │ │ └── local-compose/ # Local development stack
[ ] │ ├── files/ # Shared templates and utility scripts
[ ] │ └── modules/ # Reusable Terraform modules
[ ] ├── ci/
[ ] │ ├── github/ # README, env mapping, badges (no YAML workflows)
[ ] │ ├── jenkins/ # Jenkinsfile, controller notes  
[ ] │ └── scripts/ # Provider-agnostic build/push/deploy shims
[ ] ├── bootstrap/ # One-time dev machine setup installers
[ ] │ ├── install/ # Focused installer scripts (tofu, pnpm, docker, reuse)
[ ] │ └── README.md # Installation instructions
[ ] └── runbooks/ # Deploy, rollback, incident docs

[ ] public/
[ ] ├── robots.txt
[ ] ├── sitemap.xml
[ ] ├── manifest.json
[ ] ├── fonts/
[ ] └── images/

[x] src/
[x] ├── bootstrap/ # composition root (DI)
[ ] │ ├── container.ts # wires adapters → ports
[ ] │ └── config.ts # Zod-validated env
[ ] │
[x] ├── contracts/ # operation contracts (edge IO)
[ ] │ ├── AGENTS.md
[ ] │ └── \*.contract.ts
[ ] │
[x] ├── mcp/ # MCP host (future)
[ ] │ ├── AGENTS.md
[ ] │ └── server.stub.ts
[ ] │
[x] ├── app/ # delivery (Next UI + routes)
[x] │ ├── layout.tsx
[x] │ ├── page.tsx
[ ] │ ├── providers.tsx # QueryClient, Wagmi, RainbowKit
[ ] │ ├── globals.css
[ ] │ ├── (public)/
[ ] │ ├── (protected)/
[ ] │ └── api/
[ ] │ ├── health/route.ts
[ ] │ ├── ai/chat/route.ts # uses ports.AIService only
[ ] │ ├── balance/route.ts # exposes credits
[ ] │ ├── keys/create/route.ts # API-key issuance
[ ] │ └── web3/verify/route.ts # calls wallet verification port
[ ] │
[x] ├── features/ # application services
[x] │ ├── home/
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
[ ] │ ├── ai.port.ts # AIService { complete(): Promise<…> }
[ ] │ ├── wallet.port.ts # WalletService { verifySignature(...) }
[ ] │ ├── auth.port.ts # AuthService { issueNonce, verifySiwe, session }
[ ] │ ├── apikey.port.ts # ApiKeyRepo { create, revoke, findByHash }
[ ] │ ├── credits.port.ts # CreditsRepo { balance, credit, debit }
[ ] │ ├── usage.port.ts # UsageRepo { recordUsage, findByApiKey }
[ ] │ ├── telemetry.port.ts # Telemetry { trace, event, span }
[ ] │ ├── ratelimit.port.ts # RateLimiter { take(key, points) }
[ ] │ ├── clock.port.ts # Clock { now(): Date }
[ ] │ └── rng.port.ts # Rng { uuid(): string }
[ ] │
[x] ├── adapters/ # infrastructure implementations (no UI)
[ ] │ ├── server/
[ ] │ │ ├── ai/litellm.adapter.ts # AIService impl
[ ] │ │ ├── auth/siwe.adapter.ts # nonce + session store
[ ] │ │ ├── wallet/verify.adapter.ts # viem-based signature checks
[ ] │ │ ├── apikey/drizzle.repo.ts # API keys persistence
[ ] │ │ ├── credits/drizzle.repo.ts # atomic credit/usage accounting
[ ] │ │ ├── db/drizzle.client.ts # drizzle instance
[ ] │ │ ├── telemetry/langfuse.adapter.ts # traces + spans
[ ] │ │ ├── logging/pino.adapter.ts # log transport
[ ] │ │ ├── ratelimit/db-bucket.adapter.ts # simple token-bucket
[ ] │ │ ├── clock/system.adapter.ts # system clock
[ ] │ │ └── rng/uuid.adapter.ts # uuid generator
[ ] │ ├── worker/ # background jobs (future)
[ ] │ └── cli/ # command-line adapters (future)
[ ] │
[x] ├── shared/ # small, pure, framework-agnostic
[x] │ ├── env/
[x] │ │ ├── server.ts # Zod-validated private vars
[x] │ │ ├── client.ts # validated public vars
[x] │ │ └── index.ts
[ ] │ ├── schemas/
[ ] │ │ ├── api.ts # request/response DTOs
[ ] │ │ ├── usage.ts # usage schema
[ ] │ │ └── mappers.ts # DTO ↔ domain translators
[ ] │ ├── constants/
[ ] │ │ ├── routes.ts
[ ] │ │ └── models.ts
[ ] │ └── util/
[ ] │ ├── strings.ts
[ ] │ ├── dates.ts
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
[x] ├── \_fixtures/ # static test data (stubs only)
[x] ├── unit/ # core rules + features with mocked ports (structure only)
[x] ├── integration/ # adapters against local services (stubs only)
[x] ├── contract/ # reusable port contract harness (stubs only)
[x] └── setup.ts

[x] e2e/
[ ] ├── auth.spec.ts
[ ] └── ai.spec.ts

[x] scripts/
[ ] ├── generate-types.ts
[ ] ├── validate-agents-md.mjs
[ ] ├── seed-db.ts
[ ] └── migrate.ts

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

- [CI/CD Pipeline Flow](CI-CD.md) - Branch model, workflows, and deployment automation
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - Infrastructure and deployment details
