import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const schema = z.object({
  display_name: z.string().max(200).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  status: z.enum(['open', 'pending', 'resolved', 'blocked']).optional(),
  assigned_user_id: z.string().nullable().optional(),
  opted_out: z.boolean().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tag_ids: z.array(z.string()).max(50).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact update' }, { status: 400 });
  const { contactId } = await params;
  const current = db.getContact(contactId);
  if (!current || current.organization_id !== auth.session.organizationId) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  const { tag_ids, ...patch } = parsed.data;
  if (
    patch.assigned_user_id
    && !db.listUsers(auth.session.organizationId).some((user: any) => user.id === patch.assigned_user_id)
  ) {
    return NextResponse.json({ error: 'Assigned user is not in this organization' }, { status: 400 });
  }
  if (tag_ids) {
    const allowedTags = new Set(db.listTags(auth.session.organizationId).map((tag: any) => tag.id));
    if (tag_ids.some((tagId) => !allowedTags.has(tagId))) {
      return NextResponse.json({ error: 'One or more tags are invalid' }, { status: 400 });
    }
  }
  const contact = db.updateContact(contactId, patch);
  if (tag_ids) db.setContactTags(contactId, tag_ids);
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: current.instance_id,
    action: 'contact.updated',
    target_type: 'contact',
    target_id: contactId,
    metadata: parsed.data,
  });
  return NextResponse.json({
    success: true,
    data: db.listContacts(undefined, 500, auth.session.organizationId)
      .find((item: any) => item.id === contact.id),
  });
}
