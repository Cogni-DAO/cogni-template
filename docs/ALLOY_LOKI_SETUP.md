# Alloy + Loki Greenfield Setup (V2)

**Status:** Ready to execute
**Scope:** Bring up log collection infrastructure from scratch
**Context:** Promtail deprecated (EOL March 2, 2026), using Alloy instead

---

## Current State

✅ **V1 Complete:** Structured logging with Pino in application code

- JSON logs to stdout
- RequestContext with reqId, session, routeId
- Event schemas (AiLlmCallEvent, PaymentsEvent)
- See: [OBSERVABILITY.md](OBSERVABILITY.md)

❌ **V2 Missing:** Log collection and aggregation

- Promtail service exists but orphaned (no Loki to send to)
- Loki service doesn't exist in docker-compose
- No way to query/visualize application logs

---

## Goal

Minimal viable log collection:

1. Add Loki service to docker-compose
2. Replace Promtail with Alloy
3. Configure Alloy to scrape container logs via Docker socket
4. Verify logs flow: App → Docker → Alloy → Loki
5. Provide smoke query runbook for validation

**Deferred to later PRs:**

- Grafana dashboards
- Alert rules
- Advanced filtering (health check noise)
- Structured metadata extraction
- Trace collection (OTLP)

---

## Design Decisions

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

- **Loki:** `grafana/loki:3.6.2` (Dec 2024 - stable 3.x branch with recent security patches)
- **Alloy:** `grafana/alloy:v1.9.2` (Dec 2024 - stable 1.9.x branch, includes eBPF fixes and better component compatibility)

**Why these versions:**

- Loki 3.6.2: Recent patch release on 3.6.x branch, includes CVE fixes and stability improvements
- Alloy v1.9.2: Latest 1.9.x with fixes for validation and profile collection; avoids breaking changes from v1.9.0

**Update policy:** Review quarterly; test in dev before promoting to prod. Never use `:latest`.

### 3. Security

- Alloy UI: `127.0.0.1:12345` (internal only, not exposed publicly)
- Docker socket: read-only mount (`:ro`)
- No `/var/lib/docker/containers` mount (using docker discovery, not file scraping)
- Loki: no auth for now (internal network only)

### 4. Storage

- **Loki data:** Named volume `loki_data` (chunks + index)
- **Alloy positions:** Named volume `alloy_data` (offset tracking)

---

## Implementation

### Step 1: Add Loki Service

**File:** `platform/infra/services/runtime/docker-compose.yml`

Add after `postgres` service:

```yaml
loki:
  image: grafana/loki:3.6.2
  container_name: loki
  restart: unless-stopped
  networks:
    - web
  ports:
    - "127.0.0.1:3100:3100" # Internal only
  volumes:
    - ../loki-promtail/loki-config.yaml:/etc/loki/local-config.yaml:ro
    - loki_data:/loki
  command: -config.file=/etc/loki/local-config.yaml
```

Add to `volumes:` section:

```yaml
volumes:
  # ... existing volumes ...
  loki_data:
    name: loki_data
  alloy_data:
    name: alloy_data
```

### Step 2: Replace Promtail with Alloy

**File:** `platform/infra/services/runtime/docker-compose.yml`

Replace entire `promtail:` service block with:

```yaml
alloy:
  image: grafana/alloy:v1.9.2
  container_name: alloy
  restart: unless-stopped
  networks:
    - web
  ports:
    - "127.0.0.1:12345:12345" # Host binding internal only; container listens on 0.0.0.0
  volumes:
    - ./configs/alloy-config.alloy:/etc/alloy/config.alloy:ro
    - alloy_data:/var/lib/alloy
    - /var/run/docker.sock:/var/run/docker.sock:ro
  command:
    - run
    - /etc/alloy/config.alloy
    - --server.http.listen-addr=0.0.0.0:12345
    - --storage.path=/var/lib/alloy
  environment:
    - ALLOY_LOG_LEVEL=info
  depends_on:
    - loki
```

**Key points:**

