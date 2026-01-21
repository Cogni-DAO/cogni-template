# Services Architecture

> Deployable workers and servers with their own process lifecycle, distinct from pure library packages.

## Overview

The `services/` directory contains **standalone deployable services**—Node.js processes with their own entry points, environment configuration, health endpoints, and Docker images. Services import from `packages/` but never from `src/` (the Next.js app).

**Key distinction from packages:**

| Aspect          | `packages/`                    | `services/`                   |
| --------------- | ------------------------------ | ----------------------------- |
| Process         | Library (no lifecycle)         | Standalone process            |
| Entry point     | `dist/index.js` (exports only) | `src/main.ts` (runs)          |
| Environment     | None (injected by consumer)    | Owns Zod-validated env config |
| Health checks   | None                           | `/livez`, `/readyz` endpoints |
| Docker image    | None                           | Multi-stage Dockerfile        |
| Signal handling | None                           | SIGTERM graceful shutdown     |
| Deployment      | npm package                    | K8s Deployment (replicas)     |

> **Note:** K8s `Job`/`CronJob` is reserved for finite batch tasks, not queue workers. Workers deploy as `Deployment` with horizontal scaling.

**Worker vs HTTP services:**

| Service Type | HTTP Server Needed | Health Endpoint   |
| ------------ | ------------------ | ----------------- |
| HTTP API     | Yes (Fastify, etc) | Same server       |
| Queue Worker | **No**             | Minimal node:http |

Worker services (like `scheduler-worker`) do **not** require a product HTTP server—only a minimal health endpoint for orchestrator probes. Use `node:http` directly; do not add Fastify/Express unless serving product traffic.

## When to Create a Service

Create a service when the code:

1. **Runs independently** — Worker loop, HTTP server, or scheduled job
2. **Owns its lifecycle** — Startup, shutdown, health, readiness
3. **Has deployment concerns** — Docker, K8s manifests, env vars
4. **Cannot be a library** — Needs process isolation from the Next.js app

**Do NOT create a service for:** Shared logic, type definitions, utility functions, or anything that should be a library in `packages/`.

---

## Service Structure

```
services/<name>/
├── src/
│   ├── main.ts              # Entry point (signal handling, startup)
│   ├── config.ts            # Zod env schema
│   ├── health.ts            # /livez, /readyz handlers
│   ├── worker.ts            # Main worker logic (or server.ts for HTTP)
│   ├── observability/       # Logging infrastructure
│   │   ├── logger.ts        # makeLogger() factory (pino)
│   │   └── redact.ts        # Redaction paths
│   └── ...                  # Service-specific modules
├── tests/
│   └── ...                  # Service-specific tests
├── Dockerfile               # Multi-stage build (Model B)
├── package.json             # name: @cogni/<name>-service
├── tsconfig.json            # Standalone (NOT added to root references)
├── tsup.config.ts           # Transpile-only (bundle: false)
├── vitest.config.ts         # Test config
└── AGENTS.md                # Service documentation
```

---

## MVP Service Checklist

When creating a new service, complete these items in order:

### 1. Workspace Setup

- [ ] Add `services/*` to `pnpm-workspace.yaml` (if first service)
- [ ] Create `services/<name>/package.json`:
  ```json
  {
    "name": "@cogni/<name>-service",
    "private": true,
    "type": "module",
    "scripts": {
      "build": "tsup",
      "start": "node dist/main.js",
      "dev": "tsx watch src/main.ts",
      "typecheck": "tsc --noEmit"
    }
  }
  ```
- [ ] Add workspace dependency to root `package.json` (if needed for scripts)

### 2. TypeScript Configuration

- [ ] Create `tsconfig.json` (standalone, does NOT extend root or use composite mode—services are isolated)
- [ ] Create `tsup.config.ts` for **transpile-only** (Model B):

  ```typescript
  import { defineConfig } from "tsup";

  export default defineConfig({
    entry: ["src/**/*.ts"], // Transpile all source files
    format: ["esm"],
    bundle: false, // Model B: transpile-only, node_modules copied to Docker image
    splitting: false,
    dts: false,
    clean: true,
    sourcemap: true,
    platform: "node",
    target: "node20",
  });
  ```

