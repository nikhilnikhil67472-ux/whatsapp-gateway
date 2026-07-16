import { NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { generateApiKey, hashApiKey } from '@/lib/security/api-key';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!db.getInstance(id)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const apiKey = generateApiKey();
  db.updateInstance(id, {
    api_key_hash: hashApiKey(apiKey),
    api_key_prefix: apiKey.slice(0, 10),
  });

  return NextResponse.json({
    success: true,
    apiKey,
    note: 'The previous instance API key is now invalid.',
  });
}
