import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "e2e",
      "tests/_fakes/**",
      "tests/_fixtures/**",
      "tests/api/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "e2e/",
        ".next/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/index.ts",
      ],
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
