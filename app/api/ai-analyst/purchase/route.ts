import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { createAIAnalystRequest, createAIAnalystBinanceRequest } from '@/lib/paymentAgentRequests';
import { sendAgentAlert } from '@/lib/telegram';
export const dynamic='force-dynamic';
function escapeHtml(value:string){return value.replace(/[&<>"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[char]||char))}
export async function POST(request:NextRequest){
 const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
 if(!session)return NextResponse.json({error:'Autenticação necessária'},{status:401});
 if(!isPaymentAgentCountryAllowed(session.country))return NextResponse.json({error:'O Payment Agent está disponível apenas para clientes de Moçambique e África do Sul.'},{status:403});
 const body=await request.json().catch(()=>({}));
 const method=String(body.paymentMethod||'').toLowerCase();
 const isBinance=method==='binance_usdt_trc20';
 if(method!=='mpesa'&&method!=='emola'&&!isBinance)return NextResponse.json({error:'Escolha M-Pesa, e-Mola ou Binance USDT TRC20.'},{status:400});

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
  try{await sendAgentAlert(['🟡 <b>NOVO AI ANALYST — BINANCE USDT</b>','',`Cliente: <b>${escapeHtml(cryptoRow.client_name)}</b>`,'Serviço: <b>AI Analyst</b>','Plano: <b>AI Analyst — 30 dias</b>','Valor: <b>3 USDT</b>','Rede: <b>TRON (TRC20)</b>',`Endereço: <code>TYhiKauxruZ7Lux47nsgtq8R4j5jczRQeu</code>`,'','Confirme somente depois de verificar o recebimento na Binance.'].join('\\n'),[[{text:'✅ CONFIRMAR USDT',callback_data:`pa:confirm:${cryptoRow.id}`},{text:'❌ REJEITAR',callback_data:`pa:reject:${cryptoRow.id}`}]]);}catch(error){console.error('[AI Analyst Binance] Telegram alert failed',error)}
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
 const row=await createAIAnalystRequest({userId:session.id,clientName:session.name,clientEmail:session.email,clientNickname:nickname,paymentMethod:method});
 try{
  const text=['🧠 <b>NOVO AI ANALYST — ASSINATURA MENSAL</b>','',`Cliente: <b>${escapeHtml(row.client_name)}</b>`,'Serviço: <b>AI Analyst</b>','Plano: <b>AI Analyst — 30 dias</b>','Valor: <b>250 MZN / $3 USD</b>',`Método: <b>${row.payment_method==='mpesa'?'M-Pesa':'e-Mola'}</b>`,`Número: <b>${escapeHtml(row.payment_number||'—')}</b>`,`Nome: <b>${escapeHtml(row.payment_name||'—')}</b>`,'','Confirme somente depois de receber o pagamento.'].join('\\n');
  await sendAgentAlert(text,[[{text:'✅ CONFIRMAR PAGAMENTO',callback_data:'pa:confirm:'+row.id},{text:'❌ REJEITAR',callback_data:'pa:reject:'+row.id}]]);
 }catch{}
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
