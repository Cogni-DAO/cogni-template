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
  "chart-1": "hsl(var(--chart-1))",
  "chart-2": "hsl(var(--chart-2))",
  "chart-3": "hsl(var(--chart-3))",
  "chart-4": "hsl(var(--chart-4))",
  "chart-5": "hsl(var(--chart-5))",
  "chart-6": "hsl(var(--chart-6))",
};

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    colors: semanticColors,
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
        display: "var(--font-display)",
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities(measureUtilities);
    }),
  ],
} satisfies Config;
