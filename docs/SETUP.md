# Developer Setup

## First Time Setup

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

See [ENVIRONMENTS.md](ENVIRONMENTS.md) for deployment modes and [DATABASES.md](DATABASES.md) for migration details.
