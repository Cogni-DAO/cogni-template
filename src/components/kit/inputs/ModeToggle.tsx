// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/inputs/ModeToggle`
 * Purpose: Theme toggle dropdown component using shadcn DropdownMenu primitives with next-themes integration.
 * Scope: Provides ModeToggle dropdown with current theme display and selection options. Does not handle theme persistence (next-themes handles this).
 * Invariants: Uses next-themes hook; blocks className prop; forwards ref; shows current theme in trigger with icon + label.
 * Side-effects: global (theme state changes via setTheme; localStorage updates via next-themes)
 * Notes: Uses CVA factory from `@/styles/ui` for trigger styling; dropdown items show Light/Dark/System with active indicators.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, next-themes documentation
 * @public
 */

"use client";

import type { VariantProps } from "class-variance-authority";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import React, { forwardRef, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/vendor/ui-primitives/shadcn";
import {
  dropdownContent,
  dropdownMenuCheck,
  dropdownMenuItem,
  icon,
  modeToggle,
  themeIcon,
} from "@/styles/ui";

type ModeToggleNoClass = Omit<ComponentProps<"button">, "className">;

export interface ModeToggleProps
  extends ModeToggleNoClass,
    VariantProps<typeof modeToggle> {}

export const ModeToggle = forwardRef<HTMLButtonElement, ModeToggleProps>(
  ({ variant, size, ...props }, ref) => {
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
            className={modeToggle({ variant, size })}
            aria-label="Select theme"
            {...props}
          >
            <CurrentIcon className={themeIcon({ state: "visible" })} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={dropdownContent({ size: "md" })}
        >
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
