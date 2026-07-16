import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({
    success: true,
    session: auth.session,
    organization: db.getOrganization(auth.session.organizationId),
  });
}
