# bootstrap · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-01
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
  - `getContainer()` - Singleton DI container with logger
  - `resetContainer()` - Reset singleton (tests only)
  - `Container` interface - Ports + logger
  - `resolveAiDeps()` - AI feature dependencies
  - `wrapRouteHandlerWithLogging()` - Route logging wrapper (from `http/`)
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none (uses `@/shared/env`)
- **Files considered API:** `container.ts`, `http/index.ts`

## Responsibilities

- This directory **does**:
  - Dependency injection wiring with singleton container
  - Environment-based adapter selection (APP_ENV=test → fakes, production → real)
  - Logger initialization (one per process)
  - Route logging wrapper with type-safe auth config (envelope-only)
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
