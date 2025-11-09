# Cogni-Template Implementation Plan

## Strategic Implementation Order

Based on current Next.js baseline and leverage analysis, this plan prioritizes CI-first approach with atomic, testable stages.

### ✅ Current Baseline (Complete)

- [x] Next.js App Router with TypeScript
- [x] ESLint + Prettier configuration
- [x] Basic Tailwind CSS setup
- [x] Initial project structure

---

## Stage 1: Core Configuration Hardening ✅

**Goal**: Enforce strict code discipline with comprehensive linting rules

### Files to Create/Update:

- [x] `eslint.config.mjs` - Add typescript, boundaries, tailwind, import rules (flat config)
- [x] `.prettierrc` - Standardize code formatting
- [x] `.prettierignore` - Exclude build artifacts
- [x] `.editorconfig` - IDE whitespace and newline consistency
- [x] `.nvmrc` - Pin Node.js version (v20)
- [x] `.gitignore` - Standard git ignore list (was already present)
- [x] Update `package.json` scripts for typecheck, husky, lint-staged
- [x] `tsconfig.eslint.json` - ESLint-specific TypeScript configuration
- [x] `tailwind.config.ts` - Minimal config for plugin compatibility

### Validation:

- [x] `pnpm lint` passes with zero warnings
- [x] `pnpm typecheck` passes
- [x] All files format consistently

---

## Stage 2: Early DAO Governance + CI Foundation

**Goal**: Install cogni-git-review, have a repo-spec and simple CI github action.

### Files to Create:

- [x] `.cogni/repo-spec.yaml` - Repository rules and governance (user handled)
- [x] `.github/workflows/ci.yml` - Basic CI pipeline (user handled)

### Validation:

- [x] GitHub Actions run on push/PR
- [x] Pre-commit hooks block bad commits
- [x] Branch protection enforces CI checks

---

## Stage 3: Environment & Type Safety ✅

**Goal**: Bulletproof environment variable management with zod validation

### Files to Create:

- [x] `.env.example` - Sample environment variables (with DATABASE_URL using sslmode=require)
- [x] `.env.local.example` - Local-only template (never committed)
- [x] `src/shared/env/server.ts` - Private vars (DATABASE_URL, API keys)
- [x] `src/shared/env/client.ts` - Public vars (NEXT*PUBLIC*\*)
- [x] `src/shared/env/index.ts` - Unified exports and helpers
- [x] `src/shared/env/AGENTS.md` - Documentation for env management
- [x] Update `.gitignore` - Allow .env.example files to be committed
- [x] Add `zod` dependency to package.json
- [x] Path aliases already configured in tsconfig.json (@shared/\*)

### Validation:

- [x] Invalid env vars cause build failures (via Zod validation)
- [x] Type safety for all environment access
- [x] Clear separation of client/server variables
- [x] Development mode allows linting without production secrets
- [x] Cross-field validation (Loki, Langfuse all-or-nothing)
- [x] Context-aware env object with runtime guards

---

## Stage 4: Design System + Lint Enforcement

**Goal**: Tailwind preset with shadcn/ui and strict style rules

### Files to Create:

- [x] `tailwind.config.ts` - Custom preset with design tokens
- [x] `src/styles/tailwind.preset.ts` - Reusable theme configuration
- [x] `src/styles/tailwind.css` - Global styles and utilities
- [x] `src/styles/theme.ts` - Theme variables and constants
- [x] Update `.eslintrc.json` - Add tailwind rules banning arbitrary values
- [x] Install shadcn/ui CLI and base components

### Validation:

- [x] Lint blocks arbitrary Tailwind classes
- [x] shadcn/ui components render correctly
- [x] Consistent theme variables across components

---

## Stage 5: Core Dependencies + Providers

**Goal**: Install and wire essential web3, AI, and utility packages

### Files to Create/Update:

- [ ] `package.json` - Add wagmi, viem, RainbowKit, LiteLLM, zod, etc.
- [ ] `src/app/providers.tsx` - Client providers (QueryClient, Wagmi, RainbowKit)
- [ ] `src/lib/web3/config.ts` - wagmi configuration
- [ ] `src/lib/web3/chains.ts` - Supported blockchain networks
- [ ] `src/lib/web3/connectors.ts` - Wallet connector setup
- [ ] `src/lib/logging/logger.ts` - Pino logger configuration

### Validation:

- [ ] All providers render without errors
- [ ] Wallet connection UI appears
- [ ] Logger outputs structured logs

---

## Stage 6: Minimal Routes + Health Check

**Goal**: Basic routing structure with operational endpoints

### Files to Create:

- [ ] `src/app/api/health/route.ts` - Readiness/liveness probe
- [ ] `src/app/(public)/layout.tsx` - Unauthenticated route layout
- [ ] `src/app/(public)/page.tsx` - Public landing page
- [ ] `src/app/(protected)/layout.tsx` - Auth-required route layout
- [ ] `src/app/(protected)/page.tsx` - Protected dashboard
- [ ] `middleware.ts` - Global middleware (auth, rate-limit, headers)

