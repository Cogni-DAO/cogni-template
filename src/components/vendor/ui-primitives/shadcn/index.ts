// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Public surface for UI components module via re-exports of shadcn/ui components.
 * Scope: Re-exports UI components only. Does not export internal utilities or development helpers.
 * Invariants: Only re-exports from component files; no circular dependencies; maintains type exports.
 * Side-effects: none
 * Notes: Changes here affect components public API contract; follows barrel export pattern.
 * Links: ARCHITECTURE.md#public-surface
 * @public
 */

export { Avatar, AvatarFallback, AvatarImage } from "./avatar";
export { Button, type ButtonProps, buttonVariants } from "./button";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
