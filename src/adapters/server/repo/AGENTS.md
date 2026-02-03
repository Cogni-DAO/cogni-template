# repo · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-02-03
- **Status:** draft

## Purpose

Repository access adapter implementing RepoCapability. Provides code search (ripgrep) and file retrieval with path validation and SHA stamping.

## Pointers

- [RepoCapability interface](../../../../packages/ai-tools/src/capabilities/repo.ts)
- [COGNI_BRAIN_SPEC](../../../../docs/COGNI_BRAIN_SPEC.md)
- [Tool Use Spec](../../../../docs/TOOL_USE_SPEC.md)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** `RipgrepAdapter`, `RipgrepAdapterConfig`, `RepoPathError`
- **Env/Config keys:** `COGNI_REPO_SHA` (optional SHA override)
- **Files considered API:** `ripgrep.adapter.ts`, `index.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** RepoCapability (from @cogni/ai-tools)

## Responsibilities

- This directory **does**: Implement RepoCapability for code search and file retrieval
- This directory **does not**: Define tool contracts (owned by @cogni/ai-tools), handle billing/telemetry

## Usage

Imported via server barrel (`@/adapters/server`) and instantiated by `createRepoCapability()` in `src/bootstrap/capabilities/repo.ts`. Consumed by `core__repo_search` and `core__repo_open` tool implementations. Not used directly — always accessed through `RepoCapability` interface.

```typescript
// Bootstrap wires it:
import { RipgrepAdapter } from "@/adapters/server";
const adapter = new RipgrepAdapter({
  repoRoot: env.COGNI_REPO_ROOT,
  repoId: "main",
});
```

## Standards

- REPO_READ_ONLY: Read-only access, no writes
- REPO_ROOT_ONLY: All paths validated (rejects `..`, symlink escapes)
- SHA_STAMPED: All results include HEAD sha7
- HARD_BOUNDS: search≤50 hits, snippet≤20 lines, open≤200 lines, max 256KB
- NO_EXEC_IN_BRAIN: Only spawns `rg` and `git rev-parse` with fixed flags
- RG_BINARY_NOT_NPM: Uses system `rg` binary via child_process

## Dependencies

- **Internal:** @cogni/ai-tools (RepoCapability interface), @/shared/observability
- **External:** ripgrep binary (rg), git

## Change Protocol

- Update this file when exports or env config change
- Coordinate with COGNI_BRAIN_SPEC.md for invariant changes

## Notes

- Requires system `rg` and `git` binaries at runtime (not npm packages)
- COGNI_REPO_SHA override is reserved but not yet wired (deferred until mounts without .git)
