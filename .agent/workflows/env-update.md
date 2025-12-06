---
description: Guide for propagating environment variables across the stack
---

You've just added a new environment variable. To ensure it propagates correctly across local development, testing, CI/CD, and production, you must update multiple files.

Use this checklist to verify you haven't missed anything.

## 1. Validation & Types (The Source of Truth)

- [ ] **`src/shared/env/server.ts`** (or `client.ts`): Add the variable to the Zod schema. This ensures type safety and runtime validation.

## 2. Local Development & Documentation

- [ ] **`.env.local`**: Add the variable with a real value for this local environment.
- [ ] **`.env.test`**: Add the variable (often with a mock value) for this test environment.
- [ ] **`.env.(local|test).example`**: Add the variable with a placeholder or default value. This is the public documentation for required env vars.

## 3. Docker Compose (Runtime Stack)

If the variable is needed by the main application container:

- [ ] **`platform/infra/services/runtime/docker-compose.dev.yml`**: Add it to the `environment` section of the `app` service.
- [ ] **`platform/infra/services/runtime/docker-compose.yml`**: Add it to the `environment` section of the `app` service.

If the variable is needed by other services:

- [ ] **`platform/infra/services/sourcecred/docker-compose.sourcecred.yml`**: For SourceCred service variables.
- [ ] **`platform/infra/services/edge/docker-compose.yml`**: For Caddy/Edge variables (rare).

## 4. Deployment Pipeline (Production/Preview)

To get the variable from GitHub Secrets into the VM:

### A. GitHub Workflows

- [ ] **`.github/workflows/deploy-production.yml`**: Map the secret/var to the `env` block of the `deploy` job.
- [ ] **`.github/workflows/staging-preview.yml`**: Map the secret/var to the `env` block of the `deploy` job.

### B. Deployment Script (`deploy.sh`)

- [ ] **`platform/ci/scripts/deploy.sh`**:
  1.  Add it to `REQUIRED_SECRETS` (if it's a secret) or `REQUIRED_ENV_VARS` (if it's a config).
  2.  Add it to the `cat > /opt/cogni-template-runtime/.env << ENV_EOF` block (Step 1).
  3.  Add it to the `ssh ... bash /tmp/deploy-remote.sh` command (at the bottom of the file) to pass it to the remote script.

## 5. Special Cases: Isolated Services (e.g., SourceCred)

If the variable is for a standalone service running in its own Docker Compose project (like SourceCred):

- [ ] **Docker Compose**: Update the service's compose file (e.g., `platform/infra/services/sourcecred/docker-compose.sourcecred.yml`).
- [ ] **`deploy.sh` (Step 1)**: Add the variable to the _specific_ `.env` file generation block for that service (e.g., `/opt/cogni-template-sourcecred/.env`).
- [ ] **`deploy.sh` (Compose Command)**: **CRITICAL**: Ensure the `docker compose` command for that service explicitly uses `--env-file /path/to/service/.env`.
  - _Example_: `docker compose --project-name cogni-sourcecred --env-file /opt/cogni-template-sourcecred/.env -f ...`
  - _Reason_: Isolated services often run from a shared script context and won't automatically find their `.env` file unless explicitly told.

## See Also

- [scripts/setup/SETUP_DESIGN.md](file:///Users/derek/dev/cogni-template/scripts/setup/SETUP_DESIGN.md): Guidance on scripting setup, automated + manual env steps required.
