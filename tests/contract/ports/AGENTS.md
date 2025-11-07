# tests/contract/ports · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** stable

## Purpose

Single source of truth for port behavior. Each `*.port.contract.ts` exports a reusable test suite that any adapter must pass.

## Pointers

- [Ports](../../../src/ports/)
- [Harness](../harness/)
- [Integration tests](../../integration/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["ports", "tests"],
  "must_not_import": [
    "app",
    "features",
    "core",
    "adapters/server",
    "adapters/worker",
    "mcp"
  ]
}
```

## Public Surface

- **Exports:** `run<PortName>Contract(adapterFactory)` per port
- **Routes:** none
- **CLI:** `pnpm test`
- **Env/Config keys:** none
- **Files considered API:** `**/*.port.contract.ts`

## Responsibilities

- This directory **does:** define expectations for each port once; assert inputs/outputs and error semantics
- This directory **does not:** talk to real services; that is the adapter's job

## Usage

```bash
# in adapter int test
import { runAiPortContract } from '../../contract/ports/ai/ai.port.contract';
runAiPortContract(makeAdapterUnderTest);
```

## Standards

- No I/O in contracts. Use the harness to provide stubs
- Be explicit on edge cases and error mapping
- Version contract files if breaking changes are introduced

## Dependencies

- **Internal:** src/ports/**, tests/contract/harness/**
- **External:** vitest

## Change Protocol

- When a port changes, update the matching contract suite and adapters
- Bump **Last reviewed** date

## Notes

- Integration subdirs rule of thumb: Create a subdir when an adapter exists or an infra client is exercised: `ai/`, `db/`, `wallet/`, optionally `telemetry/`, `ratelimit/`, `logging/`
- Keep HTTP route tests out of `/integration`; put them in `/e2e` or `/integration/http-contract`
