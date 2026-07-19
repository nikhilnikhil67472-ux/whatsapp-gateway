import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const requestedDays = Number(request.nextUrl.searchParams.get('days') || 30);
  const days = Math.max(1, Math.min(365, Number.isFinite(requestedDays) ? requestedDays : 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString();
  return NextResponse.json({
    success: true,
    days,
    summary: db.getUsageSummary(auth.session.organizationId, since),
    timeline: db.getUsageTimeline(auth.session.organizationId, since),
    instances: db.getUsageByInstance(auth.session.organizationId, since),
  });
}
