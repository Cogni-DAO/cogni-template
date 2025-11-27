# Comprehensive Hexagonal Boundary Import Rules

Based on ESLint configuration, ARCHITECTURE.md, and existing test fixtures, here are our **complete hexagonal boundary import rules** with explicit allowed/denied examples:

## **Test Coverage Checklist**

### **1. Core Layer** (`src/core/**`)

**Rule:** Core is pure domain - standalone only

- [x] **✅ ALLOWED:** `import { UserRole } from "@/core/user/model";` → tests/lint/eslint/boundaries.spec.ts:21-28
- [x] **❌ DENIED:** `import { Terminal } from "@/features/home/components/Terminal";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:30-40
- [x] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:42-52
- [x] **❌ DENIED:** `import { DbClient } from "@/adapters/server/db";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:54-64 ‼️⚠️‼️ **FAILING - ESLint allows core→adapters import when it should be blocked**

### **2. Ports Layer** (`src/ports/**`)

**Rule:** Ports define interfaces using core types only

- [x] **✅ ALLOWED:** `import { AuthSession } from "@/core/auth/session";` → tests/lint/eslint/boundaries.spec.ts:68-75
- [x] **✅ ALLOWED:** `import type { User } from "@/core";` → tests/lint/eslint/boundaries.spec.ts:77-84
- [x] **❌ DENIED:** `import { DbClient } from "@/adapters/server/db";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:77-87 ‼️⚠️‼️ **FAILING - ESLint allows ports→adapters import when it should be blocked**
- [x] **❌ DENIED:** `import { authAction } from "@/features/auth/actions";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:89-99 ‼️⚠️‼️ **FAILING - ESLint allows ports→features import when it should be blocked**

### **3. Features Layer** (`src/features/**`)

**Rule:** Features use canonical surfaces only, type-only ports, no adapters/bootstrap

- [x] **✅ ALLOWED:** `import { Message } from "@/core";` → tests/lint/eslint/type-imports.spec.ts:87-97 ‼️⚠️‼️ **FAILING - ESLint blocks features→core canonical import when it should be allowed**
- [x] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";` → tests/lint/eslint/type-imports.spec.ts:20-26
- [x] **✅ ALLOWED:** `import { Button } from "@/components";` → tests/lint/eslint/imports.spec.ts:20-26
- [x] **✅ ALLOWED:** `import { Container } from "@/components/kit/layout/Container";` → tests/lint/eslint/features-boundaries.spec.ts:20-26 ‼️⚠️‼️ **FAILING - ESLint blocks features→kit subpaths when it should be allowed**
- [x] **✅ ALLOWED:** `import { someUtil } from "@/shared";` → tests/lint/eslint/features-boundaries.spec.ts:28-34
- [x] **❌ DENIED:** `import { Message } from "@/core/chat/model";` // no-restricted-imports (@/core/\*\* blocked) → tests/lint/eslint/entry-points.spec.ts:74-84
- [x] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // import/no-internal-modules → tests/lint/eslint/entry-points.spec.ts:62-72
- [x] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai";` // no-restricted-imports (@/adapters/\*\* blocked) → tests/lint/eslint/features-boundaries.spec.ts:36-48
- [x] **❌ DENIED:** `import { resolveAiDeps } from "@/bootstrap/container";` // no-restricted-imports (@/bootstrap/\*\* blocked) → tests/lint/eslint/features-boundaries.spec.ts:50-62
- [x] **❌ DENIED:** `import { Terminal } from "@/features/home/components/Terminal";` // no-restricted-imports (cross-feature) → tests/lint/eslint/features-boundaries.spec.ts:64-76
- [x] **❌ DENIED:** `import { button } from "@/styles/ui";` // no-restricted-imports (@/styles/\*\* blocked) → tests/lint/eslint/imports.spec.ts:28-42

### **4. Bootstrap Layer** (`src/bootstrap/**`)

**Rule:** DI composition - connects adapters to ports

