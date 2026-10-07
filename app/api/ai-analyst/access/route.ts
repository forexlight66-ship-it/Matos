import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE, getDerivRefreshToken, saveDerivRefreshToken } from '@/lib/platform-auth';
import { getAIAnalystAccess } from '@/lib/paymentAgentRequests';
import { getAuthenticatedDerivNickname } from '@/lib/derivNickname';

export const dynamic='force-dynamic';
export const revalidate=0;

export async function GET(request:NextRequest){
 const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
 if(!session)return NextResponse.json({active:false},{status:401,headers:{'Cache-Control':'no-store'}});

 const appId=process.env.DERIV_APP_ID?.trim();
 if(!appId)return NextResponse.json({active:false,error:'DERIV_APP_ID não está configurado.'},{status:500,headers:{'Cache-Control':'no-store'}});

 const accessToken=request.cookies.get('deriv_access_token')?.value||'';
 const cookieRefreshToken=request.cookies.get('deriv_refresh_token')?.value||'';
 const storedRefreshToken=await getDerivRefreshToken(session.id);

 try{
  const identity=await getAuthenticatedDerivNickname({
   accessToken,
   refreshToken:cookieRefreshToken||storedRefreshToken,
   appId,
  });
  const access=await getAIAnalystAccess(session.id,identity.nickname);
  const response=NextResponse.json({
   ...access,
   derivNickname:identity.nickname,
  },{headers:{'Cache-Control':'no-store, private'}});
  if(identity.refreshed){
   response.cookies.set('deriv_access_token',identity.accessToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:3600});
   if(identity.refreshToken){
    response.cookies.set('deriv_refresh_token',identity.refreshToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30});
    await saveDerivRefreshToken(session.id,identity.refreshToken);
   }
  }
  return response;
 }catch(error){
  console.error('[AI Analyst access] Deriv nickname lookup failed:',error);
  return NextResponse.json({
   active:false,
   expiresAt:null,
   derivNickname:null,
   code:'DERIV_NICKNAME_REQUIRED',
  },{status:200,headers:{'Cache-Control':'no-store, private'}});
 }
}
