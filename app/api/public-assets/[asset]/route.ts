import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC_ASSETS: Record<string, { file: string; contentType: string; cacheControl: string }> = {
  'icon.svg': { file: 'icon.svg', contentType: 'image/svg+xml; charset=utf-8', cacheControl: 'public, max-age=3600' },
  'manifest.webmanifest': { file: 'manifest.webmanifest', contentType: 'application/manifest+json; charset=utf-8', cacheControl: 'no-cache' },
  'sw.js': { file: 'sw.js', contentType: 'application/javascript; charset=utf-8', cacheControl: 'no-cache' },
};

type RouteContext = { params: Promise<{ asset: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  const entry = PUBLIC_ASSETS[asset];
  if (!entry) return new NextResponse('Not found', { status: 404 });

  try {
    const body = await readFile(join(process.cwd(), 'server-assets', entry.file));
    const headers: Record<string, string> = {
      'Content-Type': entry.contentType,
      'Cache-Control': entry.cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    if (asset === 'sw.js') headers['Service-Worker-Allowed'] = '/';
    return new NextResponse(body, { status: 200, headers });
  } catch {
    return new NextResponse('Asset unavailable', { status: 404 });
  }
}
