import { NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';

export async function GET() {
  const instances = db.listInstances();
  return NextResponse.json({
    status: 'ok',
    database: 'ok',
    app: 'online',
    instances: instances.length,
    connectedInstances: instances.filter((instance: any) => instance.status === 'connected').length,
    waitingQrInstances: instances.filter((instance: any) => instance.status === 'waiting_qr').length,
    checkedAt: new Date().toISOString(),
  });
}
