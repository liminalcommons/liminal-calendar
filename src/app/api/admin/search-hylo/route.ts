import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole } from '@/lib/auth-helpers';
import { searchPeople } from '@/lib/hylo-client';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (getUserRole(session) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: 'No Hylo access token' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchPeople(accessToken, q.trim(), 10);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[GET /api/admin/search-hylo]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
