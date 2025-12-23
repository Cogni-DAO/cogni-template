# New Package Checklist

> Quick reference for adding packages. See [PACKAGES_ARCHITECTURE.md](./PACKAGES_ARCHITECTURE.md) for full details.

## Files to Create

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

## Files to Update

| File                   | Change                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `package.json` (root)  | Add `"@cogni/<name>": "workspace:*"` to dependencies             |
| `tsconfig.json` (root) | Add `{ "path": "./packages/<name>" }` to references              |
| `biome/base.json`      | Add `packages/<name>/tsup.config.ts` to noDefaultExport override |

## Commands

```bash
pnpm install                    # Link workspace package
pnpm packages:build             # Build all packages + declarations
pnpm typecheck                  # Verify app resolves package
pnpm check                      # Full validation
```

## Key Constraints

- Package **cannot** import from `src/**` — `no-packages-to-src-or-services` rule in `.dependency-cruiser.cjs` (already exists)
- App imports via `@cogni/<name>`, not filesystem paths
- Declarations must exist in `dist/` before app typecheck passes

## Verification

```bash
pnpm packages:validate          # Check dist/index.d.ts exists
pnpm arch:check                 # Verify no boundary violations
```