### Validation:

- [ ] `/api/health` returns 200 OK
- [ ] Route groups render correctly
- [ ] Middleware processes requests

---

## Stage 7: Web3 Integration

**Goal**: Wallet connection and signature verification

### Files to Create:

- [ ] `src/app/api/web3/verify/route.ts` - Signature verification endpoint
- [ ] `src/features/wallet/components/ConnectButton.tsx` - Wallet connection UI
- [ ] `src/features/wallet/hooks/useWalletAuth.ts` - Authentication logic
- [ ] `src/features/wallet/services/verification.ts` - Signature validation
- [ ] `src/lib/schemas/api.ts` - Request/response DTOs

### Validation:

- [ ] Wallet connects successfully
- [ ] Signature verification works
- [ ] Protected routes require wallet auth

---

## Stage 8: AI Layer Proof of Concept

**Goal**: LiteLLM proxy with basic LangGraph workflow

### Files to Create:

- [ ] `src/app/api/ai/chat/route.ts` - Chat completion endpoint
- [ ] `src/app/api/ai/stream/route.ts` - Streaming response handler
- [ ] `src/lib/ai/client.ts` - OpenAI-compatible client → LiteLLM proxy
- [ ] `src/lib/ai/graphs/proof-of-concept.ts` - Minimal LangGraph example
- [ ] `src/lib/ai/litellm/router.ts` - Model routing and fallbacks
- [ ] `infra/litellm/config.yaml` - LiteLLM proxy configuration

### Validation:

- [ ] LiteLLM proxy responds to API calls
- [ ] Chat endpoint returns completions
- [ ] Usage tracking works

---

## Stage 9: Database Integration (Vultr Postgres)

**Goal**: Crypto-paid Postgres for user accounts and usage tracking

### Files to Create:

- [ ] `src/lib/db/client.ts` - Database client from DATABASE_URL
- [ ] `src/lib/db/schema.ts` - Single schema file (accounts, api_keys, usage tables)
- [ ] `src/lib/db/migrations.ts` - Migration runner
- [ ] `src/lib/schemas/usage.ts` - Usage record zod schemas
- [ ] `scripts/seed-db.ts` - Development data seeding
- [ ] `scripts/migrate.ts` - Database migration runner

### Validation:

- [ ] Database connection successful
- [ ] Migrations run without errors
- [ ] Usage data persists correctly

---

## Stage 10: Testing Framework

**Goal**: Comprehensive test coverage with vitest and playwright

### Files to Create:

- [x] `vitest.config.mts` - Unit/integration test configuration
- [ ] `playwright.config.ts` - End-to-end test configuration
- [x] `tests/setup.ts` - Test environment bootstrap
- [x] `tests/_fakes/` - Deterministic test doubles (FakeClock, FakeRng, FakeTelemetry)
- [x] `tests/_fixtures/` - Static test data
- [x] `tests/contract/` - Port contract test framework with harness
- [x] `tests/unit/` - Unit test directory structure
- [x] `tests/integration/` - Integration test directory structure (stubs only)
- [ ] `tests/unit/env.test.ts` - Environment validation tests
- [ ] `tests/integration/api.test.ts` - API endpoint tests
- [ ] `e2e/auth.spec.ts` - Authentication flow tests
- [ ] `e2e/proposals.spec.ts` - Feature workflow tests
- [ ] Update GitHub Actions to run tests

### Validation:

- [ ] Unit tests pass in CI
- [ ] Integration tests cover API routes
- [ ] E2E tests validate user workflows

---

## Stage 11: Infrastructure as Code

**Goal**: Docker, docker-compose, and deployment configurations

### Files to Create:

- [ ] `Dockerfile` - Production container build
- [ ] `infra/docker-compose.yml` - Local development stack
- [ ] `infra/loki/` - Logging stack configuration
- [ ] `infra/grafana/` - Metrics and dashboards
- [ ] `infra/terraform/` - Cloud deployment modules
- [ ] Update CI to build and deploy containers

### Validation:

- [ ] Local stack runs with docker-compose
- [ ] Production build succeeds
- [ ] Deployment pipeline works

---

## Stage 12: Full DAO Runtime Integration

**Goal**: Complete DAO governance with treasury and deployment controls

### Files to Create:

- [ ] `scripts/generate-types.ts` - Schema/type generation
- [ ] `src/features/proposals/` - DAO proposal management feature
- [ ] `src/lib/config/app.ts` - Feature flags and toggles
- [ ] Integration with .cogni files for runtime governance
- [ ] Treasury → OpenRouter → Akash deployment flow

### Validation:

- [ ] DAO governance works end-to-end
- [ ] Treasury controls deployments
- [ ] All systems integrate correctly

---

## Success Criteria

Each stage must satisfy:

1. **Atomic**: Can be developed and tested independently
2. **Validated**: Has clear success/failure criteria
3. **Committed**: Clean git history with working state
4. **CI-Protected**: All changes validated by automated checks
5. **OSS-Compliant**: Uses only open-source dependencies
6. **Type-Safe**: Full TypeScript coverage, no `any` types
