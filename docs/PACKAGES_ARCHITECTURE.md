# Packages Architecture

> Internal packages for shared, pure libraries with strict isolation boundaries.

## Overview

The `packages/` directory contains **Node-owned** internal packages—pure TypeScript libraries with no `src/` or `services/` imports. Each package declares its target environment (isomorphic or node-only) via tsconfig/tsup. These enable future repo splits and clean dependency boundaries.

## When to Create a Package

**TL;DR:** Make a package only when the code is small, reusable, and doesn’t depend on the app.

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

2. **Root package.json** — Add workspace dependency:

   ```json
   "dependencies": {
     "@cogni/<name>": "workspace:*"
   }
   ```

   Use `@cogni/<name>` consistently in all imports (app code and tests).

3. **Package tsconfig.json** — Enable TypeScript composite mode:

   ```json
   {
     "compilerOptions": {
       "composite": true,
       "declaration": true,
       "declarationMap": true,
       "outDir": "dist",
       "rootDir": "src"
     }
   }
   ```

4. **Root tsconfig.json references** — Add project reference:

   ```json
   "references": [
     { "path": "./packages/<name>" }
   ]
   ```

5. **Package exports** — Point to `dist/` for runtime:

   ```json
   "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
   ```

6. **Dependency-cruiser** — Add forbidden rules in `.dependency-cruiser.cjs` if the package must not import from `src/`.

## Canonical CI Flow

**TypeScript project references (`tsc -b`) is the default way packages are built and type-checked in CI.**

CI pipeline order:

1. `pnpm install --frozen-lockfile`
2. `pnpm exec tsc -b` — Build package references in dependency order (incremental)
3. `pnpm typecheck` — App typecheck (resolves packages via `dist/`)
4. `pnpm test` — Unit/integration tests

TypeScript project references build packages incrementally using `.tsbuildinfo` cache files. The app resolves `@cogni/*` imports via `package.json` exports pointing to `dist/`, **not** via tsconfig path aliases.

**Escape hatch:** If a package is temporarily source-resolved for local dev (e.g., via tsconfig paths), it must still pass the canonical CI flow (`tsc -b`) without path hacks before merging.

**Future optimization:** When package/service count grows significantly, consider Turborepo for remote caching and task graph orchestration across multiple jobs. Not required for current scale.

## Import Boundaries & Invariants

**Strict isolation rules:**

| From                        | Can Import Package?      | Can Import `src/`? | Notes                                       |
| --------------------------- | ------------------------ | ------------------ | ------------------------------------------- |
| `src/app/`, `src/features/` | Yes, via `@cogni/<name>` | Yes                | App code resolves packages via `dist/`      |
| `packages/<name>/src/`      | Yes, other packages      | **NO**             | Never import `@/` aliases or `src/**` paths |
| `packages/<other>/src/`     | Yes, via workspace       | **NO**             | Package-to-package via `@cogni/<other>`     |

**Invariants:**

- Packages **must never** import `@/` (src aliases) or any `src/**` filesystem paths
- `src/` **must never** import `packages/**` filesystem paths (use `@cogni/<name>` workspace imports only)
- Packages are ESM-only, require Node >= 20 in dev/CI and any future services
- Enforced by dependency-cruiser in CI

## Existing Packages

| Package                  | Target     | Purpose                                          |
| ------------------------ | ---------- | ------------------------------------------------ |
| `@cogni/aragon-osx`      | isomorphic | Aragon OSx encoding, addresses, receipt decoders |
| `@cogni/cogni-contracts` | isomorphic | Cogni-owned contract ABI and bytecode constants  |

## Related Docs

- [Architecture](ARCHITECTURE.md) — Hexagonal layers and boundaries
- [Node Formation Spec](NODE_FORMATION_SPEC.md) — Uses `@cogni/aragon-osx`
