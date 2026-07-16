import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    db.updateInstance(id, { status: 'logout_requested', qr_base64: null });
    const commandId = db.enqueueWorkerCommand(id, 'logout');
    return NextResponse.json({
      success: true,
      message: 'Logout requested. The background worker will remove the session.',
      commandId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
