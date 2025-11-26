# Database & Migration Architecture

This document describes database organization, migration strategies, and database-specific configuration patterns.

**For stack deployment modes and environment details, see [ENVIRONMENTS.md](ENVIRONMENTS.md).**

## Quick Start: Primary Development Workflow

**If you only need to know ONE thing:**

```bash
# Daily development (fake adapters, no external API calls)
pnpm dev:stack:test           # Start app + infrastructure in test mode
pnpm dev:stack:test:setup     # First time: create test DB + migrate
pnpm test:stack:dev           # Run stack tests
```

**For real AI calls (production adapters):**

```bash
pnpm dev:stack                # Same as above, but hits real LiteLLM/OpenRouter
```

**Docker stacks:** Used primarily in CI, not required for daily development. See sections 2.3-2.5 for details.

---

## Database Separation

**Database Security Model**: Two-user PostgreSQL architecture separating administrative and application access.

**Development Database:** `${APP_DB_NAME}` (typically `cogni_template_dev`)  
**Test Database:** `${APP_DB_NAME}` (typically `cogni_template_stack_test`)
**Production Database:** `${APP_DB_NAME}` (typically `cogni_template_preview` or `cogni_template_production`)

All stack deployment modes use the same migration tooling but connect to appropriate database instances. Test environments always use the test database and reset it between test runs.

## Database Provisioning (Infrastructure-as-Code)

To ensure a repeatable and consistent database state across environments (especially for `docker compose` setups), we use a dedicated provisioning service.

### The `db-provision` Service

In `docker-compose.dev.yml`, the `db-provision` service handles:

1.  **Idempotent Database Creation**: Automatically creates `APP_DB_NAME` (e.g., `cogni_template_dev`) and `LITELLM_DB_NAME` (e.g., `litellm_dev`) if they do not exist.
2.  **Isolation**: Ensures LiteLLM has its own isolated database to prevent schema collisions with the main application.

This service is gated behind the `bootstrap` profile and runs only when explicitly requested or on fresh stack bring-up if configured.

### Development vs. Production Roles

- **Development (MVP):** For simplicity, the local development environment connects to Postgres using the `superuser` (`postgres`) credentials. This avoids complex role management during rapid iteration but means the app has theoretical power to DROP tables.
  - _Note:_ `provision.sh` in dev currently skips role hardening to align with this MVP choice.
- **Production:** Production deployments MUST use the Two-User Model described below (Root vs. App User) with restricted privileges. The application user should NOT have `DROP` or `TRUNCATE` permissions on the schema in production.

## Current Schema Baseline (Phase 0)

- **billing_accounts** — `id` (text PK), `owner_user_id` (unique), `balance_credits BIGINT DEFAULT 0`, timestamps.
- **virtual_keys** — `id` (uuid PK), `billing_account_id` (FK → billing_accounts, cascade), `litellm_virtual_key`, labels/flags, timestamps.
- **credit_ledger** — `id` (uuid PK), `billing_account_id` (FK → billing_accounts, cascade), `virtual_key_id` (FK → virtual_keys, cascade, NOT NULL), `amount BIGINT`, `balance_after BIGINT DEFAULT 0`, `reason`, optional reference/metadata, timestamps.
- Credits are stored as whole units (Stage 6.5 invariant: 1 credit = $0.001 USD, 1 USDC = 1,000 credits). Keep all arithmetic integer-only; no fractional credits.
- Optional: make `credit_ledger.virtual_key_id` nullable if you need ledger rows that are not tied to a specific virtual key (e.g., admin adjustments). Not required for the MVP if every entry is keyed.

## Database URL Construction

All environments construct PostgreSQL URLs from individual pieces using the `buildDatabaseUrl()` helper:

```typescript
// src/shared/env/db-url.ts
export function buildDatabaseUrl(env: DbEnvInput): string {
  // Uses application database credentials (not root)
  const user = env.POSTGRES_USER; // Maps to APP_DB_USER in containers
  const password = env.POSTGRES_PASSWORD; // Maps to APP_DB_PASSWORD in containers
  const db = env.POSTGRES_DB; // Maps to APP_DB_NAME in containers
  const host = env.DB_HOST; // No default - must be explicit
  const port =
    typeof env.DB_PORT === "number"
      ? env.DB_PORT
      : Number(env.DB_PORT ?? "5432");

  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}
```

**Environment Examples:**

- **Host development:** `postgresql://postgres:postgres@localhost:55432/cogni_template_dev`
- **Host testing:** `postgresql://postgres:postgres@localhost:5432/cogni_template_stack_test`
- **Container (internal):** `postgresql://cogni_app_preview:password@postgres:5432/cogni_template_preview`
- **Host tests → container:** `postgresql://postgres:postgres@localhost:55432/cogni_template_stack_test`

## Database Security Architecture

**Two-User Model**: Production deployments use separate PostgreSQL users for administration and application access:

- **Root User** (`POSTGRES_ROOT_USER`): Database server administration, user/database creation
- **Application User** (`APP_DB_USER`): Runtime application connections, limited to application database

