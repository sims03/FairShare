import type { NextConfig } from "next";

// GitHub Pages build (set by .github/workflows/deploy-pages.yml). The site lives at
// https://sims03.github.io/FairShare/, so every URL needs the "/FairShare" prefix (the base path).
// Local `npm run dev` and a normal `npm run build` don't set it: no prefix, same as before.
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? "/FairShare" : "";

const nextConfig: NextConfig = {
  // Dev only: let phones on the home Wi-Fi (192.168.x.x) open the dev server.
  allowedDevOrigins: ["192.168.*.*"],
  // Cache Components turns on Partial Prerendering, which needs a running server: the static export
  // fails with "PPR cannot be enabled in export mode". So both are off for the Pages build
  // (partialPrefetching requires cacheComponents). Our pages are client-side, so nothing changes visibly.
  cacheComponents: !isGitHubPages,
  partialPrefetching: !isGitHubPages,
  // Lets browser code build full links (invite links, email redirects) with the same prefix.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(isGitHubPages && {
    // Static export: `next build` writes plain HTML/CSS/JS files to `out/`. GitHub Pages
    // can only serve files, it can't run a Next.js server.
    output: "export" as const,
    basePath,
    // `/FairShare/` is served from `out/index.html` (folder + index.html suits GitHub Pages).
    trailingSlash: true,
    // There's no server to resize images on the fly (we don't use next/image yet anyway).
    images: { unoptimized: true },
  }),
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
