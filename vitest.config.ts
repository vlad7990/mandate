import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server modules import "server-only", a Next.js build-time guard
      // with no node entry point. Stubbing it here lets unit tests reach
      // server helpers directly; the guard itself still does its real
      // job in the Next build, which is the only place it ever ran.
      // Same stub the eval harness has used since the router slice.
      "server-only": path.resolve(__dirname, "evals/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
