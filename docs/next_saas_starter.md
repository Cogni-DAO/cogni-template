# Components to Copy from SaaS-Starter

## Priority 1: Essential UI Components

### Card System

- [x] **Source:** `/Users/derek/dev/saas-starter/components/ui/card.tsx`
- [x] **Target:** `src/components/vendor/ui-primitives/shadcn/card.tsx`
- [x] **Status:** ✅ Already exists - basic shadcn card implementation
- **Dependencies:** `@/lib/utils` (cn function)
- **Tokens Used:** `bg-card`, `text-card-foreground`, `border`, `shadow-sm`, `text-muted-foreground`

### Button (Update Existing)

- [x] **Source:** `/Users/derek/dev/saas-starter/components/ui/button.tsx`
- [x] **Current:** `src/components/vendor/ui-primitives/shadcn/button.tsx` (Radix-based)
- [x] **Also has:** `src/styles/ui/inputs.ts` (CVA factory) + `src/components/kit/inputs/Button.tsx`
- [x] **Status:** ✅ Already exists - multiple implementations available
- **Note:** Has Slot from Radix, `asChild` prop, but may need style updates

### Input

- [ ] **Source:** `/Users/derek/dev/saas-starter/components/ui/input.tsx`
- [ ] **Target:** `src/components/vendor/ui-primitives/shadcn/input.tsx`
- [ ] **Status:** ❌ Missing - needs to be copied
- **Tokens Used:** `bg-background`, `border-input`, `focus-visible:ring-ring`

### Label

- [ ] **Source:** `/Users/derek/dev/saas-starter/components/ui/label.tsx`
- [ ] **Target:** `src/components/vendor/ui-primitives/shadcn/label.tsx`
- [ ] **Status:** ❌ Missing - needs to be copied

## Priority 2: Interactive Components

### DropdownMenu

- [ ] **Source:** `/Users/derek/dev/saas-starter/components/ui/dropdown-menu.tsx`
- [ ] **Target:** `src/components/vendor/ui-primitives/shadcn/dropdown-menu.tsx`
- [ ] **Status:** ❌ Missing - needs to be copied
- **Dependencies:** `@radix-ui/react-dropdown-menu`, `lucide-react` icons
- **Tokens Used:** `bg-popover`, `focus:bg-accent`, `dark:` utilities, `text-destructive`

### Avatar (Update Existing)

- [x] **Source:** `/Users/derek/dev/saas-starter/components/ui/avatar.tsx`
- [x] **Current:** `src/components/vendor/ui-primitives/shadcn/avatar.tsx` + `src/components/kit/data-display/Avatar.tsx`
- [x] **Status:** ✅ Already exists - compare implementations for best features
- **Action:** Compare and potentially merge best features

### Radio Group

- [ ] **Source:** `/Users/derek/dev/saas-starter/components/ui/radio-group.tsx`
- [ ] **Target:** `src/components/vendor/ui-primitives/shadcn/radio-group.tsx`
- [ ] **Status:** ❌ Missing - needs to be copied

## Priority 3: Application Components

### Terminal Component

- [x] **Source:** `/Users/derek/dev/saas-starter/app/(dashboard)/terminal.tsx`
- [x] **Current:** `src/features/home/components/Terminal.tsx`
- [x] **Status:** ✅ Already exists - but may need feature updates
- **Note:** Saas-starter version has clipboard functionality, step-by-step animation, uses hardcoded classes instead of design tokens

## Summary

- **✅ Already have:** Card, Button, Avatar, Terminal (4/8)
- **❌ Missing:** Input, Label, DropdownMenu, Radio Group (4/8)
- **🔄 Need updates:** Terminal (clipboard), Button/Avatar (compare implementations)
