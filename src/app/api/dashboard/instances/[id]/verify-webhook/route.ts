import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';
import { verifyWebhookSignature } from '@/lib/webhooks/signature';

const verifySchema = z.object({
  payload: z.string().max(1_000_000),
  timestamp: z.string().min(1).max(30),
  signature: z.string().min(1).max(256),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid signature test' }, { status: 400 });
  const { id } = await params;
  const instance = db.getInstance(id, auth.session.organizationId);
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  const valid = verifyWebhookSignature({
    ...parsed.data,
    secret: instance.webhook_secret,
    toleranceSeconds: 300,
  });
  return NextResponse.json({ success: true, valid });
}
