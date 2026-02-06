---
id: architecture-enforcement-gaps
type: research
title: Architecture Enforcement Status
status: draft
trust: draft
summary: Assessment of hexagonal architecture boundary enforcement coverage — what's enforced, known gaps, and next steps.
read_when: Evaluating architecture enforcement coverage or adding dependency-cruiser rules.
owner: derekg1729
created: 2025-11-27
tags: [meta, architecture]
---

# Architecture Enforcement Status

**Last Updated:** 2025-11-27

## ✅ Enforced

- **Layer Boundaries:** All hexagonal layers enforce dependency direction (57 tests passing)
- **Entry Points:**
  - `@/ports` → must use `index.ts` (blocks internal port files)
  - `@/core` → must use `public.ts` (blocks internal core files)
  - `@/adapters/server` → must use `index.ts` (blocks internal adapter files, exception: `auth.ts`)
  - `@/adapters/test` → must use `index.ts` (blocks internal test adapter files)
  - `@/features/*` → external code must use `services/` or `components/` (blocks `mappers/utils/constants/` from outside `src/features/`; cross-feature internals are a known gap below)
- **Types Layer:** Leaf layer (imports nothing); canonical source for cross-cutting domain types
- **Contracts Layer:** Directional boundaries enforced (contracts→types); imported by features/app layers; no entry point rules yet (see gaps)
- **Types Canonical:** `src/types/payments.ts` is single source of truth for payment enums (core/contracts/features import from here)
- **Config Hygiene:** Phantom layer detection tests prevent undefined layer drift

## ⚠️ Known Gaps

- **Features Cross-Privacy:** Features can import other features' `mappers/utils/constants/` internals; only non-feature layers are blocked from feature internals (needs architectural decision: strict isolation vs. shared utilities pattern)
- **Contracts Entry Points:** No entry point rules (needs decision: public-by-default vs. index.ts pattern)
- **Test Boundaries:** Tests can import anything with respect to dependency-cruiser hex rules; no graph-based test boundary enforcement yet (needs decision: strict vs. pragmatic testing)

## 📋 Next Steps

1. Decide on features cross-privacy model (block all vs. allow intra-feature)
2. Decide on contracts entry point pattern (if any)
3. Decide on test boundary policy (unit vs. integration)
