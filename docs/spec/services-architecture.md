---
id: services-architecture-spec
type: spec
title: Services Architecture
status: active
spec_state: draft
trust: draft
summary: Deployable services in services/ — standalone processes with their own lifecycle, Docker images, health endpoints, and strict import isolation from src/ and other services.
read_when: Deciding whether code belongs in a service or package, reviewing service import boundaries, or checking deployment contracts.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [deployment, infra]
---

# Services Architecture

## Context

The `services/` directory contains **standalone deployable services** — Node.js processes with their own entry points, environment configuration, health endpoints, and Docker images. Services import from `packages/` but never from `src/` (the Next.js app). This is distinct from `packages/`, which are pure libraries with no process lifecycle.

## Goal

Define the structural contracts, invariants, and import boundaries for deployable services — so that each service is independently buildable, testable, deployable, and isolated from the Next.js app and other services.

## Non-Goals

- Step-by-step instructions for creating a new service (see [Create a Service Guide](../guides/create-service.md))
- CI/CD pipeline automation for services (see [CI/CD & Services GitOps Initiative](../../work/initiatives/ini.cicd-services-gitops.md))
- Package architecture (see [Packages Architecture Spec](./packages-architecture.md))

## Core Invariants

1. **SERVICE_ISOLATION**: Services never import from `src/` (the Next.js app) or from other services. Only `packages/*` via `@cogni/*` workspace imports are allowed. Enforced by dependency-cruiser.

2. **STANDALONE_BUILD**: Services have their own `tsconfig.json` (standalone, not added to root references) and `tsup.config.ts`. Unlike packages, services do not use TypeScript composite mode.

3. **IMAGE_PER_SERVICE**: Each service has its own multi-stage Dockerfile producing an OCI image. Default is Model B (transpile-only + runtime node_modules).

4. **HEALTH_ENDPOINTS_REQUIRED**: Every service exposes `/livez` (liveness) and `/readyz` (readiness) via minimal `node:http`. No Fastify/Express for workers — only if serving product HTTP traffic.

5. **GRACEFUL_SHUTDOWN**: SIGTERM sets `ready=false` immediately, stops accepting new work, drains in-flight work with timeout, closes connections, then exits.

6. **READINESS_GATES_LOCALLY**: For queue workers, `ready=false` must gate the poll/claim loop, not just HTTP traffic. Workers stop claiming new jobs immediately on SIGTERM regardless of orchestrator.

7. **NO_DOCKERFILE_HEALTHCHECK**: No `HEALTHCHECK` instruction in Dockerfiles — probes are orchestrator concerns, defined in K8s manifests or Compose files.

8. **ZOD_VALIDATED_ENV**: Every service owns a Zod-validated env config (`src/config.ts`). Services fail fast on invalid environment at startup.

9. **TEST_DISCOVERY**: Services are included in workspace test discovery and have per-service test commands.

10. **PROD_COMPOSE_LISTS_SERVICE**: Production runtime compose includes the service definition. CI pushes immutable SHA-tagged images to registry.

## Design

### Services vs Packages

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

### When to Create a Service

Create a service when the code:

1. **Runs independently** — Worker loop, HTTP server, or scheduled job
2. **Owns its lifecycle** — Startup, shutdown, health, readiness
3. **Has deployment concerns** — Docker, K8s manifests, env vars
4. **Cannot be a library** — Needs process isolation from the Next.js app

**Do NOT create a service for:** Shared logic, type definitions, utility functions, or anything that should be a library in `packages/`.

**Smell test — not a package if it:**

- Listens on a port
- Runs a worker loop
- Has its own Docker image
- Owns environment variables or health checks

### Worker vs HTTP Services

| Service Type | HTTP Server Needed | Health Endpoint   |
| ------------ | ------------------ | ----------------- |
| HTTP API     | Yes (Fastify, etc) | Same server       |
| Queue Worker | **No**             | Minimal node:http |

Worker services (like `scheduler-worker`) do **not** require a product HTTP server — only a minimal health endpoint for orchestrator probes.

### Service Structure

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

### Packaging Models

