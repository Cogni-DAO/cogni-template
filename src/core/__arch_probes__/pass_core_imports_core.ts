// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/__arch_probes__/pass_core_imports_core`
 * Purpose: Architecture probe demonstrating valid core→core import (should pass dependency-cruiser).
 * Scope: Tests allowed import within same layer. Does NOT test cross-layer imports.
 * Invariants: Must successfully import from @/core without violating layer boundaries.
 * Side-effects: none
 * Notes: Used by tests/arch/core-layer-boundaries.spec.ts to validate core-only-core rule.
 * Links: .dependency-cruiser.cjs (core-only-core rule), tests/arch/core-layer-boundaries.spec.ts
 * @public
 */

import { other } from "@/core/__arch_probes__/other";
export const probePass = other;
