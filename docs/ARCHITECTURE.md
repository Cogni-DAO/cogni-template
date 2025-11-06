# Cogni-Template Architecture

Strict **Hexagonal (Ports & Adapters)** for a full-stack TypeScript app on **Next.js App Router**.  
Purpose: a **fully open-source, crypto-only AI Application** with clean domain boundaries.  
**Web3 Enclosure** — all resources authenticated by connected wallets.  
**Crypto-only Accounting** — infrastructure, LLM usage, and deployments funded by DAO-controlled wallets.  
Every dependency points inward.

---

## System Layers (by directory)

## System Layers (by directory)

- **src/bootstrap/** → Composition root (DI/factories), env (Zod), exports a container/getPort().
- **src/app/** → Delivery/UI + Next.js API routes. Imports only **features/ports/shared**.
- **src/features/** → Vertical slices (use cases): `proposals/`, `auth/`… orchestrate **core** via **ports**.
- **src/ports/** → Contracts/interfaces only.
- **src/core/** → Pure domain. No I/O/time/RNG; inject via ports.
- **src/adapters/** → Infra implementations of ports. No UI.
  - `server/` (drizzle, langfuse, pino, siwe, viem, litellm, rate-limit, clock, rng)
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

### Intent anchors (keep in mind)

- Hexagonal: `app → features → ports → core` and `adapters → ports → core`. Dependencies point inward.
- 100% OSS stack. Strict lint/type/style. Env validated at boot. Contract tests required for every adapter.
- **Proof-of-Concept Scope** — implement minimal working integrations only; no product logic.

### Vertical slicing

- Each feature is a slice under **features/** with its own `actions/`, `services/`, `components/`, `hooks/`, `types/`, `constants/`.
- Slices may depend on **core** and **ports** only. Never on other slices or **adapters**.
- Public surface changes in a slice must update that slice’s `AGENTS.md` and pass contract tests.

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
[ ] LICENSE # OSS license
[ ] CODEOWNERS # review ownership
[ ] SECURITY.md # disclosure policy
[ ] CONTRIBUTING.md # contribution standards
[ ] README.md # overview
[ ] CHANGELOG.md # releases
[ ] middleware.ts # headers, session/API-key guard, basic rate-limit
[ ] vitest.config.ts # unit/integration
[ ] playwright.config.ts # UI/e2e

[ ] docs/
[ ] └── ARCHITECTURE.md # narrative + diagrams (longform)

[ ] infra/ # infra (minimal → full)
[ ] ├── docker-compose.yml # web + postgres + litellm + langfuse
[ ] ├── litellm/config.yaml # model routing + budgets
[ ] ├── langfuse/ # self-hosted observability
[ ] └── terraform/ # IaC modules (Akash/OpenTofu)

[ ] public/
[ ] ├── robots.txt
[ ] ├── sitemap.xml
[ ] ├── manifest.json
[ ] ├── fonts/
[ ] └── images/

[ ] src/
[ ] ├── bootstrap/ # composition root (DI)
[ ] │ ├── container.ts # wires adapters → ports
[ ] │ └── config.ts # Zod-validated env
[ ] │
[ ] ├── app/ # delivery (Next UI + routes)
[ ] │ ├── layout.tsx
[ ] │ ├── page.tsx
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
[ ] ├── features/ # application services
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
[ ] ├── core/ # domain: entities, rules, invariants
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
[ ] ├── ports/ # contracts (minimal interfaces)
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
[ ] ├── adapters/ # infrastructure implementations (no UI)
[ ] │ ├── server/
[ ] │ │ ├── ai/litellm.adapter.ts # AIService impl
[ ] │ │ ├── auth/siwe.adapter.ts # nonce + session store
[ ] │ │ ├── wallet/verify.adapter.ts # viem-based signature checks
[ ] │ │ ├── apikey/drizzle.repo.ts # API keys persistence
[ ] │ │ ├── credits/drizzle.ledger.ts # atomic credit/usage accounting
[ ] │ │ ├── db/drizzle.client.ts # drizzle instance
[ ] │ │ ├── telemetry/langfuse.adapter.ts # traces + spans
[ ] │ │ ├── logging/pino.adapter.ts # log transport
[ ] │ │ ├── ratelimit/db-bucket.adapter.ts # simple token-bucket
[ ] │ │ ├── clock/system.adapter.ts # system clock
[ ] │ │ └── rng/uuid.adapter.ts # uuid generator
[ ] │ ├── worker/ # background jobs (future)
[ ] │ └── cli/ # command-line adapters (future)
[ ] │
[ ] ├── shared/ # small, pure, framework-agnostic
[ ] │ ├── env/
[ ] │ │ ├── server.ts # Zod-validated private vars
[ ] │ │ ├── client.ts # validated public vars
[ ] │ │ └── index.ts
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
[ ] ├── components/ # shared presentational UI
[ ] │ ├── ui/
[ ] │ ├── primitives/
[ ] │ └── index.ts
[ ] │
[ ] ├── styles/
[ ] │ ├── tailwind.preset.ts
[ ] │ ├── tailwind.css
[ ] │ └── theme.ts
[ ] │
[ ] ├── types/
[ ] │ ├── index.d.ts
[ ] │ └── global.d.ts
[ ] │
[ ] └── assets/
[ ] ├── icons/
[ ] └── images/

[ ] tests/
[ ] ├── unit/ # core rules + features with mocked ports
[ ] ├── integration/ # adapters against local services
[ ] ├── contract/ # reusable port contract harness
[ ] └── setup.ts

[ ] e2e/
[ ] ├── auth.spec.ts
[ ] └── ai.spec.ts

[ ] scripts/
[ ] ├── generate-types.ts
[ ] ├── seed-db.ts
[ ] └── migrate.ts

---

## Enforcement Rules

- **Imports**
  - `core` → only `core` (standalone).
  - `ports` → `core`.
  - `features` → `ports|core|shared`.
  - `app` → `features|ports|shared` (never adapters).
  - `adapters` → `ports|shared` (never `app|features|core`).
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
**Adapters (integration):** run contract + real-service tests in `tests/integration/<adapter-area>/**`.  
**Routes (API e2e):** HTTP-level tests hitting Next API routes in `e2e/**`.  
**Setup:** common mocks and config in `tests/setup.ts`.

---

## Notes

- No UI in `adapters/`. Client wallet connect remains in `app/providers.tsx` and hooks.
- Keep `shared/` small and pure. Promote growing parts into `core` or a new `port`.
- Inject `Clock` and `Rng` via ports to keep domain deterministic.