| Model                                 | Description                            | When to Use                           | Runtime Copies            |
| ------------------------------------- | -------------------------------------- | ------------------------------------- | ------------------------- |
| **B: Runtime node_modules** (default) | tsup transpile-only + node_modules     | Default for all services              | `dist/` + `node_modules/` |
| **A: Bundled**                        | tsup bundles all deps into single file | Only if you need single-file artifact | Only `dist/`              |

Default to Model B. ESM bundling with pino and other libs that use dynamic requires causes runtime errors. Model A is only for advanced cases requiring single-file output.

### Internal Boundaries (Clean Architecture) — Optional

For complex services, use hexagonal/clean architecture folders:

```
services/<name>/src/
├── core/           # Pure business logic (no I/O, no framework)
├── ports/          # Interfaces for external dependencies
├── adapters/       # Implementations of ports (DB, HTTP, etc.)
├── main.ts         # Composition root (wires adapters to ports)
├── config.ts       # Environment config
└── health.ts       # Health endpoints
```

| From        | Can Import                     | Cannot Import          |
| ----------- | ------------------------------ | ---------------------- |
| `core/`     | `core/`, `ports/`              | `adapters/`, `main.ts` |
| `ports/`    | `ports/`, `core/`              | `adapters/`, `main.ts` |
| `adapters/` | `adapters/`, `ports/`, `core/` | `main.ts`              |
| `main.ts`   | Everything                     | —                      |

> **Activation:** These rules are **opt-in**. Dependency-cruiser only enforces them when the `core/` or `ports/` folders exist in a service.

### Contracts

**Only needed for HTTP services.** Services exposing HTTP APIs should have a `src/contracts/` folder following the same pattern as `src/contracts/*.contract.ts` in the app.

Worker services (like `scheduler-worker`) don't need contracts — job payloads live in the domain's core package (e.g., `@cogni/scheduler-core`).

### Import Boundaries

| From               | Can Import                  | Cannot Import          |
| ------------------ | --------------------------- | ---------------------- |
| `services/<name>/` | `packages/*` via `@cogni/*` | `src/`, other services |
| `src/`             | `packages/*` via `@cogni/*` | `services/`            |
| `packages/`        | Other `packages/*`          | `src/`, `services/`    |

Enforced by dependency-cruiser:

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

### Existing Services

| Service            | Purpose                        | Status   | CI/CD                                                                                   |
| ------------------ | ------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| `scheduler-worker` | Temporal worker for scheduling | MVP (v0) | P0 stopgap (see [CI/CD initiative](../../work/initiatives/ini.cicd-services-gitops.md)) |

### File Pointers

| File                               | Purpose                            |
| ---------------------------------- | ---------------------------------- |
| `services/*/package.json`          | Service workspace declarations     |
| `services/*/Dockerfile`            | Multi-stage Docker build           |
| `services/*/src/main.ts`           | Entry point with signal handling   |
| `services/*/src/config.ts`         | Zod env schema                     |
| `services/*/src/health.ts`         | Health endpoint handlers           |
| `.dependency-cruiser.cjs`          | Import boundary enforcement        |
| `platform/infra/services/runtime/` | Docker Compose service definitions |

## Acceptance Checks

**Automated:**

- `pnpm check` — dependency-cruiser enforces import boundary rules
- `pnpm --filter @cogni/<name>-service build` — service builds independently
- `pnpm --filter @cogni/<name>-service test` — service tests pass

**Manual:**

1. Verify service has no imports from `src/` or other `services/`
2. Verify `/livez` and `/readyz` endpoints respond correctly
3. Verify SIGTERM triggers graceful shutdown (ready=false → drain → exit)
4. Verify Dockerfile has no `HEALTHCHECK` instruction

## Open Questions

_(none)_

## Related

- [Create a Service Guide](../guides/create-service.md) — step-by-step service creation checklist
- [Packages Architecture](./packages-architecture.md) — pure libraries, package vs service distinction
- [Architecture](./architecture.md) — hexagonal layers and boundaries
- [Node vs Operator Contract](./node-operator-contract.md) — Node/Operator deployment boundaries
- [CI/CD & Services GitOps](../../work/initiatives/ini.cicd-services-gitops.md) — service build/deploy roadmap
