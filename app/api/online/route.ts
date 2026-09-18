import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONLINE_WINDOW_MS = 60_000;
const onlineUsers = new Map<string, number>();

function prune() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  for (const [id, lastSeen] of onlineUsers) {
    if (lastSeen < cutoff) onlineUsers.delete(id);
  }
}

export async function GET(request: NextRequest) {
  prune();
  return NextResponse.json({ online: onlineUsers.size });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session?.id) return NextResponse.json({ online: 0 }, { status: 401 });

  onlineUsers.set(String(session.id), Date.now());
  prune();
  return NextResponse.json({ online: onlineUsers.size });
}
