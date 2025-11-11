// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@styles/ui`
 * Purpose: Barrel exports for split styling factories organized by domain.
 * Scope: Re-exports all CVA factories from domain-specific modules. Does not contain factory definitions.
 * Invariants: Explicit exports only (no export *); maintains backward compatibility; prevents circular dependencies.
 * Side-effects: none
 * Notes: Replaces monolithic ui.ts with domain-split architecture per AGENTS.md guidance.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, src/styles/AGENTS.md
 * @public
 */

// Layout components
export {
  container,
  flex,
  grid,
  header,
  pad,
  pageContainer,
  pageShell,
  row,
  section,
  twoColumn,
} from "./layout";

// Data display components
export {
  avatar,
  avatarFallback,
  avatarImage,
  badge,
  card,
  cardContent,
  cardFooter,
  cardHeader,
  iconBox,
} from "./data";

// Input components
export { button, modeToggle } from "./inputs";

// Typography components
export {
  brandText,
  heading,
  paragraph,
  prompt,
  prose,
  textAccent,
} from "./typography";

// Code components
export { codeToken, heroActionContainer, heroCodeBlock } from "./code";

// Overlay components
export {
  dropdownContent,
  dropdownMenuCheck,
  dropdownMenuItem,
  icon,
  iconButton,
  navLink,
  reveal,
  skipLink,
  terminalBody,
  terminalDot,
  terminalFrame,
  terminalHeader,
  themeIcon,
} from "./overlays";

// Export variant types for external use
export type { VariantProps } from "class-variance-authority";
