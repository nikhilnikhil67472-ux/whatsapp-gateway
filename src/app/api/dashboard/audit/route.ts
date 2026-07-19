import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 200);
  const limit = Math.max(1, Math.min(1_000, Number.isFinite(requestedLimit) ? requestedLimit : 200));
  return NextResponse.json({
    success: true,
    data: db.listAuditLogs(auth.session.organizationId, limit),
  });
}
