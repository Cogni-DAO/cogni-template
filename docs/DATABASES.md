# Database & Migration Architecture

This document describes database organization, migration strategies, and database-specific configuration patterns.

**For stack deployment modes and environment details, see [ENVIRONMENTS.md](ENVIRONMENTS.md).**

## Database Separation

**Development Database:** `cogni_template_dev`  
**Test Database:** `cogni_template_stack_test`

All stack deployment modes use the same migration tooling but connect to appropriate database instances. Test environments always use the test database and reset it between test runs.

## Database URL Construction

All environments construct PostgreSQL URLs from individual pieces using the `buildDatabaseUrl()` helper:

```typescript
// src/shared/env/db-url.ts
export function buildDatabaseUrl(env: DbEnvInput): string {
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  const db = env.POSTGRES_DB;
  const host = env.DB_HOST ?? "localhost";
  const port =
    typeof env.DB_PORT === "number"
      ? env.DB_PORT
      : Number(env.DB_PORT ?? "5432");

  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}
```

**Environment Examples:**

- **Host development:** `postgresql://postgres:postgres@localhost:5432/cogni_template_dev`
- **Host testing:** `postgresql://postgres:postgres@localhost:5432/cogni_template_stack_test`
- **Container (internal):** `postgresql://postgres:postgres@postgres:5432/cogni_template_stack_test`
- **Host tests → container:** `postgresql://postgres:postgres@localhost:55432/cogni_template_stack_test`

## 2. Migration Strategy

**Core Principle:** For any environment, migrations run against the same `DATABASE_URL` the app uses in that environment.

**Migration Commands:**

- `pnpm db:migrate` - Host environments (uses dotenv to load env files)
- `pnpm db:migrate:container` - Container environments (uses pre-loaded env vars)

### 2.1 Local Development

**Database:** `cogni_template_dev`

**Environment:** `.env.local`

**Commands:**

```bash
pnpm db:migrate    # Migrate dev database
pnpm dev:stack     # Start app using same database
```

### 2.2 Host Stack Tests

**Database:** `cogni_template_stack_test` (host Postgres)

**Environment:** `.env.local` + `.env.test` (override)

**Commands:**

```bash
pnpm test:stack:setup    # Create database + run migrations
pnpm test:stack:dev      # Run vitest stack tests against host app
```

**Details:**

- `test:stack:setup` creates `cogni_template_stack_test` and runs migrations using test environment
- `test:stack:dev` uses `vitest.stack.config.mts` (loads `.env.local` then `.env.test`)
- `reset-db.ts` truncates tables in the **host** stack DB between tests

### 2.3 Docker Stack Testing

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
  DATABASE_URL: ${{ secrets.DATABASE_URL }} # Container-correct hostname
  LITELLM_MASTER_KEY: ${{ secrets.LITELLM_MASTER_KEY }}
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
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
