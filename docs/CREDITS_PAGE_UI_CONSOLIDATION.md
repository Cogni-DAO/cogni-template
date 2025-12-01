# Credits Page UI Consolidation Plan

**Date:** 2025-12-01
**Branch:** `feat/credits-ui-cleanup`
**Context:** Phase 3b - Establish Credits page as reference implementation for UI_IMPLEMENTATION_GUIDE

---

## Strategic Goal

**Credits is the core product surface** (where users pay). Make it the reference implementation that:

1. Uses only `@/components` imports (no raw `@/styles/ui` in features)
2. Demonstrates proper kit primitive usage
3. Passes 360/768/1280 mobile-first QA gate
4. Establishes patterns for future pages to follow

---

## Current State Analysis

### File: `src/app/(app)/credits/CreditsPage.client.tsx`

**Stats:**

- 232 lines
- 23 CVA factory imports from `@/styles/ui`
- 2 kit component imports from `@/components`
- 3 payment hooks from `@/features/payments/public`

**Component Imports:**

```typescript
// Kit components (GOOD)
import { Button, UsdcPaymentFlow } from "@/components";

// CVA factories (SHOULD BE KIT COMPONENTS)
import {
  amountButtons, // Grid layout for payment amounts
  badge, // Status badges
  card, // Card container
  cardContent, // Card body
  cardHeader, // Card header
  container, // Page container
  heading, // Typography
  ledgerEntry, // List item wrapper
  ledgerHeader, // List item header
  ledgerList, // List container
  ledgerMeta, // List item footer
  paragraph, // Typography
  row, // Flex row layout
  section, // Page section
  statsBox, // Metric display box
  statsGrid, // Metric grid layout
  twoColumn, // Two-column layout
} from "@/styles/ui";
```

### Visual Structure

```
┌─ Credits Page ───────────────────────────────────────┐
│                                                       │
│  ┌─ Left Column: Balance & History ────────────┐    │
│  │  [Card Elevated]                            │    │
│  │  ┌─ Header ───────────────────────────┐     │    │
│  │  │ Credits                             │     │    │
│  │  │ Pay with USDC on Ethereum Sepolia   │     │    │
│  │  │                                     │     │    │
│  │  │ [Stats Grid]                        │     │    │
│  │  │   Balance         Conversion        │     │    │
│  │  │   1,000 credits   1¢ = 10 credits   │     │    │
│  │  └─────────────────────────────────────┘     │    │
│  │  ┌─ Content ──────────────────────────┐     │    │
│  │  │ [Ledger List]                       │     │    │
│  │  │   widget_payment | ref123           │     │    │
│  │  │   +100 credits                      │     │    │
│  │  │   Balance after: 1,100 • timestamp  │     │    │
│  │  │   ──────────────────────────────    │     │    │
│  │  │   (repeat for N entries)            │     │    │
│  │  └─────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────┘    │    │
│                                                       │
│  ┌─ Right Column: Purchase Flow ────────────┐        │
│  │  [Card Default]                          │        │
│  │  ┌─ Header ─────────────────────────┐    │        │
│  │  │ Buy Credits                       │    │        │
│  │  │ Choose an amount...               │    │        │
│  │  └───────────────────────────────────┘    │        │
│  │  ┌─ Content ────────────────────────┐    │        │
│  │  │ [Amount Buttons Grid]             │    │        │
│  │  │  [ $1 ]  [ $10 ]  [ $25 ]         │    │        │
│  │  │  [ $50 ] [ $100 ]                 │    │        │
│  │  │                                   │    │        │
│  │  │ [UsdcPaymentFlow]                 │    │        │
│  │  │ Help text...                      │    │        │
│  │  └───────────────────────────────────┘    │        │
│  └──────────────────────────────────────┘        │    │
└───────────────────────────────────────────────────────┘
```

---

## Pattern Analysis

### Pattern 1: Card Layout (Repeated 2x)

**Current:** CVA factories `card()`, `cardHeader()`, `cardContent()`
**Problem:** Not using shadcn Card primitive
**Solution:** Adopt shadcn Card component

### Pattern 2: Stats Grid (Used 1x, but reusable)

