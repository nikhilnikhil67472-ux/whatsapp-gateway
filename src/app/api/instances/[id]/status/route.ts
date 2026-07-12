import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: instance.status,
      qrBase64: instance.qr_base64,
      updatedAt: instance.qr_updated_at,
      data: instance,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
