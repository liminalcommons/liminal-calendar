import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { aggregateAllReports } from '@/lib/attendance-reports/aggregate';

export async function GET(_request: NextRequest) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (member.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const events = await aggregateAllReports(db);
    return NextResponse.json({ events });
  } catch (err) {
    console.error('[GET /api/admin/attendance-reports]', err);
    return NextResponse.json(
      { error: 'Failed to fetch attendance reports' },
      { status: 500 },
    );
  }
}
