import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DEFAULT_EVENT_SETTINGS } from '@/lib/whatsapp-engine/event-settings';
import { db } from '@/lib/db/sqlite';
import { generateApiKey, hashApiKey } from '@/lib/security/api-key';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  clientId: z.string().optional(),
  instanceName: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
  rejectCall: z.boolean().default(true),
  groupsIgnore: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
    }

    const { clientId, instanceName, rejectCall, groupsIgnore } = parsed.data;
    if (db.getInstanceByIdentifier(instanceName)) {
      return NextResponse.json({ error: 'An instance with this name already exists' }, { status: 409 });
    }

    const apiKey = generateApiKey();

    const instanceId = db.createInstance({
      client_id: clientId || null,
      instance_name: instanceName,
      provider: 'local_baileys',
      status: 'created',
      api_key_hash: hashApiKey(apiKey),
      api_key_prefix: apiKey.slice(0, 10),
      reject_calls: rejectCall,
      allow_groups: !groupsIgnore,
      ignore_groups: groupsIgnore,
      event_settings: {
        ...DEFAULT_EVENT_SETTINGS,
        groups: {
          ...DEFAULT_EVENT_SETTINGS.groups,
          ignore_group_messages: groupsIgnore,
          send_group_messages_to_ai: !groupsIgnore,
        },
        calls: {
          ...DEFAULT_EVENT_SETTINGS.calls,
          auto_reject_calls: rejectCall,
        },
      },
    });

    // The background worker owns Baileys sockets in production. It polls SQLite
    // and starts newly created instances without creating a duplicate web-process socket.

    return NextResponse.json({
      success: true,
      data: {
        id: instanceId,
        instanceName: instanceName,
        status: 'created',
        apiKey,
        apiKeyNote: 'Store this key now. For security, the full value is not shown again.',
      }
    });

  } catch (error: any) {
    console.error('Create instance error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
