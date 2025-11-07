# components · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-08
- **Status:** draft

## Purpose

Shared presentational UI. No business logic, no data fetching. Design tokens and variants only.

## Pointers

- [Architecture](../../docs/ARCHITECTURE.md)
- [UI Style Guide](../../docs/STYLEGUIDE_UI.md)
- [Updating shadcn/ui](../../docs/UPDATING_SHADCN.md)

## Boundaries

```json
{
  "layer": "components",
  "may_import": ["components", "shared", "types", "styles"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker",
    "contracts",
    "bootstrap"
  ]
}
```

## Public Surface

- **Exports:** UI components and widgets via `components/index.ts`
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `widgets/*/index.tsx`, `ui/index.ts`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Presentational UI, tokens, themes, CVA variants, local UI state only.
- This directory **does not**: Domain rules, DB/IO, network calls, adapter logic.

## Usage

Minimal local commands:

```bash
pnpm typecheck
pnpm lint
```

## Standards

- **Subdirs:**
  - `ui/` — shadcn base. Do Not Edit. Treat as vendor code. Keep close to upstream. No feature logic.
  - `primitives/` — stateless building blocks that wrap or extend `ui/` with CVA.
  - `widgets/` — composite, stateful UI reused across features (tables, terminal, markdown viewer).
  - `layout/` — shells, headers, nav, footers.
  - `overlays/` — modal, drawer, toast presenters.
  - `forms/` — composed fields and resolvers.
  - `icons/` — app-specific SVGs.
  - `index.ts` — curated exports; do not export private internals.
- **Placement Rules:**
  - Single-route or one-off → keep colocated with that route or in `features/<slice>/components/`.
  - Reused by ≥2 slices → promote to `components/widgets/`.
  - Stateless + generic → `components/primitives/`.
  - shadcn-generated files → stay in `components/ui/` unmodified; wrap to customize.
- **Styling:** Use tokens from `src/styles/` only. No arbitrary Tailwind values. Prefer CVA for variants. Variant props must be typed. No inline styles except approved CSS vars.
- **Testing:** Snapshot widgets and critical primitives. No network. Client-only tests isolate interactivity.

## Dependencies

- **Internal:** shared/util, styles/
- **External:** React, Radix UI primitives, class-variance-authority

## Change Protocol

- Update **Last reviewed** and this file when exports or subdir rules change.
- Run boundary lint. Refuse merges that import outside `may_import`.
- For shadcn updates, follow `docs/UPDATING_SHADCN.md`.

## Notes

- Promotion policy: colocate → second consumer → promote. Keep root lean.
- Each file: short header with Purpose, Scope, Invariants. No inline commentary drift.
- Rationale and examples live in `docs/STYLEGUIDE_UI.md`.
