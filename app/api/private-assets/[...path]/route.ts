import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_ASSETS: Record<string, string> = {
  'payment-agent/mpesa.svg': 'payment-agent/mpesa.svg',
  'payment-agent/emola.svg': 'payment-agent/emola.svg',
  'signals-free.svg': 'signals-free.svg',
};

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) return new NextResponse('Not found', { status: 404 });

  const { path } = await context.params;
  const key = Array.isArray(path) ? path.join('/') : '';
  const file = PRIVATE_ASSETS[key];
  if (!file) return new NextResponse('Not found', { status: 404 });

  try {
    const body = await readFile(join(process.cwd(), 'server-assets', file));
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        Vary: 'Cookie',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
