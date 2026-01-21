// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema/__arch_probes__/fail_refs_imports_slice`
 * Purpose: Arch probe that intentionally violates no-refs-to-slices rule.
 * Scope: Test-only fixture. Does not run in production.
 * Invariants: Must trigger depcruise violation when scanned.
 * Side-effects: none
 * Links: .dependency-cruiser.cjs, tests/arch/packages-layer-boundaries.spec.ts
 * @internal
 */

// Simulates refs.ts importing from a domain slice (forbidden)
// @ts-expect-error - intentional violation for arch testing
import { schedules } from "../src/scheduling";

export const probe = schedules;
