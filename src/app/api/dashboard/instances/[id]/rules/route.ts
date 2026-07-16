import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(10_000).default(100),
  match_type: z.enum(['exact', 'contains', 'starts_with', 'regex']).default('contains'),
  match_value: z.string().min(1).max(1_000),
  response_type: z.enum(['text', 'media', 'audio', 'location', 'contact']).default('text'),
  response_payload: z.record(z.string(), z.unknown()),
  cooldown_seconds: z.number().int().min(0).max(604_800).default(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!db.getInstance(id, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: db.listAutoReplyRules(id) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = ruleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid auto-reply rule', details: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  if (!db.getInstance(id, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  if (parsed.data.match_type === 'regex') {
    try {
      new RegExp(parsed.data.match_value, 'i');
    } catch {
      return NextResponse.json({ error: 'Regex pattern is invalid' }, { status: 400 });
    }
  }
  const ruleId = db.createAutoReplyRule({
    organization_id: auth.session.organizationId,
    instance_id: id,
    ...parsed.data,
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: id,
    action: 'auto_reply_rule.created',
    target_type: 'auto_reply_rule',
    target_id: ruleId,
    metadata: { name: parsed.data.name },
  });
  return NextResponse.json({ success: true, id: ruleId }, { status: 201 });
}
