// SPDX-License-Identifier: Polyform-Shield-1.0.0

/**
 * Purpose: Merges Tailwind CSS class names with conflict resolution via clsx and tailwind-merge.
 * Scope: Provides cn() utility for combining class names. Does not handle CSS-in-JS or style objects.
 * Invariants: Always returns valid class string; handles undefined/null gracefully.
 * Side-effects: none
 * Notes: Uses tailwind-merge to resolve Tailwind utility conflicts automatically.
 * Links: none
 * @internal
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
