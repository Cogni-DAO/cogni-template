# Environment & Stack Deployment Modes

This document describes the 6 deployment modes (from app-only to full production stack), their purposes, commands, environment variable loading patterns, and how they interconnect.

## When to Use Each Mode

**App Only** - Pure UI development, component work, no backend needed  
**Host Stack Development** - Daily development with real external services, fastest feedback. Docker stack with App running as dev server accepting live updates  
**Host Stack Test** - Development testing with fake adapters, predictable responses, and test DB to be cleared on test runs
**Docker Dev Stack** - Simulate real production-like local deployment. All services built in containers
**Docker Dev Stack Test** - CI/CD testing with fake adapters, production simulation but deterministic  
**Docker Stack** - Full production deployment, hardened compose, black box e2e testing

## Key Environment Distinction

**`APP_ENV=production`** (Development modes)

- Real adapters active
- External API calls to LiteLLM, OpenRouter, etc.
- Requires valid API keys and external connectivity
- Used in: `pnpm dev:stack`, `pnpm docker:dev:stack`

**`APP_ENV=test`** (Testing modes)

- Fake adapters active
- Deterministic, predictable responses
- No external API calls or dependencies
- Used in: `pnpm dev:stack:test`, `pnpm docker:test:stack`

## Stack Deployment Modes

**Command Summary:**

1. **App Only**: `pnpm dev` - Next.js only, no infrastructure. UI-only change validation.
2. **Host Development**: `pnpm dev:stack` - Next.js + host postgres on :5432
3. **Host Stack Test**: `pnpm dev:stack:test` + `pnpm test:stack:dev` - Test app + host postgres on :5432
4. **Docker Dev Stack**: `pnpm docker:dev:stack` - All services containerized, postgres exposed on :55432
5. **Docker Dev Stack Test**: `pnpm docker:test:stack` + `pnpm test:stack:docker` - All services containerized in test mode
6. **Docker Stack**: `pnpm docker:stack` - Full production deployment (local: `dotenv -e .env.local -- pnpm docker:stack`)

## Environment Variable System

**Base Configuration:** `.env.local`

- Database pieces: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST=localhost`, `DB_PORT=5432`, `POSTGRES_DB=cogni_template_dev`
- App settings: `APP_ENV=production`, `LITELLM_MASTER_KEY`, etc.

**Test Overrides:** `.env.test`

- `APP_ENV=test` (enables fake adapters)
- `POSTGRES_DB=cogni_template_stack_test` (separate test database)

**Loading Pattern:** `dotenv -e .env.test -e .env.local`

- `.env.test` loads first and overrides `.env.local` values
- Test values like `APP_ENV=test` take precedence over base `APP_ENV=production`

## Mode Details

### 1. App Only (`pnpm dev`)

**Purpose:** Fast UI development with no infrastructure dependencies

**Infrastructure:**

- Next.js dev server only
- No database, no external services
- Routes that require database/services will error

**Environment:** Minimal - may not load full environment  
**Use Case:** Pure UI/frontend development, component work, styling changes

**Commands:**

```bash
pnpm dev    # Just Next.js dev server
```

### 2. Host Stack Development (`pnpm dev:stack`)

**Purpose:** Fast local development workflow

**Infrastructure:**

- Next.js runs directly on host (no containers)
- PostgreSQL container on `localhost:5432`
- LiteLLM container on `localhost:4000`

**Environment:** Uses `.env.local` only

- `APP_ENV=production` (real adapters)
- `POSTGRES_DB=cogni_template_dev`
- `DB_HOST=localhost` (connects to containerized postgres)

**Commands:**

```bash
pnpm dev:stack    # Start infra containers + Next.js dev server
```

### 3. Host Stack Test (`pnpm dev:stack:test` + `pnpm test:stack:dev`)

**Purpose:** Stack testing with real app server but fake adapters

**Infrastructure:**

- Next.js runs directly on host in test mode
- PostgreSQL container on `localhost:5432`
- LiteLLM container on `localhost:4000`

**Environment:** `.env.local` + `.env.test` override

- `APP_ENV=test` (fake adapters for deterministic testing)
- `POSTGRES_DB=cogni_template_stack_test` (separate test database)
- `DB_HOST=localhost`, `TEST_BASE_URL=http://localhost:3000/`

**Commands:**

