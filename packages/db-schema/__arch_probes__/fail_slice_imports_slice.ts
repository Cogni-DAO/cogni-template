// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema/__arch_probes__/fail_slice_imports_slice`
 * Purpose: Arch probe that intentionally violates no-cross-slice-schema-imports rule.
 * Scope: Test-only fixture. Does not run in production.
 * Invariants: Must trigger depcruise violation when scanned.
 * Side-effects: none
 * Links: .dependency-cruiser.cjs, tests/arch/packages-layer-boundaries.spec.ts
 * @internal
 */

// Simulates scheduling.ts importing from auth.ts (forbidden - slices cannot import each other)
// @ts-expect-error - intentional violation for arch testing
import { users } from "../src/auth";

export const probe = users;
