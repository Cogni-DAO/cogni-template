# meta · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-11
- **Status:** draft

## Purpose

Meta-information API endpoints that provide service introspection, health status, and API documentation.

## Pointers

- [API AGENTS.md](../AGENTS.md)
- [Architecture](../../../../../docs/ARCHITECTURE.md)
- [Feature Development Guide](../../../../../docs/FEATURE_DEVELOPMENT_GUIDE.md)

## Boundaries

```json
{
  "layer": "app",
  "may_import": ["features", "contracts", "shared"],
  "must_not_import": [
    "adapters/server",
    "adapters/worker",
    "core",
    "ports",
    "components"
  ]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):**
  - `/api/v1/meta/health` [GET] - Health check for liveness/readiness probes
  - `/api/v1/meta/openapi` [GET] - OpenAPI v3 specification
  - `/api/v1/meta/route-manifest` [GET] - Route manifest for e2e testing
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** health/route.ts, openapi/route.ts, route-manifest/route.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: provide service metadata; enable monitoring and API discovery; support e2e testing
- This directory **does not**: contain business logic, user data, or authentication

## Usage

```bash
curl http://localhost:3000/api/v1/meta/health        # Service health
curl http://localhost:3000/api/v1/meta/openapi       # API spec
curl http://localhost:3000/api/v1/meta/route-manifest # Route discovery
```

## Standards

- All endpoints are static responses (force-static)
- Contract validation required for all responses
- Safe for production environments (read-only)

## Dependencies

- **Internal:** contracts (meta.health, meta.route-manifest, http/openapi)
- **External:** next (NextResponse)

## Change Protocol

- Update this file when **Routes** change
- Bump **Last reviewed** date
- Ensure contract tests pass

## Notes

- Meta endpoints are infrastructure-focused, not user-facing features
- Used by monitoring systems, API tooling, and automated testing
