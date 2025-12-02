# Migration Plan: Remove @theme inline + Mobile-First Header

## Goal

Delete the non-standard `@theme inline` block from `tailwind.css` and redesign Header for mobile-first using **standard Tailwind classes** (like Credits page), ensuring no horizontal overflow at any viewport.

## Key Decisions

- **GithubButton on mobile**: Icon-only (no star count), expands to full at lg+
- **Styling approach**: Standard Tailwind classes (`px-4 gap-2 md:gap-4`), not CVA tokens
- **WalletConnectButton**: Always visible in header (wallet-first UX)

---

## Phase 1: Delete @theme inline + Migrate to Standard Tailwind

### Philosophy

**Do NOT preserve the bespoke token system.** Instead of moving vars to `:root`, replace usages with standard Tailwind utilities at callsites.

### What to Keep in :root/.dark

ONLY shadcn semantic colors + radius (already defined lines 33-111):

```css
--background, --foreground, --card, --popover, --primary, --secondary,
--muted, --accent, --destructive, --border, --input, --ring (+ foreground variants)
--radius
```

### Migration Strategy

#### 1.1 Delete @theme inline Block

Delete lines 113-268 entirely. The `tailwind.config.ts` already maps colors via `hsl(var(--token))`.

#### 1.2 Fix Broken var() References at Callsites

After deletion, `pnpm check` will fail on unresolved vars. Fix by replacing with standard Tailwind:

| Old Pattern                        | New Pattern                      |
| ---------------------------------- | -------------------------------- |
| `gap-[var(--spacing-md)]`          | `gap-4`                          |
| `gap-[var(--spacing-lg)]`          | `gap-6`                          |
| `gap-[var(--spacing-xl)]`          | `gap-8`                          |
| `shadow-[var(--shadow-lg)]`        | `shadow-lg`                      |
| `shadow-[var(--shadow-sm)]`        | `shadow-sm`                      |
| `z-[var(--z-overlay)]`             | `z-50`                           |
| `max-w-[var(--size-container-lg)]` | `max-w-4xl` (or `max-w-[56rem]`) |
| `duration-[var(--duration-fast)]`  | `duration-150`                   |
| `h-[var(--size-icon-lg)]`          | `h-6`                            |
| `w-[var(--size-icon-lg)]`          | `w-6`                            |

#### 1.3 Extend tailwind.config.ts (If Needed)

For tokens with no direct Tailwind equivalent, add to theme.extend:

```ts
// tailwind.config.ts
theme: {
  extend: {
    // Only if no standard Tailwind utility exists
    spacing: {
      'icon-sm': '1rem',
      'icon-lg': '1.5rem',
    },
    // etc.
  }
}
```

#### 1.4 Minimal Compatibility Layer (Last Resort)

If a var is deeply embedded and blocking the build with no quick fix:

1. Add ONLY that var to `:root`
2. Create tech debt issue to remove it
3. Document why it was needed

**Hard rule:** No new non-color vars in `:root` unless grep-proven and no Tailwind replacement.

#### 1.5 Verification

- [ ] `pnpm check` passes
- [ ] `grep -r "var(--spacing" src/` returns zero matches (or documented exceptions)
- [ ] `grep -r "var(--size-" src/` returns zero matches (or documented exceptions)
- [ ] Light/dark mode works
- [ ] No hydration warnings

---

## Phase 2: Mobile-First Header Redesign

### Current Issues

```
Header on mobile: [Logo][Cogni][Chat][Credits][GithubButton][Wallet][Toggle]
Result: Horizontal overflow, cramped layout, broken UX
```

### Target Layout (Using Standard Tailwind Classes)

| Breakpoint           | Left           | Right                                                        |
| -------------------- | -------------- | ------------------------------------------------------------ |
| **< 768px (mobile)** | Logo + "Cogni" | GithubIcon + Wallet + ModeToggle + MenuButton                |
| **≥ 768px (md)**     | Logo + "Cogni" | Nav links inline + GithubIcon + Wallet + Toggle              |
| **≥ 1024px (lg)**    | Logo + "Cogni" | Nav links + GithubButton (full with stars) + Wallet + Toggle |

### Implementation

#### 2.1 Add shadcn Sheet Component

```bash
npx shadcn@latest add sheet
```

#### 2.2 Create MobileNav Component

New file: `src/components/kit/navigation/MobileNav.tsx`