**Current:** CVA `statsGrid()` + `statsBox()` with manual layout
**Problem:** Generic data display pattern without kit component
**Solution:** Create `<MetricCard />` kit component

### Pattern 3: Ledger List (Used 2x, complex structure)

**Current:** CVA `ledgerList()`, `ledgerEntry()`, `ledgerHeader()`, `ledgerMeta()`
**Problem:** Complex repeating structure without abstraction
**Solution:** Create `<LedgerEntry />` kit component or use shadcn Table

### Pattern 4: Amount Selector (Used 1x)

**Current:** CVA `amountButtons()` + manual Button mapping
**Problem:** Not using form primitive pattern
**Solution:** Use shadcn RadioGroup or ToggleGroup

### Pattern 5: Typography (Used everywhere)

**Current:** CVA `heading()`, `paragraph()`
**Problem:** Importing from styles/ui instead of kit typography components
**Solution:** Create kit typography components (or keep as-is if preferred)

---

## Consolidation Strategy

### Phase 1: Adopt shadcn Card (1 hour)

**Goal:** Replace CVA card factories with shadcn Card component

**Steps:**

1. Install shadcn Card:

   ```bash
   npx shadcn@latest add card
   ```

2. Create kit wrapper:

   ```typescript
   // src/components/kit/layout/Card.tsx
   export {
     Card,
     CardHeader,
     CardTitle,
     CardDescription,
     CardContent,
     CardFooter,
   } from "@/components/vendor/shadcn/card";
   ```

3. Update `src/components/index.ts` barrel:

   ```typescript
   export { Card, CardHeader, CardContent } from "./kit/layout/Card";
   ```

4. Refactor CreditsPage.client.tsx:

   ```diff
   - import { card, cardHeader, cardContent } from '@/styles/ui'
   + import { Card, CardHeader, CardContent } from '@/components'

   - <div className={card({ variant: "elevated" })}>
   -   <div className={cardHeader()}>
   + <Card className="shadow-lg">
   +   <CardHeader>
   ```

5. Delete CVA card factories (or keep for other pages if needed):
   - `src/styles/ui/data.ts` - Remove `card`, `cardHeader`, `cardContent`

**Validation:**

- Credits page renders identically
- No raw CVA card imports in feature layer

---

### Phase 2: Create MetricCard Kit Component (45 min)

**Goal:** Abstract stats grid pattern into reusable component

**Steps:**

1. Create new kit component:

   ```typescript
   // src/components/kit/data-display/MetricCard.tsx
   import { heading, paragraph } from '@/styles/ui/typography'

   interface MetricCardProps {
     label: string
     value: string | number
     loading?: boolean
   }

   export function MetricCard({ label, value, loading }: MetricCardProps) {
     return (
       <div className="space-y-2">
         <p className={paragraph({ size: "sm", tone: "subdued", spacing: "none" })}>
           {label}
         </p>
         <h3 className={heading({ level: "h3" })}>
           {loading ? "Loading..." : value}
         </h3>
       </div>
     )
   }
   ```

2. Create MetricsGrid layout component:

   ```typescript
   // src/components/kit/layout/MetricsGrid.tsx
   import { grid } from '@/styles/ui/layout'

   export function MetricsGrid({ children }: { children: React.ReactNode }) {
     return <div className={grid({ cols: "2", gap: "md" })}>{children}</div>
   }
   ```

3. Refactor CreditsPage.client.tsx:

   ```diff
   - import { statsGrid, statsBox, heading, paragraph } from '@/styles/ui'
   + import { MetricCard, MetricsGrid } from '@/components'

   - <div className={statsGrid()}>
   -   <div className={statsBox()}>
   -     <div className={paragraph({ size: "sm", tone: "subdued", spacing: "none" })}>
   -       Balance
   -     </div>
   -     <div className={heading({ level: "h3" })}>
   -       {summaryQuery.isLoading ? "Loading..." : `${formatCredits(...)} credits`}
   -     </div>
   -   </div>
   - </div>
   + <MetricsGrid>
   +   <MetricCard
   +     label="Balance"
   +     value={`${formatCredits(summaryQuery.data?.balanceCredits ?? 0)} credits`}
   +     loading={summaryQuery.isLoading}
   +   />
   +   <MetricCard label="Conversion" value="1¢ = 10 credits" />
   + </MetricsGrid>
   ```

