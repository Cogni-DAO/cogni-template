# tests/integration/brain · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-02-03
- **Status:** draft

## Purpose

End-to-end smoke tests for Brain-mode capability wiring. Validates the full path from temp git repo through createRepoCapability to tool invocation, including SHA stamping and citation format.

## Pointers

- [RepoCapability interface](../../../packages/ai-tools/src/capabilities/repo.ts)
- [Tool Use Spec](../../../docs/TOOL_USE_SPEC.md)
- [COGNI_BRAIN_SPEC](../../../docs/COGNI_BRAIN_SPEC.md)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["adapters/server", "shared", "tests"],
  "must_not_import": ["core", "features", "app", "mcp"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** `pnpm test:int -- tests/integration/brain`
- **Env/Config keys:** none
- **Files considered API:** none

## Responsibilities

- This directory **does**: Smoke test tool layer wiring (RipgrepAdapter → RepoCapability → tool implementations)
- This directory **does not**: Test adapter internals (see repo/), test DI container, test citation guard logic

## Usage

```bash
pnpm test:int -- tests/integration/brain
```

## Standards

- Requires system `rg` and `git` binaries
- Uses temp-git-repo fixture from `tests/integration/repo/fixtures/`
- Asserts SHA_STAMPED and REPO_CITATION_REGEX on tool results
- Cleanup guarded: `if (repo) cleanupTempGitRepo(repo)`

## Dependencies

- **Internal:** @cogni/ai-tools (tool implementations, citation regex), src/adapters/server (RipgrepAdapter), tests/integration/repo/fixtures/
- **External:** vitest, ripgrep binary, git

## Change Protocol

- Update this file when new brain-related smoke tests are added
- Bump **Last reviewed** date

## Notes

- Does not test DI container or citation guard — only tool invocation wiring
- Fixture shared with tests/integration/repo/ to avoid duplication
