// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/providers/rainbowkit-theme`
 * Purpose: Theme configuration for RainbowKit to match repository design system.
 * Scope: Provides light/dark theme configurations. Does not handle theme detection or switching logic.
 * Invariants: Returns valid RainbowKit theme objects; uses exact CSS variable values from tailwind.css.
 * Side-effects: none
 * Notes: Light uses --muted, dark uses --accent. Values from src/styles/tailwind.css.
 * Links: https://www.rainbowkit.com/docs/theming
 * @public
 */

import { darkTheme, lightTheme } from "@rainbow-me/rainbowkit";

/**
 * Creates light theme for RainbowKit matching repository design tokens.
 * Uses --muted from :root for subtle button on light background.
 * Note: RainbowKit's lightTheme() base expects light mode UI patterns.
 */
export function createAppLightTheme(): ReturnType<typeof lightTheme> {
  return lightTheme({
    // Light gray button (--muted light)
    accentColor: "hsl(210 40% 96.1%)",
    // Dark text on light button (--muted-foreground light)
    accentColorForeground: "hsl(215.4 16.3% 20%)",
    borderRadius: "medium",
  });
}

/**
 * Creates dark theme for RainbowKit matching repository design tokens.
 * Uses --accent from .dark for medium-tone button on dark background.
 * Note: RainbowKit's darkTheme() base expects dark mode UI patterns.
 */
export function createAppDarkTheme(): ReturnType<typeof darkTheme> {
  return darkTheme({
    // Medium gray button (--accent dark, lighter than dark background)
    accentColor: "hsl(217.2 32.6% 17.5%)",
    // Light text on button (--accent-foreground dark)
    accentColorForeground: "hsl(210 40% 98%)",
    borderRadius: "medium",
  });
}