**Validation:**

- Stats display renders identically
- Easier to add new metrics in future

---

### Phase 3: Refactor Ledger List (2 options)

#### Option A: Create LedgerEntry Kit Component (1.5 hours)

**Goal:** Abstract ledger entry pattern into reusable component

**Steps:**

1. Create new kit component:

   ```typescript
   // src/components/kit/data-display/LedgerEntry.tsx
   import { Badge } from '@/components'
   import { heading, paragraph, row, ledgerEntry, ledgerHeader, ledgerMeta } from '@/styles/ui'

   interface LedgerEntryProps {
     id: string
     reason: string
     reference: string | null
     amount: number
     balanceAfter: number
     timestamp: string
     formatCredits: (n: number) => string
     formatTimestamp: (t: string) => string
   }

   export function LedgerEntry({
     reason,
     reference,
     amount,
     balanceAfter,
     timestamp,
     formatCredits,
     formatTimestamp
   }: LedgerEntryProps) {
     return (
       <div className={ledgerEntry()}>
         <div className={ledgerHeader()}>
           <div className={row({ gap: "sm" })}>
             <Badge intent={reason === "widget_payment" ? "secondary" : "outline"}>
               {reason}
             </Badge>
             <span className={paragraph({ size: "sm", tone: "default", spacing: "none" })}>
               {reference ?? "No reference"}
             </span>
           </div>
           <div className={heading({ level: "h4" })}>
             {amount >= 0 ? "+" : ""}{formatCredits(amount)}
           </div>
         </div>
         <div className={ledgerMeta()}>
           <span>Balance after: {formatCredits(balanceAfter)}</span>
           <span>•</span>
           <span>{formatTimestamp(timestamp)}</span>
         </div>
       </div>
     )
   }
   ```

2. Refactor CreditsPage.client.tsx to use component

**Validation:**

- Ledger renders identically
- Less duplication in Credits page

#### Option B: Adopt shadcn Table (2 hours)

**Goal:** Use proper table primitive for tabular data

**Steps:**

1. Install shadcn Table:

   ```bash
   npx shadcn@latest add table
   ```

2. Create kit wrapper with ledger-specific styling
3. Refactor to use Table component with columns: Type, Reference, Amount, Balance, Date

**Trade-offs:**

- ✅ More semantic (ledger entries are tabular data)
- ✅ Better accessibility
- ✅ Sortable columns (future enhancement)
- ❌ More refactoring effort
- ❌ Need to rethink mobile layout (tables on mobile are hard)

**Recommendation:** **Option A** for now (keep list), defer Table to Phase 4

---

### Phase 4: Improve Amount Selector (1 hour)

**Goal:** Use form primitive instead of button grid

**Steps:**

1. Install shadcn RadioGroup:

   ```bash
   npx shadcn@latest add radio-group
   ```

2. Refactor amount selector:
   ```diff
   - <div className={amountButtons()}>
   -   {PAYMENT_AMOUNTS.map((amountCents) => (
   -     <Button
   -       key={amountCents}
   -       variant={amountCents === selectedAmount ? "default" : "outline"}
   -       onClick={() => setSelectedAmount(amountCents)}
   -     >
   -       ${(amountCents / 100).toFixed(2)} / {formatCredits(amountCents * CREDITS_PER_CENT)} credits
   -     </Button>
   -   ))}
   - </div>
   + <RadioGroup value={selectedAmount.toString()} onValueChange={(v) => setSelectedAmount(Number(v))}>
   +   {PAYMENT_AMOUNTS.map((amountCents) => (
   +     <RadioGroupItem key={amountCents} value={amountCents.toString()}>
   +       ${(amountCents / 100).toFixed(2)} / {formatCredits(amountCents * CREDITS_PER_CENT)} credits
   +     </RadioGroupItem>
   +   ))}
   + </RadioGroup>
   ```

**Validation:**

- Better accessibility (keyboard navigation, screen reader support)
- Form semantics (submittable)

**Alternative:** Keep button grid if visual design is important (buttons are more visual than radio inputs)

---

### Phase 5: Layout Primitives Audit (30 min)

**Goal:** Ensure layout-only classNames, no inline typography/colors

