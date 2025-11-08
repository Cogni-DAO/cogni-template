// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Barrel exports for split CVA styling factories organized by component domain.
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
export { button } from "./inputs";

// Typography components
export { heading, paragraph, prompt, prose, textAccent } from "./typography";

// Overlay components
export {
  icon,
  iconButton,
  reveal,
  terminalBody,
  terminalDot,
  terminalFrame,
  terminalHeader,
} from "./overlays";

// Export variant types for external use
export type { VariantProps } from "class-variance-authority";
