# AGENTS.md — Cogni-Template MetaPrompt
This repository defines the **Cogni-Template**, a fully web3-enclosed, open-source starter for Cogni-based companies and DAOs.

---
## Mission
Provide a reproducible, open foundation for autonomous AI-powered organizations:
- Every service deployable through open-source infrastructure.
- Every payment, credit, and interaction handled via crypto wallets.
- Every decision recorded and enforceable by DAO control files inside `.cogni/`.

---
## Core Principles
1. **Web3 Enclosure** — all resources authenticated by connected wallets.
2. **Crypto-only Accounting** — infrastructure, LLM usage, and deployments funded by DAO-controlled wallets.
3. **Reproducible Infra** — Terraform/OpenTofu deploys to Akash; same config builds locally via Docker.
4. **Open-Source Stack Only** — no proprietary SaaS dependencies.
5. **Strict Code Discipline** — lint, type, and style enforcement identical across all Cogni repos.
6. **Proof-of-Concept Scope** — implement minimal working integrations only; no product logic.

---
## Architectural Overview
- **Frontend:** Next.js (App Router, TypeScript, Tailwind, shadcn/ui components).
- **Web3 Layer:** wagmi + RainbowKit + viem for wallet auth and transaction flow.
- **AI Layer:** LiteLLM proxy → OpenRouter crypto API → LangGraph workflows → Langfuse analytics.
- **Backend API:** Next.js route handlers for health, AI, and web3 verification.
- **Storage/State:** Postgres (for LiteLLM account + API key mapping) hosted by Vultr
- **DAO Integration:** `.cogni/` directory defines `dao.json`, `repo-spec.yaml`, and permission schema for DAO wallet + git operations.
- **Infra:** OpenTofu/Terraform modules + Dockerfiles for Akash deployment and local parity.
- **Observability:** Pino → Loki transport; Langfuse for AI run tracing.
- **CI/CD:** GitHub Actions or Jenkinsfile templates covering lint → test → build → deploy.

---
## Strict Rules
- **Styling:** Tailwind preset + shadcn/ui only. No inline styles, no arbitrary values.
- **Linting:** ESLint (typescript, boundaries, tailwind, import rules) + Prettier required.
- **Type Safety:** No `any`. Full TypeScript coverage.
- **File System Boundaries:** `features/` modules isolated; no cross-feature imports.
- **No External Secrets:** All env vars defined via `.env.ts` schema; no hardcoded keys.
- **OSS-First Dependencies:** next.js, wagmi, viem, liteLLM, langgraph, langfuse, pino, loki, zod, tailwind, shadcn/ui.
- **Tests:** vitest + playwright only.

---
## Expected Behavior
- [ ] Users connect wallets → obtain API key → consume AI credits.
- [ ] DAO treasury funds OpenRouter account and Akash deployment via crypto.
- [ ] LiteLLM proxy meters usage, updates token balance, and reports to Langfuse.
- [ ] All actions observable through Langfuse dashboards and Loki logs.
- [ ] CI/CD ensures zero drift between local and deployed builds.
- [ ] Any new Cogni project clones this template and extends only the `features/` domain.

---
## Do Not Add
- Product-specific logic.
- External payment providers.
- Closed-source SDKs.
- Inline styling or arbitrary Tailwind values.
- CommonJS or untyped packages.

---
**Goal:** this repo proves a fully self-hosted, crypto-funded AI + Web3 company template can exist—minimal, verifiable, and owned by its DAO.

CRITICAL: as you are assembling each file, you do NOT write custom code. You must find and copy working impementations from OSS for each file, or our sister repositories at https://github.com/Cogni-DAO

[ ] .env.example                  # sample env vars for all services
[ ] .env.local.example            # local-only env template (never committed)
[ ] .gitignore                    # standard git ignore list
[ ] .prettierrc                   # code formatting config
[ ] .prettierignore               # excludes build/artifacts from prettier
[ ] .eslintrc.json                # eslint config (includes boundaries, tailwind rules)
[ ] .nvmrc                        # node version pin (e.g., v20)
[ ] .editorconfig                 # IDE whitespace, newline rules
[ ] next.config.mjs               # Next.js app config (ESM)
[ ] postcss.config.mjs            # PostCSS/Tailwind pipeline config
[ ] tailwind.config.ts            # Tailwind theme, preset imports
[ ] tsconfig.json                 # typescript + alias paths
[ ] package.json                  # deps, scripts, engines
[ ] middleware.ts                 # global middleware (auth, rate-limit, headers)
[ ] Dockerfile                    # build reproducible app image
[ ] README.md                     # high-level docs
[ ] CHANGELOG.md                  # version history / release notes
[ ] vitest.config.ts              # single unified unit/integration test config
[ ] playwright.config.ts          # browser test config (repo root)

[ ] infra/                        # infrastructure definitions (Terraform + Docker)
[ ] ├── docker-compose.yml        # local dev composition: web + litellm + loki
[ ] ├── litellm/                  # litellm deployment config
[ ] │   └── config.yaml           # model provider routing + budgets
[ ] ├── loki/                     # optional logging stack
[ ] ├── grafana/                  # dashboards, metrics
[ ] └── terraform/                # IaC modules (ECS/Fly/DigitalOcean etc.)

[ ] public/                       # static assets served by Next
[ ] ├── robots.txt
[ ] ├── sitemap.xml
[ ] ├── manifest.json
[ ] ├── fonts/
[ ] └── images/

