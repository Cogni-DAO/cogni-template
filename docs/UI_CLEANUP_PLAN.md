# UI Cleanup Plan

Phased approach to consolidate UI before locking it down. Don't lock down trash.

**Read first**: `docs/UI_IMPLEMENTATION_GUIDE.md`

---

## ⚠️ CRITICAL: "Cleanup" = Code Refactoring, NOT Visual Design

**What Phase 0-3 achieves:**

- Styling code consolidation (inline className → CVA factories)
- Design token enforcement (no raw colors/typography)
- ESLint hygiene (fix config bugs, add freeze rules)

**What Phase 0-3 does NOT do:**

- Visual design improvements (colors, spacing, typography are unchanged)
- UX enhancements (layouts, interactions, accessibility beyond basics)
- New features or components

**This is infrastructure work.** The site looks the same (except 3 minor behavior fixes).

---

## Status Update: Phase 0-3 Styling Infrastructure Complete

**Date:** 2025-12-01
**Branch:** feat/ui-cleanup
**Commits:** c03f604, 144f887, 280f069, e101efc, 3ffca09

**Completed (styling code only):**

- Phase 0: Freeze rules active (ESLint blocks new components/imports) ✅
- Phase 2: Knip scoped, dead code deleted, token checks in CI ✅
- Phase 3: Kit token replacements + page inline className extractions (13 factories) ✅

**Pending:**

- Mobile QA: 360/768/1280 manual verification on /, /credits, /chat
- Phase 4: Storybook + Playwright visual regression (separate PR)
- next-themes SSR fix (see below)

### TODO: next-themes SSR Theme Sync

**Current state:** `wallet.client.tsx` uses a `mounted` state to avoid hydration mismatch. This works but causes a brief theme flash on load.

**Proper fix:**

- [ ] Use next-themes with `attribute="class"` and `enableSystem` + `defaultTheme="system"` (if not already)
- [ ] In `app/layout.tsx`, read the theme cookie via `cookies()` and set `<html className={themeClass} data-theme={themeClass} style={{ colorScheme: themeClass === "dark" ? "dark" : "light" }}>`
- [ ] Ensure ThemeProvider uses the same cookie key so server and client agree
- [ ] Delete the `mounted` workaround in `wallet.client.tsx`

**Visual changes (3 only):**

1. Alert success: bg-success/10 (semantic token vs raw green-50)
2. Terminal: overflow-y-scroll (vs overflow-y-auto)
3. Hero mobile: mx-0 baseline at <640px

**See:** [UI_CLEANUP_CHECKLIST.md](UI_CLEANUP_CHECKLIST.md) for line-by-line status

---

## Master TODO Checklist

### Phase 0: FREEZE (Day 1)

- [x] Add ESLint rule to block new files in `src/components/**` outside `kit/` → `eslint/ui-governance.config.mjs:133-140` ✅
- [x] Add ESLint rule to block new UI lib imports (`@headlessui/*`, etc.) → `eslint/ui-governance.config.mjs:150-157` ✅
- [x] Verify `no-raw-colors` rule is active → `eslint/ui-governance.config.mjs:56` ✅

### Phase 1: INVENTORY (Day 1, 2 hours max)

