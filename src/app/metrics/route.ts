import { renderPrometheusMetrics } from '@/lib/observability/metrics';
import { isHackathonPublicRequest } from '@/lib/security/hackathon-public-mode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request) {
  if (isHackathonPublicRequest(request)) return true;
  const token = process.env.METRICS_TOKEN;
  if (!token) return true;
  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${token}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Metrics authentication required' }, { status: 401 });
  }
  const metrics = await renderPrometheusMetrics();
  return new Response(metrics.body, {
    headers: {
      'Content-Type': metrics.contentType,
      'Cache-Control': 'no-store',
    },
  });
}
