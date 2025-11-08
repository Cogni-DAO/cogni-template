// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Purpose: Public surface for components module via re-exports of shared UI components.
 * Scope: Re-exports components only. Does not export internal utilities or development helpers.
 * Invariants: Only re-exports from component files; no circular dependencies; maintains type exports.
 * Side-effects: none
 * Notes: Changes here affect components public API contract; follows barrel export pattern.
 * Links: ARCHITECTURE.md#public-surface
 * @public
 */

export { Reveal } from "./kit/animation/Reveal";
export { Avatar, AvatarFallback, AvatarImage } from "./kit/data-display/Avatar";
export { TerminalFrame } from "./kit/data-display/TerminalFrame";
export { Button } from "./kit/inputs/Button";
export { Container } from "./kit/layout/Container";
export { Hero } from "./kit/sections";
export { Prompt } from "./kit/typography/Prompt";
