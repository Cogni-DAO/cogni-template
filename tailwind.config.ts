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
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities(measureUtilities);
    }),
  ],
} satisfies Config;
