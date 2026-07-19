import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const instanceId = request.nextUrl.searchParams.get('instanceId');
  if (instanceId && !db.getInstance(instanceId, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  const contacts = db.listContacts(
    instanceId || undefined,
    500,
    auth.session.organizationId,
  );
  return NextResponse.json({ success: true, data: contacts });
}
