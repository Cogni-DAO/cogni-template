# bootstrap · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** stable

## Purpose

Application composition root. Provides environment validation and dependency injection wiring for runtime.  
System setup installers were moved to `platform/bootstrap/` and are out of scope here.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Platform bootstrap (installers)](../../platform/bootstrap/README.md)

## Boundaries

```json
{
  "layer": "bootstrap",
  "may_import": [
    "ports",
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
    "shared",
    "types",
    "bootstrap"
  ],
  "must_not_import": [
    "app",
    "features",
    "core",
    "contracts",
    "components",
    "styles",
    "assets"
  ]
}
```

## Public Surface

- **Exports:**
  - `getContainer()` - Singleton DI container with logger and config
  - `resetContainer()` - Reset singleton (tests only)
  - `Container` interface - Ports + logger + config (includes accountsForUser(userId), serviceAccountService, metricsQuery, metricsCapability, repoCapability, toolSource)
  - `ContainerConfig` interface - Runtime config (unhandledErrorPolicy, rateLimitBypass, DEPLOY_ENVIRONMENT)
  - `UnhandledErrorPolicy` type - `"rethrow" | "respond_500"`
  - `resolveAiAdapterDeps()` - AI adapter dependencies for factory
  - `createGraphExecutor()` - Factory for GraphExecutorPort (from `graph-executor.factory.ts`)
  - `createAgentCatalog()`, `listAgentsForApi()` - Discovery factory (from `agent-discovery.ts`)
  - `wrapRouteHandlerWithLogging()` - Route logging wrapper with metrics (from `http/`)
  - `wrapPublicRoute()` - Lazy singleton wrapper for public routes with rate limiting (from `http/`)
  - `makeWrapPublicRoute()` - Pure factory for testing (from `http/wrapPublicRoute`)
  - `RateLimitBypassConfig` - Test bypass config type (from `http/wrapPublicRoute`)
  - `TokenBucketRateLimiter`, `publicApiLimiter`, `extractClientIp` - Rate limiting utilities (from `http/`)
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none (uses `@/shared/env`)
- **Files considered API:** `container.ts`, `graph-executor.factory.ts`, `agent-discovery.ts`, `http/index.ts`, `http/wrapPublicRoute.ts`, `http/rateLimiter.ts`

**Subdirectories:**

- `ai/` - AI tool bindings and tool source factory
- `capabilities/` - Capability factories (MetricsCapability, RepoCapability, WebSearchCapability)
- `http/` - Route wrappers and rate limiting

## Responsibilities

- This directory **does**:
  - Dependency injection wiring with singleton container
  - Factory functions for adapter construction (e.g., createInProcGraphExecutor, createAgentCatalog)
  - Sandbox provider registration (LazySandboxGraphProvider + SandboxAgentCatalogProvider, gated by LITELLM_MASTER_KEY; sandbox adapter loaded via dynamic import to avoid Turbopack bundling native deps)
  - Discovery factory for agent listing (listAgentsForApi per DISCOVERY_PIPELINE invariant)
  - Environment-based adapter selection (APP_ENV=test → fakes, production → real adapters including RipgrepAdapter)
  - Logger initialization (one per process)
  - Route logging wrapper with type-safe auth config (envelope-only)
  - Public API rate limiting (10 req/min/IP + burst 5) with test bypass via wrapPublicRoute()
- This directory **does not**:
  - System installation or platform configuration
  - Handle request-scoped context (see `@/shared/observability`)
  - Map domain errors to HTTP responses (routes handle locally)

## Usage

Bootstrap application runtime dependencies.

## Standards

- Environment validation before startup
- Clean dependency injection patterns

## Dependencies

- **Internal:** ports, adapters, shared, types
- **External:** Node.js runtime

## Change Protocol

- Update this file when **bootstrap interfaces** change
- Bump **Last reviewed** date

## Notes

- System installers moved to platform/bootstrap/
- Focus on runtime composition only
