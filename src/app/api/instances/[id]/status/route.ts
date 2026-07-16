import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { toPublicInstance } from '@/lib/instances/public-instance';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const instance = db.getInstance(id, auth.session.organizationId);

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: instance.status,
      qrBase64: instance.qr_base64,
      updatedAt: instance.qr_updated_at,
      data: toPublicInstance(instance),
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
