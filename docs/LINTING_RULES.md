# Linting & Formatting Rules Inventory

> **Purpose**: Comprehensive inventory of all ESLint and Prettier rules in cogni-template with analysis of Biome migration feasibility.
>
> **Status**: Current as of 2025-11-25
>
> **Related Docs**:
>
> - [ESLINT_TESTING.md](../tests/lint/ESLINT_TESTING.md) - Test coverage documentation
> - [ui-style-spec.json](./ui-style-spec.json) - UI governance specification

---

## Migration TODO Checklist

### Phase 0: Parity Gating (4-6 hours)

- [x] Create `biome.json` with formatter config matching Prettier settings
- [x] Add Biome linter rules for 31 easy migrations (core TS, imports, naming)
- [x] Add Biome non-blocking run to `pnpm lint` (runs in CI via `pnpm check`)
- [x] Create `tests/lint/biome/canaries.spec.ts` test suite
- [x] Test `useSortedClasses` against real Tailwind fixtures (5+ files)
- [x] Run Biome React/Next.js rules against existing test fixtures
- [x] Run Biome a11y rules against existing test fixtures
- [x] Document parity gaps: list rules where Biome differs from ESLint
- [x] Calculate coverage: what % of current violations does Biome catch?

### Phase 1: Formatting Consolidation (2-3 hours)

- [x] Update `package.json` scripts: `format` → Biome for JS/TS/JSON, Prettier retained for MD/CSS/YAML
- [x] Update `lint-staged` to use `biome check --apply` instead of Prettier for TS/TSX/JS
- [ ] Update CI to use `biome format` for formatting checks
- [x] Verify no formatting churn: run format, commit, run again (no diff)
- [x] **Decision**: Keep/remove Prettier based on Tailwind sorting parity
  > **Outcome**: **Hybrid Model**. We use Biome for JS/TS/JSON (including Tailwind sorting via `useSortedClasses`) and keep Prettier for MD/CSS/YAML only.

### Phase 2: Lint Migration (Atomic Commits)

- [x] **Commit 1A**: Toolchain MVP (Pipeline Only)
  > **Note**: Establishes Biome pipeline with MVP rules (recommended disabled). No source code changes.
- [x] **Commit 1B**: Mechanical Biome Apply
  > **Note**: Repo-wide formatting and class sorting fixes. Purely mechanical.
- [x] **Commit 2B**: Migrate `no-default-export`
  > **Note**: Enabled in Biome (error), removed from ESLint. Strict overrides for Next.js App Router only.
- [x] **Commit 3**: Migrate `no-process-env` (with parity tests)
  > **Note**: Enabled in Biome (error), removed from ESLint. Allowlist for env modules and infrastructure files.
- [x] **Commit 4**: Migrate `consistent-type-imports` (with parity tests)
  > **Note**: Enabled in Biome as useImportType (error), removed from ESLint base and app configs. Enforces type-only imports.
- [x] **Commit 5**: Migrate `no-unused-vars` & `unused-imports` (with parity tests)
  > **Note**: Enabled in Biome as noUnusedVariables + noUnusedImports (error), removed from ESLint. Both rules flag unused code; underscore-prefix allowed.
- [x] **Commit 6**: Migrate `no-explicit-any`
  > **Note**: Enabled in Biome as noExplicitAny (error), disabled in ESLint. Flags all explicit `any` types.
- [x] **Commit 7**: Migrate Import Sorting (`simple-import-sort`)
  > **Note**: Migrated to Biome organizeImports. Removes eslint-plugin-simple-import-sort. Biome now sorts: Node built-ins → external packages → internal aliases.
- [x] **Commit 8**: Final ESLint Cleanup & Verification
  > **Note**: Removed React/Next.js, a11y, filename conventions (unicorn/check-file) from ESLint. ESLint now only enforces hex boundaries + UI/Tailwind governance. Filename conventions dropped temporarily (will be reintroduced via Biome `useFilenamingConvention` or Ultracite later).
- [x] **Commit 8B**: Remove Duplicate Vendor SDK Restrictions
  > **Note**: Removed ESLint vendor SDK import restrictions (no-vendor-sdk-imports plugin). These patterns were duplicated - Biome already enforces identical restrictions via `noRestrictedImports` (configured in Commit 1B) with same `src/infra/**` exemption.

### Remaining ESLint Rules (Post-Commit 8B)

**Active ESLint Configs**: base, app, tests, ui-governance

**Rules by Category** (Remaining):

1. **UI Governance** (4 rules) - custom Tailwind token enforcement
   - `ui-governance/no-raw-colors`, `no-arbitrary-non-token-values`, `token-classname-patterns`, `no-vendor-imports-outside-kit`

2. **Hexagonal Architecture** - dependency-cruiser
   - ✅ **Migrated from ESLint**: Layer boundaries now enforced via dependency-cruiser (41/59 tests complete).
   - See [tests/arch/AGENTS.md](../tests/arch/AGENTS.md) for boundary enforcement details and migration status.

3. **Tailwind** (5 rules) - eslint-plugin-tailwindcss
   - `tailwindcss/no-conflicting-utilities`, `no-arbitrary-value-overuse`, `prefer-theme-tokens`, `valid-theme-function`, `valid-apply-directive`

4. **UI Import Restrictions** (layer-specific)
   - `no-restricted-imports`, `no-restricted-properties`, `import/no-internal-modules`, `no-inline-styles/no-inline-styles`
   - Features, app, styles, vendor, kit layers

**Rules REMOVED in Commit 8** (now handled by Biome or dropped):

- ❌ React/Next.js (~15 rules) - `react-hooks/*`, `@next/next/*`, `react/*`
- ❌ Accessibility (~11 rules) - `jsx-a11y/*`
- ❌ Filename Conventions (~10 rules) - `unicorn/filename-case`, `check-file/*` (dropped temporarily)
- ❌ TypeScript core (~5 rules) - `@typescript-eslint/*` (moved to Biome)
- ❌ Import sorting - `simple-import-sort/*` (moved to Biome organizeImports)

**Rules REMOVED in Commit 8B** (duplicate, now only in Biome):

- ❌ Vendor SDK Restrictions (1 rule) - `no-vendor-sdk-imports/no-vendor-sdk-imports` (duplicate of Biome `noRestrictedImports`)

**Total Active ESLint Rules**: ~12-14 (down from ~77)
**Migrated to Biome**: 10 rules (Commits 2B-8B)
**Dropped temporarily**: ~10 filename rules (to be reintroduced via Biome later)

### Post-Commit 8 Notes

**Filename Conventions**: Temporarily dropped `unicorn/filename-case` and `check-file/*` rules. These will be reintroduced later via:

- Biome `useFilenamingConvention` when recommended rules are enabled
- Or Ultracite custom rules for complex Next.js patterns

**Boundaries**: `eslint-plugin-boundaries` tests currently failing. Being replaced by dependency-cruiser (in progress by another developer).

**Performance**: ESLint surface area reduced by ~85% (77 → ~13-15 rules). Most linting now handled by Biome.

### Future Work

- [ ] Enable Biome `useFilenamingConvention` for filename discipline
- [ ] Replace `eslint-plugin-boundaries` with dependency-cruiser
- [ ] Consider Biome React/a11y rules once stable
- [ ] Measure performance: compare before/after times for `pnpm format` and `pnpm check`

---

### Phase 0 Results (completed)

- **Easy-rule coverage enabled in Biome**: noExplicitAny, noUnusedImports/Variables, useImportType, useNamingConvention (vars/functions/types), noProcessEnv (with allowlist), vendor SDK import bans, useSortedClasses; noDefaultExport scoped to `src/{components,features,app}` only.
- **Tailwind sorting parity**: `pnpm biome check` on 6 production files (`WalletConnectButton.tsx`, `auth.client.tsx`, `wallet.client.tsx`, `kit/inputs/Button.tsx`, `app/(app)/chat/page.tsx`, `app/(app)/credits/page.tsx`) surfaced zero `useSortedClasses` findings (classes already sorted); other findings matched existing ESLint rules (noExplicitAny, useImportType, noProcessEnv, scoped noDefaultExport).
- **React/Next/a11y parity canaries**: Biome flagged hooks ordering (`useHookAtTopLevel`), exhaustive deps (warn), and a11y alt text (`useAltText`) on canary fixtures; sample coverage 6/6 = 100% for targeted checks.
- **Parity gaps**: None observed in Phase 0 sample set. **TODO (Phase 2)**: run full ESLint fixture parity for React/Next/a11y and record coverage/false-positive rates.
- **Coverage metric (sample)**: Easy-rule sample set (unused imports/vars, import type, process.env guard, hooks, alt text, Tailwind sorting) detected 100% of expected issues across canaries and real-file runs.