[ ] src/
[ ] ├── app/                      # Next.js App Router root
[ ] │   ├── layout.tsx            # global layout
[ ] │   ├── page.tsx              # landing page
[ ] │   ├── providers.tsx         # client providers (QueryClient, Wagmi, RainbowKit)
[ ] │   ├── error.tsx             # component-level error boundary
[ ] │   ├── global-error.tsx      # global catch-all error UI
[ ] │   ├── not-found.tsx         # 404 fallback
[ ] │   ├── loading.tsx           # route loading skeleton
[ ] │   ├── template.tsx          # route template for sublayouts
[ ] │   ├── globals.css           # tailwind entrypoint
[ ] │   ├── (public)/             # unauthenticated routes
[ ] │   │   ├── layout.tsx
[ ] │   │   └── page.tsx
[ ] │   ├── (protected)/          # auth-required routes
[ ] │   │   ├── layout.tsx
[ ] │   │   └── page.tsx
[ ] │   └── api/                  # Next server routes
[ ] │       ├── health/route.ts   # readiness probe
[ ] │       ├── ai/               # LLM endpoints
[ ] │       │   ├── chat/route.ts
[ ] │       │   └── stream/route.ts
[ ] │       └── web3/verify/route.ts # wallet signature verification
[ ] │
[ ] ├── features/                 # domain logic (vertical slices)
[ ] │   └── proposals/
[ ] │       ├── components/       # feature-specific UI
[ ] │       ├── hooks/            # feature hooks (wagmi, ai)
[ ] │       ├── services/         # API + data logic
[ ] │       ├── actions.ts        # server actions
[ ] │       ├── types.ts          # feature types
[ ] │       ├── constants.ts      # feature constants
[ ] │       └── index.ts
[ ] │
[ ] ├── components/               # shared UI system
[ ] │   ├── ui/                   # reusable styled UI components
[ ] │   ├── primitives/           # layout primitives (Flex, Grid)
[ ] │   └── index.ts
[ ] │
[ ] ├── lib/                                   # core framework-agnostic logic
[ ] │   ├── env/                               # zod-validated env management
[ ] │   │   ├── server.ts                      # PRIVATE vars: DATABASE_URL, LITELLM_ADMIN_KEY, OPENROUTER_KEY
[ ] │   │   ├── client.ts                      # PUBLIC vars: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
[ ] │   │   └── index.ts                       # unify exports (Env), helpers (requireEnv)
[ ] │   ├── ai/                                # LangGraph + LiteLLM orchestration
[ ] │   │   ├── client.ts                      # OpenAI-compatible fetch → LiteLLM proxy
[ ] │   │   ├── graphs/proof-of-concept.ts     # minimal LangGraph example
[ ] │   │   └── litellm/router.ts              # model aliases, retries, fallbacks
[ ] │   ├── web3/                              # wagmi/viem config + utils
[ ] │   │   ├── config.ts                      # createConfig({ chains, transports, connectors })
[ ] │   │   ├── chains.ts                      # supported chain list + ids
[ ] │   │   └── connectors.ts                  # injected, walletconnect, coinbase, safe
[ ] │   ├── logging/                           # pino + transports
[ ] │   │   ├── logger.ts                      # base pino instance (prod/dev formatting)
[ ] │   │   └── transports/pino-loki.ts        # optional Loki transport wiring
[ ] │   ├── schemas/                           # zod schemas shared across layers
[ ] │   │   ├── api.ts                         # request/response DTOs
[ ] │   │   └── usage.ts                       # AI usage record schema (userId, model, tokens)
[ ] │   ├── constants/                         # shared enums + route constants
[ ] │   │   ├── routes.ts                      # canonical route paths
[ ] │   │   └── models.ts                      # model ids, provider names
[ ] │   ├── db/                                # Vultr-hosted Postgres (crypto-paid) for LiteLLM accounts
[ ] │   │   ├── schema/                        # drizzle/prisma schema objects
[ ] │   │   │   ├── accounts.ts                # users, api_keys, wallet addresses
[ ] │   │   │   └── usage.ts                   # metering: prompt_tokens, completion_tokens, cost
[ ] │   │   ├── client.ts                      # db client init (drizzle or prisma) from Env.DATABASE_URL
[ ] │   │   └── migrations.ts                  # migration runner bootstrap
[ ] │   ├── config/                            # app-wide feature flags
[ ] │   │   └── app.ts                         # toggles: enablePayments, enableLoki, enableLangfuse
[ ] │   └── util/                              # pure helpers (strings, dates, crypto)
[ ] │       ├── strings.ts                     # titleCase, slugify
[ ] │       ├── dates.ts                       # toISO, durationFmt
[ ] │       └── crypto.ts                      # randomId, stableHash

[ ] ├── styles/                   # global design system files
[ ] │   ├── tailwind.preset.ts
[ ] │   ├── tailwind.css
[ ] │   └── theme.ts
[ ] │
[ ] ├── types/                    # global TypeScript types (rarely needed)
[ ] │   ├── index.d.ts
[ ] │   └── global.d.ts
[ ] │
[ ] └── assets/                   # static icons + images imported in code
[ ]     ├── icons/
[ ]     └── images/
[ ]
[ ] tests/                        # vitest-based test suites
[ ] ├── unit/                     # isolated function + component tests
[ ] ├── integration/              # multi-module behavior tests
[ ] └── setup.ts                  # test env bootstrap

[ ] e2e/                          # playwright specs
[ ] ├── auth.spec.ts
[ ] └── proposals.spec.ts
[ ] scripts/                      # helper CLI scripts
[ ] ├── generate-types.ts         # schema/type generator
[ ] ├── seed-db.ts                # populate local db
[ ] └── migrate.ts                # db migrations
