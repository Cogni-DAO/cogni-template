// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema/__arch_probes__/illegal-src-import`
 * Purpose: Arch probe that intentionally violates no-db-schema-to-src rule.
 * Scope: Test-only fixture. Does not run in production.
 * Invariants: Must trigger depcruise violation when scanned.
 * Side-effects: none
 * Links: .dependency-cruiser.cjs, tests/arch/packages-layer-boundaries.spec.ts
 * @internal
 */

// @ts-expect-error - intentional violation for arch testing
import { cn } from "@/shared/util/cn";

export const probe = cn;
