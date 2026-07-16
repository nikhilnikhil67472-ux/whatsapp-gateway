import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ success: true, data: db.listTags(auth.session.organizationId) });
}

export async function POST(request: NextRequest) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 });
  try {
    const id = db.createTag({ organization_id: auth.session.organizationId, ...parsed.data });
    return NextResponse.json({ success: true, id });
  } catch {
    return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tagId = request.nextUrl.searchParams.get('id');
  if (!tagId) return NextResponse.json({ error: 'Tag id is required' }, { status: 400 });
  const deleted = db.deleteTag(tagId, auth.session.organizationId);
  if (!deleted) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    action: 'tag.deleted',
    target_type: 'tag',
    target_id: tagId,
  });
  return NextResponse.json({ success: true });
}
