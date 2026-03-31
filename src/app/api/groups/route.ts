import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getCurrentUser } from '@/lib/hylo-client';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: 'No Hylo access token' }, { status: 401 });
  }

  try {
    const me = await getCurrentUser(accessToken);
    const groups = (me.memberships ?? []).map((m) => ({
      id: m.group.id,
      name: m.group.name,
      slug: m.group.slug,
    }));

    return NextResponse.json(groups);
  } catch (err) {
    console.error('[GET /api/groups]', err);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}
