import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stray lockfiles in parent directories make Turbopack infer the wrong
  // workspace root (breaking module resolution in dev). Pin it explicitly.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
