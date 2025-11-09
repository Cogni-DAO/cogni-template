// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/inputs/ModeToggle`
 * Purpose: Theme toggle button component using CVA styling with next-themes integration for dark/light mode switching.
 * Scope: Provides ModeToggle component with theme state management. Does not handle theme persistence (next-themes handles this).
 * Invariants: Uses next-themes hook; blocks className prop; forwards ref; renders appropriate icon for current theme.
 * Side-effects: theme state changes via setTheme, localStorage updates via next-themes
 * Notes: Uses CVA factory from `@/styles/ui` - no literal classes allowed; cycles through light→dark→system→light.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, next-themes documentation
 * @public
 */

"use client";

import type { VariantProps } from "class-variance-authority";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps, ReactNode } from "react";
import { forwardRef, useEffect, useState } from "react";

import { modeToggle, themeIcon } from "@/styles/ui";

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

    const cycleTheme = (): void => {
      if (theme === "light") {
        setTheme("dark");
      } else if (theme === "dark") {
        setTheme("system");
      } else {
        setTheme("light");
      }
    };

    const getIcon = (): ReactNode => {
      if (!mounted) {
        // Fallback during SSR/hydration
        return <Sun className={themeIcon({ state: "visible" })} />;
      }
      
      switch (theme) {
        case "light":
          return <Sun className={themeIcon({ state: "visible" })} />;
        case "dark":
          return <Moon className={themeIcon({ state: "visible" })} />;
        case "system":
          return <Monitor className={themeIcon({ state: "visible" })} />;
        default:
          return <Sun className={themeIcon({ state: "visible" })} />;
      }
    };

    const getAriaLabel = (): string => {
      if (!mounted) return "Toggle theme";
      
      switch (theme) {
        case "light":
          return "Switch to dark mode";
        case "dark":
          return "Switch to system theme";
        case "system":
          return "Switch to light mode";
        default:
          return "Toggle theme";
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={cycleTheme}
        aria-label={getAriaLabel()}
        className={modeToggle({ variant, size })}
        {...props}
      >
        {getIcon()}
      </button>
    );
  }
);

ModeToggle.displayName = "ModeToggle";