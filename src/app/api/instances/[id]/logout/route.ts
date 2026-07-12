import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppEngineManager } from '@/lib/whatsapp-engine/manager';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await WhatsAppEngineManager.logoutInstance(id);
    return NextResponse.json({ success: true, message: 'Logged out' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
