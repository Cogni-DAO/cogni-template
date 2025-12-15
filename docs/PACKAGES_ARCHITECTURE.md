# Packages Architecture

> Internal packages for shared, pure libraries with strict isolation boundaries.

## Overview

The `packages/` directory contains **Node-owned** internal packages—pure TypeScript libraries with no `src/` or `services/` imports. Each package declares its target environment (isomorphic or node-only) via tsconfig/tsup. These enable future repo splits and clean dependency boundaries.

## When to Create a Package

Create a package when code is:

1. **Pure logic** — No I/O, no framework deps, no `src/` imports
2. **Shared across boundaries** — Used by both `src/` and potential future CLI/services
3. **Isolation-critical** — Must never depend on app internals (e.g., protocol encodings, domain constants)

**Do NOT create a package for:** UI components, feature services, adapters, or anything importing from `src/`.

## Package Structure

```
packages/<name>/
├── src/
│   └── index.ts          # Public exports (barrel file)
├── tests/                 # Package-specific tests
├── package.json           # name: @cogni/<name>, exports to dist/
├── tsconfig.json          # rootDir: src, outDir: dist, target env
└── tsup.config.ts         # Build config (platform: browser|node|neutral)
```

## Critical CI/CD Setup Checklist

When adding a new package:

1. **pnpm-workspace.yaml** — Already includes `packages/*` (no change needed)

2. **Root tsconfig.json paths** — Add canonical alias:

   ```json
   "@cogni/<name>": ["packages/<name>/src/index.ts"]
   ```

   Use `@cogni/<name>` consistently in all imports (app code and tests).

3. **Package exports** — Point to `dist/` for runtime:

   ```json
   "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
   ```

4. **Dependency-cruiser** — Add forbidden rules in `.dependency-cruiser.cjs` if the package must not import from `src/`.

## CI Model

| Lane             | Command                             | Purpose                                  |
| ---------------- | ----------------------------------- | ---------------------------------------- |
| **Fast (check)** | `pnpm typecheck`                    | Paths resolve `@cogni/<name>` → source   |
| **Contract**     | `pnpm -r --filter ./packages build` | Build dist/, validate exports/types work |

The fast lane runs on every commit. The contract lane validates that `dist/` exports match what consumers expect (runs in package tests via dynamic imports).

## Import Boundaries

| From                        | Can Import Package? | Notes                     |
| --------------------------- | ------------------- | ------------------------- |
| `src/app/`, `src/features/` | Yes                 | Via `@cogni/<name>` alias |
| `packages/<other>/`         | Yes                 | Via workspace resolution  |
| Package itself              | No `src/` imports   | Enforced by dep-cruiser   |

## Existing Packages

| Package             | Target     | Purpose                                          |
| ------------------- | ---------- | ------------------------------------------------ |
| `@cogni/aragon-osx` | isomorphic | Aragon OSx encoding, addresses, receipt decoders |

## Related Docs

- [Architecture](ARCHITECTURE.md) — Hexagonal layers and boundaries
- [Node Formation Spec](NODE_FORMATION_SPEC.md) — Uses `@cogni/aragon-osx`
