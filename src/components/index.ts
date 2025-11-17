// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components`
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
export { Badge } from "./kit/data-display/Badge";
export { GithubButton } from "./kit/data-display/GithubButton";
export { TerminalFrame } from "./kit/data-display/TerminalFrame";
export { Button } from "./kit/inputs/Button";
export { ModeToggle } from "./kit/inputs/ModeToggle";
export { Container } from "./kit/layout/Container";
export { Header } from "./kit/layout/Header";
export { NavigationLink } from "./kit/navigation/NavigationLink";
export { SkipLink } from "./kit/navigation/SkipLink";
export { Hero } from "./kit/sections";
export {
  type CodeToken,
  CodeTokenLine,
  HeroActionContainer,
  HeroCodeBlock,
} from "./kit/typography/CodeHero";
export { HeroActionWords } from "./kit/typography/HeroActionWords";
export { Prompt } from "./kit/typography/Prompt";
export { container, grid, section } from "@/styles/ui";
