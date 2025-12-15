// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@aragon-osx/__arch_probes__/illegal-src-import`
 * Purpose: Arch probe that intentionally violates no-packages-to-src-or-services rule.
 * Scope: Test-only fixture; does NOT run in production.
 * Invariants: Must trigger depcruise violation when scanned.
 * Side-effects: none
 * Links: .dependency-cruiser.cjs, tests/arch/packages-layer-boundaries.spec.ts
 * @internal
 */

// @ts-expect-error - intentional violation for arch testing
import { cn } from "@/shared/util/cn";

export const probe = cn;
