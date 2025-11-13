# bootstrap · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

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

- **Exports:** Application bootstrap functions
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** none

## Responsibilities

- This directory **does**: Environment validation, dependency injection wiring
- This directory **does not**: System installation, platform configuration

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