- [ ] Run `rg "from ['\"]@/components" --type ts -c` — count kit imports
- [ ] Run `rg "<Button" --type tsx -c` — count Button usage (repeat for Input, Badge, etc.)
- [ ] Run `rg "className.*bg-[a-z]+-[0-9]" --type tsx` — find raw color violations
- [ ] Run `rg "className.*text-[a-z]+-[0-9]" --type tsx` — find raw text color violations
- [ ] Run `rg "text-(xs|sm|base|lg|xl|2xl)" --type tsx` — find raw typography outside kit
- [ ] Run `rg "className.*(p|m)-[0-9]+" --type tsx` — find raw spacing violations
- [ ] Document findings in `ui-inventory.md` or JSON (doesn't need to be fancy)

### Phase 2: DELETE (Day 2)

- [x] Install Knip: `pnpm add -D knip` ✅
- [x] Run `pnpm knip --include files,exports,dependencies` ✅
- [x] Delete unused components in `src/features/*/components/` (kit is the survivor set) ✅
- [x] Delete unused components in `src/components/app/` ✅
- [x] Delete unused exports in `src/components/index.ts` ✅
- [x] Create `scripts/check-ui-tokens.sh` with typography + arbitrary value checks ✅
- [x] Wire script into `pnpm check` → `scripts/check-fast.sh` ✅
- [ ] (Optional) Add to Lefthook pre-commit → `lefthook.yml` (deferred)

### Phase 3: CONSOLIDATE (Variable)

**Canonical primitives** — pick ONE per category, migrate/delete rest:

- [ ] Button → `src/components/kit/inputs/Button.tsx` (canonical)
- [ ] Input → `src/components/kit/inputs/Input.tsx` (canonical)
- [ ] Badge → `src/components/kit/data-display/Badge.tsx` (canonical)
- [ ] Avatar → `src/components/kit/data-display/Avatar.tsx` (canonical)
- [ ] Container → `src/components/kit/layout/Container.tsx` (canonical)
- [ ] Header → `src/components/kit/layout/Header.tsx` (canonical)
- [ ] Card → TBD (create if needed, or delete Card-like components)
- [ ] Dialog/Modal → TBD (create if needed)
- [ ] Dropdown → TBD (extract from `ModeToggle.tsx` or delete)

**Code cleanup**:

- [ ] Remove CVA variant export → `src/components/kit/data-display/GithubButton.tsx:419`
- [ ] Move inline CVA to shared factory → `src/components/kit/inputs/Input.tsx`

**ESLint config bugs** → `eslint/ui-governance.config.mjs`:

- [ ] Fix layer blocks overriding base `no-restricted-imports` (lines 124-156) — refactor to shared base
- [ ] Fix wrong allowlist syntax: `rounded-[--radius]` → `rounded-[var(--radius)]` (line 57)
- [ ] Fix malformed glob: `e2e/**/*.{ts,spec.ts}` → `e2e/**/*.ts` (line 290)
- [ ] Remove/relax overlapping rules: `tailwindcss/prefer-theme-tokens` (line 60)
- [ ] Narrow `document.documentElement` restriction scope (lines 265-278)

**Hard gate**: Ship PR with all above. Phase 4 blocked until merged.

### Phase 4: LOCK DOWN (After Phase 3 PR)

**Storybook setup**:

- [ ] Run `npx storybook@latest init`
- [ ] Install addons: `pnpm add -D @storybook/addon-a11y @storybook/addon-viewport`
- [ ] Add scripts to `package.json`: `storybook`, `storybook:build`
- [ ] Create story for `Button.tsx` — tone(5), size(4), icon, asChild variants
- [ ] Create story for `Input.tsx` — default, disabled, error variants
- [ ] Create story for `Badge.tsx` — intent(4), size(4) variants
- [ ] Create story for `Avatar.tsx` — with/without fallback
- [ ] Create story for `Container.tsx` — size variants
- [ ] Create story for `Header.tsx` — responsive collapse
- [ ] Create story for `NavigationLink.tsx` — active/inactive
- [ ] Create story for `TerminalFrame.tsx` — surface(3) variants

**Playwright visual regression**:

- [ ] Add visual config to `playwright.config.ts`
- [ ] Add script to `package.json`: `test:visual`
- [ ] Capture baselines at 360px, 768px, 1280px

**Lighthouse mobile budget**:

- [ ] Install: `pnpm add -D @lhci/cli`
- [ ] Create `lighthouserc.js` with mobile preset
- [ ] Add script to `package.json`: `lighthouse`
- [ ] Start with warn/floor 70-80 during consolidation
- [ ] After Phase 3 stable: hard-fail ≥ 90

---

## Key Files

| File                              | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `docs/UI_IMPLEMENTATION_GUIDE.md` | The 5 rules, token system, quality gates    |
| `src/components/index.ts`         | Barrel exports (update after consolidation) |
| `src/components/kit/`             | 20 components to audit                      |
| `src/styles/ui/`                  | CVA factories (the styling API)             |
| `eslint/ui-governance.config.mjs` | Enforcement rules (has bugs)                |
| `src/styles/tailwind.css`         | Token definitions (source of truth)         |
| `src/styles/theme.ts`             | Token TypeScript keys                       |

---

## Anti-Patterns

- ❌ Write stories/tests before consolidation — you'll test trash
- ❌ Add more ESLint rules — use ripgrep checks instead
- ❌ Let inventory tooling become the work — 2 hours max
- ❌ Skip the freeze — you'll chase regressions forever
- ❌ Create new components during cleanup — freeze means freeze

---

## Philosophy

**Freeze → Measure → Delete → Consolidate → Lock Down**

Stop the bleeding first. Measure to confirm the obvious. Delete dead code. Pick canonical primitives. Only THEN add stories and visual tests.

### Enforcement Philosophy

**Few lint rules + strong fixtures** — not ESLint jail.

| Layer                  | Tool                   | Why                                 |
| ---------------------- | ---------------------- | ----------------------------------- |
| Format + hygiene       | Biome                  | Fast, low false positives           |
| Boundaries + tokens    | ESLint (few rules)     | High-signal governance only         |
| Typography + arbitrary | ripgrep CI checks      | Deterministic, no config edge cases |
| Visual correctness     | Storybook + Playwright | The real enforcement                |

Keep ESLint rules few and scoped. Use `rg` for regex-friendly bans.

---

## Phase 0: FREEZE (Same Day)

**Goal**: Stop regressions while cleanup happens.

### Temporary CI Rules

Add to ESLint/CI configuration (see Master TODO for checkboxes):

- **No new component files** in `src/components/**` outside `kit/` without approval
- **No new UI library imports** — block new `@radix-ui/*`, `@headlessui/*`, etc. without RFC
- **Existing token rules enforced** — `no-raw-colors` already blocks raw Tailwind palette

### Implementation

Use comment-gated exceptions for approved changes only:

```typescript
// eslint-disable-next-line ui-governance/no-new-components -- RFC #123 approved
```

---

## Phase 1: INVENTORY v0 (Same Day — 2 Hours Max)

**Goal**: Quick counts to confirm the obvious. Do NOT let inventory tooling become the work.

### Tools

**ripgrep FIRST**. ts-morph is OPTIONAL (only if ripgrep results are unclear).

### What to Scan

#### 1. Component Imports (ripgrep)

```bash
# Count imports from kit barrel
rg "from ['\"]@/components" --type ts -c

# Count direct Radix imports (should only be in kit)
rg "from ['\"]@radix-ui" --type ts -c

# Count vendor imports outside kit (violations)
rg "from ['\"]@/components/vendor" --type ts -c --glob '!**/kit/**'
```

#### 2. JSX Tag Usage (ripgrep)

```bash
# Core primitives
rg "<Button" --type tsx -c
rg "<Input" --type tsx -c
rg "<Badge" --type tsx -c

# Layout
rg "<Container" --type tsx -c
rg "<Header" --type tsx -c
```

#### 3. className Divergence (THE REAL SOUP)

```bash
# Token violations - raw palette colors
rg "className.*bg-[a-z]+-[0-9]" --type tsx
rg "className.*text-[a-z]+-[0-9]" --type tsx
rg "className.*\[#" --type tsx  # hex values

# Spacing drift - raw values instead of tokens
rg "className.*(p|m)-[0-9]+" --type tsx
rg "gap-[0-9]+" --type tsx

# Typography drift - raw sizes instead of tokens
rg "text-(xs|sm|base|lg|xl|2xl)" --type tsx
```

#### 4. CVA Variant Usage (ts-morph — OPTIONAL)

Only if ripgrep doesn't give clear answers:

- Which CVA factories are actually used?
- Any inline variant definitions outside `styles/ui/`?

### Output

Document findings in `ui-inventory.json` (or just markdown notes):

```json
{
  "components": {
    "Button": { "count": 47, "files": ["..."] },
    "Input": { "count": 12, "files": ["..."] }
  },
  "tokenViolations": {
    "rawColors": { "count": 3, "files": ["..."] },
    "rawSpacing": { "count": 8, "files": ["..."] }
  },
  "imports": {
    "@/components": 89,
    "@radix-ui/*": 12
  }
}
```

---

## Phase 2: DELETE (Knip)

**Goal**: Remove dead code before refactoring.

### Setup

```bash
pnpm add -D knip
```

Add to `package.json`:

```json
{
  "scripts": {
    "knip": "knip",
    "knip:fix": "knip --fix"
  }
}
```

### Run

```bash
pnpm knip --include files,exports,dependencies
```

### Action

Delete all unused:

- Components
- Exports
- Dependencies

Immediately shrinks surface area. Removes "soup" that confuses consolidation.

### Add ripgrep CI Checks

Add to `pnpm check` (or Lefthook pre-commit):

```bash
# scripts/check-ui-tokens.sh

# (a) Ban raw typography utilities outside allowed dirs
if rg "text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)" \
  --type tsx \
  --glob '!src/styles/**' \
  --glob '!src/components/kit/**' \
  -c 2>/dev/null; then
  echo "ERROR: Raw text-* utilities found outside styles/kit"
  exit 1
fi

# (b) Ban arbitrary values without var(--token)
if rg '\[(?!var\(--)[^\]]+\]' \
  --type tsx \
  --glob '!src/styles/**' \
  --glob '!src/components/kit/**' \
  --glob '!src/components/vendor/**' \
  -c 2>/dev/null; then
  echo "ERROR: Arbitrary values without var(--token) found"
  exit 1
fi

echo "UI token checks passed"
```

**Why rg over ESLint**: Deterministic, fast, no Tailwind config edge cases.

**Integration** (see Master TODO Phase 2 for checkboxes):

- Add `scripts/check-ui-tokens.sh` with the two checks above
- Wire into `pnpm check` so it runs locally — devs will ignore CI-only checks
- Optionally add to Lefthook pre-commit
- Keep to these two checks only — don't add more

---

## Phase 3: CONSOLIDATE

**Goal**: Pick canonical primitives. One component per category. Everything else migrated or deleted.

### Cycle Detection (Optional)

Only if circular imports suspected:

```bash
pnpm add -D madge
pnpm madge --circular src/components
```

### Canonical Primitives Target

| Category     | Canonical                      | Migrate From | Status      |
| ------------ | ------------------------------ | ------------ | ----------- |
| Button       | `kit/inputs/Button`            | —            | ✓ exists    |
| Input        | `kit/inputs/Input`             | —            | ✓ exists    |
| Badge        | `kit/data-display/Badge`       | —            | ✓ exists    |
| Avatar       | `kit/data-display/Avatar`      | —            | ✓ exists    |
| Container    | `kit/layout/Container`         | —            | ✓ exists    |
| Header       | `kit/layout/Header`            | —            | ✓ exists    |
| Card         | TBD                            | —            | assess need |
| Dialog/Modal | TBD                            | —            | assess need |
| Dropdown     | TBD (extract from ModeToggle?) | —            | assess need |

**Success criteria**: Exactly ONE component per category in kit. Everything else migrated or deleted.

### Migration Approach

Manual edits first (3-page site). Codemods only if >10 instances of same migration.

### Hard Outcome (Gate for Phase 4)

**Ship a PR that**:

1. Deletes/migrates all duplicates found in Phase 1-2
2. Lands canonical kit map (one component per category)
3. Updates barrel exports to reflect final kit
4. Fixes any token violations found in className scan
5. Passes automated QA gate (see below)

**Phase 4 does NOT start until this PR merges.**

---

## Automated QA Gate (Phase 0-3 exit criteria)

### Why this exists

- We do NOT use a human as the QA gate. Evidence must be reproducible in CI.
- This PR series intentionally avoids visual redesign; the goal is to prevent regressions while we refactor/govern.

### Gate requirements (Phase 0-3 blocking)

- Add an automated `ui:qa` check that asserts **no horizontal overflow** at 3 viewports on 3 routes:
  - Routes: `/`, `/credits`, `/chat`
  - Viewports: `360x800`, `768x900`, `1280x900`
  - Assertion: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- The check must run in CI and print PASS/FAIL per route+viewport.

### Implementation guidance (MVP)

- Use Playwright (preferred) or a minimal headless script. Keep it tiny and deterministic.
- This is a _regression gate_, not a design gate. No pixel-perfect snapshots yet.

### What is explicitly NOT required yet

- No visual snapshot baselines.
- No Lighthouse budgets.
- No Storybook stories.

### Exit criteria for Phase 0-3 PRs

- `pnpm check`, `pnpm test`, `pnpm build` pass
- `pnpm ui:qa` passes (or equivalent CI job)
- Any intentional behavior change (e.g., scroll behavior) is stated in PR description

---

### Code Cleanup (During Phase 3)

- [x] `GithubButton.tsx:419` — Remove CVA variant export (Commit c03f604) ✅
- [x] `Input.tsx` — Move inline CVA to `@/styles/ui/inputs.ts` (Commit c03f604) ✅
- [x] `Alert.tsx` — Replace raw green colors with semantic success tokens (Commit c03f604) ✅
- [x] `CreditsPage.client.tsx` — Extract 7 inline className patterns to data factories (Commit 144f887) ✅
- [x] `Terminal.tsx` — Extract 5 chat factories to overlays (Commit 280f069) ✅
- [x] `HomeHeroSection.tsx` — Move 3 CVAs to layout.ts (Commit e101efc) ✅

### ESLint Config Bugs (Technical Debt)

Fix these in `eslint/ui-governance.config.mjs`:

- [x] **Layer blocks override base rules** — Refactored to `BASE_RESTRICTED_PATTERNS` constant (Commit 3ffca09) ✅
- [x] **Wrong allowlist syntax** — `rounded-[--radius]` → `rounded-[var(--radius)]` (Commit 3ffca09) ✅
- [x] **Malformed glob** — `e2e/**/*.{ts,spec.ts}` → `e2e/**/*.ts` (Commit 3ffca09) ✅
- [x] **Overlapping rules** — Set `tailwindcss/prefer-theme-tokens: "off"` with rationale (Commit 3ffca09) ✅
- [x] **Broad scope** — Narrowed to `src/app/**`, `src/components/**`, `src/features/**` (Commit 3ffca09) ✅

---

## Phase 4: LOCK DOWN (After Consolidation)

**Only for canonical survivors from Phase 3.**

### A. Storybook Setup

```bash
# Install with Next.js Vite builder
npx storybook@latest init

# Add addons
pnpm add -D @storybook/addon-a11y @storybook/addon-viewport
```

Add to `package.json`:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build"
  }
}
```

### B. Playwright Visual Regression

Add to `playwright.config.ts`:

```typescript
// Visual regression config
{
  testDir: './e2e/visual',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
    },
  },
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:visual": "playwright test --config=playwright.visual.config.ts"
  }
}
```

### C. Lighthouse Mobile Budget

Add Lighthouse CI for mobile performance gate:

```bash
pnpm add -D @lhci/cli
```

Add to `package.json`:

```json
{
  "scripts": {
    "lighthouse": "lhci autorun"
  }
}
```

Create `lighthouserc.js`:

```javascript
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000/", "http://localhost:3000/credits"],
      settings: { preset: "mobile" },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
      },
    },
  },
};
```

**Mobile score ≥ 90** is the north star. But will be noisy early.

**Staged rollout** (see Master TODO Phase 4 for checkboxes):

- Phase 3 (during consolidation): Run as `warn` only, or set floor at 70-80
- Gate on key routes only (`/`, `/credits`) — not every page
- After Phase 3 PR merges: Crank to hard-fail ≥ 90
- Add to CI pipeline as blocking check

### D. Stories for Canonical Kit

Create stories for survivors only:

| Component      | Variants to Cover                 |
| -------------- | --------------------------------- |
| Button         | tone (5), size (4), icon, asChild |
| Input          | default, disabled, error          |
| Badge          | intent (4), size (4)              |
| Avatar         | with/without fallback             |
| Container      | size variants                     |
| Header         | responsive collapse               |
| NavigationLink | active/inactive                   |
| TerminalFrame  | surface (3)                       |

### E. Visual Baselines

Capture at 3 viewports:

- 360px (mobile)
- 768px (tablet)
- 1280px (desktop)

---

## Timeline Summary

| Phase                | Duration    | Blocker                     |
| -------------------- | ----------- | --------------------------- |
| Phase 0: Freeze      | Same day    | —                           |
| Phase 1: Inventory   | 2 hours max | —                           |
| Phase 2: Delete      | 1-2 hours   | Inventory complete          |
| Phase 3: Consolidate | Variable    | Delete complete             |
| Phase 4: Lock Down   | Variable    | **Consolidation PR merged** |

---

## References

- [UI_IMPLEMENTATION_GUIDE.md](UI_IMPLEMENTATION_GUIDE.md) — Canonical UI reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — Layer enforcement rules
- [ui-style-spec.json](ui-style-spec.json) — Machine-readable style spec