- [ ] Add to `biome/base.json` noDefaultExport override (tsup + vitest configs)

> **Note:** Services do NOT get added to root `tsconfig.json` references. Unlike packages (which produce declarations consumed by other packages), services are standalone processes with their own isolated build.
>
> **Why `bundle: false`:** ESM bundling breaks libs like pino that use dynamic requires (`Dynamic require of "os" is not supported`). Transpile-only preserves imports, resolved at runtime via node_modules.

**ESM relative import rule:** All relative imports in service source files **must include `.js` extensions**:

```typescript
// ✅ Correct - ESM requires .js extension
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";

// ❌ Wrong - will fail at runtime with ERR_MODULE_NOT_FOUND
import { loadConfig } from "./config";
```

This is a Node.js ESM requirement when using `bundle: false`. TypeScript resolves `.js` to `.ts` during compilation, but the output keeps `.js` which Node.js needs.

### 3. Environment Configuration

- [ ] Create `src/config.ts` with Zod schema:

  ```typescript
  import { z } from "zod";

  const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    // PORT for main HTTP server (if applicable)
    PORT: z.coerce.number().default(3001),
    // HEALTH_PORT for K8s probes (separate to avoid clashes)
    HEALTH_PORT: z.coerce.number().default(9000),
    // Service-specific vars...
  });

  export type ServiceConfig = z.infer<typeof envSchema>;

  export function loadConfig(): ServiceConfig {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment:", result.error.flatten().fieldErrors);
      process.exit(1);
    }
    return result.data;
  }
  ```

> **Note:** `HEALTH_PORT` can be the same value (e.g., 9000) across all services; only host port publishing (`ports:` in Compose) must be unique if exposing externally.

### 4. Health Endpoints

- [ ] Create `src/health.ts` using minimal `node:http` (no framework):

  ```typescript
  /**
   * Health endpoints for orchestrator probes.
   * Uses raw node:http — do NOT add Fastify/Express for workers.
   */
  import { createServer, type Server } from "node:http";

  export interface HealthState {
    ready: boolean; // Set false during drain/shutdown
  }

  export function startHealthServer(state: HealthState, port: number): Server {
    const server = createServer((req, res) => {
      if (req.url === "/livez") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      } else if (req.url === "/readyz") {
        const status = state.ready ? 200 : 503;
        res.writeHead(status, { "Content-Type": "text/plain" });
        res.end(state.ready ? "ok" : "not ready");
      } else {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(port);
    return server;
  }
  ```

**Probe contract:**

| Endpoint  | Purpose                       | K8s Probe        | Cost    |
| --------- | ----------------------------- | ---------------- | ------- |
| `/livez`  | Process alive, not deadlocked | `livenessProbe`  | Minimal |
| `/readyz` | Ready to accept work (DB OK)  | `readinessProbe` | Low     |

**Health check ownership (where to define probes):**

| Environment    | Where to Define        | Notes                                              |
| -------------- | ---------------------- | -------------------------------------------------- |
| Kubernetes     | K8s manifests          | `livenessProbe`, `readinessProbe` in pod spec      |
| Docker Compose | `healthcheck:` in YAML | Only if needed for `depends_on: condition:`        |
| Dockerfile     | **Do NOT define**      | No `HEALTHCHECK` instruction—defer to orchestrator |

> **Dockerfile HEALTHCHECK is forbidden:** It bakes probe logic into the image, preventing orchestrator-specific tuning. Probes belong in deployment manifests (K8s) or compose files, not the image.

**Worker readiness invariant:** For queue workers, `ready=false` must **gate the poll/claim loop**, not just HTTP traffic. When `ready=false`:

- Worker stops polling for new jobs immediately
- In-flight jobs drain to completion (with timeout)
- Only after drain completes does the process exit