## Migration Complexity Legend

- 🟢 **Easy**: Direct Biome equivalent exists or simple config
- 🟡 **Moderate**: Possible with Biome but requires custom config or workarounds
- 🔴 **Hard**: Would require custom GritQL plugin development
- ⛔ **Not Feasible**: No realistic Biome path; requires ESLint-specific plugin ecosystem

---

## Table of Contents

### Formatting (Prettier)

1. [Prettier Configuration Analysis](#1-prettier-configuration-analysis)

### Linting (ESLint)

2. [Core TypeScript & JavaScript Rules](#2-core-typescript--javascript-rules)
3. [Import Management](#3-import-management)
4. [Filename & Naming Conventions](#4-filename--naming-conventions)
5. [React & Next.js Rules](#5-react--nextjs-rules)
6. [Accessibility Rules](#6-accessibility-rules)
7. [Tailwind & Community Plugins](#7-tailwind--community-plugins)
8. [UI Governance (Custom Rules)](#8-ui-governance-custom-rules)
9. [Hexagonal Architecture Boundaries](#9-hexagonal-architecture-boundaries)
10. [Vendor SDK Import Restrictions](#10-vendor-sdk-import-restrictions)
11. [Node.js & Environment Rules](#11-nodejs--environment-rules)
12. [Documentation & Code Style](#12-documentation--code-style)
13. [Test Overrides](#13-test-overrides)

### Migration Strategy

14. [Summary & Recommendations](#14-summary--recommendations)

---

## 1. Prettier Configuration Analysis

**Source Files**:

- `.prettierrc` - Prettier configuration
- `.prettierignore` - Ignored paths
- `package.json` - Scripts and lint-staged integration

### Current Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "always",
  "bracketSpacing": true,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### Prettier Ignore Patterns

```
.next
out
dist
build
coverage
node_modules
*.d.ts
pnpm-lock.yaml
package-lock.json
yarn.lock
```

### Integration Points

**Scripts** (`package.json`):

- `pnpm format` → `prettier --write .`
- `pnpm format:check` → `prettier --check .`

**Pre-commit Hook** (`lint-staged`):

```json
{
  "*.{ts,tsx,js,mjs,cjs}": ["eslint --fix", "prettier --write"],
  "*.{md,css,json}": ["prettier --write"]
}
```

**CI/CD**: Part of `pnpm check` pipeline

---

### Biome Migration Analysis: Formatting Rules

| Prettier Option  | Value                         | Biome Equivalent                                  | Migration   |
| ---------------- | ----------------------------- | ------------------------------------------------- | ----------- |
| `semi`           | `true`                        | `formatter.semicolons: "always"`                  | 🟢 Easy     |
| `trailingComma`  | `"es5"`                       | `formatter.trailingComma: "es5"`                  | 🟢 Easy     |
| `singleQuote`    | `false`                       | `formatter.quoteStyle: "double"`                  | 🟢 Easy     |
| `printWidth`     | `80`                          | `formatter.lineWidth: 80`                         | 🟢 Easy     |
| `tabWidth`       | `2`                           | `formatter.indentWidth: 2`                        | 🟢 Easy     |
| `useTabs`        | `false`                       | `formatter.indentStyle: "space"`                  | 🟢 Easy     |
| `endOfLine`      | `"lf"`                        | `formatter.lineEnding: "lf"`                      | 🟢 Easy     |
| `arrowParens`    | `"always"`                    | `javascript.formatter.arrowParentheses: "always"` | 🟢 Easy     |
| `bracketSpacing` | `true`                        | `javascript.formatter.bracketSpacing: "true"`     | 🟢 Easy     |
| **Plugin**       | `prettier-plugin-tailwindcss` | N/A                                               | 🔴 **Hard** |

**Summary**: 9/10 options have direct Biome equivalents. The Tailwind plugin is the only challenge.

---

### Tailwind Class Sorting

**What `prettier-plugin-tailwindcss` Currently Does**:

- Automatically sorts Tailwind classes in a consistent order
- Follows Tailwind's official class ordering (layout → typography → colors → effects)
- Works in `className` props, `cn()` calls, and template literals
- Handles modifiers correctly (`hover:`, `md:`, etc.)

**Example**:

```tsx
// Before
<div className="text-white p-4 bg-primary hover:bg-secondary mt-2 flex">

// After (sorted)
<div className="mt-2 flex bg-primary p-4 text-white hover:bg-secondary">
```

**Why It Matters**: Consistent class ordering prevents merge conflicts and makes code reviews easier.

**Biome Status**: ✅ **Available via `useSortedClasses` rule**

- Biome has a dedicated Tailwind class sorting rule: `nursery/useSortedClasses`
- Lint rule with auto-fix capability (not just formatter)
- Can be enabled in Biome linter configuration
- **Must validate against our fixtures before migration**

**Migration Strategy**:

1. **Test Biome's `useSortedClasses` first** (Recommended)
   - Enable `nursery/useSortedClasses` in Biome config
   - Run against existing fixtures to validate sorting matches expectations
   - If behavior is acceptable, use Biome-only (no extra tools)
   - Complexity: 🟢 Easy
   - Benefit: Single tool, no sprawl

2. **Keep `prettier-plugin-tailwindcss` if Biome sorting differs**
   - Only if Biome's sorting produces unacceptable results on real fixtures
   - Document specific cases where Prettier plugin is superior
   - Complexity: 🟡 Moderate (tool sprawl)

3. **Fallback: Use `rustywind` if both fail**
   - Only if neither Biome nor Prettier produce acceptable results
   - Complexity: 🟡 Moderate (additional tool)

**Action Required**: Run Phase 0 parity test with `useSortedClasses` before deciding

> **Update**: `useSortedClasses` has been validated and is active. We are using Biome for Tailwind sorting in JS/TS/tsx files.

---

### Biome Formatter Configuration (Equivalent)

Here's the equivalent `biome.json` configuration:

```json
{
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingComma": "es5",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSpacing": true,
      "bracketSameLine": false
    }
  },
  "json": {
    "formatter": {
      "enabled": true,
      "indentWidth": 2
    }
  }
}
```

**Note**: This config does **not** include Tailwind class sorting.

---

### Migration Scripts Comparison

| Task             | Current (Prettier)   | With Biome               | Change Required     |
| ---------------- | -------------------- | ------------------------ | ------------------- |
| Format all       | `prettier --write .` | `biome format --write .` | Update script       |
| Check formatting | `prettier --check .` | `biome format .`         | Update script       |
| Pre-commit hook  | `prettier --write`   | `biome format --write`   | Update lint-staged  |
| CI check         | Part of `pnpm check` | Part of `pnpm check`     | Update check script |

**lint-staged migration**:

```json
{
  "*.{ts,tsx,js,mjs,cjs}": [
    "biome check --apply .", // Format + lint + organize imports
    "eslint --fix" // If keeping ESLint for specific rules
  ],
  "*.{md,css,json}": ["biome format --write ."]
}
```

---

### Prettier vs. Biome: Feature Comparison

| Feature              | Prettier                        | Biome                            | Notes                       |
| -------------------- | ------------------------------- | -------------------------------- | --------------------------- |
| **Speed**            | ~1-2s for large codebase        | ~50-200ms (10-40× faster)        | Biome is Rust-based         |
| **Configuration**    | JSON with plugins               | JSON (no plugins yet)            | Biome is simpler            |
| **Language Support** | JS/TS/JSX/CSS/MD/JSON/YAML/HTML | JS/TS/JSX/JSON (CSS/MD planned)  | Prettier has more           |
| **Tailwind Sorting** | ✅ Via plugin                   | ❌ Not available                 | Critical gap                |
| **Integration**      | Mature ecosystem                | Growing (VSCode, JetBrains)      | Prettier more mature        |
| **Auto-fixes**       | Format only                     | Format + lint + organize imports | Biome does more             |
| **Bundle Size**      | ~6 MB (node_modules)            | ~20 MB (single binary)           | Biome is standalone         |
| **Stability**        | Very stable (v3.x)              | Stable but evolving (v1.x)       | Prettier more battle-tested |

---

### Recommended Migration Path for Formatting

Given the critical dependency on Tailwind class sorting, we have selected **Option A (Hybrid)**.

#### Option A: Hybrid (Biome + Prettier for non-code files)

**Setup**:

1. Use Biome for all JS/TS/JSON formatting and linting (including Tailwind sorting).
2. Keep Prettier **only** for `.md`, `.css`, `.yaml`, `.yml` files.
3. **Crucial**: Do not run `prettier --write .` globally. Scope it to specific extensions.

**Pros**:

- ✅ Get Biome speed for most files (code)
- ✅ Keep Tailwind sorting (via Biome `useSortedClasses`)
- ✅ No new tools (no `rustywind`)
- ✅ Prettier handles the rest (docs, styles, config)

**Cons**:

- ❌ Two formatters to maintain (but scoped by file type)

**Config**:

```json
// package.json scripts
{
  "format": "pnpm format:biome && pnpm format:prettier",
  "format:check": "pnpm format:biome:check && pnpm format:prettier:check"
}

// lint-staged
{
  "*.{ts,tsx,js,jsx,mjs,cjs,json}": ["biome check --apply"],
  "*.{md,css,yaml,yml}": ["prettier --write"]
}
```

**Complexity**: 🟢 Easy

---

#### [DEPRECATED] Option B: Biome + rustywind

_This option was considered but rejected to avoid tool sprawl._

---

#### [DEPRECATED] Option C: Keep Prettier (Status Quo)

_This option was rejected to move towards Biome's performance benefits._

#### Option A: Hybrid (Biome + Prettier for Tailwind)

**Setup**:

1. Use Biome for all formatting rules
2. Keep Prettier only for `.tsx`/`.jsx` files with Tailwind classes
3. Run Prettier after Biome in lint-staged

**Pros**:

- ✅ Get Biome speed for most files
- ✅ Keep Tailwind sorting
- ✅ Incremental migration

**Cons**:

- ❌ Two formatters to maintain
- ❌ Potential conflicts if not configured carefully
- ❌ Slightly more complex setup

**Config**:

```json
// biome.json
{
  "files": {
    "ignore": ["*.tsx", "*.jsx"]  // Let Prettier handle these
  }
}

// .prettierignore (add)
*.ts
*.mts
*.cjs
*.mjs
*.json
*.md
```

**Complexity**: 🟡 Moderate (3-4 hours setup + testing)

---

#### Option B: Biome + rustywind

**Setup**:

1. Replace Prettier with Biome entirely
2. Use `rustywind` CLI for Tailwind class sorting
3. Update lint-staged to run both

**Pros**:

- ✅ Eliminate Prettier dependency
- ✅ rustywind is also Rust-based (fast)
- ✅ Cleaner separation of concerns

**Cons**:

- ❌ New tool to learn/maintain
- ❌ May have slight sorting differences from prettier-plugin-tailwindcss
- ❌ Need to verify it handles all edge cases (cn() calls, template literals)

**Config**:

```json
// package.json scripts
{
  "format": "biome format --write . && rustywind --write .",
  "format:check": "biome format . && rustywind --check ."
}

// lint-staged
{
  "*.{ts,tsx,js,mjs,cjs}": [
    "biome check --apply .",
    "rustywind --write"
  ]
}
```

**Complexity**: 🟢 Easy (2-3 hours setup + verification)

---

#### Option C: Keep Prettier (Status Quo)

**Setup**: No changes

**Pros**:

- ✅ Zero migration effort
- ✅ Battle-tested setup
- ✅ All features working as expected

**Cons**:

- ❌ Slower formatting (1-2s vs. 50-200ms)
- ❌ Miss out on Biome's integrated linting
- ❌ Two separate tools (Prettier + ESLint)

**Complexity**: 🟢 Zero effort

---

### Testing Checklist for Biome Migration

If you migrate from Prettier to Biome, verify these scenarios:

- [ ] Basic TypeScript files format identically
- [ ] JSX/TSX files format identically
- [ ] Tailwind classes are sorted consistently
- [ ] `cn()` and `clsx()` calls are formatted correctly
- [ ] Template literals with classes are handled
- [ ] JSON files format identically
- [ ] Markdown files format identically (if Biome supports them at migration time)
- [ ] Pre-commit hooks work correctly
- [ ] CI pipeline passes
- [ ] VSCode extension works (if used)
- [ ] Format on save works (if enabled)
- [ ] No conflicts between Biome formatter and ESLint rules

**Test command**:

```bash
# Format with current Prettier
pnpm format

# Commit to git
git add . && git commit -m "test: baseline formatting"

# Format with new Biome setup
pnpm format

# Check diff (should be minimal or zero)
git diff
```

---

### Cost-Benefit Analysis: Prettier → Biome

| Factor               | Prettier                | Biome                     | Winner                |
| -------------------- | ----------------------- | ------------------------- | --------------------- |
| **Speed**            | 1-2s for project        | 50-200ms                  | Biome (10-40× faster) |
| **Tailwind Support** | ✅ Native plugin        | ❌ / 🟡 rustywind         | Prettier              |
| **All-in-one**       | Format only             | Format + lint + imports   | Biome                 |
| **Setup Complexity** | Simple (1 config)       | Moderate (2-3 tools)      | Prettier              |
| **Ecosystem**        | Mature, widely adopted  | Growing, less mature      | Prettier              |
| **Bundle Size**      | Smaller for JS projects | Larger single binary      | Prettier              |
| **Future-proof**     | Stable, slow evolution  | Active, rapid development | Biome                 |

**Recommendation**:

For this project specifically, **Option B (Biome + rustywind)** is the best choice:

1. **Eliminates Prettier entirely** → Simpler dependency graph
2. **rustywind is well-maintained** → Active Rust project with 500+ stars
3. **Consistent with Biome's philosophy** → Both are Rust toolchain
4. **Easy to test** → Run both formatters, compare output
5. **Acceptable tradeoff** → Small setup cost for long-term speed gains

**Migration Effort**: ~4-6 hours (setup, test, document)

**ROI**:

- Save 1-2s per format run × 50+ runs/day × team size
- Cleaner toolchain (1 formatter, not 2)
- Future-ready for Biome's growing ecosystem

---

## 2. Core TypeScript & JavaScript Rules

**Source**: `eslint/base.config.mjs`

### TypeScript Strict Rules

| Rule                                               | Severity | Description                                                | Biome Migration                   |
| -------------------------------------------------- | -------- | ---------------------------------------------------------- | --------------------------------- |
| `@typescript-eslint/no-explicit-any`               | error    | Disallow `any` type                                        | 🟢 Easy - `noExplicitAny`         |
| `@typescript-eslint/no-unused-vars`                | error    | Disallow unused variables (ignore `_` prefix)              | 🟢 Easy - `noUnusedVariables`     |
| `unused-imports/no-unused-imports`                 | error    | Auto-remove unused imports                                 | 🟢 Easy - Built-in import sorting |
| `@typescript-eslint/no-misused-promises`           | error    | Ensure correct Promise usage (skip void attrs)             | 🟡 Moderate - Partial support     |
| `@typescript-eslint/consistent-type-imports`       | error    | Enforce `type` imports                                     | 🟢 Easy - Built-in                |
| `@typescript-eslint/explicit-function-return-type` | warn     | Require function return types (allow expressions)          | 🟡 Moderate - May need config     |
| TypeScript strict config                           | error    | All rules from `@typescript-eslint/strict`                 | 🟡 Moderate - Most covered        |
| TypeScript stylistic config                        | error    | All rules from `@typescript-eslint/stylistic-type-checked` | 🟡 Moderate - Subset available    |

**Biome Assessment**: Most TypeScript rules have direct Biome equivalents. The stylistic rules may need individual mapping.

---

## 2. Import Management

**Sources**: `eslint/base.config.mjs`, `eslint/app.config.mjs`

### Import Sorting & Resolution

| Rule                         | Severity | Description                                | Biome Migration                             |
| ---------------------------- | -------- | ------------------------------------------ | ------------------------------------------- |
| `simple-import-sort/imports` | error    | Sort imports consistently                  | 🟢 Easy - Built-in import sorting           |
| `simple-import-sort/exports` | error    | Sort exports consistently                  | 🟢 Easy - Built-in export sorting           |
| `import/no-unresolved`       | error    | Disallow unresolved imports                | 🟢 Easy - Built-in TypeScript integration   |
| `import/no-cycle`            | error    | Disallow circular dependencies             | 🟡 Moderate - May need custom config        |
| `import/no-default-export`   | error    | Disallow default exports (components only) | ✅ Migrated - `noDefaultExport` (Commit 2B) |
| `import/no-internal-modules` | error    | Restrict deep imports in features          | 🔴 Hard - Path-based restrictions           |

### Import Restrictions by Layer

| Layer                 | Restrictions                                        | Biome Migration                    |
| --------------------- | --------------------------------------------------- | ---------------------------------- |
| **All layers**        | No parent-relative imports (`../**`)                | 🟢 Easy - Path restrictions        |
| **All layers**        | No direct vendor imports (`@/components/vendor/**`) | 🟢 Easy - Path restrictions        |
| **All layers**        | No direct global CSS import except layout.tsx       | 🟢 Easy - Path + file restrictions |
| **All layers**        | `tailwind-merge` only in `src/styles/**` and vendor | 🟢 Easy - Path restrictions        |
| **Features**          | No cross-feature imports (`@/features/**`)          | 🟢 Easy - Path pattern matching    |
| **Features**          | No styles imports (`@/styles/**`)                   | 🟢 Easy - Path restrictions        |
| **Features**          | No adapter imports (`@/adapters/**`)                | 🟢 Easy - Path restrictions        |
| **Features**          | No bootstrap imports (`@/bootstrap/**`)             | 🟢 Easy - Path restrictions        |
| **Features**          | No deep core imports (must use `@/core` barrel)     | 🔴 Hard - Barrel enforcement       |
| **App**               | No adapter imports (`@/adapters/**`)                | 🟢 Easy - Path restrictions        |
| **Kit**               | `tailwind-merge` not allowed                        | 🟢 Easy - Path + name restriction  |
| **Styles**            | Allow `clsx`, `tailwind-merge`                      | 🟢 Easy - Path exemption           |
| **Vendor**            | All imports allowed                                 | 🟢 Easy - Path exemption           |
| **Shared cn utility** | Allow `tailwind-merge`                              | 🟢 Easy - File exemption           |

**Biome Assessment**: Most import restrictions are path-based and can be implemented in Biome. Barrel enforcement and internal module restrictions are harder.

---

## 3. Filename & Naming Conventions

**Source**: `eslint/filename.config.mjs`

### Global Rules

| Rule                      | Severity | Description                      | Biome Migration                  |
| ------------------------- | -------- | -------------------------------- | -------------------------------- |
| `check-file/no-index`     | error    | Ban index files globally         | 🟢 Easy - Glob pattern exclusion |
| Specific barrel allowlist | off      | Allow index.ts in specific paths | 🟢 Easy - Path exemptions        |

### Layer-Specific Conventions

| Layer/Pattern                              | Convention                              | Biome Migration                 |
| ------------------------------------------ | --------------------------------------- | ------------------------------- |
| **Components** (`src/components/**/*.tsx`) | PascalCase                              | 🟢 Easy - Naming rule           |
| **Components** (`src/components/**/*.ts`)  | camelCase                               | 🟢 Easy - Naming rule           |
| **Kit components**                         | PascalCase (strict)                     | 🟢 Easy - Naming rule           |
| **Hooks** (`**/hooks/**`)                  | `use[A-Z][a-zA-Z0-9]*` pattern          | 🟡 Moderate - Regex pattern     |
| **App Router** (`src/app/**`)              | Next.js reserved names only             | 🔴 Hard - Complex whitelist     |
| **Ports**                                  | `*.port.ts` suffix                      | 🟢 Easy - Suffix rule           |
| **Adapters**                               | `*.(adapter\|repo\|client).ts` suffix   | 🟢 Easy - Suffix rule           |
| **Contracts**                              | `*.contract.ts` suffix                  | 🟢 Easy - Suffix rule           |
| **Schemas**                                | `*.schema.ts` suffix                    | 🟢 Easy - Suffix rule           |
| **Mappers**                                | `*.mapper.ts` suffix                    | 🟢 Easy - Suffix rule           |
| **Feature root**                           | `actions\|types\|constants\|index` only | 🔴 Hard - Whitelist enforcement |
| **Feature services**                       | camelCase                               | 🟢 Easy - Naming rule           |
| **Tests**                                  | Specific test patterns                  | 🟡 Moderate - Regex pattern     |
| **Scripts**                                | kebab-case                              | 🟢 Easy - Naming rule           |
| **Styles**                                 | kebab-case                              | 🟢 Easy - Naming rule           |
| **Types**                                  | `*.d.ts` only in `src/types/**`         | 🔴 Hard - Location restriction  |

### Bans

| Rule                             | Description                   | Biome Migration                |
| -------------------------------- | ----------------------------- | ------------------------------ |
| Ban utils.ts in features         | Must use services/ or shared/ | 🔴 Hard - Semantic restriction |
| Ban test/story files in hooks    | Tests must be in tests/\*\*   | 🔴 Hard - Location restriction |
| Ban .d.ts outside src/types/\*\* | Type declarations centralized | 🔴 Hard - Location restriction |

**Biome Assessment**: Simple naming rules (PascalCase, camelCase, kebab-case) are easy. Complex whitelists, location restrictions, and semantic bans are hard or impossible.

---

## 4. React & Next.js Rules

**Source**: `eslint/app.config.mjs`

| Rule                              | Severity | Description                                     | Biome Migration                                     |
| --------------------------------- | -------- | ----------------------------------------------- | --------------------------------------------------- |
| All Next.js recommended rules     | error    | `@next/eslint-plugin-next/recommended`          | 🟡 Moderate - Biome has subset                      |
| All Next.js Core Web Vitals rules | error    | `@next/eslint-plugin-next/core-web-vitals`      | 🟡 Moderate - Partial parity                        |
| `react/react-in-jsx-scope`        | off      | Not needed in React 17+                         | 🟢 Easy - Disable                                   |
| `react-hooks/rules-of-hooks`      | error    | Enforce hooks rules                             | 🟡 Moderate - Biome has `useHookAtTopLevel`         |
| `react-hooks/exhaustive-deps`     | warn     | Exhaustive deps in useEffect                    | 🟡 Moderate - Biome has `useExhaustiveDependencies` |
| `no-restricted-properties`        | error    | Block `document.documentElement` (theme safety) | 🟢 Easy - Property restriction                      |

**Biome Assessment**:

- Biome includes React-inspired rules: `useHookAtTopLevel`, `useExhaustiveDependencies`, `noChildrenProp`, etc.
- Next.js-specific rules (image optimization, link components) have partial Biome equivalents
- **Migration requires parity testing**: Run Biome rules against existing fixtures to validate coverage
- **Decision point**: Accept Biome's subset if it catches 80%+ of issues, or keep ESLint for 100% coverage

---

## 5. Accessibility Rules

**Source**: `eslint/app.config.mjs`

| Rule                                      | Severity | Biome Migration                                                    |
| ----------------------------------------- | -------- | ------------------------------------------------------------------ |
| `jsx-a11y/alt-text`                       | error    | 🟡 Moderate - Biome has `useAltText`                               |
| `jsx-a11y/anchor-is-valid`                | error    | 🟡 Moderate - Biome has `useValidAnchor`                           |
| `jsx-a11y/aria-props`                     | error    | 🟡 Moderate - Biome has `useAriaPropsForRole`                      |
| `jsx-a11y/aria-proptypes`                 | error    | 🟡 Moderate - Biome has ARIA validation                            |
| `jsx-a11y/aria-role`                      | error    | 🟡 Moderate - Biome has `useValidAriaRole`                         |
| `jsx-a11y/aria-unsupported-elements`      | error    | 🟡 Moderate - Biome has `noAriaUnsupportedElements`                |
| `jsx-a11y/click-events-have-key-events`   | error    | 🟡 Moderate - Biome has `useKeyWithClickEvents`                    |
| `jsx-a11y/interactive-supports-focus`     | error    | 🟡 Moderate - Biome has `noInteractiveElementToNoninteractiveRole` |
| `jsx-a11y/label-has-associated-control`   | error    | 🟡 Moderate - Biome has `noLabelWithoutControl`                    |
| `jsx-a11y/no-autofocus`                   | warn     | 🟡 Moderate - Biome has `noAutofocus`                              |
| `jsx-a11y/no-static-element-interactions` | warn     | 🟡 Moderate - Biome has `noNoninteractiveElementToInteractiveRole` |

**Biome Assessment**:

- Biome has a comprehensive `a11y` rule category with many jsx-a11y equivalents
- Coverage is substantial but not 100% - some edge cases may differ
- **Migration requires parity testing**: Validate Biome a11y rules against existing fixtures
- **Decision point**: If Biome catches 80%+ of a11y issues with acceptable false positive rate, migrate. Otherwise keep ESLint.

---

## 6. Tailwind & Community Plugins

**Source**: `eslint/app.config.mjs`

| Rule                                     | Severity | Description                                  | Biome Migration                      |
| ---------------------------------------- | -------- | -------------------------------------------- | ------------------------------------ |
| `tailwindcss/no-conflicting-utilities`   | error    | Prevent conflicting Tailwind classes         | 🔴 Hard - Requires Tailwind parsing  |
| `tailwindcss/no-arbitrary-value-overuse` | error    | Limit arbitrary values (max 10/file, 3/rule) | 🔴 Hard - Tailwind-specific counting |
| `tailwindcss/prefer-theme-tokens`        | warn     | Prefer theme tokens for colors/spacing       | 🔴 Hard - Theme analysis             |
| `tailwindcss/valid-theme-function`       | error    | Validate theme() usage                       | 🔴 Hard - Tailwind-specific          |
| `tailwindcss/valid-apply-directive`      | error    | Validate @apply usage                        | 🔴 Hard - CSS-in-JS analysis         |
| `no-inline-styles/no-inline-styles`      | error    | Disallow inline styles prop                  | 🟡 Moderate - Property check         |

**Exemptions**:

- Font files: Allow inline styles for Next.js fonts
- Theme init script: Allow document.documentElement
- E2E tests: Allow document.documentElement

**Biome Assessment**: Tailwind-specific rules require Tailwind parser and semantic understanding. Would need custom GritQL plugin work.

---

## 7. UI Governance (Custom Rules)

**Source**: `eslint/ui-governance.config.mjs`, `scripts/eslint/plugins/ui-governance.cjs`

### Custom Rules

| Rule                                          | Severity | Description                                                       | Biome Migration                   |
| --------------------------------------------- | -------- | ----------------------------------------------------------------- | --------------------------------- |
| `ui-governance/no-raw-colors`                 | error    | Block raw Tailwind colors (bg-red-500, text-gray-600)             | 🔴 Hard - Custom Tailwind parsing |
| `ui-governance/no-arbitrary-non-token-values` | error    | Block arbitrary values without tokens (gap-[12px], bg-[#fff])     | 🔴 Hard - Token validation        |
| `ui-governance/token-classname-patterns`      | error    | Require token-prefixed utilities (bg-background, text-foreground) | 🔴 Hard - Token pattern matching  |
| `ui-governance/no-vendor-imports-outside-kit` | error    | Block vendor imports outside kit layer                            | 🟢 Easy - Path restriction        |

### Allowed Token Patterns

**Color prefixes tracked**: `bg`, `text`, `border`, `ring`, `shadow`, `stroke`, `fill`

**Semantic token suffixes**:

- `background`, `foreground`, `card`, `card-foreground`
- `popover`, `popover-foreground`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `muted`, `muted-foreground`
- `accent`, `accent-foreground`
- `destructive`, `destructive-foreground`
- `border`, `input`, `ring`
- `danger`, `warning`, `success`
- `chart-1` through `chart-6`
- `offset-background`

**Allowed keywords**: `transparent`, `current`, `inherit`

**Arbitrary value rule**: Must wrap `var(--token-name)` pattern

**Functions tracked**: `cn`, `clsx`, `classnames` (tracked dynamically via imports)

### Exemptions

| Path                       | Exemption                   |
| -------------------------- | --------------------------- |
| `src/components/vendor/**` | All UI governance rules OFF |
| `src/styles/**`            | All UI governance rules OFF |
| `src/__tests__/**`         | All UI governance rules OFF |

### How Rules Work

1. **Detection**: Scans `className` JSX attributes and tracked function calls (`cn`, `clsx`, `classnames`)
2. **Tokenization**: Splits class strings, handles modifiers (`:hover`, `!important`, negatives)
3. **Validation**:
   - Raw palette check (e.g., `red-500`, `gray-600`)
   - Hex/RGB literal check (e.g., `[#fff]`, `[rgb(10,10,10)]`)
   - Token pattern check (must match semantic suffixes)
   - Arbitrary value check (must contain `var(--...)`)

**Biome Assessment**: These rules require custom Tailwind class parsing, token validation, and semantic analysis. Would require significant GritQL plugin development to match current functionality.

---

## 8. Hexagonal Architecture Boundaries

**Source**: `eslint/app.config.mjs`

### boundaries/element-types

Complex ruleset enforcing hexagonal architecture layers.

| From Layer              | Can Import                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **core**                | core only                                                                                                                 |
| **ports**               | ports, core, types                                                                                                        |
| **features**            | features/**, ports/**, core/**, shared/**, types/\*\*, components                                                         |
| **features** (disallow) | adapters/test/\*\*                                                                                                        |
| **contracts**           | contracts/**, shared/**, types/\*\*                                                                                       |
| **app**                 | app/**, features/**, ports/**, shared/**, lib/**, contracts/**, types/**, components/**, styles/**, bootstrap/**, auth.ts |
| **app** (disallow)      | adapters/test/\*\*                                                                                                        |
| **lib**                 | lib/**, ports/**, shared/**, types/**                                                                                     |
| **auth**                | auth/**, shared/**, types/**, lib/**                                                                                      |
| **mcp**                 | mcp/**, features/**, ports/**, contracts/**, bootstrap/\*\*                                                               |
| **adapters/server**     | adapters/server/**, ports/**, shared/**, types/**                                                                         |
| **adapters/worker**     | adapters/worker/**, ports/**, shared/**, types/**                                                                         |
| **adapters/cli**        | adapters/cli/**, ports/**, shared/**, types/**                                                                            |
| **adapters/test**       | adapters/test/**, ports/**, shared/**, types/**                                                                           |
| **shared**              | shared/**, types/**                                                                                                       |
| **bootstrap**           | bootstrap/**, ports/**, adapters/**, shared/**, types/\*\*                                                                |
| **components**          | components/**, shared/**, types/**, styles/**                                                                             |
| **styles**              | styles/\*\* only                                                                                                          |
| **assets**              | assets/\*\* only                                                                                                          |
| **tests**               | Allow all                                                                                                                 |
| **e2e**                 | Allow all                                                                                                                 |
| **scripts**             | scripts/**, ports/**, shared/**, types/**                                                                                 |

### boundaries/entry-point

Enforces specific entry point patterns per layer.

| Layer                                                                    | Allowed Entry Points                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **ports, adapters/server, adapters/test, shared, components, lib, auth** | `**/index.ts`, `**/index.tsx`                                        |
| **contracts**                                                            | `**/*.contract.ts`, `http/router.v1.ts`, `http/openapi.v1.ts`        |
| **styles**                                                               | `ui.ts`, `tailwind.css`                                              |
| **features**                                                             | `**/services/*.{ts,tsx}`, `**/components/*.{ts,tsx}`, `**/public.ts` |
| **core**                                                                 | `**/public.ts`                                                       |
| **bootstrap**                                                            | `container.ts`                                                       |
| **app**                                                                  | `**/*.{ts,tsx}`, `_facades/**/*.server.ts`                           |
| **lib**                                                                  | `**/*.ts`                                                            |
| **auth**                                                                 | `auth.ts`                                                            |

### boundaries/no-unknown-files

Ensures all files match defined boundary patterns.

**Ignored paths**:

- `**/*.test.*`, `**/*.spec.*`
- `tests/**`, `e2e/**`, `scripts/**`
- Config files (eslint.config.mjs, etc.)

**Biome Assessment**: ⛔ **Not Feasible** - The boundaries plugin provides rich semantic layer analysis with complex import rules based on architectural patterns. This would require extensive custom plugin development and Biome doesn't have an equivalent ecosystem for architectural rules.

---

## 9. Vendor SDK Import Restrictions

**Status**: ✅ **Migrated to Biome (Commit 8B)** - ESLint version removed as duplicate

**Previous Source**: `eslint/no-vendor-sdk-imports.config.mjs`, `scripts/eslint/plugins/no-vendor-sdk-imports.cjs` (deleted in Commit 8B)

**Current Source**: `biome/base.json` (lines 27-73) - `noRestrictedImports` rule with `src/infra/**` override

### Rule: no-vendor-sdk-imports (now: Biome noRestrictedImports)

Prevents vendor lock-in by blocking proprietary SaaS SDK imports in core code.

**Applies to**: `src/**/*.{ts,tsx,js,jsx}`

**Exemption**: `src/infra/**` (adapters may use vendor SDKs)

### Blocked Vendor Scopes

- `@vercel/*`
- `@sentry/*`
- `@datadog/*`
- `@clerk/*`
- `@auth0/*`
- `@supabase/*`
- `@upstash/*`
- `@amplitude/*`
- `@segment/*`
- `@fullstory/*`
- `@intercom/*`

### Blocked Vendor Packages

**Observability SaaS**: `newrelic`, `dd-trace`, `logrocket`, `analytics-node`, `mixpanel-browser`, `mixpanel`, `hotjar`, `posthog-js`, `posthog-node`, `@hotjar/browser`, `bugsnag`, `rollbar`, `honeybadger`

**BaaS**: `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/database`, `appwrite`, `pocketbase`

**Feature Flags**: `launchdarkly-node-server-sdk`, `launchdarkly-react-client-sdk`, `configcat-node`, `configcat-js`

**Chat/Support**: `crisp-sdk-web`

### Detection

- ES6 imports: `import { foo } from 'vendor-pkg'`
- Dynamic imports: `import('vendor-pkg')`
- Require calls: `const pkg = require('vendor-pkg')`

**Biome Assessment**: 🟢 **Easy** - This is simple import path pattern matching, which Biome can handle with import restrictions.

---

## 10. Node.js & Environment Rules

**Source**: `eslint/base.config.mjs`

| Rule               | Severity | Description                 | Biome Migration              |
| ------------------ | -------- | --------------------------- | ---------------------------- |
| `n/no-process-env` | error    | Disallow process.env access | 🟢 Easy - Global restriction |

### Allowed Files for process.env

- `src/shared/env/**/*.{ts,tsx}`
- `src/auth.ts`
- `e2e/**/*.{ts,tsx}`
- `playwright.config.ts`
- `tests/**/*.ts`
- `scripts/**/*.ts`
- `docs/templates/**/*.ts`
- `*.config.{ts,mts}`
- `drizzle.config.ts`

**Biome Assessment**: Easy to implement with file-based exemptions.

---

## 11. Documentation & Code Style

**Source**: `eslint/base.config.mjs`

| Rule                 | Severity | Description                                        | Biome Migration                  |
| -------------------- | -------- | -------------------------------------------------- | -------------------------------- |
| `tsdoc/syntax`       | error    | Validate TSDoc syntax                              | ⛔ Not Feasible - TSDoc-specific |
| `no-inline-comments` | error    | Disallow mid-code comments (except eslint-disable) | 🟢 Easy - Comment pattern        |
| CVA variant map ban  | error    | Ban inline variant objects in cva() calls          | 🔴 Hard - AST pattern matching   |

### CVA Rule Detail

Ban this pattern in `src/styles/**`:

```javascript
cva(..., {
  variants: {
    color: { /* inline object */ }
  }
})
```

Require: `const colorVariants = { ... } satisfies Record<...>; cva(..., { variants: { color: colorVariants } })`

**Biome Assessment**: TSDoc validation not feasible. Comment rules easy. CVA syntax enforcement requires custom AST analysis.

---

## 12. Test Overrides

**Source**: `eslint/tests.config.mjs`

### Rules Disabled in Tests

**Applies to**: `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `tests/**`, `e2e/**`

- `boundaries/entry-point` → off
- `boundaries/element-types` → off
- `boundaries/no-unknown-files` → off
- `no-restricted-imports` → off
- `tsdoc/syntax` → off
- `no-inline-comments` → off

**Applies to**: `docs/templates/**/*.{ts,tsx}`

- `tsdoc/syntax` → off
- `jsdoc/*` → off

**Biome Assessment**: 🟢 Easy - File pattern-based exemptions.

---

## 14. Summary & Recommendations

### Overall Migration Assessment

This document analyzed **87 total configuration options**:

- **10 Prettier formatting options** (9 easy, 1 requires validation)
- **77 ESLint linting rules** (31 easy, 38 moderate with parity testing, 6 hard blockers, 2 obsolete)

### Key Corrections from Initial Analysis

1. **Tailwind sorting**: Biome has `useSortedClasses` rule - no need for rustywind unless parity test fails
2. **Framework rules**: Biome includes React/Next.js/a11y equivalents - migration possible with parity validation
3. **Real blockers**: Only 2 categories require ESLint:
   - Hexagonal boundaries (`eslint-plugin-boundaries`)
   - Custom UI governance (token parsing in Tailwind classes)

### Prettier Migration Summary

All core Prettier formatting options have direct Biome equivalents. Tailwind class sorting available via Biome's `useSortedClasses` rule.

**Recommended solution**: Replace Prettier with Biome entirely (4-6 hour migration including parity testing, 10-40× faster formatting).

### ESLint Migration Complexity Breakdown (Corrected)

| Category           | Easy (🟢)    | Moderate (🟡) | Hard Blocker (🔴) | Obsolete (⚪) |
| ------------------ | ------------ | ------------- | ----------------- | ------------- |
| **Core TS/JS**     | 4 rules      | 4 rules       | 0 rules           | 0 rules       |
| **Imports**        | 8 rules      | 3 rules       | 0 rules           | 0 rules       |
| **Filenames**      | 12 rules     | 3 rules       | 7 rules           | 0 rules       |
| **React/Next.js**  | 2 rules      | 4 rules       | 0 rules           | 0 rules       |
| **Accessibility**  | 0 rules      | 11 rules      | 0 rules           | 0 rules       |
| **Tailwind**       | 0 rules      | 6 rules       | 0 rules           | 0 rules       |
| **UI Governance**  | 1 rule       | 0 rules       | 3 rules           | 0 rules       |
| **Boundaries**     | 0 rules      | 0 rules       | 3 rules           | 0 rules       |
| **Vendor SDK**     | 1 rule       | 0 rules       | 0 rules           | 0 rules       |
| **Node/Env**       | 1 rule       | 0 rules       | 0 rules           | 0 rules       |
| **Docs/Style**     | 1 rule       | 0 rules       | 0 rules           | 1 rule        |
| **Test Overrides** | 1 rule       | 0 rules       | 0 rules           | 0 rules       |
| **TOTAL**          | **31 rules** | **31 rules**  | **13 rules**      | **1 rule**    |

**Key insight**: 62 of 77 ESLint rules (80%) can potentially move to Biome with parity validation. Only 13 rules (17%) are genuine blockers.

### Phased Migration Plan

This plan prioritizes **speed + maintainability** with **no reduction in enforcement strength** for core governance rules.

#### Phase 0: Parity Gating (No Behavior Change)

**Goal**: Validate Biome behavior before switching

**Steps**:

1. Add `biome.json` config with all proposed rules
2. Run `biome check` in CI in **non-blocking mode** (informational only)
3. Enable `useSortedClasses` and test against real codebase fixtures
4. Document which ESLint rules are redundant vs. unique
5. Create "Biome canaries" test suite (minimal fixtures for critical rules)

**Exit Criteria**:

- ✅ List of Biome rules that can be enabled without false positives
- ✅ Decision on Tailwind sorting: Biome-only vs. keep Prettier plugin
- ✅ Parity test results documented

**Timeline**: 4-6 hours

---

#### Phase 1: Formatting Consolidation

**Goal**: Single source of truth for formatting

**Steps**:

1. Switch `format` scripts to Biome where supported
2. If Markdown formatting gaps exist, keep Prettier **only for Markdown** (avoid tool sprawl)
3. Keep Tailwind sorting in exactly one place (Biome `useSortedClasses` preferred)
4. Update `lint-staged` and pre-commit hooks
5. Update CI formatting checks

**Exit Criteria**:

- ✅ One `format` command produces stable output
- ✅ Pre-commit hooks work correctly
- ✅ CI formatting checks pass
- ✅ No tool sprawl (Biome + optionally Prettier for unsupported filetypes only)

**Timeline**: 2-3 hours

---

#### Phase 2: Lint Migration (Selective)

**Goal**: Move easy rules to Biome, keep ESLint focused on bespoke governance

**Steps**:

1. **Move to Biome** (31 easy rules):
   - Unused vars/imports removal
   - Basic import hygiene (sorting, type imports)
   - Simple naming conventions Biome supports
   - process.env restrictions
   - Vendor SDK path blocking

2. **Evaluate with parity tests** (31 moderate rules):
   - React/Next.js rules (accept if catches 80%+ of issues)
   - Accessibility rules (accept if false positive rate < 20%)
   - Basic Tailwind rules (if not using custom UI governance)
   - Only migrate if reduces ESLint complexity without losing signal

3. **Keep in ESLint** (13 hard blocker rules):
   - `eslint-plugin-boundaries` (hex architecture enforcement)
   - Custom UI governance rules (token parsing, arbitrary value validation, vendor import isolation)
   - Complex filename location restrictions (if Biome parity insufficient)

**Exit Criteria**:

- ✅ ESLint config is materially smaller and clearly scoped
- ✅ All existing integration tests still pass (boundaries + UI governance unchanged)
- ✅ Biome canaries suite passes
- ✅ No meaningful loss of coverage vs. current tests

**Timeline**: 1-2 days

---

#### Non-Goals (MVP Scope)

**Do NOT attempt in this iteration**:

- ❌ Full rewrite of custom UI governance rules in Biome/GritQL
- ❌ Full replacement of `eslint-plugin-boundaries` (hex architecture)
- ❌ Migrating CVA variant map enforcement to Biome
- ❌ Achieving "perfect ecosystem purity" (pragmatism over purity)

**Why**: Focus on speed wins, not risky rewrites. Keep what works.

### Recommended End-State Toolchain

**Principle**: Prefer deletion of tools over adding tools. No sprawl.

```
┌─────────────────────────────────────────────────────────────┐
│                    FORMATTING LAYER                         │
│                                                             │
│  Biome (single tool for format + lint)                     │
│  • 10-40× faster than Prettier                             │
│  • All formatting rules (semi, quotes, spacing, etc.)      │
│  • Auto-organize imports                                    │
│  • Tailwind class sorting (useSortedClasses rule)          │
│  • Generic lint rules (unused vars, type imports, etc.)    │
│                                                             │
│  [Optional] Prettier for Markdown only                     │
│  • ONLY if Biome Markdown support is insufficient          │
│  • Keep minimal, avoid tool sprawl                         │
└─────────────────────────────────────────────────────────────┘
                           +
┌─────────────────────────────────────────────────────────────┐
│                  BESPOKE GOVERNANCE (ESLint)                │
│                                                             │
│  ESLint (minimal, focused on unique governance)            │
│  • eslint-plugin-boundaries (hex architecture)             │
│  • Custom UI governance rules (token parsing)              │
│  • [Optional] Framework rules if Biome parity fails        │
│                                                             │
│  Total ESLint rules after migration: ~13-20 (down from 77) │
└─────────────────────────────────────────────────────────────┘
```

**Key Decision Points** (validated in Phase 0):

- Tailwind sorting: Use Biome's `useSortedClasses` unless parity test fails
- Framework rules: Migrate to Biome if 80%+ coverage achieved
- Only add extra tools (rustywind, keep Prettier) if parity tests prove necessary

### Cost-Benefit Analysis

#### Full Migration Timeline & Costs

| Phase                        | Timeline     | Cost                         | Benefit                                   | Risk                     |
| ---------------------------- | ------------ | ---------------------------- | ----------------------------------------- | ------------------------ |
| **Phase 0: Parity Gating**   | 4-6 hours    | Validation testing           | Confidence before switching               | Low (no changes)         |
| **Phase 1: Formatting**      | 2-3 hours    | Script updates, testing      | 10-40× faster formatting                  | Low (Biome mature)       |
| **Phase 2: Lint (Easy)**     | 4-6 hours    | Config migration             | Faster linting, simpler config            | Low (direct equivalents) |
| **Phase 2: Lint (Moderate)** | 1-2 days     | Parity testing, canaries     | Reduce ESLint to ~13-20 rules             | Medium (need validation) |
| **TOTAL (MVP)**              | **2-3 days** | **Testing + config changes** | **10-40× speed, 70%+ fewer ESLint rules** | **Low-Medium**           |

**Alternative: Keep Status Quo**

- Cost: $0
- Benefit: Zero risk
- Downside: 10-40× slower, more complex toolchain

**Alternative: Full Biome migration (not recommended)**

- Cost: 3-6 weeks (custom GritQL plugins)
- Risk: High (rewrite battle-tested governance rules)
- Downside: Ongoing maintenance burden

**Recommendation**: **Phased migration (2-3 days)** for optimal speed/risk tradeoff.

---

### Acceptance Tests

Before migrating any rule category, validate with these tests:

#### Biome Canaries Suite (New)

Create minimal fixtures for critical Biome rules:

```typescript
// tests/lint/biome/canaries.spec.ts
describe('Biome Canaries', () => {
  it('removes unused imports', ...)
  it('enforces type imports', ...)
  it('sorts Tailwind classes correctly', ...)  // useSortedClasses
  it('catches React hooks violations', ...)     // if migrating
  it('catches a11y violations', ...)            // if migrating
})
```

#### Existing Integration Tests (Must Pass)

**No regressions allowed**:

- ✅ `tests/lint/eslint/boundaries.spec.ts` - Hex architecture (stays in ESLint)
- ✅ `tests/lint/eslint/ui-governance.spec.ts` - UI governance (stays in ESLint)
- ✅ `tests/lint/eslint/features-boundaries.spec.ts` - Feature imports
- ✅ `tests/lint/eslint/vendor-sdk-imports.spec.ts` - Vendor SDK blocking

#### CI Integration

**Phase 0 setup**:

```bash
# Add to CI (non-blocking initially)
biome check . || echo "Biome check informational only"
```

**Phase 1/2 setup**:

```bash
# Replace in CI
biome check .         # Format + lint (fast)
eslint . --quiet      # Only bespoke rules (slower but fewer files)
```

---

### Risks & Mitigations

| Risk                                                      | Likelihood | Impact | Mitigation                                                                           |
| --------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------ |
| Biome framework rules differ from ESLint in edge cases    | Medium     | Medium | Phase 0 parity testing with canaries; keep ESLint if gaps found                      |
| Tailwind sorting differs from prettier-plugin-tailwindcss | Low        | Low    | Test `useSortedClasses` against real fixtures; fallback to Prettier plugin if needed |
| Tool sprawl (Biome + Prettier + rustywind)                | Low        | Medium | **Prefer Biome-only first**; only add extra tools if Phase 0 tests fail              |
| False positives from Biome rules                          | Low        | Low    | Tune Biome config in Phase 0; disable problematic rules                              |
| ESLint integration tests regress                          | Very Low   | High   | Run full test suite before/after; no changes to boundaries + UI governance           |

**Mitigation principle**: Always validate with real fixtures, not hypotheticals. No blind migrations.

---

### Decision Record: What Stays in ESLint and Why

After Phase 2 completion, ESLint config should contain **only**:

1. **eslint-plugin-boundaries** (3 rules)
   - Reason: No Biome equivalent for rich semantic layer analysis
   - Alternative: None (unique architectural enforcement)

2. **Custom UI governance** (3 rules)
   - Reason: Bespoke Tailwind token parsing + arbitrary value validation
   - Alternative: Rewrite in GritQL (3-6 weeks, not MVP scope)

3. **Complex filename restrictions** (0-7 rules)
   - Reason: Only if Biome naming rules lack parity
   - Decision: Made in Phase 2 based on parity tests

4. **Framework rules** (0-20 rules)
   - Reason: Only if Biome parity < 80% coverage
   - Decision: Made in Phase 2 based on canary results

**Total ESLint rules after migration**: 6-33 (down from 77)

**ESLint becomes**: Focused bespoke governance tool, not generic linter.

---

### Deliverables

To execute this migration plan, create these artifacts:

#### 1. ✅ Updated Inventory Doc (This Document)

Complete - reflects Biome support for Tailwind sorting + framework rules with corrected complexity assessments.

#### 2. 📋 Biome Canaries Test Suite

Create `tests/lint/biome/canaries.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Biome Canaries", () => {
  it("removes unused imports", () => {
    const fixture = `import { unused } from 'module';\nexport const used = 'value';`;
    const result = runBiome(fixture, "test.ts");
    expect(result).not.toContain("unused");
  });

  it("enforces type imports", () => {
    const fixture = `import { MyType } from './types';\nconst x: MyType = {};`;
    const errors = getBiomeErrors(fixture, "test.ts");
    expect(errors).toContain("useImportType");
  });

  it("sorts Tailwind classes correctly", () => {
    const fixture = `<div className="text-white p-4 bg-primary mt-2 flex" />`;
    const result = runBiome(fixture, "test.tsx");
    // Validate sorted order matches expectations
    expect(result).toMatch(
      /className="mt-2 flex .* p-4 .* bg-primary .* text-white"/
    );
  });

  // Add more based on Phase 0 priorities:
  // - React hooks violations (if migrating)
  // - A11y violations (if migrating)
  // - Import path restrictions
});

function runBiome(code: string, filename: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "biome-test-"));
  const filePath = join(tempDir, filename);
  try {
    writeFileSync(filePath, code);
    execSync(`biome check --apply ${filePath}`, { encoding: "utf-8" });
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    return readFileSync(filePath, "utf-8");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function getBiomeErrors(code: string, filename: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "biome-test-"));
  const filePath = join(tempDir, filename);
  try {
    writeFileSync(filePath, code);
    execSync(`biome check ${filePath}`, { encoding: "utf-8" });
    return "";
  } catch (error: any) {
    return error.stdout + error.stderr;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
```

#### 3. 📝 Decision Record Template

Create `docs/BIOME_MIGRATION_DECISIONS.md` after Phase 0:

```markdown
# Biome Migration Decision Record

Date: YYYY-MM-DD
Status: Phase 0 Complete / Phase 1 Complete / Phase 2 Complete

## Phase 0 Results

### Tailwind Sorting

- ✅ / ❌ Biome `useSortedClasses` produces acceptable results
- **Decision**: Use Biome / Keep Prettier plugin / Add rustywind
- **Rationale**: [Paste test results summary]
- **Fixture examples**: [Link to test cases]

### Framework Rules (React/Next.js)

- **Coverage**: X% of existing test cases caught by Biome rules
- **False positives**: Y occurrences
- **Decision**: Migrate / Keep ESLint
- **Rationale**: [80%+ threshold met? False positive rate < 20%?]

### Accessibility Rules

- **Coverage**: X% of existing test cases caught by Biome rules
- **False positives**: Y occurrences
- **Decision**: Migrate / Keep ESLint
- **Rationale**: [80%+ threshold met? False positive rate acceptable?]

## Final Configuration

### What Stayed in ESLint

1. eslint-plugin-boundaries (3 rules) - No alternative
2. Custom UI governance (3 rules) - Bespoke token parsing
3. [Additional categories if parity insufficient]

**Total ESLint rules**: X (down from 77)

### What Moved to Biome

- Core TypeScript rules (8 rules)
- Import management (11 rules)
- [List other migrated categories]

**Total Biome rules**: X

### Toolchain Summary

- ✅ Biome: Format + lint (single tool)
- ✅ ESLint: Bespoke governance only (minimal)
- ✅ [Optional] Prettier: Markdown only (if needed)
- ❌ No tool sprawl

## Performance Improvements

- Formatting speed: Xms (was Yms) - Z× faster
- Linting speed: Xms (was Yms) - Z× faster
- Total check time: Xms (was Yms) - Z× faster

## Acceptance Test Results

- ✅ All boundaries tests pass
- ✅ All UI governance tests pass
- ✅ Biome canaries pass
- ✅ No formatting churn in codebase
```

#### 4. 🎯 Next Steps Checklist

- [ ] Week 1: Execute Phase 0 (4-6 hours)
- [ ] Week 1: Review Phase 0 results with team
- [ ] Week 1-2: Execute Phase 1 (2-3 hours)
- [ ] Week 1-2: Execute Phase 2 (1-2 days)
- [ ] Week 2: Document final decisions
- [ ] Week 2: Validate all acceptance tests pass
- [ ] Ongoing: Monitor for regressions

**Success Criteria**:

- ✅ 10-40× faster formatting
- ✅ ESLint reduced to 6-33 rules (from 77)
- ✅ All existing integration tests pass
- ✅ No tool sprawl
- ✅ No weakening of governance enforcement

---

### Notes on Current Implementation Gaps

Based on comparison of `tests/lint/ESLINT_TESTING.md` vs. actual config:

**✅ Fully Implemented**:

- Token-driven styling rules (no-raw-colors, no-arbitrary-non-token-values, token-classname-patterns)
- Vendor import boundaries (no-vendor-imports-outside-kit)
- Hexagonal architecture boundaries
- Features import restrictions
- Vendor SDK blocking

**⚠️ Documented but Not Verified**:

- MDX prose allowances (mentioned in ESLINT_TESTING.md line 90-96, but no explicit rule found in config)
- Some specific test cases may be documented aspirationally

**📝 Action Items**:

1. Verify MDX prose handling (check if it's implicitly allowed or needs explicit rule)
2. Update ESLINT_TESTING.md if any documented rules don't match implementation
3. Add integration tests for any missing coverage areas

---

## Appendix: Source File Map

### Formatting Configuration

| Config File                  | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `.prettierrc`                | Prettier formatting options (semi, quotes, spacing, etc.) |
| `.prettierignore`            | Paths excluded from Prettier formatting                   |
| `package.json` (scripts)     | `format`, `format:check` commands                         |
| `package.json` (lint-staged) | Pre-commit hook integration                               |

### Linting Configuration

| Config File                                        | Purpose                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| `eslint.config.mjs`                                | Main entry point, imports all sub-configs                 |
| `eslint/base.config.mjs`                           | Core TS/JS rules, imports, Node.js rules, TSDoc           |
| `eslint/app.config.mjs`                            | React, Next.js, Tailwind, boundaries, import restrictions |
| `eslint/filename.config.mjs`                       | All filename and naming convention rules                  |
| `eslint/tests.config.mjs`                          | Test file exemptions                                      |
| `eslint/ui-governance.config.mjs`                  | Custom UI governance rules config                         |
| `eslint/no-vendor-sdk-imports.config.mjs`          | Vendor SDK blocking config                                |
| `scripts/eslint/plugins/ui-governance.cjs`         | Custom plugin implementation (Tailwind token rules)       |
| `scripts/eslint/plugins/no-vendor-sdk-imports.cjs` | Custom plugin implementation (vendor SDK blocking)        |
| `docs/ui-style-spec.json`                          | Machine-readable UI governance spec                       |

## Test Coverage

See `tests/lint/ESLINT_TESTING.md` for comprehensive integration test coverage (32 high-value test cases covering all major rule categories).

Test files:

- `tests/lint/eslint/boundaries.spec.ts` - Hexagonal architecture boundaries
- `tests/lint/eslint/features-boundaries.spec.ts` - Feature import restrictions
- `tests/lint/eslint/ui-governance.spec.ts` - UI governance rules
- `tests/lint/eslint/vendor-sdk-imports.spec.ts` - Vendor SDK blocking
- `tests/lint/eslint/imports.spec.ts` - Import restrictions
- `tests/lint/eslint/styling.spec.ts` - Tailwind/styling rules
- Additional test files for entry points, contracts, adapters, theme, process-env, etc.
