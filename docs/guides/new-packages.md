---
id: new-packages-guide
type: guide
title: New Package Checklist
status: draft
trust: draft
summary: Step-by-step checklist for adding a new workspace package under packages/.
read_when: Creating a new @cogni/* workspace package.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [packages, dev]
---

# New Package Checklist

> Quick reference for adding packages. See [Packages Architecture Spec](../spec/packages-architecture.md) for full details.

## When to Use This

You are adding a new internal workspace package under `packages/`. This covers shared libraries consumed by the app or other packages.

**Do NOT use this guide for:** Services (use [Create a New Service](./create-service.md)), feature code in the Next.js app (`src/features/`), or one-off scripts (`scripts/`).

## Preconditions

- [ ] Package purpose and name decided (`@cogni/<name>`)
- [ ] Package does not duplicate existing functionality in `packages/`

## Steps

### 1. Create Package Files

Model after: `packages/aragon-osx/` or `packages/ai-core/`

```
packages/<name>/
├── src/index.ts           # Barrel export
├── package.json           # name: @cogni/<name>
├── tsconfig.json          # composite: true
├── tsup.config.ts         # Build config
├── AGENTS.md              # Package boundaries
├── __arch_probes__/       # Arch violation test
└── .gitignore             # dist/, *.tsbuildinfo
```

### 2. Update Root Configuration

| File                   | Change                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `package.json` (root)  | Add `"@cogni/<name>": "workspace:*"` to dependencies             |
| `tsconfig.json` (root) | Add `{ "path": "./packages/<name>" }` to references              |
| `biome/base.json`      | Add `packages/<name>/tsup.config.ts` to noDefaultExport override |

### 3. Build and Validate

```bash
pnpm install                    # Link workspace package
pnpm packages:build             # Build all packages + declarations
pnpm typecheck                  # Verify app resolves package
pnpm check                      # Full validation
```

### Key Constraints

- Package **cannot** import from `src/**` — `no-packages-to-src-or-services` rule in `.dependency-cruiser.cjs` (already exists)
- App imports via `@cogni/<name>`, not filesystem paths
- Declarations must exist in `dist/` before app typecheck passes

## Verification

```bash
pnpm packages:validate          # Check dist/index.d.ts exists
pnpm arch:check                 # Verify no boundary violations
```

## Troubleshooting

### Problem: `pnpm typecheck` can't find package types

**Solution:** Run `pnpm packages:build` first — declarations must exist in `dist/` before the app can resolve them.

### Problem: Dependency cruiser flags import violation

**Solution:** Packages cannot import from `src/`. Check that all imports use `@cogni/*` workspace references or external deps only.

## Related

- [Packages Architecture Spec](../spec/packages-architecture.md) — invariants, structure contracts, import boundaries
- [Create a New Service](./create-service.md) — for deployable services (not packages)
