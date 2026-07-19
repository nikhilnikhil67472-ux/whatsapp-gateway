import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { generateApiKey, hashApiKey } from '@/lib/security/api-key';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const apiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  user_id: z.string().nullable().optional(),
  instance_id: z.string().nullable().optional(),
  role: z.enum(['admin', 'developer', 'viewer']).default('developer'),
  scopes: z.array(z.string().trim().min(1).max(100)).max(50).default(['messages:send']),
  ip_allowlist: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  expires_at: z.string().datetime().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    success: true,
    data: db.listUserApiKeys(auth.session.organizationId),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = apiKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid API key configuration', details: parsed.error.issues }, { status: 400 });
  }
  if (
    parsed.data.user_id
    && !db.listUsers(auth.session.organizationId).some((user: any) => user.id === parsed.data.user_id)
  ) {
    return NextResponse.json({ error: 'User is not in this organization' }, { status: 400 });
  }
  if (
    parsed.data.instance_id
    && !db.getInstance(parsed.data.instance_id, auth.session.organizationId)
  ) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  const apiKey = generateApiKey();
  const apiKeyId = db.createUserApiKey({
    organization_id: auth.session.organizationId,
    ...parsed.data,
    key_hash: hashApiKey(apiKey),
    key_prefix: apiKey.slice(0, 12),
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: parsed.data.instance_id,
    action: 'api_key.created',
    target_type: 'api_key',
    target_id: apiKeyId,
    metadata: { name: parsed.data.name, scopes: parsed.data.scopes },
  });
  return NextResponse.json({
    success: true,
    id: apiKeyId,
    apiKey,
    note: 'Store this key now. The full value is not shown again.',
  }, { status: 201 });
}