Workers must stop claiming new jobs immediately on SIGTERM regardless of orchestrator—do not rely on external routing semantics.

### 5. Entry Point with Signal Handling

- [ ] Create `src/main.ts`:

  ```typescript
  import { loadConfig } from "./config";
  import { createHealthHandlers, type HealthState } from "./health";

  const config = loadConfig();

  const healthState: HealthState = {
    ready: false,
    dbConnected: false,
  };

  async function main() {
    // 1. Initialize dependencies
    const db = await initDatabase(config.DATABASE_URL);
    healthState.dbConnected = true;

    // 2. Start health server on dedicated port (avoids clashes with main HTTP)
    startHealthServer(createHealthHandlers(healthState), config.HEALTH_PORT);

    // 3. Mark ready AFTER initialization complete
    healthState.ready = true;
    console.log(`Service ready, health on port ${config.HEALTH_PORT}`);

    // 4. Start main work loop
    await startWorker(db);
  }

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.log(`Received ${signal}, starting graceful shutdown...`);

    // 1. Stop accepting new work immediately
    healthState.ready = false;

    // 2. Drain in-flight work (with timeout)
    await drainWithTimeout(30_000);

    // 3. Close connections
    await closeDatabase();

    // 4. Exit cleanly
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
  ```

**Shutdown invariants:**

1. Set `ready = false` immediately (canonical drain signal; in K8s also stops routing; in Compose only helps if process gates work intake)
2. Stop pulling new jobs/requests
3. Drain in-flight work with timeout
4. Close DB pool and connections
5. Exit 0 (clean) or 1 (error)

### 6. Dockerfile

**Packaging models:** Choose exactly one per service:

| Model                          | Description                            | When to Use                           | Runtime Copies            |
| ------------------------------ | -------------------------------------- | ------------------------------------- | ------------------------- |
| **B: Runtime node_modules** ⭐ | tsup transpile-only + node_modules     | Default for all services              | `dist/` + `node_modules/` |
| **A: Bundled**                 | tsup bundles all deps into single file | Only if you need single-file artifact | Only `dist/`              |

> **Default to Model B.** ESM bundling with pino and other libs that use dynamic requires causes runtime errors (`Dynamic require of "os" is not supported`). Model B (transpile-only) avoids these issues. Model A is only for advanced cases requiring single-file output (must use CJS format if bundling).

- [ ] Create multi-stage `Dockerfile`:

  > **Reference implementation:** `services/scheduler-worker/Dockerfile`

  ```dockerfile
  # syntax=docker/dockerfile:1

  # ============================================================================
  # Stage 1: Builder — install deps, build packages, prune to prod
  # ============================================================================
  FROM node:20-bookworm-slim AS builder

  # Build tools for native modules (bufferutil, etc. from shared lockfile)
  RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ && rm -rf /var/lib/apt/lists/*

  # Pin pnpm to match root package.json packageManager field
  RUN corepack enable && corepack prepare pnpm@9.12.2 --activate
  WORKDIR /app

  # Copy workspace config for dependency resolution
  COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
  COPY packages/<dep1>/package.json packages/<dep1>/
  COPY packages/<dep2>/package.json packages/<dep2>/
  COPY services/<name>/package.json services/<name>/

  # Install all dependencies (dev + prod) for build
  RUN pnpm install --frozen-lockfile --filter @cogni/<name>-service...

  # Copy source files for packages that need to be built
  COPY packages/<dep1> packages/<dep1>
  COPY packages/<dep2> packages/<dep2>
  COPY services/<name> services/<name>

  # Build packages in dependency order (transpile-only for service)
  RUN pnpm --filter @cogni/<dep1> build && \
      pnpm --filter @cogni/<dep2> build && \
      pnpm --filter @cogni/<name>-service build

  # Prune to production dependencies only
  RUN pnpm prune --prod --filter @cogni/<name>-service...

  # ============================================================================
  # Stage 2: Runner — minimal production image with node_modules
  # ============================================================================
  FROM node:20-bookworm-slim AS runner

  # Security: non-root user
  RUN addgroup --system --gid 1001 nodejs && \
      adduser --system --uid 1001 worker
  USER worker
  WORKDIR /app

  # Copy transpiled output, node_modules, and package.json files for resolution
  COPY --from=builder --chown=worker:nodejs /app/services/<name>/dist ./services/<name>/dist
  COPY --from=builder --chown=worker:nodejs /app/services/<name>/package.json ./services/<name>/
  COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
  COPY --from=builder --chown=worker:nodejs /app/packages/<dep1>/dist ./packages/<dep1>/dist
  COPY --from=builder --chown=worker:nodejs /app/packages/<dep1>/package.json ./packages/<dep1>/
  COPY --from=builder --chown=worker:nodejs /app/packages/<dep2>/dist ./packages/<dep2>/dist
  COPY --from=builder --chown=worker:nodejs /app/packages/<dep2>/package.json ./packages/<dep2>/

  WORKDIR /app/services/<name>
  ENV NODE_ENV=production

  # NOTE: No HEALTHCHECK instruction — probes defined in K8s manifests or Compose
  CMD ["node", "dist/main.js"]
  ```