**Container Configuration**: The postgres container runs initialization scripts on first startup:

- Creates application database (`APP_DB_NAME`)
- Creates application user (`APP_DB_USER`) with database-specific permissions
- Application connects via `DATABASE_URL` using app user credentials

**Environment Variable Mapping**:

```bash
# Container postgres service
POSTGRES_USER=${POSTGRES_ROOT_USER}      # Container's POSTGRES_USER
POSTGRES_PASSWORD=${POSTGRES_ROOT_PASSWORD}
POSTGRES_DB=postgres                      # Default database for user creation

# Application service
POSTGRES_USER=${APP_DB_USER}             # App's POSTGRES_USER
POSTGRES_PASSWORD=${APP_DB_PASSWORD}
POSTGRES_DB=${APP_DB_NAME}
```

## 2. Migration Strategy

**Core Principle:** For any environment, migrations run against the same `DATABASE_URL` the app uses in that environment.

**Migration Commands:**

- `pnpm dev:stack:db:migrate` - Host environments (uses dotenv to load env files)
- `pnpm db:migrate:container` - Container environments (uses pre-loaded env vars)

### 2.1 Local Development

**Database:** `cogni_template_dev`

**Environment:** `.env.local`

**Commands:**

```bash
pnpm dev:stack:db:migrate    # Migrate dev database
pnpm dev:stack               # Start app using same database
```

### 2.2 Host Stack Tests

**Database:** `cogni_template_stack_test` (host Postgres)

**Environment:** `.env.local` + `.env.test` (override)

**Commands:**

```bash
pnpm dev:stack:test:setup    # Create database + run migrations
pnpm test:stack:dev          # Run vitest stack tests against host app
pnpm dev:stack:test:reset    # Nuclear reset (drop + recreate + migrate)
```

**Details:**

- `dev:stack:test:setup` creates `cogni_template_stack_test` and runs migrations using test environment
- `test:stack:dev` uses `vitest.stack.config.mts` (loads `.env.local` then `.env.test`)
- `reset-db.ts` truncates tables in the **host** stack DB between tests

### 2.3 Docker Dev Stack

**Database:** `cogni_template_dev` (container Postgres)

**Environment:** `.env.local` passed to Docker Compose

**Commands:**

```bash
# First time setup (creates DB + runs migrations)
pnpm docker:dev:stack:setup     # Complete: build stack, create DB, migrate

# Manual steps (if needed)
pnpm docker:dev:stack           # Start containers
pnpm db:provision               # Create database
pnpm docker:dev:stack:migrate   # Run migrations in container
```

**Key Properties:**

- Dev stack owns schema and migrations in shared `postgres_data` volume
- Uses `docker-compose.dev.yml` with real adapters
- Postgres exposed on `localhost:55432` for debugging

### 2.4 Docker Stack (Production Simulation)

