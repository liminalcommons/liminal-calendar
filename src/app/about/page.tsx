import { MarketingLanding } from '@/components/MarketingLanding';

export const dynamic = 'force-dynamic';

/**
 * /about — the landing page's canonical URL. `/` shows the same content to
 * unauthenticated non-guest visitors; this route always shows it, so signed-in
 * members and guests can still read the welcome text.
 */
export default function AboutPage() {
  return <MarketingLanding />;
}
