import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const instance = db.getInstance(id, auth.session.organizationId);
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  const limit = Math.max(1, Math.min(250, Number(request.nextUrl.searchParams.get('limit') || 100)));
  const after = request.nextUrl.searchParams.get('after');
  return NextResponse.json({
    success: true,
    data: db.listMessages(id, limit, after),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
