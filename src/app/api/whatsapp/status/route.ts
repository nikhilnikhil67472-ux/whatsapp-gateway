import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authorizeGatewayRequest } from '@/lib/security/api-key';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  instanceId: z.string().min(1).max(128),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    instanceId: request.nextUrl.searchParams.get('instanceId'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide a valid instanceId query parameter' },
      { status: 400 },
    );
  }

  const instance = db.getInstanceByIdentifier(parsed.data.instanceId);
  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const authorization = authorizeGatewayRequest(request, instance, 'instances:read');
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  const rateLimit = await checkRateLimit({
    key: authorization.rateLimitKey || `instance-status:${instance.id}`,
    limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120),
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: instance.id,
        instanceName: instance.instance_name,
        status: instance.status,
        connected: instance.status === 'connected',
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
