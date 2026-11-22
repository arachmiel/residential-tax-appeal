import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are request-specific database lookups, so they are rendered dynamically (see `dynamic` in each page).
  poweredByHeader: false,
};

export default nextConfig;