```tsx
// Uses Sheet from shadcn
// Contains: Chat, Credits links (+ any future nav items)
// Trigger: hamburger Menu icon button (min-h-11 touch target)
// Accessible: focus trap, aria-labels, keyboard navigation
```

#### 2.3 Refactor Header.tsx (Standard Tailwind Classes)

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import {
  GithubButton,
  ModeToggle,
  NavigationLink,
  WalletConnectButton,
} from "@/components";
import { MobileNav } from "@/components/kit/navigation/MobileNav";

export function Header(): ReactElement {
  return (
    <header className="border-b border-border bg-background py-3">
      {/* Container: matches PageContainer pattern */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo - min-w-0 prevents flex overflow */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/TransparentBrainOnly.png"
              alt="Cogni Brain Logo"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="truncate bg-gradient-to-r from-primary to-accent-blue bg-clip-text text-lg font-bold text-transparent">
              Cogni
            </span>
          </Link>

          {/* Desktop nav - hidden on mobile */}
          <nav
            className="hidden items-center gap-4 md:flex"
            aria-label="Primary"
          >
            <NavigationLink href="/chat">Chat</NavigationLink>
            <NavigationLink href="/credits">Credits</NavigationLink>
          </nav>

          {/* Action buttons - responsive */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* GithubButton: icon-only until lg - use hidden, NOT opacity-0 */}
            <GithubButton
              username="cogni-DAO"
              repo="cogni-template"
              size="sm"
              variant="default"
              showGithubIcon={true}
              showStarIcon={false}
              className="hidden sm:flex lg:hidden" // Hidden <sm and ≥lg
            />
            {/* Full GithubButton at lg+ */}
            <GithubButton
              username="cogni-DAO"
              repo="cogni-template"
              size="lg"
              variant="default"
              showGithubIcon={true}
              showStarIcon={true}
              initialStars={0}
              targetStars={172900}
              autoAnimate={true}
              animationDuration={10}
              className="hidden lg:flex"
            />

            {/* Wallet: compact on mobile, full on sm+ */}
            <WalletConnectButton variant="compact" className="sm:hidden" />
            <WalletConnectButton className="hidden sm:flex" />

            <ModeToggle />

            {/* Mobile menu trigger - 44px touch target */}
            <MobileNav className="md:hidden" />
          </div>
        </div>
      </div>
    </header>
  );
}
```

#### 2.4 Component Requirements

**GithubButton:**

- Use `hidden` class (not `opacity-0` or `sr-only`) to prevent duplicate tab stops
- Hidden on <sm in header, but **must be accessible in Sheet** so mobile users can reach it
- Ensure both header instances have identical `href` and `aria` semantics

**WalletConnectButton:**

- Add `variant: 'default' | 'compact'` with strict contract:
  - **compact**: Never renders address/balance, uses `max-w-[8.5rem]` + `truncate` on label container, `shrink-0` on button
  - **default**: Full behavior with address when connected
  - Identical click behavior for both variants
- Implementation: truncate inside label container, not just on button wrapper

**MobileNav trigger (use shadcn Button for consistency):**

```tsx
// Inside MobileNav.tsx
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

<Sheet>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Open menu">
      <Menu className="h-5 w-5" />
    </Button>
  </SheetTrigger>
  <SheetContent>
    {/* Nav links: Chat, Credits */}
    {/* GithubButton (full) - ensures mobile users can access it */}
    <nav className="flex flex-col gap-4 py-4">
      <NavigationLink href="/chat">Chat</NavigationLink>
      <NavigationLink href="/credits">Credits</NavigationLink>
    </nav>
    <GithubButton ... />  {/* Full version in Sheet */}
  </SheetContent>
</Sheet>
```

#### 2.5 Overflow Protection Rules

| Element        | Protection                                            |
| -------------- | ----------------------------------------------------- |
| Logo container | `min-w-0` allows flex shrinking                       |
| Brand text     | `truncate` prevents text overflow                     |
| Logo image     | `shrink-0` keeps fixed size                           |
| Action cluster | `shrink-0` prevents collapse                          |
| WalletConnect  | Compact variant + `max-w-[8.5rem] truncate` on mobile |
| Touch targets  | `h-11 w-11` minimum (44px)                            |

#### 2.6 Playwright Overflow Assertion

Add to header tests (with tolerance for scrollbar/font loading edge cases):

```ts
test("header does not overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // Wait for fonts to load

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  // Allow 1px tolerance for subpixel rounding
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test("header does not overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
```

---

## Phase 3: Homepage & Root Layout Alignment

### 3.1 Root Layout (`src/app/layout.tsx`)

Ensure consistent padding cascade:

- Body: No horizontal padding (handled by Container/PageContainer)
- Main: `min-h-screen` via pageShell CVA (keep existing)

### 3.2 Homepage Audit

- Verify Hero section doesn't overflow on mobile
- Ensure consistent spacing with Credits page pattern
- Container max-width: `max-w-7xl` (1280px) matches Header

---

## Files to Modify

| File                                              | Action                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| `src/styles/tailwind.css`                         | Delete `@theme inline` block (lines 113-268)                        |
| `src/styles/ui/*.ts`                              | Replace `var(--spacing-*)`, `var(--size-*)` with Tailwind utilities |
| `src/components/kit/layout/Header.tsx`            | Rewrite with standard Tailwind + overflow protection                |
| `src/components/kit/navigation/MobileNav.tsx`     | **NEW** - Sheet-based mobile nav                                    |
| `src/components/kit/auth/WalletConnectButton.tsx` | Add `variant: 'default'                                             | 'compact'` prop |
| `src/components/ui/sheet.tsx`                     | **NEW** - Add via `npx shadcn@latest add sheet`                     |
| `src/components/index.ts`                         | Export MobileNav                                                    |
| `tests/e2e/header.spec.ts`                        | **NEW** - Overflow assertions at 360/390px                          |

**Potentially modified (if var() usages exist):**

- `src/styles/ui/layout.ts` - Replace spacing vars
- `src/styles/ui/overlays.ts` - Replace z-index, shadow vars
- `src/styles/ui/data.ts` - Replace size vars
- `tailwind.config.ts` - Extend theme only if no Tailwind equivalent exists

---

## Acceptance Criteria

### Token Migration

- [ ] No `@theme inline` block in tailwind.css
- [ ] `grep -r "var(--spacing" src/` returns zero matches (or documented exceptions)
- [ ] `grep -r "var(--size-" src/` returns zero matches (or documented exceptions)
- [ ] `pnpm check` passes
- [ ] Light/dark mode works
- [ ] No hydration warnings in console

### Header Mobile-First

- [ ] No horizontal overflow at 360px, 390px, 768px, 1024px viewports
- [ ] Playwright test: `scrollWidth <= clientWidth + 1` at 360/390px (with networkidle)
- [ ] Touch targets ≥ 44px on mobile (`h-11 w-11`)
- [ ] Sheet opens/closes correctly with hamburger menu (uses shadcn Button)
- [ ] Keyboard navigation works (focus trap in Sheet)
- [ ] All nav links accessible via Sheet on mobile
- [ ] GithubButton: hidden <sm in header, **accessible in Sheet** on mobile
- [ ] GithubButton: icon-only sm-lg, full lg+ in header
- [ ] WalletConnectButton: compact variant <sm (no address, `max-w-[8.5rem]`, `shrink-0`), full sm+
- [ ] Logo container has `min-w-0`, brand text has `truncate`, logo has `shrink-0`

### Visual Verification

- [ ] Screenshot at 360/390/768/1024px (light + dark)
- [ ] Credits page styling unchanged
- [ ] Homepage Hero section renders correctly on mobile

---

## Implementation Order

1. **Phase 1: Delete @theme inline** - Run `pnpm check`, fix broken var() refs with Tailwind utilities
2. **Add Sheet component** - `npx shadcn@latest add sheet`
3. **Add WalletConnect compact variant** - Small isolated change
4. **Create MobileNav** - Isolated new component with 44px trigger
5. **Refactor Header** - Standard Tailwind + overflow protection + responsive variants
6. **Add Playwright test** - Overflow assertion at 360/390px
7. **Verify & test** - All breakpoints, both themes, `pnpm check`

---

## Risk Mitigation

| Risk                             | Mitigation                                                   |
| -------------------------------- | ------------------------------------------------------------ |
| Var() breakage after delete      | Replace at callsites with Tailwind utilities before checking |
| CVA factory failures             | Test style module imports individually                       |
| GithubButton duplicate tab stops | Use `hidden` class (not `opacity-0`/`sr-only`)               |
| Brand text overflow              | `min-w-0` on container + `truncate` on text                  |
| Wallet button overflow           | Compact variant with `max-w-[8.5rem] truncate` on mobile     |
| Sheet accessibility              | shadcn uses Radix primitives (focus trap built-in)           |
| Touch target too small           | Enforce `h-11 w-11` (44px) on all mobile buttons             |
