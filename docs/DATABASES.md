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

**Core Principle:** Migrations run via a dedicated `MIGRATOR_IMAGE` that contains only migration tooling. The app runtime image has no pnpm or migration capabilities.

**Architecture:**

- **MIGRATOR_IMAGE:** Separate Docker image (`IMAGE_NAME:IMAGE_TAG-migrate`) containing drizzle-kit and migrations
- **db-migrate service:** Docker Compose service that runs migrations using the migrator image
- **Runner image:** Lean production image (~80MB) with no migration tooling

**Migration Commands:**

- `pnpm db:migrate` - Alias for `db:migrate:dev` (default: dev environment)
- `pnpm db:migrate:dev` - Direct: drizzle-kit with `.env.local` (dev database)
- `pnpm db:migrate:test` - Direct: drizzle-kit with `.env.test` (test database)
- `pnpm db:migrate:direct` - Direct: drizzle-kit using DATABASE_URL from current environment
- `pnpm db:migrate:container` - Container-only: used inside migrator Docker image

**Execution Contexts:**

- **Local Dev** (`db:migrate`, `db:migrate:dev`): Runs `drizzle-kit migrate` with `.env.local`. For daily development.
- **Local Test** (`db:migrate:test`): Runs `drizzle-kit migrate` with `.env.test`. For test database setup.
- **Direct** (`db:migrate:direct`): Runs `drizzle-kit migrate` using `DATABASE_URL` from environment. For testcontainers and CI.
- **Container** (`db:migrate:container`): Internal command used by Docker migrator image. Not for direct use.

### 2.1 Local Development

**Database:** `cogni_template_dev`

**Environment:** `.env.local`

**Commands:**

```bash
pnpm db:migrate              # Migrate dev database directly with drizzle-kit
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
pnpm db:migrate                 # Run migrations with drizzle-kit
```

**Key Properties:**

- Dev stack owns schema and migrations in shared `postgres_data` volume
- Uses `docker-compose.dev.yml` with db-migrate service for migrations
- Postgres exposed on `localhost:55432` for debugging
- Migrations run via dedicated migrator image (not inside app container)

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
pnpm docker:test:stack          # Build and start containers with test env

# 2. Run migrations via db-migrate service
pnpm db:migrate:test

# 3. Run host tests against containerized app
pnpm test:stack:docker
```

**Key Properties:**

- Uses dedicated migrator image for migrations (not app container)
- Environment variables passed via dotenv to Docker Compose
- Migrations run via db-migrate service with `--profile bootstrap`
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
      --profile bootstrap run --rm db-migrate

- name: Start application
  run: |
    docker compose -f platform/infra/services/runtime/docker-compose.yml \
      up -d app
```

**Benefits:**

- Same `DATABASE_URL` for migrations and app
- Dedicated migrator image with pinned drizzle-kit version
- Migrations as repeatable deployment step (idempotent)
- Lean runner image (~80MB) without migration tooling
- db-migrate service receives only DB env vars (least-secret exposure)

## 4. Technical Implementation

### 4.1 Docker Image Architecture

**Two-Image Strategy:**

- **Runner image** (`IMAGE_NAME:IMAGE_TAG`): Lean production image (~80MB) for app runtime only
- **Migrator image** (`IMAGE_NAME:IMAGE_TAG-migrate`): Contains drizzle-kit and migrations (~480MB)

**Runner Stage (no migration tools):**

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache curl

ENV NODE_ENV=production

# Copy runtime bundle only (no pnpm, no migrations)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
CMD ["node", "server.js"]
```

**Migrator Stage:**

```dockerfile
FROM base AS migrator
WORKDIR /app

RUN apk add --no-cache g++ make python3

# Install deps with drizzle-kit
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy migration files only
COPY drizzle.config.ts ./
COPY src/shared/db ./src/shared/db
COPY src/adapters/server/db/migrations ./src/adapters/server/db/migrations

CMD ["pnpm", "db:migrate:container"]
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

**Separation of Concerns:**

- Runner image cannot mutate database schema (no pnpm, no drizzle-kit)
- Migrator image has only DB env vars (least-secret exposure)
- Clear security boundary between app runtime and migrations

**Lean Production Image:**

- Runner image ~80MB (Next.js standalone only)
- No dev dependencies in production runtime
- Faster container pulls and startup

**Consistent Migration Tooling:**

- Pinned drizzle-kit version in migrator image
- Idempotent migrations (safe to re-run)
- Same db-migrate service in dev and production

### 5.2 Trade-offs

**Two Images to Build:**

- CI builds both runner and migrator targets
- Tag coupling: `IMAGE_NAME:IMAGE_TAG` and `IMAGE_NAME:IMAGE_TAG-migrate`
- Both must be pushed and pulled during deployment

**Larger Migrator Image:**

- Migrator includes full node_modules (~480MB)
- Acceptable since it only runs during deployments, not at runtime

## 6. Future Improvements (If/When Needed)

### 6.1 Migrator Image Optimization

The migrator image (~480MB) includes full node_modules. Potential optimizations:

- Use pnpm's `--filter` to install only drizzle-kit and dependencies
- Multi-stage build to copy only required binaries
- Consider distroless base image for smaller footprint

### 6.2 Enhanced Environment Separation

**Stricter Test Isolation:**

- Container-specific DB reset routines
- Separate test databases for different environments
- Longer-running smoke test environments

**Production Pipeline:**

- Blue/green deployments with migration gating
- Automated migration rollback on failure

## 7. Summary

**Environment Separation:** Host dev DB, host stack test DB, container stack DB are cleanly separated

**Two-Image Architecture:** Lean runner image (~80MB) + dedicated migrator image (~480MB) with clear security boundaries

**Production-Ready Pattern:** Dedicated db-migrate service, same `DATABASE_URL`, migrations as first-class deployment step

**Least-Secret Exposure:** db-migrate service receives only DB env vars, not app secrets

**Tag Coupling:** `APP_IMAGE=IMAGE_NAME:IMAGE_TAG`, `MIGRATOR_IMAGE=IMAGE_NAME:IMAGE_TAG-migrate`
