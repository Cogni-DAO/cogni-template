import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

import { measureUtilities } from "./src/styles/tailwind.preset";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
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
