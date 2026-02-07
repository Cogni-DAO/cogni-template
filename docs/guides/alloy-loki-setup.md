---
id: alloy-loki-setup-guide
type: guide
title: Alloy + Grafana Cloud Loki Setup
status: draft
trust: draft
summary: How to set up Alloy log forwarding to Grafana Cloud Loki, including Grafana Cloud account setup, environment config, and verification.
read_when: Setting up or troubleshooting the Alloy → Grafana Cloud Loki log pipeline.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [observability, infra]
---

# Alloy + Grafana Cloud Loki Setup (V2)

## When to Use This

You are setting up or troubleshooting the Alloy log collection pipeline that forwards container logs to Grafana Cloud Loki. Promtail is deprecated (EOL March 2, 2026) — Alloy is the replacement.

## Preconditions

- [ ] Docker running
- [ ] Grafana Cloud account (free tier available)
- [ ] `.env.local` or `.env.runtime.local` configured

## Steps

### Current State

✅ **V1 Complete:** Structured logging with Pino in application code

- JSON logs to stdout
- RequestContext with reqId, session, routeId
- Event schemas (AiLlmCallEvent, PaymentsEvent)
- See: [Observability Spec](../spec/observability.md)

✅ **V2 Complete:** Log collection and aggregation

- Alloy forwards logs to Grafana Cloud Loki
- No self-hosted Loki required
- Logs queryable via Grafana Cloud interface

### Goal

Minimal viable log collection with Grafana Cloud:

1. Replace Promtail with Alloy
2. Configure Alloy to scrape container logs via Docker socket
3. Forward logs to Grafana Cloud Loki (managed service)
4. Verify logs flow: App → Docker → Alloy → Grafana Cloud
5. Query and visualize logs in Grafana Cloud

**Deferred to later PRs:**

- Grafana dashboards
- Alert rules
- Advanced filtering (health check noise)
- Structured metadata extraction
- Trace collection (OTLP)

### Design Decisions

### 1. Label Cardinality (STRICT)

**Labels** (indexed, low-cardinality):

- `app` - Application name (e.g., "cogni-template")
- `env` - Environment (dev, test, prod)
- `service` - Docker Compose service name (mapped from compose_service)
- `stream` - stdout/stderr

**JSON fields** (not labels, query with `| json`):

- `reqId` - Request ID (high cardinality)
- `userId` - User ID (high cardinality)
- `billingAccountId` - Billing account (high cardinality)
- `attemptId` - Payment attempt ID (high cardinality)
- `level` - Log level (info, warn, error)
- `msg` - Log message
- `time` - Timestamp

**Rationale:** Loki indexes labels; high-cardinality labels destroy performance. Keep cardinality < 100 per label.

### 2. Version Pinning

- **Alloy:** `grafana/alloy:v1.9.2` (Dec 2024 - stable 1.9.x branch, includes eBPF fixes and better component compatibility)
- **Grafana Cloud Loki:** Managed service (automatically updated by Grafana)

**Why these versions:**

- Alloy v1.9.2: Latest 1.9.x with fixes for validation and profile collection; avoids breaking changes from v1.9.0
- Grafana Cloud: No version management required, always up-to-date

**Update policy:** Review Alloy quarterly; test in dev before promoting to prod. Never use `:latest`.

### 3. Security

- Alloy UI: `127.0.0.1:12345` (internal only, not exposed publicly)
- Docker socket: read-only mount (`:ro`)
- No `/var/lib/docker/containers` mount (using docker discovery, not file scraping)
- Grafana Cloud: Basic auth with user ID and API key (credentials via environment variables)

### 4. Storage

- **Grafana Cloud:** Managed storage (no local volumes required for Loki)
- **Alloy positions:** Named volume `alloy_data` (offset tracking)

### Step 1: Setup Grafana Cloud Account

1. Sign up at https://grafana.com/products/cloud/ (free tier available)
2. Navigate to: **Connections → Data Sources → Loki**
3. Note the following credentials:
   - **URL**: Push endpoint (e.g., `https://logs-prod-us-central1.grafana.net/loki/api/v1/push`)
   - **User ID**: Numeric value shown in the interface
4. Generate an API key:
   - Click **"Generate now"** in the Loki data source page
   - Grant `logs:write` permission
   - Save the API key securely (starts with `glc_`)

### Step 2: Configure Environment Variables

Add to your `.env.local` or `.env.runtime.local`:

```bash
GRAFANA_CLOUD_LOKI_URL="https://logs-prod-us-central1.grafana.net/loki/api/v1/push"
GRAFANA_CLOUD_LOKI_USER="123456"  # Your numeric user ID
GRAFANA_CLOUD_LOKI_API_KEY="glc_your_api_key_here"  # API key with logs:write
```

These variables are already configured in:

- `.env.local.example` (local development template)
- `docker-compose.yml` and `docker-compose.dev.yml` (Alloy service environment section)

### Step 3: Alloy Configuration

The Alloy configuration is already created at `platform/infra/services/runtime/configs/alloy-config.alloy` with:

- **Container allowlist**: `(app|litellm|caddy)` only
- **Strict label cardinality**: `{app, env, service, stream}` only
- **Grafana Cloud endpoint**: Uses `sys.env("GRAFANA_CLOUD_LOKI_URL")`
- **Authentication**: Basic auth with user ID and API key from environment

See the actual config file for full implementation details.

### Step 4: Deploy Stack

```bash
cd platform/infra/services/runtime
docker compose --env-file .env.runtime.local down
docker compose --env-file .env.runtime.local up -d
```

Wait ~30 seconds for services to stabilize.

### Implementation History

1. Setup Grafana Cloud account and get credentials
2. Update `docker-compose.yml` and `docker-compose.dev.yml`:
   - Remove `loki` service (using Grafana Cloud)
   - Replace `promtail` with `alloy`
   - Add Grafana Cloud env vars to alloy service
   - Add `alloy_data` volume definition
3. Create `configs/alloy-config.alloy` with Grafana Cloud endpoint
4. Test locally with Grafana Cloud
5. Update documentation:
   - `docs/OBSERVABILITY.md` — Complete Grafana Cloud setup guide
   - `platform/infra/services/runtime/AGENTS.md` — Added setup instructions
6. Standardize environment files:
   - Merge `.env.example` into `.env.local.example`
   - Delete `.env.example`
   - Update all references in docs and scripts

## Verification

**Check Alloy UI:**

Open http://127.0.0.1:12345 in your browser:

- Verify `discovery.docker.containers` shows discovered targets
- Verify `loki.write.grafana_cloud_loki` shows healthy endpoint status
- Check for any error messages in component status

**Check Grafana Cloud:**

1. Navigate to https://your-org.grafana.net/a/logs (Explore → Loki)
2. Run LogQL queries:
   - `{app="cogni-template"}` - Should show all logs
   - `{service="app"}` - Application logs only
   - `{service="app"} | json | level="error"` - Filter errors

**Validation Checklist:**

- [ ] Alloy UI accessible at http://127.0.0.1:12345
- [ ] Alloy discovers containers (check UI targets)
- [ ] Only allowlisted services shown (app, litellm, caddy)
- [ ] Grafana Cloud shows `app="cogni-template"` logs
- [ ] Labels contain exactly: `app`, `env`, `service`, `stream`
- [ ] High-cardinality fields (reqId) queryable via `| json`

## Troubleshooting

### Problem: No logs in Grafana Cloud

**Solution:**

1. Check Alloy UI (http://127.0.0.1:12345):
   - Component status shows errors?
   - Authentication failing?
2. Check Alloy logs: `docker logs alloy | tail -50`
3. Verify environment variables in container:
   ```bash
   docker exec alloy env | grep GRAFANA_CLOUD
   ```
4. Verify app is logging: `docker logs app | head`

### Problem: Authentication errors

**Solution:**

1. Verify credentials are correct in `.env` file
2. Check API key has `logs:write` permission in Grafana Cloud
3. Verify URL format includes `/loki/api/v1/push` path

### Problem: Labels missing

**Solution:**

1. Verify `APP_ENV` is set: `docker exec alloy env | grep APP_ENV`
2. Check Alloy relabeling rules in `configs/alloy-config.alloy`
3. Query in Grafana Cloud: `{app="cogni-template"}` to inspect labels

## Related

- [Observability Spec](../spec/observability.md) — structured logging, tracing, event schemas
- [Observability Hardening Initiative](../../work/initiatives/ini.observability-hardening.md) — future enhancements (filtering, dashboards, alerts, traces)
- [Official Alloy Tutorial: Send Logs to Loki](https://grafana.com/docs/alloy/latest/tutorials/send-logs-to-loki/)
- [loki.source.docker Component](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [discovery.docker Component](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.docker/)
- [Loki Label Best Practices](https://grafana.com/docs/loki/latest/best-practices/)