**Current layout imports that are CORRECT:**

```typescript
(container, section, twoColumn, row, ledgerList);
```

**Current typography imports that should stay in features:**

```typescript
(heading, paragraph, badge);
```

**Validation:**

- No raw Tailwind typography classes (`text-sm`, `text-lg`) outside kit
- No raw color classes (`bg-green-500`, `text-red-700`) outside kit
- Run `pnpm check` to validate ESLint rules

---

### Phase 6: Mobile Responsiveness (1.5 hours)

**Goal:** Pass 360/768/1280 QA gate with zero horizontal scroll

**Known Issues:**

- Two-column layout needs better mobile stacking
- Stats grid needs single-column on mobile
- Amount buttons grid needs responsive wrapping
- Ledger table needs mobile-friendly card view

**Steps:**

1. Test at 360px width:

   ```bash
   # Manual testing or automated Playwright
   ```

2. Fix two-column stacking:

   ```diff
   - <div className={twoColumn({})}>
   + <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
   ```

3. Fix stats grid responsive:

   ```typescript
   // In MetricsGrid component
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
   ```

4. Fix amount buttons wrapping:
   ```typescript
   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
   ```

**Validation:**

- No horizontal scroll at 360px, 768px, 1280px
- Content readable and tappable on mobile
- Run automated `pnpm ui:qa` gate (to be implemented)

---

## Implementation Plan: Phased Rollout

### **Sprint 1: Core Primitives** (3-4 hours)

- ✅ Phase 1: Adopt shadcn Card
- ✅ Phase 2: Create MetricCard component
- ✅ Phase 3: Create LedgerEntry component (Option A)
- ✅ Phase 5: Layout audit

**Exit Criteria:**

- Credits page imports only from `@/components`
- No CVA factory imports in CreditsPage.client.tsx
- `pnpm check` passes

---

### **Sprint 2: Polish & QA** (2-3 hours)

- ✅ Phase 6: Mobile responsiveness
- ✅ Create automated ui:qa test for Credits page
- ✅ Manual QA at 3 viewports
- ✅ Document patterns in `CREDITS_PAGE_UI_NOTES.md`

**Exit Criteria:**

- Passes 360/768/1280 QA gate
- Zero horizontal scroll
- Loading/error states work correctly

---

### **Sprint 3: Optional Enhancements** (2-3 hours, defer if needed)

- ⏳ Phase 4: RadioGroup for amount selector (better a11y)
- ⏳ Add shadcn Skeleton for loading states
- ⏳ Add shadcn Separator for visual dividers
- ⏳ Add shadcn ScrollArea for ledger history

**Exit Criteria:**

- Best-in-class accessibility
- Polished loading states
- Reference implementation complete

---

## Success Metrics

**Before Consolidation:**

- 23 CVA factory imports in CreditsPage
- 232 lines with mixed concerns
- No component reuse
- Unknown mobile behavior

**After Consolidation:**

- 0 CVA factory imports in CreditsPage
- ~180 lines (estimate)
- 3 new reusable kit components (Card, MetricCard, LedgerEntry)
- Passes 360/768/1280 QA gate

---

## Next Steps

1. **Create feature branch:**

   ```bash
   git checkout -b feat/credits-ui-cleanup
   ```

2. **Execute Sprint 1** (Core Primitives)

3. **Create PR** with before/after screenshots

4. **After merge:** Document patterns in `CREDITS_PAGE_UI_NOTES.md` for future pages

---

## Defer to Later

- Terminal renames (home/chat) - Low priority, separate tiny PR
- Delete Hero/CtaSection/FeaturesGrid - Defer until Credits is perfect
- Home/Chat polish - Credits first, then expand patterns

---

## Questions to Resolve

1. **Keep or replace amount button grid?**
   - Keep Button grid (more visual, better UX)
   - Replace with RadioGroup (better a11y, form semantics)

2. **Use Table or List for ledger?**
   - Keep List (mobile-friendly, current works)
   - Adopt Table (semantic, sortable future)

3. **How aggressive on typography components?**
   - Keep `heading()`, `paragraph()` as CVA (current)
   - Create `<Heading>`, `<Text>` kit components (more abstraction)

**Recommendation:** Answer these as you go, bias toward pragmatic wins
