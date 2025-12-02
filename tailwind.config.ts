import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

import { measureUtilities } from "./src/styles/tailwind.preset";

const semanticColors = {
  transparent: "transparent",
  current: "currentColor",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  card: "hsl(var(--card))",
  "card-foreground": "hsl(var(--card-foreground))",
  popover: "hsl(var(--popover))",
  "popover-foreground": "hsl(var(--popover-foreground))",
  primary: "hsl(var(--primary))",
  "primary-foreground": "hsl(var(--primary-foreground))",
  secondary: "hsl(var(--secondary))",
  "secondary-foreground": "hsl(var(--secondary-foreground))",
  muted: "hsl(var(--muted))",
  "muted-foreground": "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
  "accent-foreground": "hsl(var(--accent-foreground))",
  destructive: "hsl(var(--destructive))",
  "destructive-foreground": "hsl(var(--destructive-foreground))",
  border: "hsl(var(--border))",
  input: "hsl(var(--input))",
  ring: "hsl(var(--ring))",
  danger: "hsl(var(--color-danger))",
  warning: "hsl(var(--color-warning))",
  success: "hsl(var(--color-success))",
  "syntax-property": "hsl(var(--syntax-property))",
  "syntax-operator": "hsl(var(--syntax-operator))",
  "syntax-punctuation": "hsl(var(--syntax-punctuation))",
  "syntax-delimiter": "hsl(var(--syntax-delimiter))",
  "syntax-string": "hsl(var(--syntax-string))",
  "syntax-keyword": "hsl(var(--syntax-keyword))",
  "accent-blue": "hsl(var(--accent-blue))",
};

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: semanticColors,
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
        display: "var(--font-display)",
      },
      spacing: {
        // Icon sizes (used for h-icon-lg, w-icon-lg in CVA factories)
        "icon-sm": "1rem", // 16px
        "icon-md": "1.25rem", // 20px
        "icon-lg": "1.5rem", // 24px
        "icon-xl": "2rem", // 32px
        "icon-2xl": "3rem", // 48px
        "icon-3xl": "4rem", // 64px
        "icon-4xl": "5rem", // 80px
      },
      width: {
        // Dropdown widths (used for w-dropdown-md in overlays)
        "dropdown-sm": "8rem",
        "dropdown-md": "9rem",
        "dropdown-lg": "10rem",
        "dropdown-xl": "12rem",
      },
      maxWidth: {
        // Container max-widths (used for max-w-container-lg in layout)
        "container-sm": "42rem",
        "container-md": "48rem",
        "container-lg": "56rem",
        "container-xl": "64rem",
        "container-2xl": "72rem",
        "container-3xl": "80rem",
        "container-screen": "1280px",
      },
      zIndex: {
        overlay: "50",
        modal: "100",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "300ms",
        slow: "500ms",
      },
      transitionDelay: {
        fast: "150ms",
        normal: "300ms",
        slow: "450ms",
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities(measureUtilities);
    }),
  ],
} satisfies Config;
