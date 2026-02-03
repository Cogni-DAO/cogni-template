# bootstrap/ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-02-03
- **Status:** stable

## Purpose

AI tool bindings and tool source factory. Wires tool implementations with injected capabilities at bootstrap time.

## Pointers

- [Tool Use Spec](../../../docs/TOOL_USE_SPEC.md)
- [Tools Authoring](../../../docs/TOOLS_AUTHORING.md)

## Boundaries

```json
{
  "layer": "bootstrap",
  "may_import": ["bootstrap"],
  "must_not_import": ["app", "features", "core", "adapters"]
}
```

## Public Surface

- **Exports:** `createToolBindings()`, `createBoundToolSource()`, `ToolBindings`, `ToolBindingDeps`
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** `tool-bindings.ts`, `tool-source.factory.ts`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Wire tool implementations with capabilities, create ToolSourcePort
- This directory **does not**: Execute tools, contain business logic

## Usage

```bash
# Consumed by container.ts automatically
```

## Standards

- Per CAPABILITY_INJECTION: implementations receive capabilities at construction

## Dependencies

- **Internal:** bootstrap
- **External:** `@cogni/ai-core`, `@cogni/ai-tools`

## Change Protocol

- Add new tools to `tool-bindings.ts` when adding to TOOL_CATALOG

## Notes

- Per TOOL_BINDING_REQUIRED: createBoundToolSource throws if any catalog tool lacks binding
