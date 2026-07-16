import { NextRequest, NextResponse } from 'next/server';
import { openApiDocument } from '@/lib/docs/openapi';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  const document = {
    ...openApiDocument,
    servers: [
      {
        ...openApiDocument.servers[0],
        url: configuredBaseUrl || request.nextUrl.origin,
      },
    ],
  };

  return NextResponse.json(document, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
