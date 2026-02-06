---
id: packages-architecture-spec
type: spec
title: Packages Architecture
status: active
spec_state: draft
trust: draft
summary: Internal @cogni/* packages — pure TypeScript libraries with strict isolation boundaries, composite builds, and ESM-only exports.
read_when: Creating a new package, debugging package builds, or working with @cogni/* imports.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [infra, meta]
---

# Packages Architecture

## Context

The `packages/` directory contains **Node-owned** internal packages — pure TypeScript libraries with no `src/` or `services/` imports. Each package declares its target environment (isomorphic or node-only) via tsconfig/tsup. These enable future repo splits and clean dependency boundaries.

## Goal

Provide a shared-library layer (`@cogni/*` workspace packages) with strict isolation from the app (`src/`) and services (`services/`), built via TypeScript project references and consumed via `dist/` exports.

## Non-Goals

- Deployable services with process lifecycle (those belong in `services/`)
- UI components or feature-specific code (those belong in `src/features/`)
- Published npm packages (all packages are `private: true` workspace-only)

## Core Invariants

1. **NO_SRC_IMPORTS**: Packages must never import `@/` (src aliases) or any `src/**` filesystem paths. Enforced by dependency-cruiser.

2. **NO_SERVICE_IMPORTS**: Packages must never import from `services/`. Dependency direction is `services → packages`, never reverse.

3. **WORKSPACE_IMPORTS_ONLY**: `src/` must never import `packages/**` filesystem paths — use `@cogni/<name>` workspace imports only.

4. **ESM_ONLY**: Packages are ESM-only, require Node >= 20 in dev/CI and any future services.

5. **COMPOSITE_BUILD**: All packages use TypeScript composite mode with `tsc -b` for incremental builds. Services do NOT get added to root `tsconfig.json` references.

6. **DIST_EXPORTS**: Package `exports` field points to `dist/` for runtime resolution. App resolves `@cogni/*` via `package.json` exports, not tsconfig path aliases.

7. **PURE_LIBRARY**: A package has no process lifecycle — no ports, no worker loops, no Docker images, no env vars, no health checks. If it needs any of these, it's a service.

## Design

### When to Create a Package

Create a package when code is:

1. **Pure logic** — No I/O, no framework deps, no `src/` imports
2. **Shared across boundaries** — Used by both `src/` and potential future CLI/services
3. **Isolation-critical** — Must never depend on app internals (e.g., protocol encodings, domain constants)

**Do NOT create a package for:** UI components, feature services, adapters, or anything importing from `src/`.

### Packages vs Services — Smell Test

Not a package if it:

- Listens on a port
- Runs a worker loop
- Has its own Docker image
- Owns environment variables or health checks

| Directory   | Contains                             | May Import From       |
| ----------- | ------------------------------------ | --------------------- |
| `packages/` | Pure libraries, no process lifecycle | Other packages        |
| `services/` | Entry points, env, signal handling   | `packages/`, own code |

**Dependency rule:** `services → packages` allowed; `packages → services` forbidden.

### Package Structure

```
packages/<name>/
├── src/
│   └── index.ts          # Public exports (barrel file)
├── tests/                 # Package-specific tests
├── package.json           # name: @cogni/<name>, exports to dist/
├── tsconfig.json          # rootDir: src, outDir: dist, target env
└── tsup.config.ts         # Build config (platform: browser|node|neutral)
```

### CI/CD Setup Checklist for New Packages

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

7. **Biome config** — Add `packages/<name>/tsup.config.ts` to the `noDefaultExport` override in `biome/base.json`:

   ```json
   {
     "includes": [
       "packages/ai-core/tsup.config.ts",
       "packages/<name>/tsup.config.ts",
       ...
     ],
     "linter": { "rules": { "style": { "noDefaultExport": "off" } } }
   }
   ```

8. **Vitest config** — Add `packages/<name>/vitest.config.ts` for package-local tests:

   ```typescript
   import tsconfigPaths from "vite-tsconfig-paths";
   import { defineProject } from "vitest/config";

   export default defineProject({
     plugins: [
       tsconfigPaths({
         projects: ["../../tsconfig.json"], // Repo root for @cogni/* resolution
       }),
     ],
     test: {
       name: "<name>",
       globals: true,
       environment: "node",
       include: ["tests/**/*.{test,spec}.{ts,tsx}"],
     },
   });
   ```

   Also add the vitest config to `biome/base.json` noDefaultExport override.

   **Test location rules:**
   - Package-local tests (`packages/<name>/tests/**`) must only import that package — no `src/` imports (enforced by dependency-cruiser)
   - Cross-package integration tests live in `tests/packages/**` and may import multiple `@cogni/*` packages

### Canonical CI Flow

**TypeScript project references (`tsc -b`) is the default way packages are built and type-checked in CI.**

CI pipeline order:

1. `pnpm install --frozen-lockfile`
2. `pnpm exec tsc -b` — Build package references in dependency order (incremental)
3. `pnpm typecheck` — App typecheck (resolves packages via `dist/`)
4. `pnpm test` — Unit/integration tests

TypeScript project references build packages incrementally using `.tsbuildinfo` cache files. The app resolves `@cogni/*` imports via `package.json` exports pointing to `dist/`, **not** via tsconfig path aliases.

**Escape hatch:** If a package is temporarily source-resolved for local dev (e.g., via tsconfig paths), it must still pass the canonical CI flow (`tsc -b`) without path hacks before merging.

**Future optimization:** When package/service count grows significantly, consider Turborepo for remote caching and task graph orchestration across multiple jobs. Not required for current scale.

### Import Boundaries

| From                        | Can Import Package?      | Can Import `src/`? | Notes                                       |
| --------------------------- | ------------------------ | ------------------ | ------------------------------------------- |
| `src/app/`, `src/features/` | Yes, via `@cogni/<name>` | Yes                | App code resolves packages via `dist/`      |
| `packages/<name>/src/`      | Yes, other packages      | **NO**             | Never import `@/` aliases or `src/**` paths |
| `packages/<other>/src/`     | Yes, via workspace       | **NO**             | Package-to-package via `@cogni/<other>`     |

### Existing Packages

| Package                  | Target     | Purpose                                                |
| ------------------------ | ---------- | ------------------------------------------------------ |
| `@cogni/ai-core`         | isomorphic | AI event types, UsageFact, ExecutorType for billing    |
| `@cogni/ai-tools`        | isomorphic | Pure tool contracts and implementations (NO LangChain) |
| `@cogni/aragon-osx`      | isomorphic | Aragon OSx encoding, addresses, receipt decoders       |
| `@cogni/cogni-contracts` | isomorphic | Cogni-owned contract ABI and bytecode constants        |
| `@cogni/ids`             | isomorphic | Branded ID types (UserId, ActorId) for RLS enforcement |
| `@cogni/scheduler-core`  | node       | Scheduling types, port interfaces, payload schemas     |
| `@cogni/db-schema`       | node       | Drizzle schema with subpath exports per domain slice   |
| `@cogni/db-client`       | node       | Drizzle client factory + scheduling adapters           |

### File Pointers

| File                        | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `packages/*/package.json`   | Workspace package declarations            |
| `packages/*/tsconfig.json`  | Composite TypeScript config per package   |
| `packages/*/tsup.config.ts` | Build config per package                  |
| `tsconfig.json` (root)      | Project references for all packages       |
| `.dependency-cruiser.cjs`   | Import boundary enforcement rules         |
| `biome/base.json`           | noDefaultExport overrides for tsup/vitest |

## Acceptance Checks

**Automated:**

- `pnpm check` — dependency-cruiser enforces import boundary rules; biome/tsc catch violations
- `pnpm exec tsc -b` — incremental package build succeeds

**Manual:**

1. Verify new packages have composite tsconfig, dist/ exports, and workspace dependency in root
2. Verify no `@/` or `src/**` imports in any `packages/` source

## Open Questions

_(none)_

## Related

- [Architecture](./architecture.md) — Hexagonal layers and boundaries
- [Node Formation Spec](../NODE_FORMATION_SPEC.md) — Uses `@cogni/aragon-osx`
- [Services Architecture](./services-architecture.md) — Deployable service contracts
- [Node vs Operator Contract](./node-operator-contract.md) — Import boundary context
