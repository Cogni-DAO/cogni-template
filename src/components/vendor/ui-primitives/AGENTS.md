# vendor/ui-primitives · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-08
- **Status:** draft

## Purpose

Vendored UI primitive building blocks copied into the repository for local maintenance.

## Pointers

- [UI Style Guide](../../../../docs/STYLEGUIDE_UI.md)
- [Updating shadcn](../../../../docs/UPDATING_SHADCN.md)

## Boundaries

```json
{
  "layer": "components",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** None (vendor code never re-exported in barrel)
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** None - internal to kit wrappers only

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Store copied example code from shadcn, Radix docs, or repo snippets for local maintenance
- This directory **does not**: Store npm libraries, provide public API, or get imported outside kit/

## Usage

Minimal local commands:

```bash
pnpm test -w path/to/this
pnpm build -w path/to/this
```

## Standards

- Vendor examples, not libraries (Radix stays as npm dep)
- No @/\* imports. Only externals. Keep diffs minimal
- Add \_vendor_utils.ts only if vendored files need cn helper
- Only kit/\*\* may import from this directory

## Dependencies

- **Internal:** imports within repo (paths)
- **External:** NPM packages/services

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Folder structure: shadcn/, radix-examples/ (only if you copy example code)
- \_vendor_utils.ts: local cn helper so vendor code doesn't import repo utils
- ESLint blocks @/\* imports in vendor/\*\*, allows clsx/tailwind-merge only here
