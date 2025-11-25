# Database Incident (2025-11-25)

## What happened

- Dev app tables (`users`, `billing_accounts`, `credit_ledger`, `virtual_keys`) kept disappearing while migrations reported success.
- Two issues overlapped:
  - Host workflows (.env.test + test reset script) were able to point at a second Postgres instance (brew @5432) and truncate the wrong DB.
  - LiteLLM’s container runs Prisma migrations on the shared `cogni_template_dev` database and can recreate its own tables after we drop/recreate the DB.

## Actions taken (exact)

- Removed host Postgres instances: `brew services stop postgresql@14 postgresql@15 && brew uninstall postgresql@14 postgresql@15` and deleted `/opt/homebrew/var/postgresql@14` and `/opt/homebrew/var/postgresql@15`.
- Hardened test reset: added a guard in `tests/stack/setup/reset-db.ts` to verify `current_database()` and port match env before TRUNCATE.
- Script fixes:
  - `dev:stack:test:db:create` now uses `-p "$DB_PORT"` so it respects the configured port.
  - Docker dev/test scripts set `DB_PORT=5432` for in-container connections (host remains 55432) to avoid hitting a non-existent port inside the network.
- Reset dev DB and reapplied migrations in the right order:
  - `docker stop litellm`
  - `docker exec -e PGPASSWORD=password postgres psql -U user -d postgres -c "DROP DATABASE IF EXISTS cogni_template_dev WITH (FORCE);"`
  - `docker exec -e PGPASSWORD=password postgres psql -U user -d postgres -c "CREATE DATABASE cogni_template_dev;"`
  - `docker start litellm` (lets LiteLLM reapply its Prisma migrations)
  - `pnpm dev:stack:db:migrate` (reapply app migrations)
- Verified current state via `docker exec ... psql` that app tables and drizzle metadata exist alongside LiteLLM tables.

## Current state

- Only Docker Postgres on `localhost:55432` is running; brew Postgres removed.
- Dev DB `cogni_template_dev` contains both LiteLLM tables and app tables; drizzle migrations table is present.
- Test reset now refuses to truncate if connected DB/port differ from expected env.

## Future goal

- Separate LiteLLM into its own database to remove cross-tooling interference:
  - Create a dedicated LiteLLM database (e.g., `litellm_dev`) in the same Postgres instance.
  - Configure LiteLLM’s `DATABASE_URL` to point only to `litellm_dev`.
  - Ensure LiteLLM migrations (Prisma) run exclusively against `litellm_dev`.
  - After this change, `cogni_template_dev` contains only app tables managed by Drizzle.
- Clarify the port model:
  - From the host: tests/tools connect to Postgres on `localhost:55432`.
  - Inside containers: services connect to Postgres on port `5432` via the Docker network name.
  - `.env.test` and stack scripts must derive DB_HOST/DB_PORT from one source of truth so tests cannot silently point at a different instance.
- While LiteLLM still shares `cogni_template_dev`, treat this as a temporary workaround:
  - After a full stack restart that recreates `cogni_template_dev`, re-run `pnpm dev:stack:db:migrate` once LiteLLM finishes booting.
  - Remove this step once LiteLLM has its own isolated database.

## Guiding principles

- Schema ownership rule:
  - `cogni_template_dev` is owned by the app; only Drizzle migrations are allowed to change its schema.
  - LiteLLM must not connect to or migrate `cogni_template_dev` once isolation is in place.
  - No mixed migration tools (Prisma + Drizzle) in the same schema.

## Lessons / Guardrails

- Do not run a separate host Postgres during normal development; all migrations/tests must hit the Docker Postgres only.
- Never let a third-party service (LiteLLM/Prisma/etc.) share and migrate the same schema as the core app.
- All destructive scripts (reset-db, truncate) must assert `current_database()` and `inet_server_port()` before running.
- One migration system (Drizzle) per schema; no mixing migration tools.
