import type { NextConfig } from "next";

/**
 * Two builds out of one tree.
 *
 * The ordinary build is a Next server: route handlers hold the Claude, Polly
 * and S3 keys, and nothing about the app changes. The static build drops the
 * server entirely and emits files that any static host will serve, which is
 * what makes a public demonstration possible without handing a deployment
 * platform somebody's API keys.
 *
 * The whole measurement stack survives that, because none of it was ever on
 * the server: the signal processing is arithmetic in the browser and the
 * models are files. What is lost is exactly the three things that need a
 * secret, and the interface already knows how to hide them.
 */
const staticExport = process.env.NEXT_PUBLIC_STATIC_BUILD === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      basePath: basePath || undefined,
      assetPrefix: basePath || undefined,
      // Optimisation is a server feature. Without this the build fails rather
      // than quietly serving nothing.
      images: { unoptimized: true },
      // A static host maps /history to /history/index.html. Without the
      // trailing slash every route below the root 404s on GitHub Pages.
      trailingSlash: true,
    }
  : {};

export default nextConfig;
