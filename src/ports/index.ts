// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports`
 * Purpose: Hex entry file for port interfaces - canonical import surface.
 * Scope: Re-exports only public port interfaces with named type exports. Does not export implementations or runtime objects.
 * Invariants: Type-only exports, no runtime coupling, no export *
 * Side-effects: none
 * Notes: Enforces architectural boundaries via ESLint entry-point rules
 * Links: Used by features with type-only imports
 * @public
 */

export type { Clock } from "./clock.port";
export type { LlmService } from "./llm.port";
