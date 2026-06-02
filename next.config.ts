import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment — calendar.castalia.one
  //
  // `postgres` (postgres-js) imports `fs` for SSL config loading. Mark it
  // as a server-external package so webpack doesn't try to bundle it for
  // the client edge — Next.js loads it at runtime on the Node side only.
  serverExternalPackages: ['postgres'],
  async headers() {
    return [
      {
        // The service-worker script must NEVER be HTTP-cached. If Chrome serves
        // a stale sw.js from cache, a broken worker (e.g. an old passthrough-fetch
        // build that dropped Set-Cookie on OAuth 302s) keeps shadowing the fixed
        // one and the user is trapped on the landing page until they wipe app data.
        // no-store forces a fresh fetch on every SW update check.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Hashed bundles are immutable — a new build = a new URL. Cache them
        // hard at the edge + browser so repeat loads never re-fetch JS/CSS.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  env: {
    // Surface the deploy commit + branch to the client so bug reports can
    // pin the GitHub issue to a specific build. Vercel sets the underlying
    // VERCEL_GIT_* vars; we re-export them as NEXT_PUBLIC_* so they're
    // inlined into the client bundle at build time.
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
    NEXT_PUBLIC_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? '',
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? '',
  },
};

export default nextConfig;
