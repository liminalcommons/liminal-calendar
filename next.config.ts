import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment — calendar.castalia.one
  //
  // `postgres` (postgres-js) imports `fs` for SSL config loading. Mark it
  // as a server-external package so webpack doesn't try to bundle it for
  // the client edge — Next.js loads it at runtime on the Node side only.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
