import path from "node:path";
import { defineConfig } from "vitest/config";

// §185 — the judgment harness's own config. Separate from
// vitest.eval.config.ts ON PURPOSE: `npm run eval` must never trigger a
// harness ingest (real candidates, real spend, a real project), and
// `npm run harness` must never re-run the router benchmarks. Same
// aliases as the eval rig — the harness drives the LIVE seams, which
// import "server-only".
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "evals/server-only-stub.ts"),
    },
  },
  test: {
    setupFiles: ["evals/setup.ts"],
    include: ["evals/judgment-harness/*.harness.ts"],
    environment: "node",
    fileParallelism: false,
    maxConcurrency: 1,
    // Ten CVs, sequential, ~3 model calls each: give the run an hour.
    testTimeout: 3_600_000,
    hookTimeout: 120_000,
  },
});
