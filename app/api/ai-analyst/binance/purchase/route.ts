import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { createAIAnalystBinanceRequest } from '@/lib/paymentAgentRequests';
import { derivPaymentRequest } from '@/lib/paymentAgent';
import { sendAgentAlert } from '@/lib/telegram';
export const dynamic = 'force-dynamic';
const ADDRESS = 'TYhiKauxruZ7Lux47nsgtq8R4j5jczRQeu';
function escapeHtml(value:string){return value.replace(/[&<>\"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[char]||char))}
export async function POST(request: NextRequest) {
 const session=await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
 if(!session)return NextResponse.json({error:'Autenticação necessária'},{status:401});
 let nickname='';
 try{const token=request.cookies.get('deriv_access_token')?.value||'';if(token){const result=await derivPaymentRequest(token,'/account/v1/nickname','GET',undefined,false);nickname=String(result?.data?.nickname||result?.nickname||'').trim();}}catch{}
 if(!nickname)return NextResponse.json({error:'Não foi possível obter o nickname da conta Deriv.'},{status:400});
 const row=await createAIAnalystBinanceRequest({userId:session.id,clientName:session.name,clientEmail:session.email,clientNickname:nickname});
 try{await sendAgentAlert([
  '🟡 <b>NOVO AI ANALYST — BINANCE USDT</b>','',
  `Cliente: <b>${escapeHtml(row.client_name)}</b>`,
  `Conta Deriv: <b>${escapeHtml(row.client_nickname)}</b>`,
  'Plano: <b>AI Analyst — 30 dias</b>','Valor: <b>3 USDT</b>','Rede: <b>TRON (TRC20)</b>',
  `Endereço: <code>${ADDRESS}</code>`,'',
  'O cliente será liberado somente após confirmação manual do recebimento do USDT.'
 ].join('\\n'),[[{text:'✅ CONFIRMAR USDT',callback_data:`pa:confirm:${row.id}`},{text:'❌ REJEITAR',callback_data:`pa:reject:${row.id}`}]]);}catch(error){console.error('[AI Analyst Binance] Telegram alert failed',error)}
 return NextResponse.json({requestId:row.id,status:row.status,amountUsdt:3,asset:'USDT',network:'TRC20',address:ADDRESS},{headers:{'Cache-Control':'no-store'}});
}
