import path from "node:path";
import { defineConfig } from "vitest/config";

// The restore rehearsal's own config, separate from the unit suite and
// from both model-calling configs ON PURPOSE:
//
//   * `npm test` must never start a Docker container — the unit suite is
//     2.3 seconds and that is why anyone runs it;
//   * `npm run eval` and `npm run harness` spend money on model calls and
//     must never be triggered by a backup rehearsal, which spends none.
//
// This config drives real `docker` and real `pg_dump`/`pg_restore`
// against a throwaway Postgres 17. Nothing it touches is production.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The backup runner imports "server-only"; same stub the eval and
      // harness rigs have used since the router slice.
      "server-only": path.resolve(__dirname, "evals/server-only-stub.ts"),
    },
  },
  test: {
    include: ["evals/backup-rehearsal/*.harness.ts"],
    environment: "node",
    fileParallelism: false,
    maxConcurrency: 1,
    // Container pull on a cold machine, then a full backup and restore.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // The phases are a sequence — a restore cannot be verified before a
    // backup exists, so the steps must not be reordered or parallelised.
    sequence: { shuffle: false, concurrent: false },
  },
});
