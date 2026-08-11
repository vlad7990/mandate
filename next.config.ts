import type { NextConfig } from "next";

/**
 * Legacy product URLs.
 *
 * Every authenticated route used to sit at the root — `/home`,
 * `/projects/…`, `/executive-intelligence/…` — in the same URL space as
 * the marketing pages. That is a collision waiting to happen, and it
 * happened: a marketing page for Executive Intelligence could not be
 * built because the workspace already owned the path. The whole product
 * moved behind `/app`; these keep old links working.
 *
 * ⚠️ `/executive-intelligence` (no trailing path) is deliberately NOT in
 * this list. That exact path is now the marketing page, and redirecting
 * it would send every visitor who wants to read about the product into a
 * sign-in wall. Only its sub-paths belong to the workspace, which is why
 * that one entry uses `/:path+` (one or more segments) rather than the
 * `/:path*` (zero or more) the others use.
 */
const LEGACY_PRODUCT_REDIRECTS = [
  { source: "/home", destination: "/app/home" },
  { source: "/projects/:path*", destination: "/app/projects/:path*" },
  { source: "/candidates/:path*", destination: "/app/candidates/:path*" },
  { source: "/analytics/:path*", destination: "/app/analytics/:path*" },
  { source: "/settings/:path*", destination: "/app/settings/:path*" },
  {
    source: "/executive-intelligence/:path+",
    destination: "/app/executive-intelligence/:path+",
  },
];

const nextConfig: NextConfig = {
  // Stray lockfiles in parent directories make Turbopack infer the wrong
  // workspace root (breaking module resolution in dev). Pin it explicitly.
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return LEGACY_PRODUCT_REDIRECTS.map((r) => ({ ...r, permanent: true }));
  },
};

export default nextConfig;
