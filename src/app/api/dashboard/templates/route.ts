import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const templateSchema = z.object({
  instance_id: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50).default('general'),
  content: z.string().min(1).max(65_536),
  variables: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const instanceId = request.nextUrl.searchParams.get('instanceId');
  if (instanceId && !db.getInstance(instanceId, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: db.listTemplates(auth.session.organizationId, instanceId),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = templateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid template', details: parsed.error.issues }, { status: 400 });
  }
  if (
    parsed.data.instance_id
    && !db.getInstance(parsed.data.instance_id, auth.session.organizationId)
  ) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  const templateId = db.createTemplate({
    organization_id: auth.session.organizationId,
    ...parsed.data,
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: parsed.data.instance_id,
    action: 'template.created',
    target_type: 'message_template',
    target_id: templateId,
    metadata: { name: parsed.data.name },
  });
  return NextResponse.json({ success: true, id: templateId }, { status: 201 });
}
