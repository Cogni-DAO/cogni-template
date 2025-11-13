# Comprehensive Hexagonal Boundary Import Rules

Based on ESLint configuration, ARCHITECTURE.md, and existing test fixtures, here are our **complete hexagonal boundary import rules** with explicit allowed/denied examples:

## **Test Coverage Checklist**

### **1. Core Layer** (`src/core/**`)

**Rule:** Core is pure domain - standalone only

- [ ] **✅ ALLOWED:** `import { UserRole } from "@/core/user/model";`
- [x] **❌ DENIED:** `import { Terminal } from "@/features/home/components/Terminal";` // boundaries/element-types → tests/lint/eslint/boundaries.spec.ts:30-40
- [ ] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { DbClient } from "@/adapters/server/db";` // boundaries/element-types

### **2. Ports Layer** (`src/ports/**`)

**Rule:** Ports define interfaces using core types only

- [x] **✅ ALLOWED:** `import { AuthSession } from "@/core/auth/session";` → tests/lint/eslint/boundaries.spec.ts:44-50
- [ ] **✅ ALLOWED:** `import type { User } from "@/core";`
- [ ] **❌ DENIED:** `import { DbClient } from "@/adapters/server/db";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { authAction } from "@/features/auth/actions";` // boundaries/element-types

### **3. Features Layer** (`src/features/**`)

**Rule:** Features use canonical surfaces only, type-only ports, no adapters/bootstrap

- [ ] **✅ ALLOWED:** `import { Message } from "@/core";`
- [ ] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";`
- [x] **✅ ALLOWED:** `import { Button } from "@/components";` → tests/lint/eslint/imports.spec.ts:20-26
- [ ] **✅ ALLOWED:** `import { Container } from "@/components/kit/layout/Container";`
- [ ] **✅ ALLOWED:** `import { someUtil } from "@/shared";`
- [ ] **❌ DENIED:** `import { Message } from "@/core/chat/model";` // no-restricted-imports (@/core/\*\* blocked)
- [ ] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // import/no-internal-modules
- [ ] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai";` // no-restricted-imports (@/adapters/\*\* blocked)
- [ ] **❌ DENIED:** `import { resolveAiDeps } from "@/bootstrap/container";` // no-restricted-imports (@/bootstrap/\*\* blocked)
- [ ] **❌ DENIED:** `import { Terminal } from "@/features/home/components/Terminal";` // no-restricted-imports (cross-feature)
- [x] **❌ DENIED:** `import { button } from "@/styles/ui";` // no-restricted-imports (@/styles/\*\* blocked) → tests/lint/eslint/imports.spec.ts:28-42

### **4. Bootstrap Layer** (`src/bootstrap/**`)

**Rule:** DI composition - connects adapters to ports

- [ ] **✅ ALLOWED:** `import { LiteLlmAdapter, SystemClock } from "@/adapters/server";`
- [ ] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";`
- [ ] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types

### **5. App Layer** (`src/app/**`)

**Rule:** HTTP delivery - features services/components allowed, no direct core/adapters

- [x] **✅ ALLOWED:** `import { execute } from "@/features/ai/services/complete";` → tests/lint/eslint/boundaries.spec.ts:67-74
- [ ] **✅ ALLOWED:** `import { Terminal } from "@/features/home/components/Terminal";` // **FIXED: components now allowed**
- [ ] **✅ ALLOWED:** `import { resolveAiDeps } from "@/bootstrap/container";`
- [ ] **✅ ALLOWED:** `import { aiCompleteOperation } from "@/contracts/ai.complete.v1.contract";`
- [ ] **✅ ALLOWED:** `import { Button } from "@/components";`
- [ ] **✅ ALLOWED:** `import { someUtil } from "@/shared";`
- [ ] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types (app can't import core directly)
- [ ] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai";` // no-restricted-imports (@/adapters/\*\* blocked)
- [ ] **❌ DENIED:** `import { authHelpers } from "@/features/auth/utils";` // boundaries/entry-point (not services/ or components/)
- [ ] **❌ DENIED:** `import { AUTH_CONSTANTS } from "@/features/auth/constants";` // boundaries/entry-point (not services/ or components/)

### **6. Adapters Layer** (`src/adapters/**`)

**Rule:** Infrastructure only - implements ports using core types

- [ ] **✅ ALLOWED:** `import type { LlmService } from "@/ports";`
- [ ] **✅ ALLOWED:** `import type { Message } from "@/core";`
- [ ] **✅ ALLOWED:** `import { someUtil } from "@/shared";`
- [ ] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { NextRequest } from "next/server";` // boundaries/element-types (app concerns)

### **7. Contracts Layer** (`src/contracts/**`)

**Rule:** Edge schemas only - shared utilities for validation

- [ ] **✅ ALLOWED:** `import { someSchema } from "@/shared/schemas";`
- [ ] **❌ DENIED:** `import { Message } from "@/core";` // boundaries/element-types
- [ ] **❌ DENIED:** `import { execute } from "@/features/ai/services/complete";` // boundaries/element-types

### **8. Entry Point Enforcement**

**Rule:** Only canonical entry files can be imported

- [ ] **✅ ALLOWED:** `import type { LlmService } from "@/ports";` // → src/ports/index.ts
- [ ] **✅ ALLOWED:** `import { Message } from "@/core";` // → src/core/public.ts
- [ ] **✅ ALLOWED:** `import { LiteLlmAdapter } from "@/adapters/server";` // → src/adapters/server/index.ts
- [ ] **✅ ALLOWED:** `import { execute } from "@/features/ai/services/complete";` // services/\* allowed
- [ ] **✅ ALLOWED:** `import { Terminal } from "@/features/home/components/Terminal";` // components/\* allowed
- [ ] **❌ DENIED:** `import { LlmService } from "@/ports/llm.port";` // boundaries/entry-point
- [ ] **❌ DENIED:** `import { Message } from "@/core/chat/model";` // boundaries/entry-point
- [ ] **❌ DENIED:** `import { LiteLlmAdapter } from "@/adapters/server/ai/litellm.adapter";` // boundaries/entry-point
- [ ] **❌ DENIED:** `import { toCoreMessages } from "@/features/ai/mappers";` // boundaries/entry-point (not services/ or components/)

### **9. Type-Only Port Imports**

**Rule:** Features must use `import type` from ports to prevent runtime coupling

- [ ] **✅ ALLOWED:** `import type { LlmService, Clock } from "@/ports";`
- [ ] **❌ DENIED:** `import { LlmService, Clock } from "@/ports";` // @typescript-eslint/consistent-type-imports

### **10. Cross-Layer Type Boundaries**

**Rule:** Ports must not re-export core types

- [ ] **✅ ALLOWED:** `export type { LlmService } from './llm.port';` // ports/index.ts
- [ ] **❌ DENIED:** `export type { Message } from './llm.port';` // ports should not re-export core types

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
