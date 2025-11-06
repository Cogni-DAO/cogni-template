# Cogni-Template Architecture

Strict **Hexagonal (Ports & Adapters)** for a full-stack TypeScript app on **Next.js App Router**.  
Purpose: a **fully open-source, crypto-funded AI template** with clean domain boundaries.  
Every dependency points inward.

---

## Core Intent

- **Layers:** `app → features → ports → core`, and `adapters → ports → core`.
- **Web3:** Wallet auth and payment via connected wallets.
- **AI:** **LiteLLM → OpenRouter (crypto-paid)**; LangGraph deferred to v2.
- **Observability:** **Langfuse** via telemetry port, logs via **Pino**, optional **Loki** later.
- **Data:** **Drizzle + Postgres** for state.
- **Infra:** **Docker Compose** first; **OpenTofu/Terraform → Akash** later.
- **Discipline:** 100% OSS, strict lint/type/style rules, contract tests per port.

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
[ ] ├── features/ # application services (no adapters)
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
