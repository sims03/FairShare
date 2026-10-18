import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones on the home Wi-Fi (192.168.x.x) open the dev server.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
