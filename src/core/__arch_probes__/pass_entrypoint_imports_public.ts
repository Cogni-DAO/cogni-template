// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/__arch_probes__/pass_entrypoint_imports_public`
 * Purpose: Architecture probe demonstrating valid import from core public.ts (must pass dependency-cruiser).
 * Scope: Tests canonical entry point import. Does NOT test internal imports.
 * Invariants: Must be accepted by dependency-cruiser with no violations.
 * Side-effects: none
 * Notes: Used by tests/arch/entrypoints-boundaries.spec.ts to validate entry point enforcement.
 * Links: .dependency-cruiser.cjs (entry point rules), tests/arch/entrypoints-boundaries.spec.ts
 * @public
 */

import type { Message } from "@/core";
export type ProbePass = Message;
