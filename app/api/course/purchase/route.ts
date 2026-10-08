import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE, getDerivRefreshToken } from '@/lib/platform-auth';
import { getAuthenticatedDerivNickname } from '@/lib/derivNickname';
import { createCourseRequest } from '@/lib/paymentAgentRequests';

export const dynamic='force-dynamic';

export async function POST(request:NextRequest){
  const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if(!session) return NextResponse.json({error:'Autenticação necessária'},{status:401});
  const body=await request.json().catch(()=>({}));
  const method=String(body.paymentMethod||'').toLowerCase();
  const currency=String(body.currency||'').trim().toUpperCase();
  const isMzn=currency==='MZN';
  const isBinance=method==='binance_usdt_trc20';
  if(isMzn && method!=='mpesa' && method!=='emola') return NextResponse.json({error:'Clientes elegíveis em MZN devem usar M-Pesa ou e-Mola.'},{status:400});
  if(!isMzn && !isBinance) return NextResponse.json({error:'Para a sua moeda, use Binance — 15 USDT (TRC20).'},{status:400});
  if(isMzn && isBinance) return NextResponse.json({error:'Clientes elegíveis em MZN devem usar M-Pesa ou e-Mola.'},{status:400});
  const payerName=String(body.payerName||'').trim();
  const payerNumber=String(body.payerNumber||'').replace(/\D/g,'');
  if(isMzn){
    if(payerName.length<2) return NextResponse.json({error:'Informe o seu nome.'},{status:400});
    if(!/^\\d{9,15}$/.test(payerNumber)) return NextResponse.json({error:'Informe o número usado para fazer o pagamento.'},{status:400});
  }
  const appId=process.env.DERIV_APP_ID?.trim();
  if(!appId) return NextResponse.json({error:'DERIV_APP_ID não está configurado.'},{status:500});
  const accessToken=request.cookies.get('deriv_access_token')?.value||'';
  const refreshToken=request.cookies.get('deriv_refresh_token')?.value||await getDerivRefreshToken(session.id);
  let identity;
  try{ identity=await getAuthenticatedDerivNickname({accessToken,refreshToken,appId}); }
  catch(error){ const status=Number((error as any)?.status||401); return NextResponse.json({error:status===401?'Conecte a sua conta Deriv antes de comprar o curso.':'Não foi possível identificar o nickname da sua conta Deriv.'},{status:status===401?401:502}); }
  const row=await createCourseRequest({userId:session.id,clientName:session.name,clientEmail:session.email,clientNickname:identity.nickname,paymentMethod:isMzn?method as 'mpesa'|'emola':'binance_usdt_trc20',payerName,payerNumber});
  return NextResponse.json({requestId:row.id,status:row.status,derivNickname:identity.nickname,amountMzn:999,amountUsdt:15,paymentMethod:row.payment_method,paymentNumber:row.payment_number,paymentName:row.payment_name},{headers:{'Cache-Control':'no-store'}});
}
