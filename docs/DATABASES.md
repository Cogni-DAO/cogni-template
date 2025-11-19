# Database & Migration Architecture

This document describes how databases are organized, how migrations run, and how that behavior maps to local development, stack tests, and Docker-based deployments. It also captures the current in-container migration strategy, trade-offs, and possible future improvements.

## Overview: Environment Separation

We deliberately separate **host Postgres** (for local dev + fast tests) from **container Postgres** (for prod-like stacks). Each environment has its own `DATABASE_URL` and migration strategy, but all use the same migration tooling.

## 1. Environment Details

### 1.1 Host Postgres (Local Machine)

**Used for:** `dev:stack`, `test:stack`, `test:int`

**Databases:**

- `cogni_template_dev` - Local development
  ```
  postgresql://postgres:postgres@localhost:5432/cogni_template_dev
  ```
- `cogni_template_stack_test` - Host stack tests
  ```
  postgresql://postgres:postgres@localhost:5432/cogni_template_stack_test
  ```

**Environment Files:**

- `.env.local` - Base local environment (dev DB, secrets, etc.)
- `.env.stack.local` - Stack test overrides (points to `cogni_template_stack_test`)

**Vitest Configuration:**

- `vitest.stack.config.mts` loads `.env.local` → `.env.stack.local` (override)
- Stack tests connect to **host** `cogni_template_stack_test`

### 1.2 Container Postgres (Docker Stack)

**Used for:** `docker:stack`, staging, production

**Database:**

- `cogni_template_stack_test` (same name, **different Postgres instance**)

  ```
  postgresql://postgres:postgres@postgres:5432/cogni_template_stack_test
  ```

  - Note: `postgres` is the Docker service name, **never** `localhost`

**Environment Files:**

- `.env.docker` - Container-only environment
  - Used by `docker compose --env-file .env.docker`
  - Contains container-correct `DATABASE_URL`, `APP_ENV`, etc.
  - **Not** loaded by host Vitest

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

**Environment:** `.env.local` + `.env.stack.local` (override)

**Commands:**

```bash
pnpm test:stack:setup    # Create database + run migrations
pnpm test:stack          # Run vitest stack tests
```

**Details:**

- `test:stack:setup` creates `cogni_template_stack_test` and runs migrations
- `test:stack` uses `vitest.stack.config.mts` (loads both env files)
- `reset-db.ts` truncates tables in the **host** stack DB between tests

### 2.3 Docker Stack (Production-like)

**Database:** `cogni_template_stack_test` (container Postgres)

**Environment:** `.env.docker` (container-only)

**Commands:**

```bash
# 1. Start Docker stack with container environment
pnpm docker:stack:build    # Build and start containers

# 2. Run migrations INSIDE app container (same image + env as app)
pnpm docker:stack:migrate

# 3. (Optional) Run host tests against container app
pnpm test:stack
```

**Package.json Configuration:**

```json
{
  "docker:stack": "docker compose --env-file .env.docker up -d",
  "docker:stack:build": "docker compose --env-file .env.docker up -d --build",
  "docker:stack:migrate": "docker compose --env-file .env.docker run --rm --entrypoint sh app -lc 'pnpm db:migrate:container'",
  "docker:stack:test": "pnpm docker:stack && pnpm docker:stack:migrate && pnpm test:stack"
}
```

**Key Properties:**

- Uses same Docker image for both app and migrations
- Uses same `.env.docker` environment
- Migrations run **inside** the container against container Postgres
- No environment file conflicts with host tools

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
