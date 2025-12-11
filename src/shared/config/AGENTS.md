# config · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2024-12-11
- **Status:** draft

## Purpose

Server-only configuration helpers sourced from versioned repo metadata (e.g., `.cogni/repo-spec.yaml`). Provides typed accessors for governance-managed inbound payment configuration for USDC credits top-up. This is the canonical source for chainId + receiving_address used by OnChainVerifier and payment flows. These settings must not rely on environment variables.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [.cogni/repo-spec.yaml](../../.cogni/repo-spec.yaml)

## Boundaries

```json
{
  "layer": "shared",
  "may_import": ["shared"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
    "mcp"
  ]
}
```

## Public Surface

- **Exports:** `getPaymentConfig()`, `InboundPaymentConfig` - server-only helpers reading repo-spec metadata
- **Routes/CLI:** none
- **Env/Config keys:** none (reads versioned files only)
- **Files considered API:** index.ts, repoSpec.server.ts

## Responsibilities

- This directory **does**: read repo-spec from `payments_in.credits_topup.*` path, validate governance-critical payment config (chainId, receivingAddress, provider), expose typed helpers for server callers.
- This directory **does not**: access browser APIs, depend on frameworks, expose env overrides, or support legacy widget paths.

## Usage

- Server components/helpers: `import { getPaymentConfig } from "@/shared/config";`
- Client components: `import type { InboundPaymentConfig } from "@/shared/config";` (props only, no direct file access)

## Standards

- Helpers must read repo-spec from disk on the server only and cache parsed results.
- No env-based overrides for governance-managed addresses or chain configuration.
- Export through `index.ts` entry point only.

## Dependencies

- **Internal:** `@/shared/web3` (chain constants)
- **External:** yaml parser, Node fs/path

## Change Protocol

- Update this file when adding/removing helpers or expanding public surface.
- Keep helpers server-only and cache parsed data to avoid repeated IO.
- Bump **Last reviewed** when materially changed.

## Notes

- Repo-spec changes require a server restart to refresh cached payment config.
- Reads from `payments_in.credits_topup.*` path only - no fallback to legacy widget paths.
