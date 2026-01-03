// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/__arch_probes__/illegal-src-import`
 * Purpose: Arch probe to verify packages/ai-tools cannot import from src/.
 * Scope: Test fixture only; NOT production code.
 * Invariants: PACKAGES_NO_SRC_IMPORTS — uncommenting import should fail depcruise.
 * Side-effects: none
 * Links: .dependency-cruiser.cjs, PACKAGES_ARCHITECTURE.md
 * @internal
 */

// Uncommenting the following line should trigger depcruise violation:
// import { something } from "../../../src/features/ai/types";

export {};
