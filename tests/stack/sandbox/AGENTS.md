# tests/stack/sandbox · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** draft

## Purpose

Stack tests for sandbox P0.5 and P0.5a. Proves socket bridge, proxy forwarding, network isolation, secrets safety, and billing header injection using real Docker containers against a live dev stack (LiteLLM, sandbox-internal network).

## Pointers

- [Sandbox Spec](../../../docs/SANDBOXED_AGENTS.md)
- [Sandbox Adapter](../../../src/adapters/server/sandbox/)
- [Shared Fixtures](../../_fixtures/sandbox/fixtures.ts)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["adapters/server", "ports", "shared", "tests"],
  "must_not_import": ["core", "features", "app", "mcp"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** `pnpm test:stack:dev -- sandbox-llm`
- **Env/Config keys:** `LITELLM_MASTER_KEY` (required; tests skip if absent)
- **Files considered API:** none

## Responsibilities

- This directory **does**: Test proxy health endpoint via socket bridge; test LiteLLM forwarding; test network isolation (no proxy → no connectivity); test secrets isolation (no LITELLM_MASTER_KEY in container env); test OPENAI_API_BASE injection; test spoofed header handling
- This directory **does not**: Test actual LLM completions (requires internet); test billing reconciliation; test graph execution

## Usage

```bash
# Requires running dev stack
pnpm dev:stack:test

# Run P0.5 proxy tests
pnpm test:stack:dev -- sandbox-llm
```

## Standards

- `testTimeout: 4_000` — full proxy+sandbox flow completes in <1s
- `hookTimeout: 10_000` — setup/teardown touches multiple containers
- Tests skip (not fail) if `LITELLM_MASTER_KEY` is unset
- `cleanupOrphanedProxies()` runs in beforeAll and afterAll

## Dependencies

- **Internal:** src/adapters/server/sandbox, tests/\_fixtures/sandbox
- **External:** vitest, dockerode, Docker daemon, LiteLLM, sandbox-internal network

## Change Protocol

- Update tests when proxy or sandbox adapter behavior changes
- Bump **Last reviewed** date
- Ensure `pnpm test:stack:dev -- sandbox-llm` passes

## Notes

- Requires `cogni-sandbox-runtime:latest` image — `pnpm sandbox:docker:build`
- Requires `nginx:alpine` image for proxy containers
- Requires dev stack running — `pnpm dev:stack:test`
- Orphan proxy containers (label `cogni.role=llm-proxy`) cleaned up automatically
