import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE, getDerivRefreshToken, saveDerivRefreshToken } from '@/lib/platform-auth';
import { getAuthenticatedDerivNickname } from '@/lib/derivNickname';
import { createAIAnalystRequest, createAIAnalystBinanceRequest } from '@/lib/paymentAgentRequests';
export const dynamic='force-dynamic';
function escapeHtml(value:string){return value.replace(/[&<>"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[char]||char))}
export async function POST(request:NextRequest){
 const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
 if(!session)return NextResponse.json({error:'Autenticação necessária'},{status:401});
 const body=await request.json().catch(()=>({}));
 const method=String(body.paymentMethod||'').toLowerCase();
 const clientCurrency=String(body.currency||'').trim().toUpperCase();
 const isBinance=method==='binance_usdt_trc20';
 const isMzn=clientCurrency==='MZN';
 if(method!=='mpesa'&&method!=='emola'&&!isBinance)return NextResponse.json({error:'Escolha M-Pesa, e-Mola ou Binance USDT TRC20.'},{status:400});
 if(isMzn && !isBinance && String(session.country||'').trim().toUpperCase()!=='MZ')return NextResponse.json({error:'Para a sua moeda, use Binance — 3 USDT (TRC20). M-Pesa e e-Mola estão disponíveis apenas para clientes elegíveis em MZN.'},{status:403});
 if(!isMzn && !isBinance)return NextResponse.json({error:'Para moedas diferentes de MZN, o AI Analyst deve ser pago em 3 USDT pela Binance (TRC20).'},{status:400});
 if(!clientCurrency)return NextResponse.json({error:'Moeda do cliente não identificada.'},{status:400});

 const appId=process.env.DERIV_APP_ID?.trim();
 if(!appId)return NextResponse.json({error:'DERIV_APP_ID não está configurado.'},{status:500});

 const accessToken=request.cookies.get('deriv_access_token')?.value||'';
 const cookieRefreshToken=request.cookies.get('deriv_refresh_token')?.value||'';
 const storedRefreshToken=await getDerivRefreshToken(session.id);
 let derivIdentity;
 try{
  derivIdentity=await getAuthenticatedDerivNickname({
   accessToken,
   refreshToken:cookieRefreshToken||storedRefreshToken,
   appId,
  });
 }catch(error){
  const status=Number((error as {status?:number})?.status||401);
  return NextResponse.json({
   error:status===401
    ?'Conecte a sua conta Deriv antes de comprar o AI Analyst.'
    :'Não foi possível identificar o nickname da sua conta Deriv.',
   code:'DERIV_NICKNAME_REQUIRED',
  },{status:status===401?401:502});
 }
 const nickname=derivIdentity.nickname;
 if(isBinance){
  const cryptoRow=await createAIAnalystBinanceRequest({userId:session.id,clientName:session.name,clientEmail:session.email,clientNickname:nickname});
  const response=NextResponse.json({requestId:cryptoRow.id,status:cryptoRow.status,amountUsdt:3,asset:'USDT',network:'TRC20',address:'TYhiKauxruZ7Lux47nsgtq8R4j5jczRQeu',derivNickname:nickname},{headers:{'Cache-Control':'no-store'}});
  if(derivIdentity.refreshed){
   response.cookies.set('deriv_access_token',derivIdentity.accessToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:3600});
   if(derivIdentity.refreshToken){
    response.cookies.set('deriv_refresh_token',derivIdentity.refreshToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30});
    await saveDerivRefreshToken(session.id,derivIdentity.refreshToken);
   }
  }
  return response;
 }
 const payerName=String(body.payerName||'').trim();
 const payerNumber=String(body.payerNumber||'').replace(/\D/g,'');
 if(!isMzn)return NextResponse.json({error:'Pagamento AI Analyst indisponível neste método.'},{status:400});
 if(payerName.length<2)return NextResponse.json({error:'Informe o seu nome.'},{status:400});
 if(!/^\d{9,15}$/.test(payerNumber))return NextResponse.json({error:'Informe o número usado para fazer o pagamento.'},{status:400});
 const row=await createAIAnalystRequest({userId:session.id,clientName:session.name,clientEmail:session.email,clientNickname:nickname,paymentMethod:method,payerName,payerNumber});
 const response=NextResponse.json({requestId:row.id,status:row.status,amountUsd:3,localAmountMzn:250,paymentMethod:row.payment_method,paymentNumber:row.payment_number,paymentName:row.payment_name,derivNickname:nickname},{headers:{'Cache-Control':'no-store'}});
 if(derivIdentity.refreshed){
  response.cookies.set('deriv_access_token',derivIdentity.accessToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:3600});
  if(derivIdentity.refreshToken){
   response.cookies.set('deriv_refresh_token',derivIdentity.refreshToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30});
   await saveDerivRefreshToken(session.id,derivIdentity.refreshToken);
  }
 }
 return response;
}