```bash
pnpm dev:stack:test           # Start test app server
pnpm test:stack:setup         # Create test database + migrations
pnpm test:stack:dev           # Run stack tests against host app
```

### 4. Docker Dev Stack (`pnpm docker:dev:stack`)

**Purpose:** Production-like deployment for integration testing

**Infrastructure:**

- All services containerized (app, postgres, litellm, caddy)
- Caddy provides HTTPS on `https://localhost/`
- PostgreSQL exposed on `localhost:55432` for debugging

**Environment:** Uses `.env.local` passed to Docker Compose

- `APP_ENV=production` (real adapters)
- `POSTGRES_DB=cogni_template_dev`
- `DB_HOST=postgres` (inter-container communication)

**Commands:**

```bash
pnpm docker:dev:stack         # Start all containers
pnpm docker:dev:stack:build   # Build and start
pnpm docker:dev:stack:migrate # Run migrations in container
```

### 5. Docker Dev Stack Test (`pnpm docker:test:stack` + `pnpm test:stack:docker`)

**Purpose:** Full containerized testing - used in CI

**Infrastructure:**

- All services containerized in test mode
- Caddy provides HTTPS on `https://localhost/`
- PostgreSQL exposed on `localhost:55432` for test access

**Environment:** `dotenv -e .env.test -e .env.local` passed to Docker Compose

- `APP_ENV=test` (fake adapters)
- `POSTGRES_DB=cogni_template_stack_test`
- `DB_HOST=postgres` (for containers), `localhost:55432` (for host tests)

**Commands:**

```bash
pnpm docker:test:stack:build    # Build and start containers in test mode
pnpm docker:test:stack:migrate  # Run migrations in test container
pnpm test:stack:docker          # Run tests against containerized app
```

**Test Environment Overrides:**

```bash
# test:stack:docker sets these for the test runner:
DB_HOST=localhost DB_PORT=55432 TEST_BASE_URL=https://localhost/
```

### 6. Docker Stack (`pnpm docker:stack`)

**Purpose:** Full production hardened deployment for preview and production environments

**Infrastructure:**

- All services containerized with hardened compose file
- Only accessible via Caddy HTTPS
- No debug ports exposed
- Production security configuration

**Environment:** Uses environment variables from system/CI (no env files)

- Production deployments get secrets from CI/CD environment
- Local testing: prefix commands with `dotenv -e .env.local --`

**Commands:**

```bash
# Production (uses CI environment variables):
pnpm docker:stack         # Start production stack
pnpm docker:stack:build   # Build and start production
pnpm docker:stack:migrate # Run migrations in production container

# Local testing (loads .env.local):
dotenv -e .env.local -- pnpm docker:stack         # Local production simulation
dotenv -e .env.local -- pnpm docker:stack:build   # Build and start locally
dotenv -e .env.local -- pnpm docker:stack:migrate # Run migrations locally
```

**Use Cases:**

- Production deployments (CI/CD)
- Preview deployments
- Black box end-to-end testing
- Local production simulation

## Database URL Construction

All modes use `buildDatabaseUrl()` to construct URLs from pieces:

```typescript
// Host modes
postgresql://postgres:postgres@localhost:5432/cogni_template_stack_test

// Container modes (internal)
postgresql://postgres:postgres@postgres:5432/cogni_template_stack_test

// Host tests -> container postgres
postgresql://postgres:postgres@localhost:55432/cogni_template_stack_test
```

## Port Summary

| Service    | App Only         | Host Stack Development | Host Stack Test  | Docker Dev Stack    | Docker Dev Stack Test | Docker Stack        |
| ---------- | ---------------- | ---------------------- | ---------------- | ------------------- | --------------------- | ------------------- |
| App        | `localhost:3000` | `localhost:3000`       | `localhost:3000` | `https://localhost` | `https://localhost`   | `https://localhost` |
| PostgreSQL | None             | `localhost:5432`       | `localhost:5432` | `localhost:55432`   | `localhost:55432`     | Internal only       |
| LiteLLM    | None             | `localhost:4000`       | `localhost:4000` | Internal only       | Internal only         | Internal only       |

**Note:** Docker Dev Stack modes expose PostgreSQL on `55432` for debugging and test access. Full production Docker Stack keeps all services internal. All containers communicate internally via `postgres:5432`.
