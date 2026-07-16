import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  bin: 'application/octet-stream',
};

function getContentType(filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathParts } = await params;
    const mediaRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'public', 'media');
    const filePath = path.resolve(mediaRoot, ...pathParts);

    if (!filePath.startsWith(mediaRoot + path.sep)) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    }

    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat?.isFile()) {
      return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
    }

    const file = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': getContentType(filePath),
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to read media file' }, { status: 500 });
  }
}
