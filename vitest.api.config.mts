import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/api/**/*.{test,spec}.ts"],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "tests/_fakes/**",
      "tests/_fixtures/**",
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@ports": path.resolve(__dirname, "./src/ports"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@adapters": path.resolve(__dirname, "./src/adapters"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@contracts": path.resolve(__dirname, "./src/contracts"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
