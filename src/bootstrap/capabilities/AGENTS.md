# bootstrap/capabilities · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-02-01
- **Status:** stable

## Purpose

Capability factories bridging ai-tools interfaces to adapters. Creates environment-aware capability instances.

## Pointers

- [Tool Use Spec](../../../docs/TOOL_USE_SPEC.md)
- [Tools Authoring](../../../docs/TOOLS_AUTHORING.md)

## Boundaries

```json
{
  "layer": "bootstrap",
  "may_import": ["adapters/server", "adapters/test", "shared"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** `createMetricsCapability()`, `stubMetricsCapability`
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** Uses PROMETHEUS_REMOTE_WRITE_URL, PROMETHEUS_QUERY_URL, PROMETHEUS_READ_USERNAME, PROMETHEUS_READ_PASSWORD via ServerEnv
- **Files considered API:** `metrics.ts`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Create capability instances, handle test/prod adapter selection
- This directory **does not**: Implement transport, execute tools

## Usage

```bash
# Consumed by container.ts automatically
```

## Standards

- Test mode returns FakeMetricsAdapter-backed capability
- Missing config returns stub that throws

## Dependencies

- **Internal:** adapters/server, adapters/test, shared
- **External:** `@cogni/ai-tools`

## Change Protocol

- Add new capability factory when adding tools requiring I/O

## Notes

- Pattern: test mode uses fake adapter, prod requires env vars or returns stub