- Alloy listens on `0.0.0.0:12345` **in-container** (required for Docker NAT)
- Host port binding `127.0.0.1:12345` keeps UI internal-only
- Docker socket read-only (`:ro`)
- Persistent storage at `/var/lib/alloy` (positions file)
- Waits for Loki to start (removed healthcheck dependency for simplicity)

### Step 3: Create Alloy Configuration

**File:** `platform/infra/services/runtime/configs/alloy-config.alloy`

```hcl
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO
//
// Alloy configuration for Docker container log collection
// Sends logs to local Loki instance

// Discover all Docker containers
discovery.docker "containers" {
  host             = "unix:///var/run/docker.sock"
  refresh_interval = "10s"
}

// Relabel discovered containers with strict cardinality
discovery.relabel "docker_logs" {
  targets = discovery.docker.containers.targets

  // Extract compose service name → "service" label
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    regex         = "(.*)"
    replacement   = "${1}"
    target_label  = "service"
  }

  // Extract log stream (stdout/stderr)
  rule {
    source_labels = ["__meta_docker_container_log_stream"]
    target_label  = "stream"
  }

  // Add static labels (low cardinality)
  rule {
    target_label = "app"
    replacement  = "cogni-template"
  }

  rule {
    target_label = "env"
    replacement  = sys.env("APP_ENV")  // dev, test, prod
  }
}

// Collect logs from discovered containers
loki.source.docker "default" {
  host          = "unix:///var/run/docker.sock"
  targets       = discovery.relabel.docker_logs.output
  forward_to    = [loki.process.docker_logs.receiver]
  relabel_rules = discovery.relabel.docker_logs.rules
}

// Process logs (minimal - defer filtering to later PR)
loki.process "docker_logs" {
  // Parse Docker JSON wrapper
  stage.docker {}

  // Extract timestamp from Docker JSON
  stage.timestamp {
    source = "time"
    format = "RFC3339Nano"
  }

  forward_to = [loki.write.loki_endpoint.receiver]
}

// Write logs to Loki
loki.write "loki_endpoint" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

**Key points:**

- **Strict label cardinality:** `{app, env, service, stream}` only
- Docker Compose `compose_service` label → Loki `service` label (cleaner)
- No high-cardinality labels (reqId, userId, attemptId stay in JSON fields only)
- No filtering yet (add in follow-up PR)

### Step 4: Update Loki Config (if needed)

The existing `loki-config.yaml` looks good. Verify it matches:

**File:** `platform/infra/services/loki-promtail/loki-config.yaml`

Key settings:

- `auth_enabled: false` (okay for internal network)
- `http_listen_port: 3100`
- `filesystem` storage at `/loki/chunks` and `/loki/rules`
- `analytics.reporting_enabled: false` (privacy-first)

No changes needed.

### Step 5: Smoke Query Runbook

**File:** `platform/runbooks/SMOKE_QUERY_LOKI.md`

```markdown
# Loki Smoke Query Runbook

## Prerequisites

