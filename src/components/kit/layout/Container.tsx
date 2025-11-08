// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Container component wrapper with CVA sizing and spacing variants.
 * Scope: Provides typed container variants using CVA factories. Does not handle responsive logic beyond CSS.
 * Invariants: Forwards all props except className to div element; maintains ref forwarding; blocks className prop.
 * Side-effects: none
 * Notes: Uses CVA factory from @/styles/ui - no literal classes allowed.
 * Links: src/styles/ui.ts, docs/STYLEGUIDE_UI.md
 * @public
 */

import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { container } from "@/styles/ui";

type DivNoClass = Omit<React.HTMLAttributes<HTMLDivElement>, "className">;

export interface ContainerProps
  extends DivNoClass,
    VariantProps<typeof container> {}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ size, spacing, ...props }, ref) => (
    <div ref={ref} className={container({ size, spacing })} {...props} />
  )
);
Container.displayName = "Container";
