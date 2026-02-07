---
id: developer-setup-guide
type: guide
title: Developer Setup
status: draft
trust: draft
summary: First-time setup, daily development workflow, and testing commands for the Cogni-Template repo.
read_when: Onboarding to the repo or need a quick reference for dev/test commands.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [dev, onboarding]
---

# Developer Setup

## When to Use This

You are setting up the Cogni-Template repo for the first time, or need a reference for daily development and testing commands.

## Preconditions

- [ ] Node.js 20+ installed
- [ ] pnpm installed (`corepack enable`)
- [ ] Repository cloned
- [ ] Docker running (for infrastructure services)

## Steps

### First Time Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Environment files:**

   ```bash
   cp .env.local.example .env.local
   cp .env.test.example .env.test
   ```

3. **Setup development database:**
   ```bash
   pnpm db:setup
   ```

## Daily Development

```bash
pnpm dev:stack          # Start app + infrastructure (main workflow)
```

## Testing

**Host Stack Tests:**

```bash
pnpm dev:stack:test:setup   # Create test database + migrations
pnpm test:stack:dev         # Run stack tests against host app
pnpm dev:stack:test:reset   # Nuclear reset when test DB is corrupted
```

**Docker Stack Tests:**

```bash
pnpm docker:test:stack          # Start containerized test stack
pnpm docker:test:stack:setup    # Create test database + migrations (requires stack running)
pnpm test:stack:docker          # Run tests against containerized app
pnpm docker:test:stack:reset    # Nuclear reset for containerized test database
```

## Available Modes

- `pnpm dev:stack` - Host app + containerized postgres/litellm
- `pnpm docker:test:stack` - All services containerized for testing (production-like)
- `pnpm docker:stack` - Full production simulation with local environment

**Fast variants:** Add `:fast` to skip rebuilds (e.g., `pnpm docker:test:stack:fast`)

See [ENVIRONMENTS.md](../spec/environments.md) for deployment modes and [DATABASES.md](../spec/databases.md) for migration details.

## Verification

```bash
pnpm check          # lint + type + format validation
pnpm test           # run unit/integration tests
```

## Troubleshooting

### Problem: `pnpm db:setup` fails with connection error

**Solution:** Ensure Docker is running and postgres container is healthy: `docker ps | grep postgres`.

### Problem: Port conflicts on `pnpm dev:stack`

**Solution:** Check for existing processes on ports 3000/5432: `lsof -i :3000` and kill if needed.

## Related

- [Environments Spec](../spec/environments.md) — deployment modes and stack configurations
- [Databases Spec](../spec/databases.md) — migration architecture and database setup
- [Testing Guide](./testing.md) — testing strategy and adapter patterns
