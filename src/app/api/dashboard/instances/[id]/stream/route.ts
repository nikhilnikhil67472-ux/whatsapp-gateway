import { NextRequest } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const instance = db.getInstance(id, auth.session.organizationId);
  if (!instance) return Response.json({ error: 'Instance not found' }, { status: 404 });

  const encoder = new TextEncoder();
  let cursor = request.nextUrl.searchParams.get('after') || new Date(Date.now() - 5_000).toISOString();
  let closed = false;
  let interval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const poll = () => {
        try {
          const messages = db.listMessages(id, 100, cursor);
          if (messages.length) {
            cursor = messages[messages.length - 1].created_at;
            send('messages', messages);
          } else {
            send('heartbeat', { at: new Date().toISOString() });
          }
        } catch (error) {
          send('error', {
            message: error instanceof Error ? error.message : 'Live stream failed',
          });
        }
      };
      poll();
      interval = setInterval(poll, 2_000);
      request.signal.addEventListener('abort', () => {
        closed = true;
        if (interval) clearInterval(interval);
        controller.close();
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
