import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { searchPeople } from '@/lib/hylo-client';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get('search') || undefined;

  try {
    const token = (session as any).accessToken as string;
    const members = await searchPeople(token, search);
    return NextResponse.json(members);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/members]', errMsg);
    if (errMsg.includes('401')) {
      return NextResponse.json({ error: 'token_expired', reauth: true }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
