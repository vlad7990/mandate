import path from "node:path";
import { defineConfig } from "vitest/config";

// The eval harness's own config (slice 3, gate 03bafc3): only
// evals/**/*.eval.ts, sequential (real API calls — no parallel
// spend), long timeouts. `npm test` uses vitest.config.ts and never
// touches these files.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