Stack must be running:
\`\`\`bash
cd platform/infra/services/runtime
docker compose ps | grep -E '(loki|alloy|app)'
\`\`\`

Expected output:

- `loki` - healthy
- `alloy` - running
- `app` - running

## Query 1: All Logs

\`\`\`bash

# Count all ingested logs in last 5 minutes

curl -G 'http://localhost:3100/loki/api/v1/query' \\
--data-urlencode 'query=count_over_time({app="cogni-template"}[5m])'
\`\`\`

Expected: Non-zero count if app is logging.

## Query 2: App Service Logs

\`\`\`bash

# Tail last 10 logs from app service

curl -G 'http://localhost:3100/loki/api/v1/query_range' \\
--data-urlencode 'query={service="app"}' \\
--data-urlencode 'limit=10'
\`\`\`

Expected: JSON logs with `level`, `msg`, `reqId`, `time` fields.

## Query 3: Error Logs Only

\`\`\`bash

# Find errors in last hour

curl -G 'http://localhost:3100/loki/api/v1/query_range' \\
--data-urlencode 'query={service="app"} | json | level="error"' \\
--data-urlencode 'limit=50' \\
--data-urlencode 'start=$(date -u -v-1H +%s)000000000' \\
  --data-urlencode 'end=$(date -u +%s)000000000'
\`\`\`

Expected: Only logs with `"level":"error"` in JSON payload.

## Query 4: Request Tracing

\`\`\`bash

# Find all logs for a specific request ID

REQID="abc123"
curl -G 'http://localhost:3100/loki/api/v1/query_range' \\
--data-urlencode "query={service=\"app\"} | json | reqId=\"$REQID\""
\`\`\`

Expected: All logs for that request (start, end, any errors).

## Validation Checklist

- [ ] Loki responds to `/ready` endpoint
- [ ] Query 1 returns non-zero count
- [ ] Query 2 returns valid JSON logs
- [ ] Query 3 filters by log level correctly
- [ ] Query 4 finds logs by reqId (high-cardinality field)
- [ ] Alloy UI shows targets at http://localhost:12345

## Troubleshooting

**No logs ingested:**

1. Check Alloy UI: http://localhost:12345 → verify targets discovered
2. Check Alloy logs: `docker logs alloy`
3. Check Loki logs: `docker logs loki`
4. Verify app is logging: `docker logs app | head`

**Labels missing:**

1. Verify `APP_ENV` is set in docker-compose
2. Check Alloy relabeling rules in config.alloy
3. Query with `{app="cogni-template"}` to see all applied labels

**High-cardinality warnings:**

1. Verify reqId/userId/attemptId are NOT labels (should be JSON fields only)
2. Run: `curl http://localhost:3100/loki/api/v1/labels` to see all labels
3. Expect: `app`, `env`, `service`, `stream` only (not reqId/userId)
   \`\`\`

---

## Execution Plan

1. ✅ Review this document
2. ⏳ Update `docker-compose.yml`:
   - Add `loki` service
   - Replace `promtail` with `alloy`
   - Add volume definitions
3. ⏳ Create `configs/alloy-config.alloy`
4. ⏳ Create `platform/runbooks/SMOKE_QUERY_LOKI.md`
5. ⏳ Test locally:
   - Stop stack: `docker compose down`
   - Recreate: `docker compose up -d`
   - Wait for health checks
   - Run smoke queries
6. ⏳ Update `docs/OBSERVABILITY.md`:
   - Mark V2 checklist items complete
   - Link to this document
   - Add "Next steps" section (dashboards, filtering, etc.)
7. ⏳ Commit changes:
   - Follows repo guidelines (no `check` failures)
   - Descriptive commit message
   - References issue/PR if applicable

---

## Future Enhancements (Separate PRs)

**Filtering:**

- Drop health check logs: `{service="app"} |= "GET /health"`
- Drop metrics endpoint logs: `{service="app"} |= "GET /metrics"`

**Structured Metadata:**

- Extract high-cardinality fields as structured metadata (Loki 2.9+)
- Queryable without indexing overhead

**Traces:**

- Add OTLP receiver in Alloy (ports 4317/4318)
- Forward to Tempo or other trace backend
- Correlate logs with traces via traceId

**Dashboards:**

- Grafana provisioning in docker-compose
- Pre-built dashboards for app logs
- Panel for error rate, P95 latency, etc.

**Alerts:**

- Loki ruler configuration
- Alert on error rate spike
- Alert on critical events (payment failures, etc.)

---

## References

- [Official Alloy Tutorial: Send Logs to Loki](https://grafana.com/docs/alloy/latest/tutorials/send-logs-to-loki/)
- [loki.source.docker Component](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [discovery.docker Component](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.docker/)
- [Loki Label Best Practices](https://grafana.com/docs/loki/latest/best-practices/)
- [Cogni-Template OBSERVABILITY.md](./OBSERVABILITY.md)

---

**Last Updated:** 2025-12-01
**Status:** Ready to execute (greenfield setup, not migration)
```
