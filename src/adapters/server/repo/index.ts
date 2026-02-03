// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/repo`
 * Purpose: Barrel exports for the ripgrep-based repository access adapter.
 * Scope: Re-exports RipgrepAdapter and related types. Does not contain logic.
 * Invariants: All public adapter types exported via named exports.
 * Side-effects: none
 * Links: src/adapters/server/index.ts (re-exported from main server barrel)
 * @internal
 */

export {
  RepoPathError,
  RipgrepAdapter,
  type RipgrepAdapterConfig,
} from "./ripgrep.adapter";
