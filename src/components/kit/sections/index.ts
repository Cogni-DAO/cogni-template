// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Barrel exports for section layout components.
 * Scope: Re-exports section components for page composition. Does not contain component definitions.
 * Invariants: Explicit exports only (no export *); maintains clean import paths.
 * Side-effects: none
 * Notes: Section components compose layout primitives for reusable page patterns.
 * @public
 */

export { Hero } from "./Hero";
export {
  featureContent,
  featureItem,
  heroButtonContainer,
  heroTextWrapper,
  heroVisualContainer,
  smallIcon,
} from "./hero.styles";