**Dockerfile invariants:**

- **Pin pnpm version** to match root `package.json` `packageManager` field (not `pnpm@latest`)
- **Include build tools** in builder stage: `python3`, `make`, `g++` (required for native modules from shared lockfile)
- **Default base image:** `node:20-bookworm-slim` (glibc, broad native dep compatibility)
- Alpine (`node:20-alpine`) allowed only if: (1) no native deps, and (2) CI smoke test proves image runs correctly
- **Do NOT use `--ignore-scripts`** (breaks esbuild/tsup postinstall)
- Use multi-stage to minimize final image size
- Add OCI labels (`org.opencontainers.image.*`)
- Run as non-root user
- **No HEALTHCHECK in Dockerfile** — probes are orchestrator concerns, defined in K8s manifests or Compose files

### 7. Security Defaults (K8s)

When deploying to Kubernetes, apply these security constraints:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL

# If service needs writable temp space:
volumeMounts:
  - name: tmp
    mountPath: /tmp
volumes:
  - name: tmp
    emptyDir: {}
```

### 8. Dependency Cruiser Rules

- [ ] Add rule blocking `services/<name>/` from importing `src/`:
  ```javascript
  {
    name: "no-<name>-service-to-src",
    severity: "error",
    from: { path: "^services/<name>/" },
    to: { path: "^src/" },
    comment: "<name> service cannot import from Next.js app"
  }
  ```
- [ ] Add arch probe: `services/<name>/__arch_probes__/illegal-src-import.ts`

### 9. Repo Integration

**Dev stack integration** (required):

- [ ] Add service to `dev:infra` script in root `package.json` (appends to compose service list)
- [ ] Add to `docker-compose.dev.yml` (see template below)

**Individual service scripts** (optional, for isolated development):

- [ ] Add root scripts to `package.json`:
  ```json
  "<name>:build": "pnpm --filter @cogni/<name>-service build",
  "<name>:dev": "dotenv -e .env.local -- pnpm --filter @cogni/<name>-service dev",
  "<name>:docker:build": "docker build -f services/<name>/Dockerfile -t <name>-local ."
  ```

> **Note:** The primary dev workflow is `pnpm dev:stack` which starts all services via compose. Individual `<name>:dev` scripts are useful for debugging a single service in isolation but are not required for MVP.

- [ ] Add to `docker-compose.dev.yml`:
  ```yaml
  <name>:
    build:
      context: ../../../..
      dockerfile: services/<name>/Dockerfile
    env_file: ../../../../.env.local
    depends_on:
      postgres:
        condition: service_healthy
    # Add healthcheck once health endpoints exist
  ```
- [ ] Add to production `docker-compose.yml` (when ready for deployment)
- [ ] Add to CI workflow (`.github/workflows/`):
  - Build: `pnpm --filter @cogni/<name>-service build`
  - Test: `pnpm --filter @cogni/<name>-service test`
  - Docker build and push to GHCR with immutable SHA tags

**Invariants:**

| Invariant                  | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| TEST_DISCOVERY             | Services included in workspace test discovery + per-service test command |
| IMAGE_PER_SERVICE          | Each service has its own Dockerfile producing an OCI image               |
| CI_BUILDS_AND_PUSHES       | CI pushes immutable SHA-tagged images to registry                        |
| PROD_COMPOSE_LISTS_SERVICE | Production runtime includes the service definition                       |
| READINESS_GATES_LOCALLY    | Workers stop claiming jobs on SIGTERM regardless of orchestrator         |

### 10. Documentation

- [ ] Create `services/<name>/AGENTS.md` with:
  - Purpose and scope
  - Environment variables
  - Health endpoints
  - Deployment notes
- [ ] Update `docs/ENVIRONMENTS.md` with service env vars
- [ ] Update this table in "Existing Services" section below

---

## Internal Boundaries (Clean Architecture) — Optional

For complex services, use hexagonal/clean architecture folders within the service:

```
services/<name>/src/
├── core/           # Pure business logic (no I/O, no framework)
├── ports/          # Interfaces for external dependencies
├── adapters/       # Implementations of ports (DB, HTTP, etc.)
├── main.ts         # Composition root (wires adapters to ports)
├── config.ts       # Environment config
└── health.ts       # Health endpoints
```

**Folder rules (enforced by dependency-cruiser when folders exist):**

| From        | Can Import                     | Cannot Import          |
| ----------- | ------------------------------ | ---------------------- |
| `core/`     | `core/`, `ports/`              | `adapters/`, `main.ts` |
| `ports/`    | `ports/`, `core/`              | `adapters/`, `main.ts` |
| `adapters/` | `adapters/`, `ports/`, `core/` | `main.ts`              |
| `main.ts`   | Everything                     | —                      |

> **Activation:** These rules are **opt-in**. Dependency-cruiser only enforces them when the `core/` or `ports/` folders exist in a service.

**When to use:**

- Service has complex business logic worth isolating
- Multiple adapter implementations (e.g., real DB vs in-memory for tests)
- Team wants strong decoupling guarantees

**When to skip:**

- Simple workers with minimal logic (current `scheduler-worker`)
- Startup/MVP phase where structure is evolving

---

## Contracts

**Only needed for HTTP services.** Services exposing HTTP APIs should have a `src/contracts/` folder following the same pattern as `src/contracts/*.contract.ts` in the app.

Worker services (like `scheduler-worker`) don't need contracts—job payloads live in the domain's core package (e.g., `@cogni/scheduler-core`).

---

## Import Boundaries

**Strict isolation rules:**

| From               | Can Import                  | Cannot Import          |
| ------------------ | --------------------------- | ---------------------- |
| `services/<name>/` | `packages/*` via `@cogni/*` | `src/`, other services |
| `src/`             | `packages/*` via `@cogni/*` | `services/`            |
| `packages/`        | Other `packages/*`          | `src/`, `services/`    |

**Enforced by dependency-cruiser:**

```javascript
// services/ cannot import from src/
{
  name: "no-services-to-src",
  severity: "error",
  from: { path: "^services/" },
  to: { path: "^src/" }
}

// src/ cannot import from services/
{
  name: "no-src-to-services",
  severity: "error",
  from: { path: "^src/" },
  to: { path: "^services/" }
}
```

---

## Existing Services

| Service            | Purpose                                       | Status   |
| ------------------ | --------------------------------------------- | -------- |
| `scheduler-worker` | Graphile Worker for scheduled graph execution | MVP (v0) |

---

## Related Docs

- [Packages Architecture](PACKAGES_ARCHITECTURE.md) — Pure libraries, package vs service distinction
- [Architecture](ARCHITECTURE.md) — Hexagonal layers and boundaries
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) — Infrastructure and deployment
- [Scheduler Spec](SCHEDULER_SPEC.md) — Scheduler design and Temporal migration
