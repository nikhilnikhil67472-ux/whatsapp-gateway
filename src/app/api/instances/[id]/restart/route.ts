import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { toPublicInstance } from '@/lib/instances/public-instance';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    db.updateInstance(id, {
      status: 'reconnecting',
      qr_base64: null,
      qr_updated_at: new Date().toISOString(),
    });
    const commandId = db.enqueueWorkerCommand(id, 'restart');

    return NextResponse.json({
      success: true,
      message: 'Restart requested. The background worker will reconnect this instance.',
      commandId,
      data: toPublicInstance(db.getInstance(id)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
