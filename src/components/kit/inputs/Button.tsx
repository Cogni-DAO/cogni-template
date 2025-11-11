// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/inputs/Button`
 * Purpose: Button component wrapper using CVA styling with Radix Slot composition for interactive actions.
 * Scope: Provides Button component with variant props. Does not handle form submission or navigation routing.
 * Invariants: Forwards ref; blocks className prop; accepts aria-* and data-* unchanged; always renders valid button or slot.
 * Side-effects: none
 * Notes: Uses CVA factory from \@/styles/ui - no literal classes allowed; supports asChild pattern.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md
 * @public
 */

import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { forwardRef } from "react";

import { button, icon } from "@/styles/ui";

type ButtonNoClass = Omit<ComponentProps<"button">, "className">;

export interface ButtonProps
  extends ButtonNoClass,
    VariantProps<typeof button> {
  asChild?: boolean;
  /**
   * Right icon component (Lucide icon)
   */
  rightIcon?: ReactNode;
  /**
   * Icon size variant
   */
  iconSize?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant,
      size,
      asChild = false,
      rightIcon,
      iconSize = "md",
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-slot="button"
        className={button({ variant, size })}
        ref={ref}
        {...props}
      >
        {children}
        {rightIcon && (
          <span className={icon({ size: iconSize })} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";
