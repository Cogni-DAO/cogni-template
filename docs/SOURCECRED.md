# SourceCred

v0, barely MVP. SourceCred is run as an isolated Docker service to track contributions.
SourceCred is our temporary proof of concept, with plans to migrate, adapt, and replace it with
a tailored version.

## Prerequisites

- `SOURCECRED_GITHUB_TOKEN` must be set in your `.env.local` (or `.env`).
  - You can reuse your `ACTIONS_AUTOMATION_BOT_PAT` for this.

## Usage

We provide pnpm scripts to manage the SourceCred instance:

```bash
# 1. Build the container (required first time or after config changes)
pnpm sourcecred:build

# 2. Load data from GitHub (long running process)
# This fetches data using your GitHub token and stores it in the cache volume.
pnpm sourcecred:load

# 3. Start the UI
# Once the stack is running, you can access the SourceCred UI at:
# - **URL:** `https://localhost/sourcecred/` (Read-Only)
pnpm sourcecred:up

# 4. Stop the service
pnpm sourcecred:down
```

> [!NOTE]
> The public view at `/sourcecred/` is read-only. All administrative actions (loading data, recalculating scores) must be performed via the CLI scripts.

## Configuration

- **Instance Config**: `platform/infra/services/sourcecred/instance`
- **Repositories**: `platform/infra/services/sourcecred/instance/config/plugins/sourcecred/github/config.json`
- **Docker**: `platform/infra/services/sourcecred/docker-compose.sourcecred.yml`

## Deployment & Architecture

SourceCred runs as a distinct Docker Compose stack (`cogni-sourcecred`) to keep it isolated from the main application runtime, but it shares the `cogni-edge` network to allow Caddy to route traffic to it.

### Routing (Caddy)

Access to the SourceCred UI is managed by the Edge stack's Caddy instance.

- **Config**: `platform/infra/services/edge/configs/Caddyfile.tmpl`
- **Proxy Rule**: `handle_path /sourcecred/* { reverse_proxy sourcecred:6006 }`
- **Redirect**: `redir /sourcecred /sourcecred/` (ensures trailing slash for asset loading)

This setup allows SourceCred to be served under a subpath of the main domain (e.g., `https://cogni.dao/sourcecred/`) without exposing its internal port 6006 directly to the internet.

### Environment & Secrets

The deployment script (`deploy.sh`) injects the necessary credentials:

1.  **Secret**: `ACTIONS_AUTOMATION_BOT_PAT` (from GitHub Secrets) is mapped to `SOURCECRED_GITHUB_TOKEN` in the container.
2.  **Network**: The service attaches to the external `cogni-edge` network to communicate with Caddy.
