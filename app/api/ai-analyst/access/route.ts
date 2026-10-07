import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { getAIAnalystAccess } from '@/lib/paymentAgentRequests';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
 if(!session)return NextResponse.json({active:false},{status:401});
 return NextResponse.json(await getAIAnalystAccess(session.id),{headers:{'Cache-Control':'no-store'}});
}
