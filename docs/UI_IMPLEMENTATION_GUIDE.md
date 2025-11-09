# New UI Feature — How to implement

Here's the ~50-line developer guide.

## Directories

**src/components/vendor/ui-primitives/** — vendored code (e.g., shadcn). Read-only.

**src/components/kit/** — wrappers only. No className prop. Uses CVA from @/styles/ui.

**src/features/<slice>/components/** — feature composition only. Uses kit.

**src/styles/ui.ts** — single styling API (CVA factories). Only place with class literals.

**Docs:** docs/UI_IMPLEMENTATION_GUIDE.md (this guide), src/components/AGENTS.md, src/styles/AGENTS.md.

**Building full features?** See [Feature Development Guide](FEATURE_DEVELOPMENT_GUIDE.md) for the complete architecture workflow.

## Rules (must follow)

**No literal className anywhere** except src/styles/ui.ts.

**Pages/features import kit only.** Never import vendor or styles directly.

**Features imports enforced by ESLint:** allow only @/components and @/components/kit/**; block @/styles/** and @/components/vendor/\*\*.

**kit/** calls CVA: `className={button({ size, intent })}`. Do not forward className.

**CVA parameters allowed:** ESLint permits string literals inside CVA calls like `row({ gap: "xs" })` but blocks direct className literals like `className="flex gap-2"`.

**Vendor must not import @/\***. Keep local \_vendor_utils if shadcn needs cn.

## Design Token Architecture

**Design tokens live in tailwind.css + tailwind.preset.ts**; theme.ts exposes their keys for typing; only ui.ts and kit components may use them.

**Features never see theme details** - they only use typed props and CVA factories.

## CVA + theme.ts Standard

**Token values live in tailwind.css and tailwind.preset.ts.**

**src/styles/theme.ts exports keys and types only.**

**In src/styles/ui/**, declare `const *Variants = { … } satisfies Record<TokenKey,string>` and pass into cva. No inline variant objects.

**Tailwind strings appear only in cva base or \*Variants consts.**

**Kit props are typed from theme.ts; features import kit only.**

## When you need a new primitive or pattern

1. **Define tokens in Tailwind preset** if missing.

2. **Add a CVA factory in src/styles/ui.ts** (tokens only; generic variants: size|tone|intent|elevation).

3. **Create a kit wrapper in src/components/kit/...:**
   - Import the CVA factory.
   - Omit className from props.
   - Forward ref. Apply `className={factory({...})}`.

4. **Export from src/components/index.ts** (barrel).

## Using shadcn (vendored)

1. **Use the shadcn CLI** to generate a component OR copy from docs.

2. **Place files under src/components/vendor/ui-primitives/shadcn/**.

3. **Replace repo imports** (e.g., cn) with local ./\_vendor_utils.

4. **Do not re-export vendor.** Always wrap via kit.

**No re-exports from src/components/index.ts.** Always wrap via kit.

## Using Radix (npm)

1. **Import @radix-ui/react-\*** directly in kit wrappers.

2. **Style via CVA.** No className prop.

## Feature implementation flow

1. **Start in src/features/<slice>/components/** and compose kit components.

2. **If you discover a missing primitive/variant:**
   - Add CVA in styles/ui.ts → add kit wrapper → continue composing.

3. **Promotion rule:** if two+ features need it, move the composed component into kit/ and add to barrel.

## Examples

**Terminal components** demonstrate the CVA-only pattern:

- `src/features/home/components/Terminal.tsx` (features) imports from @/components barrel
- `src/components/kit/data-display/TerminalFrame.tsx` (kit) uses CVA: `className={terminalDot({ color: "red" })}`
- `src/styles/ui.ts` defines factories: `terminalDot`, `terminalHeader`, `row`, `pad`

## Checklist before commit (many verified by `pnpm check`)

- [ ] No literal className outside styles/ui.ts.
- [ ] Feature code imports only from @/components (barrel) or @/components/kit/\*.
- [ ] Kit wrappers do not forward className.
- [ ] CVA parameters use design tokens from theme.ts types (e.g., `gap: "xs"` not `gap: "gap-2"`).
- [ ] Vendor files have no @/\* imports.
- [ ] Barrel exports updated if a new kit component was added.
- [ ] ESLint passes. Visual parity verified.
