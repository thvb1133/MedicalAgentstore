import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The signal chain is deliberately free of React and browser APIs, so it runs
 * in a plain Node environment with no DOM shim and no transform beyond
 * TypeScript. Tests feed it synthetic traces with known ground truth.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
