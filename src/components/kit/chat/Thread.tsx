// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/chat/Thread`
 * Purpose: Kit wrapper for assistant-ui Thread component - stable API surface.
 * Scope: Re-exports vendor Thread. Does not modify behavior or styling.
 * Invariants: Simple re-export; vendor component remains quarantined
 * Side-effects: none
 * Notes: Wrapper exists for governance (app/features import from kit, not vendor directly)
 * Links: Wraps @/components/vendor/assistant-ui/thread
 * @public
 */

export {
  Thread,
  type ThreadProps,
} from "@/components/vendor/assistant-ui/thread";
