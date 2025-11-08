# UI Style Guide

Purpose: consistent, testable UI with clean boundaries and enforced design tokens. All styling flows through centralized CVA API with ESLint blocking literal className usage.

## Directory model

- `src/components/ui/` — shadcn base. Treat as vendor. Do not edit.
- `src/components/primitives/` — stateless building blocks and wrappers around `ui/`.
- `src/components/widgets/` — composite, reusable UI (tables, terminal, markdown viewer).
- `src/components/layout/` — shells, headers, nav, footers.
- `src/components/overlays/` — modal, drawer, toast presenters.
- `src/components/forms/` — composed field groups and resolvers.
- `src/features/<slice>/components/` — slice-specific UI. Promote only after second consumer.

**Decision rule**: colocate first, promote on reuse.

## Boundaries

- Pages/features may import kit only; kit may import @/styles/ui only; vendor never imported directly.
- UI must not import: `core`, `ports`, `adapters`, `contracts`, or DB/IO.
- Widgets can own local UI state only.

## Server vs client

- Mark client components: `"use client"`.
- Keep server-only logic in routes or loaders. Pass data as props.

## Centralized Styling API

### Core Principle: Zero Literal Classes

All styling flows through `src/styles/ui.ts` CVA factories. ESLint blocks literal `className` strings to enforce design token discipline.

**Policy:** Pages must use kit layout and mdx wrappers; literal className is banned app-wide. Only `src/styles/ui.ts` may contain class literals for CVA factory definitions. CVA outputs are final; no class merging in app code.

```tsx
// src/components/kit/Button.tsx
import { button } from "@/styles/ui";
export function Button({ variant, size, ...p }) {
  return <button className={button({ variant, size })} {...p} />;
}
```

### Available Styling Factories

Defined in `src/styles/ui.ts`:

- `avatar({ size })` - User profile display with consistent sizing
- `button({ variant, size })` - Interactive buttons with design system variants
- `card({ variant })` - Content containers and surfaces
- `badge({ variant, size })` - Status indicators and labels

All variants provide TypeScript autocompletion and use design tokens exclusively.

### ESLint Enforcement

Configured rules block all literal className usage:

```javascript
"no-literal-classnames/no-literal-classnames": "error",
"no-restricted-syntax": [
  "error",
  {
    selector: "JSXAttribute[name.name='className'] Literal",
    message: "Use styling API from @/styles/ui. Literal className forbidden."
  },
  {
    selector: "JSXAttribute[name.name='className'] JSXExpressionContainer > CallExpression[callee.name='cn'] Literal",
    message: "Use styling API from @/styles/ui. cn() with literal strings forbidden."
  }
],
"no-restricted-imports": [
  "error",
  {
    patterns: [{
      group: ["@/components/ui/*"],
      message: "Use @/components/kit/* wrappers instead of direct ui imports"
    }],
    paths: [{
      name: "clsx",
      message: "Only allowed in src/styles/** - use styling API from @/styles/ui instead"
    }]
  }
]
```

## Component Implementation

### Using Styling API

```tsx
// Import from kit in pages
import { Button } from "@/components/kit/Button";
```

### Adding New Styling Variants

Update centralized factory in `src/styles/ui.ts`:

```typescript
export const button = cva(
  "inline-flex items-center justify-center rounded-md font-medium",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-8 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);
```

TypeScript automatically enforces available variants with full intellisense.

## Naming conventions

- Folder name = component name in kebab-case. File `index.tsx` exports default.
- Variant prop names: `variant`, `size`, `tone`, `state`, `shape`, `elevation`.
- Keep public exports curated in `src/components/index.ts`.

## File headers

Top-of-file doc block:

```typescript
/**
 * Purpose: one sentence on the role.
 * Scope: what it owns; what it avoids.
 * Invariants: 1–3 guarantees (render shape, a11y, variant behavior).
 */
```

## Accessibility

- Keyboard support on all interactive elements.
- Label every control. Use `aria-*` when needed.
- Color contrast meets WCAG AA.
- Focus outlines: never removed without a replacement.

## Testing

- **Primitives**: render smoke + variants snapshot.
- **Widgets**: interaction tests, no network.
- Avoid mocking CSS classes. Assert visible behavior.

## Performance

- Avoid re-renders: memoize stable children, event handlers.
- Defer heavy code with dynamic import at the route or widget boundary.
- No layout shift: set fixed dimensions or aspect ratios.

## Promotion policy

- **One route** → colocate under that route or its feature.
- **Second consumer** → move to `components/widgets`.
- **If it becomes stateless and generic** → `components/primitives`.

## Deprecated components

- Add `@deprecated` tag in header. Keep for one minor release.
- Replace in-call sites before removal.

## Review checklist (copy into PR)

- [ ] Directory placement correct?
- [ ] Imports within boundary?
- [ ] Uses styling API from `@/styles/ui` (no literal className)?
- [ ] No direct clsx/cn imports outside styles layer?
- [ ] Variants use design tokens from `src/styles/tailwind.preset.ts`?
- [ ] A11y checks passed?
- [ ] Tests added and green?
- [ ] `components/index.ts` updated if public?
- [ ] ESLint passes with new no-literal-className rules?