**Database:** `cogni_template_dev` (reuses dev stack's database)

**Environment:** `.env.local` passed to Docker Compose

**Commands:**

```bash
pnpm docker:stack:setup         # Start production compose (assumes DB exists)
```

**Key Properties:**

- Uses hardened `docker-compose.yml` production configuration
- Shares same `postgres_data` volume as dev stack
- **Assumes database already created and migrated** via `docker:dev:stack:setup`
- `docker:stack:migrate` available but not used in local workflow

**Local Workflow:**

1. **After nuking volumes:** Run `pnpm docker:dev:stack:setup` once to create schema
2. **To simulate prod:** Run `pnpm docker:stack:setup` (reuses existing DB/schema from shared volume)

### 2.5 Docker Stack Testing

**Database:** `cogni_template_stack_test` (container Postgres)

**Environment:** `dotenv -e .env.test -e .env.local` (test overrides base)

**Commands:**

```bash
# 1. Start Docker stack in test mode
pnpm docker:test:stack:build    # Build and start containers with test env

# 2. Run migrations INSIDE app container (same image + env as app)
pnpm docker:test:stack:migrate

# 3. Run host tests against containerized app
pnpm test:stack:docker
```

**Package.json Configuration:**

```json
{
  "docker:test:stack:build": "dotenv -e .env.test -e .env.local -- docker compose -f platform/infra/services/runtime/docker-compose.dev.yml up -d --build",
  "docker:test:stack:migrate": "dotenv -e .env.test -e .env.local -- docker compose -f platform/infra/services/runtime/docker-compose.dev.yml run --rm --entrypoint sh app -lc 'pnpm db:migrate:container'",
  "test:stack:docker": "DB_HOST=localhost DB_PORT=55432 TEST_BASE_URL=https://localhost/ dotenv -e .env.test -e .env.local -- vitest run --config vitest.stack.config.mts"
}
```

**Key Properties:**

- Uses same Docker image for both app and migrations
- Environment variables passed via dotenv to Docker Compose
- Migrations run **inside** the container with same environment as app
- Tests run from host, connect to exposed postgres port (55432) and app via HTTPS

## 3. Production Deployments

### 3.1 CI/CD Pattern

In staging and production, environment variables come from GitHub Environments/secrets, not `.env` files.

**GitHub Actions Environment:**

```yaml
env:
  APP_ENV: production
  NODE_ENV: production
  # Database configuration (two-user security model)
  POSTGRES_ROOT_USER: ${{ secrets.POSTGRES_ROOT_USER }}
  POSTGRES_ROOT_PASSWORD: ${{ secrets.POSTGRES_ROOT_PASSWORD }}
  APP_DB_USER: ${{ secrets.APP_DB_USER }}
  APP_DB_PASSWORD: ${{ secrets.APP_DB_PASSWORD }}
  APP_DB_NAME: ${{ secrets.APP_DB_NAME }}
  DATABASE_URL: ${{ secrets.DATABASE_URL }} # Uses APP_DB_* credentials
  LITELLM_MASTER_KEY: ${{ secrets.LITELLM_MASTER_KEY }}
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
```

**Deployment Steps:**

```yaml
- name: Run migrations
  run: |
    docker compose -f platform/infra/services/runtime/docker-compose.yml \
      run --rm --entrypoint sh app -lc 'pnpm db:migrate:container'

- name: Start application
  run: |
    docker compose -f platform/infra/services/runtime/docker-compose.yml \
      up -d app
```

**Benefits:**

- Same `DATABASE_URL` for migrations and app
- Same Docker image for migrations and app
- Migrations as repeatable deployment step
- No drift between migration and app environments

## 4. Technical Implementation

### 4.1 Dockerfile Runner Stage

The production image handles both app runtime and migrations:

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache curl

# Enable pnpm for migrations (pinned version for stability)
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

ENV NODE_ENV=production
ENV PATH="/usr/local/bin:${PATH}"

# Copy runtime bundle AND migration tools
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/adapters/server/db/migrations ./src/adapters/server/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# ... other files

USER nextjs
CMD ["node", "server.js"]
```

### 4.2 Drizzle Configuration

The `drizzle.config.ts` uses `process.env.DATABASE_URL` directly (pure CLI boundary):

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./src/adapters/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Works in all environments
  },
  verbose: true,
  strict: true,
});
```

**Why this works:**

- No TypeScript path resolution needed in containers
- Same config file works for host (`dotenv` loads env) and container (env pre-loaded)
- Pure CLI boundary - reads environment, nothing else

## 5. Trade-offs of Current Approach

### 5.1 Benefits

**Same Image + Environment:**

- No "works locally but not in prod" due to mismatched dependencies
- No migration image drift vs app image
- Single source of truth: `pnpm db:migrate:container`

**Simple Mental Model:**

- Whatever image runs the app can migrate the database
- Repeatable deployment step (safe to re-run)
- Common pattern for early-stage teams, viable in production

**Development Workflow:**

- Consistent migration tooling across all environments
- Easy debugging (same environment for app and migrations)

### 5.2 Trade-offs

**Larger Runtime Image:**

- Includes `node_modules` with dev tools like `drizzle-kit`
- Heavier than truly minimal Next.js standalone runtime
- Acceptable trade-off for current stage

**Extended Capabilities:**

- Runtime image can mutate database schema (not just serve HTTP)
- In strict environments, might prefer separate migration image
- Currently, simplicity outweighs isolation concerns

## 6. Future Improvements (If/When Needed)

When the stack matures and you need tighter image optimization or security separation:

### 6.1 Dedicated Migration Image

Build a separate migration-only image:

```dockerfile
FROM node:20-alpine AS migrate
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Copy only migration essentials
COPY package.json drizzle.config.ts ./
COPY src/shared/db/schema.ts ./src/shared/db/schema.ts
COPY src/adapters/server/db/migrations ./src/adapters/server/db/migrations

# Install only migration dependencies
RUN pnpm install --prod=false drizzle-kit

CMD ["pnpm", "db:migrate:container"]
```

### 6.2 Migration Service in Compose

Add dedicated migration service:

```yaml
services:
  migrate:
    image: <migration-image>
    env_file: .env.docker
    command: ["pnpm", "db:migrate:container"]
    depends_on: [postgres]

  app:
    # ... app definition
```

**CI Usage:**

```bash
docker compose up migrate    # Run migrations first
docker compose up -d app     # Then start app
```

### 6.3 Enhanced Environment Separation

**Stricter Test Isolation:**

- Container-specific DB reset routines
- Separate test databases for different environments
- Longer-running smoke test environments

**Production Pipeline:**

- Dedicated migration pipeline stage
- Blue/green deployments with migration gating
- No ad-hoc migration commands in production

## 7. Summary

**Environment Separation:** Host dev DB, host stack test DB, container stack DB are cleanly separated

**Consistent Migration Strategy:** All environments use same `drizzle-kit` tooling with environment-appropriate commands

**Production-Ready Pattern:** Same image, same `DATABASE_URL`, migrations as first-class deployment step

**Current Trade-off:** Slightly heavier image for simpler, more deterministic workflow - acceptable at current stage

**Future Path:** Can refactor to dedicated migration services when optimization becomes priority
