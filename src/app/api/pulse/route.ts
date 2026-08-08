import { handleCollect } from '@/lib/analytics/collect-handler';

// Public, unauthenticated analytics beacon. Deliberately named so it doesn't
// match content-blocker filter lists — see collect-handler.ts for why.
export const runtime = 'nodejs';

export const POST = handleCollect;