- [x] **✅ ALLOWED:** `import { LiteLlmAdapter, SystemClock } from "@/adapters/server";` → tests/lint/eslint/bootstrap.spec.ts:20-26
- [x] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";` → tests/lint/eslint/bootstrap.spec.ts:28-34
- [x] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types → tests/lint/eslint/bootstrap.spec.ts:42-52
- [x] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types → tests/lint/eslint/bootstrap.spec.ts:54-64

### **5. App Layer** (`src/app/**`)

**Rule:** HTTP delivery - features services/components allowed, no direct core/adapters

- [x] **✅ ALLOWED:** `import { execute } from "@/features/ai/services/complete";` → tests/lint/eslint/boundaries.spec.ts:103-110
- [x] **✅ ALLOWED:** `import { Terminal } from "@/features/home/components/Terminal";` // **FIXED: components now allowed** → tests/lint/eslint/boundaries.spec.ts:121-128
- [x] **✅ ALLOWED:** `import { resolveAiDeps } from "@/bootstrap/container";` → tests/lint/eslint/boundaries.spec.ts:130-137
- [x] **✅ ALLOWED:** `import { aiCompleteOperation } from "@/contracts/ai.complete.v1.contract";` → tests/lint/eslint/boundaries.spec.ts:139-146
- [x] **✅ ALLOWED:** `import { Button } from "@/components";` → tests/lint/eslint/boundaries.spec.ts:148-155
- [x] **✅ ALLOWED:** `import { someUtil } from "@/shared";` → tests/lint/eslint/features-boundaries.spec.ts:78-84
- [x] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types (app can't import core directly) → tests/lint/eslint/boundaries.spec.ts:112-122 ‼️⚠️‼️ **FAILING - ESLint allows app→core direct import when it should be blocked**
- [x] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai";` // no-restricted-imports (@/adapters/** blocked) → tests/lint/eslint/boundaries.spec.ts:124-134 ‼️⚠️‼️ **FAILING - ESLint allows app→adapters direct import when it should be blocked\*\*
- [x] **❌ DENIED:** `import { authHelpers } from "@/features/auth/utils";` // boundaries/entry-point (not services/ or components/) → tests/lint/eslint/entry-points.spec.ts:84-94 ‼️⚠️‼️ **FAILING - ESLint allows features utils imports when it should be blocked**
- [x] **❌ DENIED:** `import { AUTH_CONSTANTS } from "@/features/auth/constants";` // boundaries/entry-point (not services/ or components/) → tests/lint/eslint/entry-points.spec.ts:90-100 ‼️⚠️‼️ **FAILING - ESLint allows features constants imports when it should be blocked**

### **6. Adapters Layer** (`src/adapters/**`)

**Rule:** Infrastructure only - implements ports using core types

- [ ] **✅ ALLOWED:** `import type { LlmService } from "@/ports";`
- [ ] **✅ ALLOWED:** `import type { Message } from "@/core";`
- [ ] **✅ ALLOWED:** `import { someUtil } from "@/shared";`
- [ ] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { NextRequest } from "next/server";` // boundaries/element-types (app concerns)

### **7. Contracts Layer** (`src/contracts/**`)

**Rule:** Edge schemas only - shared utilities for validation

- [x] **✅ ALLOWED:** `import { someSchema } from "@/shared/schemas";` → tests/lint/eslint/contracts.spec.ts:20-26
- [x] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types → tests/lint/eslint/contracts.spec.ts:40-50 ‼️⚠️‼️ **FAILING - ESLint allows contracts→core import when it should be blocked**
- [x] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types → tests/lint/eslint/contracts.spec.ts:52-62 ‼️⚠️‼️ **FAILING - ESLint allows contracts→features import when it should be blocked**

### **8. Entry Point Enforcement**

**Rule:** Only canonical entry files can be imported

- [x] **✅ ALLOWED:** `import type { LlmService } from "@/ports";` // → src/ports/index.ts → tests/lint/eslint/entry-points.spec.ts:20-26
- [x] **✅ ALLOWED:** `import { Message } from "@/core";` // → src/core/public.ts → tests/lint/eslint/entry-points.spec.ts:28-34
- [x] **✅ ALLOWED:** `import { LiteLlmAdapter } from "@/adapters/server";` // → src/adapters/server/index.ts → tests/lint/eslint/entry-points.spec.ts:36-42
- [x] **✅ ALLOWED:** `import { execute } from "@/features/ai/services/complete";` // services/\* allowed → tests/lint/eslint/entry-points.spec.ts:44-50
- [x] **✅ ALLOWED:** `import { Terminal } from "@/features/home/components/Terminal";` // components/\* allowed → tests/lint/eslint/entry-points.spec.ts:52-58
- [x] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // boundaries/entry-point → tests/lint/eslint/entry-points.spec.ts:62-72
- [x] **❌ DENIED:** `import { Message } from "@/core/chat/model";` // boundaries/entry-point → tests/lint/eslint/entry-points.spec.ts:74-84
- [x] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai/litellm.adapter";` // boundaries/entry-point → tests/lint/eslint/entry-points.spec.ts:86-96
- [x] **❌ DENIED:** `import { toCoreMessages } from "@/features/ai/mappers";` // boundaries/entry-point (not services/ or components/) → tests/lint/eslint/entry-points.spec.ts:98-108 ‼️⚠️‼️ **FAILING - ESLint allows features mappers import when it should be blocked**

### **9. Type-Only Port Imports**

**Rule:** Features must use `import type` from ports to prevent runtime coupling

- [x] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";` → tests/lint/eslint/type-imports.spec.ts:20-26
- [x] **❌ DENIED:** `import { LlmService, Clock } from "@/ports";` // @typescript-eslint/consistent-type-imports → tests/lint/eslint/type-imports.spec.ts:28-38

### **10. Cross-Layer Type Boundaries**

**Rule:** Ports must not re-export core types

- [x] **✅ ALLOWED:** `export type { LlmService } from './llm.port';` // ports/index.ts → tests/lint/eslint/type-imports.spec.ts:62-68 ‼️⚠️‼️ **FAILING - ESLint blocks ports exporting interfaces when it should be allowed**
- [x] **❌ DENIED:** `export type { Message } from './llm.port';` // ports should not re-export core types → tests/lint/eslint/type-imports.spec.ts:70-78

## **Additional Test Categories Covered**

### **11. Kit Layer Purity** (`src/components/kit/**`)

**Rule:** Kit components use CVA only, no className anywhere

- [x] **❌ DENIED:** `className` prop forwarding → tests/lint/eslint/kit.spec.ts:20-26
- [x] **❌ DENIED:** Literal `className="p-4"` → tests/lint/eslint/kit.spec.ts:28-34
- [x] **✅ ALLOWED:** CVA usage `className={container({size:"lg"})}` → tests/lint/eslint/kit.spec.ts:36-42

### **12. No Raw Tailwind Rules**

**Rule:** Block raw Tailwind utilities, require design tokens

- [x] **❌ DENIED:** Raw color palettes `bg-red-500` → tests/lint/eslint/no-raw-tailwind.spec.ts (comprehensive)
- [x] **❌ DENIED:** Raw spacing `p-4`, `m-6` → tests/lint/eslint/no-raw-tailwind.spec.ts (comprehensive)
- [x] **❌ DENIED:** Raw sizing `w-4`, `h-8` → tests/lint/eslint/no-raw-tailwind.spec.ts (comprehensive)
- [x] **✅ ALLOWED:** Design tokens `bg-primary`, `text-foreground` → tests/lint/eslint/no-raw-tailwind.spec.ts:170-178
- [x] **✅ ALLOWED:** CSS custom properties `bg-[hsl(var(--color-primary))]` → tests/lint/eslint/no-raw-tailwind.spec.ts:160-168

### **13. Process.env Centralization**

**Rule:** Only src/shared/env/ can access process.env

- [x] **❌ DENIED:** `process.env.NODE_ENV` in app files → tests/lint/eslint/process-env.spec.ts:20-36
- [x] **❌ DENIED:** `process.env` in component files → tests/lint/eslint/process-env.spec.ts:38-56
- [x] **✅ ALLOWED:** `process.env` in env files → tests/lint/eslint/process-env.spec.ts:58-79

### **14. CVA-Only Styling Policy**

**Rule:** Block literal className usage, require CVA

- [x] **❌ DENIED:** Direct literal `className="flex gap-2"` → tests/lint/eslint/styling.spec.ts:20-26
- [x] **❌ DENIED:** cn() with literals → tests/lint/eslint/styling.spec.ts:28-34
- [x] **✅ ALLOWED:** CVA usage in kit → tests/lint/eslint/styling.spec.ts:36-42
- [x] **✅ ALLOWED:** Literals in styles definitions → tests/lint/eslint/styling.spec.ts:44-54

### **15. Theme Safety Rules**

**Rule:** Prevent unsafe document.documentElement manipulation

- [x] **❌ DENIED:** `document.documentElement` manipulation → tests/lint/eslint/theme.spec.ts:20-39

### **16. Vendor SDK Import Restrictions**

**Rule:** Block vendor lock-in except in adapters

- [x] **❌ DENIED:** `@sentry/nextjs`, `posthog-js`, `@clerk/nextjs` → tests/lint/eslint/vendor-sdk-imports.spec.ts (comprehensive)
- [x] **✅ ALLOWED:** Vendor SDKs in `src/infra/` → tests/lint/eslint/vendor-sdk-imports.spec.ts:147-159
- [x] **✅ ALLOWED:** Standard libraries `react`, `next/server` → tests/lint/eslint/vendor-sdk-imports.spec.ts:133-145

### **17. Vendor/Styles Layer Exemptions**

**Rule:** Vendor and styles layers exempt from styling restrictions

- [x] **✅ ALLOWED:** Literal classes in vendor components → tests/lint/eslint/vendor.spec.ts:20-26
- [x] **✅ ALLOWED:** External imports in styles layer → tests/lint/eslint/vendor.spec.ts:36-46

## **⚠️ ULTRA-SPECIFIC TEST FAILURE ANALYSIS**

### **EXACT TEST FAILURES: 17 out of 135 tests (12.6% failure rate)**

#### **1. BOUNDARIES VIOLATIONS (5 failures)**

**File: `boundaries.spec.ts`**

- ❌ **Line 60**: `blocks core importing adapters`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { DbClient } from "@/adapters/server/db"` in `src/core/auth/session.ts`

- ❌ **Line 83**: `blocks ports importing adapters`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { DbClient } from "@/adapters/server/db"` in `src/ports/auth.port.ts`

- ❌ **Line 95**: `blocks ports importing features`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { authAction } from "@/features/auth/actions"` in `src/ports/auth.port.ts`

- ❌ **Line 118**: `blocks app importing core directly`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { AuthService } from "@/core/auth/service"` in `src/app/api/auth/route.ts`

- ❌ **Line 130**: `blocks app importing adapters directly`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { LiteLlmAdapter } from "@/adapters/server/ai"` in `src/app/api/data/route.ts`

#### **2. ADAPTERS LAYER VIOLATIONS (2 failures)**

**File: `adapters.spec.ts`**

- ❌ **Line 36**: `allows adapters importing core types`
  - **Expected**: `errors = 0` (should be allowed)
  - **Actual**: `errors = 1` (unexpected boundary violation)
  - **Test Code**: `import type { Message } from "@/core"` in `src/adapters/server/ai/litellm.adapter.ts`

- ❌ **Line 77**: `blocks adapters importing app layer`
  - **Expected**: `errors > 0` with `boundaries/element-types` rule
  - **Actual**: `errors = 0` (no boundary violation detected)
  - **Test Code**: `import { NextRequest } from "next/server"` in `src/adapters/server/auth/clerk.adapter.ts`

#### **3. ENTRY POINT VIOLATIONS (3 failures)**

**File: `entry-points.spec.ts`**

- ❌ **Line 51**: `blocks non-services/components from features`
  - **Expected**: `errors > 0` with `import/no-internal-modules` or `boundaries/entry-point`
  - **Actual**: `errors = 0` (internal imports allowed)
  - **Test Code**: `import { toCoreMessages } from "@/features/ai/mappers"`

- ❌ **Line 84**: `blocks features utils/constants imports`
  - **Expected**: `errors > 0` with entry-point rule
  - **Actual**: `errors = 0` (utils imports allowed)
  - **Test Code**: `import { authHelpers } from "@/features/auth/utils"`

- ❌ **Line 53**: `blocks features constants imports`
  - **Expected**: `errors > 0` with entry-point rule
  - **Actual**: `errors = 0` (constants imports allowed)
  - **Test Code**: `import { AUTH_CONSTANTS } from "@/features/auth/constants"`

#### **4. TYPE IMPORT VIOLATIONS (3 failures)**

**File: `type-imports.spec.ts`**

- ❌ **Line 72**: `allows ports exporting their own interfaces`
  - **Expected**: `errors = 0` (should be allowed)
  - **Actual**: `errors > 0` (unexpected violation)
  - **Test Code**: `export type { LlmService } from './llm.port'` in `src/ports/index.ts`

- ❌ **Line 43**: `allows features importing core types via canonical entry`
  - **Expected**: `errors = 0` (should be allowed)
  - **Actual**: `errors > 0` (unexpected violation)
  - **Test Code**: `import { Message } from "@/core"` in `src/features/ai/services/complete.ts`

- ❌ **Line 70**: `allows mixed import with proper type annotations`
  - **Expected**: `errors = 0` (should be allowed)
  - **Actual**: `errors > 0` (unexpected violation)
  - **Test Code**: Mixed runtime/type imports in features

#### **5. CONTRACT VIOLATIONS (2 failures)**

**File: `contracts.spec.ts`**

- ❌ **Line 50**: `blocks contracts importing core domain types`
- ❌ **Line 62**: `blocks contracts importing features`

#### **6. NEW FEATURES BOUNDARIES VIOLATIONS (2 failures)**

**File: `features-boundaries.spec.ts`**

- ❌ **Line 27**: `allows features importing kit subpaths`
  - **Expected**: `errors = 0` (should be allowed)
  - **Actual**: `errors = 1` (ESLint blocks kit subpath imports)
  - **Test Code**: `import { Container } from "@/components/kit/layout/Container"` in features

**File: `imports.spec.ts`**

- ❌ **Line 58**: `blocks parent-relative imports`
  - **Expected**: `errors > 0` with `no-restricted-imports` rule
  - **Actual**: `errors = 0` (ESLint allows parent-relative imports)
  - **Test Code**: `import { utils } from "../../../shared/util"` in features

### **PREVIOUSLY SKIPPED TESTS: 5 tests (IMPLEMENTATION STATUS)**

**Original Skips:**

1. **`bootstrap.spec.ts:74`** - `blocks bootstrap importing app layer` - I manually skipped this due to initial failure ⏭️ **STILL SKIPPED**
2. **`imports.spec.ts:44`** - `blocks cross-feature imports` - Pre-existing skip ✅ **NOW IMPLEMENTED** → features-boundaries.spec.ts:64-76
3. **`imports.spec.ts:52`** - `blocks parent-relative imports` - Pre-existing skip ✅ **NOW IMPLEMENTED** → imports.spec.ts:52-62 ‼️⚠️‼️ **BUT FAILING - ESLint allows parent-relative imports when it should block them**
4. **`vendor.spec.ts:28`** - `blocks vendor forbidden repo imports` - Pre-existing skip ⏭️ **STILL SKIPPED**
5. **`kit.spec.ts:44`** - `allows internal className usage with createElement` - Pre-existing skip ⏭️ **STILL SKIPPED**

**Results: 2 out of 5 previously skipped tests now implemented**

### **ROOT CAUSE: ESLint Boundaries Configuration Mismatch**

**The `eslint/app.config.mjs` boundaries rules (lines 148-284) are NOT enforcing the architecture as specified in our test expectations.**
