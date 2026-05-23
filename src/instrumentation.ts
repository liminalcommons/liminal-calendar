/**
 * Next.js instrumentation hook — runs once per server cold start, before
 * any request is handled.
 *
 * This top-level file MUST stay edge-safe: Next bundles it for every runtime
 * the app targets, and the Edge runtime can't resolve `tls`/`net`/`crypto`
 * (which `postgres` and our migrate logic pull in). The runtime-specific
 * work lives in `./instrumentation-node.ts`, loaded only when
 * `NEXT_RUNTIME === 'nodejs'` so webpack can prune the import from the
 * Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
