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

## Priority 4: Auth & Account Infrastructure (When + What to Copy)

Auth is **not** part of the current MVP core loop (LiteLLM-key–based infra). We only start pulling Auth from SaaS-Starter once the LLM infra path is stable.

### When to copy auth infra

- **Trigger point:**  
  After we have:
  - `POST /api/v1/ai/completion` and at least one LangGraph-based route working end-to-end via LiteLLM virtual keys, and
  - a minimal way to inspect usage per key (either via LiteLLM or logs).

At that moment we’ll need a human console with real accounts/teams and non-crypto billing abstractions ready for later crypto integration.

### What to copy (and adapt) from SaaS-Starter

When we do pull from the starter, we copy **patterns and modules**, not the whole app:

1. **Auth & Session Handling**
   - **Source (conceptual):** Auth/session setup (JWT cookies, middleware, session retrieval helpers).
   - **Target:** New `src/core/auth` + `src/ports/auth.port.ts` + Next middleware.
   - **Usage:**
     - Web console login only.
     - API identity remains LiteLLM-key–based until we intentionally map users → accounts → keys.

2. **User & Team Models**
   - **Source:** User, Team, Membership tables (Drizzle models).
   - **Target:** `src/core/accounts` (or similar), integrated into our existing Drizzle schema.
   - **Usage:**
     - Represent human users and organizations.
     - Attach roles (Owner/Member) and later map them to “who can see/manage which LiteLLM keys and graphs.”

3. **RBAC Pattern**
   - **Source:** Role checks (Owner/Member) in SaaS-Starter’s dashboard routes/components.
   - **Target:** A small authorization helper layer (`canManageProject`, `canViewUsage`) in `src/core/authz`.
   - **Usage:**
     - Gate access to dashboards, admin tools, and future “agent management” UIs.
     - Does **not** replace LiteLLM usage limits; it only controls UI/API permissions in our app.

4. **Billing Shell (Without Stripe as Source of Truth)**
   - **Source:** Stripe subscription + “plan” abstractions (but not the Stripe integration itself).
   - **Target:** `src/core/billing` models and services that describe “plans/tiers/limits” in a Stripe-agnostic way.
   - **Usage:**
     - Define pricing tiers and usage limits in our DB.
     - Later, wire those to **crypto payments and/or DAO rules** instead of Stripe, while still keeping the “plan → limits” pattern.

### What we explicitly do NOT copy

- Any assumption that **Stripe** is the canonical source of truth for:
  - Whether an account can make AI calls.
  - How much usage they’re allowed.
- Any tight coupling between “Stripe subscription status” and “LLM access”:
  - In our design, LiteLLM keys + our own plans/credits (eventually crypto-funded) control access, not Stripe.

### Summary for future devs

- **Now:** Identity for AI calls = LiteLLM virtual keys (`LlmCaller { accountId, apiKey }`). No user DB, no Auth.js.
- **Later:** When we need a proper web console with users/teams:
  - Copy **auth/session, user/team models, and RBAC patterns** from SaaS-Starter into our hex structure.
  - Keep Stripe-specific pieces as reference only; replace with crypto/credits integration.
- **Always:** The core infra loop (route → facade → feature → LLM port → LiteLLM) remains the center of the system. Auth and billing are adapters around it, not the core itself.
