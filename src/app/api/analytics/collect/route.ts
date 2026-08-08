import { handleCollect } from '@/lib/analytics/collect-handler';

// Legacy beacon path. The live endpoint is /api/pulse; this alias stays so
// beacons from JS bundles cached before the move still record. Content
// blockers filter this path — that is why it moved — so it is expected to
// carry only a declining tail of traffic.
export const runtime = 'nodejs';

export const POST = handleCollect;
