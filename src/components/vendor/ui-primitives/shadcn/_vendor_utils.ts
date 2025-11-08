// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Local cn helper for vendored shadcn components to avoid repo imports.
 * Scope: Only for vendored files that need class merging. Does not export outside vendor.
 * Invariants: Combines clsx + tailwind-merge; isolated from repo utils.
 * Side-effects: none
 * Notes: Use only when vendored files originally import cn from @/lib/utils or similar.
 * @internal
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: unknown[]) {
  return twMerge(clsx(inputs));
}
