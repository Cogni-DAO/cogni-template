// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/inputs/ModeToggle`
 * Purpose: Theme toggle dropdown component using shadcn DropdownMenu primitives with next-themes integration.
 * Scope: Provides ModeToggle dropdown with current theme display and selection options. Does not handle theme persistence (next-themes handles this).
 * Invariants: Uses next-themes hook; className overrides limited to layout; forwards ref; shows current theme in trigger with icon + label.
 * Side-effects: global (theme state changes via setTheme; localStorage updates via next-themes)
 * Notes: Uses CVA factory from `@/styles/ui` for trigger styling; dropdown items show Light/Dark/System with active indicators.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, next-themes documentation
 * @public
 */

"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { VariantProps } from "class-variance-authority";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import React, { forwardRef, useEffect, useState } from "react";

import { cn } from "@/shared/util";
import {
  dropdownContent,
  dropdownMenuCheck,
  dropdownMenuItem,
  icon,
  modeToggle,
  themeIcon,
} from "@/styles/ui";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

type DropdownMenuContentProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
> &
  VariantProps<typeof dropdownContent>;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, size = "md", ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(dropdownContent({ size }), className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(dropdownMenuItem(), className)}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

type ModeToggleBaseProps = ComponentProps<"button">;

export interface ModeToggleProps
  extends Omit<ModeToggleBaseProps, "className">,
    VariantProps<typeof modeToggle> {
  /**
   * Optional className for layout/composition tweaks. Colors/typography remain CVA-driven.
   */
  className?: string;
}

export const ModeToggle = forwardRef<HTMLButtonElement, ModeToggleProps>(
  ({ variant, size, className, ...props }, ref) => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch by only rendering after mount
    useEffect(() => {
      setMounted(true);
    }, []);

    const getThemeConfig = (
      themeValue: string
    ): { icon: React.ComponentType<React.SVGProps<SVGSVGElement>> } => {
      switch (themeValue) {
        case "light":
          return { icon: Sun };
        case "dark":
          return { icon: Moon };
        case "system":
          return { icon: Monitor };
        default:
          return { icon: Monitor };
      }
    };

    const getCurrentTheme = (): {
      icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    } => {
      if (!mounted) return getThemeConfig("light");
      return getThemeConfig(theme ?? "light");
    };

    const currentTheme = getCurrentTheme();
    const CurrentIcon = currentTheme.icon;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={ref}
            type="button"
            className={cn(modeToggle({ variant, size }), className)}
            aria-label="Select theme"
            {...props}
          >
            <CurrentIcon className={themeIcon({ state: "visible" })} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" size="md">
          <DropdownMenuItem
            onClick={() => setTheme("light")}
            className={dropdownMenuItem()}
          >
            <Sun className={icon({ size: "sm" })} />
            <span>Light</span>
            {theme === "light" && (
              <Check className={dropdownMenuCheck({ size: "sm" })} />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme("dark")}
            className={dropdownMenuItem()}
          >
            <Moon className={icon({ size: "sm" })} />
            <span>Dark</span>
            {theme === "dark" && (
              <Check className={dropdownMenuCheck({ size: "sm" })} />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme("system")}
            className={dropdownMenuItem()}
          >
            <Monitor className={icon({ size: "sm" })} />
            <span>System</span>
            {theme === "system" && (
              <Check className={dropdownMenuCheck({ size: "sm" })} />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

ModeToggle.displayName = "ModeToggle";
