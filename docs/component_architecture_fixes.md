# Component Architecture Fixes

Violations found against the UI implementation guide principles that need to be addressed.

## Priority 1: Critical ESLint & Import Violations

| Issue                    | File/Location                                          | Description                                                               | Priority | Status |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- | -------- | ------ |
| Hardcoded chart range    | `scripts/eslint/plugins/no-raw-tailwind.cjs:24`        | ESLint rule hardcodes `chart-[1-5]` instead of dynamic token validation   | High     | Todo   |
| Missing token generation | ESLint system                                          | No `styles.tokens.json` generation from `tailwind.css` parsing            | High     | Todo   |
| Kit imports vendor       | `src/components/kit/inputs/ModeToggle.tsx:28`          | Imports `@/components/vendor/ui-primitives/shadcn` directly               | High     | Todo   |
| Kit imports vendor       | `src/components/kit/typography/HeroActionWords.tsx:19` | Imports `@/components/vendor/ui-primitives/shadcn` directly               | High     | Todo   |
| Kit imports vendor       | `src/components/kit/data-display/Avatar.tsx:24`        | Imports `@/components/vendor/ui-primitives/shadcn/avatar` directly        | High     | Todo   |
| Kit imports vendor       | `src/components/kit/data-display/GithubButton.tsx:17`  | Imports `@/components/vendor/ui-primitives/shadcn/github-button` directly | High     | Todo   |

## Priority 2: Styling Architecture Issues

| Issue                     | File/Location                         | Description                                                               | Priority | Status |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------- | -------- | ------ |
| Preset not minimal        | `src/styles/tailwind.preset.ts`       | 59 lines with complex mappings, should be tiny per new principles         | Medium   | Todo   |
| Value duplication         | `tailwind.css` + `tailwind.preset.ts` | Values potentially duplicated between CSS and preset mappings             | Medium   | Todo   |
| ESLint dynamic validation | ESLint rule                           | Should allow `*-[var(--token-name)]` where token exists in `tailwind.css` | Medium   | Todo   |

## Priority 3: Directory Structure (Low Priority)

| Issue                 | File/Location                             | Description                                                                         | Priority | Status |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- | -------- | ------ |
| Missing app shell     | `src/components/app/shell/`               | Directory missing for global layout components (AppShell, MainHeader, etc.)         | Low      | Todo   |
| Missing app common    | `src/components/app/common/`              | Directory missing for cross-feature app components (UserMenu, DaoStatusBadge, etc.) | Low      | Todo   |
| Missing experimental  | `src/features/*/experimental/components/` | Directory missing for sandbox UI with raw Tailwind allowed                          | Low      | Todo   |
| Missing global layout | Various                                   | No global layout components found (may be missing or in wrong locations)            | Low      | Todo   |

## Implementation Notes

**For ESLint fixes:**

- Replace hardcoded `chart-[1-5]` with dynamic token validation
- Generate `styles.tokens.json` from `tailwind.css` parsing on `pnpm lint` startup
- Update rule to allow `*-[var(--token-name)]` pattern where token exists

**For import violations:**

- Kit components should not import vendor directly
- Create proper abstractions/wrappers for vendor components
- Maintain encapsulation between layers

**For styling architecture:**

- Keep `tailwind.preset.ts` minimal - prefer bracketed tokens `[var(--chart-6)]`
- Eliminate value duplication between files
- Single source of truth: values in `tailwind.css`, types in `theme.ts`

**For directory structure:**

- Create missing directories as needed for future development
- Plan component migration strategy for proper layer separation
- Consider current minimal codebase - some missing components may be expected at this stage

## ESLint Rule Refinement Plan

**Goal:** Enforce tokens everywhere except explicit zero, narrow layout min() case, and CSS keywords.

### Step-by-Step Implementation

1. **[x] Scope the rule to class contexts**
   - Change visitors to inspect only `JSXAttribute[name.name==='className']`, `CallExpression` for `cva|clsx|cn`, and CVA variant objects
   - **Validation:** `pnpm lint` no longer flags SVG paths or theme.ts. Expect total issue count to drop significantly

2. **[x] Generic bracket handling**
   - Replace prefix-specific regex with `^[a-z0-9-]+-\[(.+)\]$`
   - Extract all `var(--token)` names in brackets and validate against parsed CSS tokens
   - **Validation:** Previously false positives like `w-[var(--…)]`, `gap-[var(--…)]`, `duration-[var(--…)]`, `bg-[color-mix(... var(--…))]` now pass

3. **[x] Strip modifiers early**
   - Strip leading `!` and `-` before checks
   - **Validation:** `!text-[var(--foreground)]` and `-mt-[var(--space-sm)]` now pass

4. **[x] Allow CSS keywords**
   - Permit `(bg|text|border|ring|stroke|fill|ring-offset)-(transparent|current)`
   - **Validation:** `text-transparent` with `bg-clip-text` passes

5. **[x] Alias map with optional opacity**
   - Add tiny static alias set (primary|secondary|muted|accent|destructive|ring)
   - Allow `/NN` or `/NN%` opacity suffix
   - **Validation:** `bg-primary/80` and `from-primary/20` pass when primary is in the alias set

6. **[x] Zero-only structural utilities**
   - Allow `^(m[trblxy]?|p[trblxy]?|gap|space-[xy]|inset|top|right|bottom|left|pt|mt|pr|mr|pb|mb|pl|ml)-0$`
   - **Validation:** `pt-0`, `mt-0` pass. `ring-2`, `z-50`, `w-4` still fail (correct)

7. **[x] Selector utilities**
   - Allow `^has-\[.+\]$`
   - **Validation:** `has-[>svg]` passes

8. **[ ] Narrow layout math carve-out**
   - Allow `^min-w-\[min\(100%,\s*\d+ch\)\]$` and `^max-w-\[min\(100%,\s*\d+ch\)\]$`
   - **Validation:** `min-w-[min(100%,48ch)]` passes. Other arbitrary `min-w-[...]` still fail

9. **[ ] ESLint config scoping**
   - Disable rule for `src/styles/theme.ts`, `**/*.svg`, non-UI script folders
   - Enable for `src/styles/ui/**/*`, `src/components/**/*`, `src/features/**/*`
   - **Validation:** Token arrays in theme.ts no longer trigger the rule

10. **[ ] Fix real violations in code**
    - Replace `from-chart-2` → `from-[var(--chart-2)]` (or keep alias if defined in preset)
    - **Validation:** `pnpm lint` shows these fixed. No new errors introduced

11. **[x] Tests**
    - Add unit tests for all patterns:
    - ✅ `bg-[var(--chart-6)]`, `bg-[hsl(var(--chart-6))]`, `w-[calc(var(--space-md)+var(--space-sm))]`
    - ✅ `bg-[color-mix(in oklab, var(--chart-6) 12%, transparent)]`
    - ✅ `!text-[var(--foreground)]`, `-mt-[var(--space-sm)]`
    - ✅ `text-transparent`, `bg-primary/80`
    - ✅ `min-w-[min(100%,48ch)]`, `has-[>svg]`
    - ❌ `ring-2`, `z-50`, `w-4`, `bg-[#fff]`, `text-white`
    - **Validation:** `pnpm test` green

12. **[ ] Acceptance gate**
    - `pnpm lint` passes on `src/styles/ui/**/*`, `src/components/**/*`, `src/features/**/*` with only expected page exceptions
    - Adding `--chart-7` in tailwind.css + key in theme.ts requires zero linter changes and is usable immediately via `[var(--chart-7)]`
