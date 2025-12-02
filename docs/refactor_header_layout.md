# Mobile-First Header Implementation

## Status: ✅ Phase 1-2B COMPLETED (2025-12-02)

**Branch:** fix/ui-mobile
**Commits:** db02b1c (Phase 1), 87af79b (Phase 2A), f2c9b60 (bugs), [Phase 2B pending]

---

## Phase 1: Token Migration ✅ COMPLETE

### What Was Done

- Deleted `@theme inline` block from tailwind.css (lines 113-268)
- Migrated spacing/size/z/duration to tailwind.config.ts theme.extend
- Updated 6 CVA factory files (layout, overlays, data, typography, code, payments)
- Replaced ~120 `var(--spacing-*)`, `var(--size-*)` references with Tailwind classes
- Added `@config "../../tailwind.config.ts"` directive (Tailwind v4 requirement)
- Fixed semantic colors (danger/warning/success) in :root
- Updated KpiBadge.tsx to use new tokens

### Token Pipeline (Implemented)

```
Colors + radius → CSS vars (:root/.dark) → Tailwind semantic classes (bg-primary, text-accent)
Spacing/size/z/duration → tailwind.config.ts extend → Tailwind utilities (gap-4, h-icon-lg, z-overlay)
```

### Deduplication Strategy

- **spacing**: icon sizes (h-icon-lg, w-icon-lg)
- **width**: dropdown widths (w-dropdown-md)
- **maxWidth**: container max-widths (max-w-container-lg)
- **zIndex**: overlay/modal layers
- **transitionDuration/Delay**: animation timing

### Exceptions

- Hero animation tokens kept in :root (isolated to code.ts): `--hero-spacing-*`, `--width-action-words`

**Commit:** db02b1c

---

## Phase 2A: Mobile-First Header ✅ COMPLETE

### Components Created

1. **MobileNav.tsx** - Sheet-based hamburger menu
   - 40px touch target (h-10 w-10)
   - SheetTitle for accessibility (WCAG 2.1)
   - Initially had GithubButton widget (later replaced in Phase 2B)

2. **WalletConnectButton compact variant**
   - RainbowKit `accountStatus="avatar"` + `showBalance={false}`
   - `max-w-[8.5rem]` to prevent mobile overflow (ESLint approved)

3. **Header.tsx mobile-first rewrite**
   - Standard Tailwind classes (no CVA factories)
   - Overflow protection: min-w-0, truncate, shrink-0
   - Responsive breakpoints for GitHub/nav visibility

### Responsive Layout (Implemented)

| Breakpoint   | Left           | Right                               |
| ------------ | -------------- | ----------------------------------- |
| **< 768px**  | Logo + "Cogni" | Wallet (compact) + Menu             |
| **≥ 768px**  | Logo + "Cogni" | Nav links + Wallet + Theme + Menu   |
| **≥ 1024px** | Logo + "Cogni" | Nav links + GitHub + Wallet + Theme |

### Bug Fixes (f2c9b60)

- Desktop nav spacing: Grouped nav + buttons together (gap-4 sm:gap-6)
- Removed duplicate wallet placeholder flash (loading: () => null)
- Added SheetTitle for accessibility

**Commits:** 87af79b, f2c9b60

---

## Phase 2B: UX Refinements ⏳ READY TO COMMIT

### Changes Made

1. **Inline 3-button theme toggle in Sheet footer**
   - NEW: SheetThemeToggle component using toggle-group
   - Grid layout (grid-cols-3) fills Sheet width
   - Icons only (Sun/Moon/Monitor), no labels
   - 48px touch targets (h-12 w-full)
   - Replaces dropdown-based ModeToggle on mobile

2. **Reduced Sheet width**
   - w-48 sm:w-52 (192px/208px)
   - Sheet width = 3 toggle buttons side-by-side exactly

3. **Replaced GitHub widget with simple link**
   - Removed GithubButton (12 props, prop drift risk)
   - Simple external link: "GitHub" + ExternalLink icon
   - Consistent with Chat/Credits nav items

4. **Mobile header spacing improvements**
   - Container: px-2 on mobile (was px-4)
   - Button gap: gap-1 on mobile (was gap-2)
   - Wallet button closer to right edge
   - Menu icon: h-10 w-10 button with h-5 w-5 icon

5. **Hide theme toggle on mobile**
   - Header ModeToggle: `className="hidden md:flex"`
   - Mobile users access theme via Sheet footer
   - Desktop unchanged (dropdown in header)

**Files modified:**

- src/components/kit/navigation/MobileNav.tsx
- src/components/kit/layout/Header.tsx
- src/components/kit/theme/SheetThemeToggle.tsx (NEW)
- src/components/vendor/shadcn/toggle.tsx (NEW via shadcn)
- src/components/vendor/shadcn/toggle-group.tsx (NEW via shadcn)

---

## Still Pending

### Wallet Button Stability

**Delegated** to another developer (see docs/HANDOFF_WALLET_BUTTON_STABILITY.md)

Issues:

- Layout shift on hydration (wallet slot not stable)
- "Connect Wallet" label on mobile (should be "Connect")
- Duplicate flash during SSR → hydration

Solution requires:

- `ConnectButton.Custom` with stable shell
- Mount gate with placeholder
- Fixed-width container across all states

### Enforcement Layer (Deferred)

- Playwright overflow tests at 360/390px
- ESLint narrow spacing lint rule + documentation

---

## Files Modified (All Phases)

| File                                                | Action                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| tailwind.config.ts                                  | Add spacing/width/maxWidth/zIndex/durations to theme.extend         |
| src/styles/tailwind.css                             | Delete @theme inline, add @config, keep hero vars + semantic colors |
| src/styles/ui/\*.ts                                 | Replace 120+ var() with Tailwind classes (6 files)                  |
| src/features/home/components/KpiBadge.tsx           | Migrate from deleted CSS vars                                       |
| src/components/kit/auth/WalletConnectButton.tsx     | Add compact variant                                                 |
| src/components/kit/auth/SafeWalletConnectButton.tsx | Forward variant prop                                                |
| src/components/kit/layout/Header.tsx                | Mobile-first rewrite                                                |
| src/components/kit/navigation/MobileNav.tsx         | NEW - Sheet menu                                                    |
| src/components/kit/theme/SheetThemeToggle.tsx       | NEW - Inline toggle                                                 |
| src/components/vendor/shadcn/sheet.tsx              | NEW via shadcn                                                      |
| src/components/vendor/shadcn/toggle.tsx             | NEW via shadcn                                                      |
| src/components/vendor/shadcn/toggle-group.tsx       | NEW via shadcn                                                      |
| docs/HANDOFF_WALLET_BUTTON_STABILITY.md             | NEW - Technical handoff                                             |

---

## Verification

- ✅ `pnpm check` passes (typecheck, lint, format, test)
- ✅ `pnpm check:docs` passes (AGENTS.md + file headers)
- ✅ No @theme inline block
- ✅ Single token pipeline (colors in CSS vars, spacing in config)
- ✅ No horizontal overflow observed at common breakpoints
- ⏳ Manual testing at 360/390/768/1024px pending final QA

---

## Next Steps

1. Commit Phase 2B documentation updates
2. Manual QA at 360/390/768/1024px viewports
3. Address wallet button stability (see handoff doc)
4. Add Playwright overflow tests (deferred)
5. Add ESLint spacing enforcement (deferred)
