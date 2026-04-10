import { NextResponse } from 'next/server';

const CASTALIA_API = process.env.CASTALIA_API_URL || 'https://castalia.one';
const BAZAAR_MAP_ID = process.env.CASTALIA_DEFAULT_MAP_ID || 'e72c6877-4812-41cd-bf20-197f98258a84';

// 5 distinct colors for talk zones
const ZONE_COLORS: Record<string, string> = {
  Terra: '#8B6914',   // earthy gold
  lobby: '#4A90D9',   // sky blue
  Aether: '#9B59B6',  // purple
  Ratio: '#27AE60',   // green
  Blot: '#E74C3C',    // red
};

const DEFAULT_COLOR = '#6B7280'; // gray fallback

export async function GET() {
  try {
    const res = await fetch(`${CASTALIA_API}/api/maps/${BAZAAR_MAP_ID}/talk-zones`, {
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json({ zones: [] }, { status: 200 });
    }

    const data = await res.json();
    const zones = (data.zones || []).map((z: { zoneId: string; name: string; participantCount?: number }) => ({
      zoneId: z.zoneId,
      name: z.name || z.zoneId,
      color: ZONE_COLORS[z.zoneId] || DEFAULT_COLOR,
      participantCount: z.participantCount || 0,
      deepLink: `${CASTALIA_API}/liminal-commons/bazaar/${z.zoneId}`,
    }));

    return NextResponse.json({ zones });
  } catch {
    return NextResponse.json({ zones: [] }, { status: 200 });
  }
}
