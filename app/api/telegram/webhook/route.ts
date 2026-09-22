import { NextRequest, NextResponse } from 'next/server';
import {
  approvePayment,
  createPaymentRequest,
  getLatestAwaitingProof,
  rejectPayment,
  saveProof,
  getCourseLanguage,
  setCourseLanguage,
} from '@/lib/telegram-course';

export const dynamic = 'force-dynamic';

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const adminChatId = () => process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const price = () => process.env.COURSE_PRICE_MZN || '—';
const emola = () => process.env.EMOLA_NUMBER || '—';
const mpesa = () => process.env.MPESA_NUMBER || '—';
const binanceAmount = () => process.env.BINANCE_USDT_AMOUNT || '15';
const binanceNetwork = () => process.env.BINANCE_USDT_NETWORK || 'TRC20';
const binanceAddress = () => process.env.BINANCE_USDT_ADDRESS || '—';

async function telegram(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || `Telegram API error: ${response.status}`);
  return data.result;
}

type Lang = 'pt' | 'en' | 'es';
const texts = {
  pt: { welcome:'Bem-vindo', course:'Curso Completo', intro:'📚 O curso ensina, passo a passo, como utilizar a plataforma de uma forma avançada, compreender as ferramentas e trabalhar com gestão de risco e estratégias aprovadas.', proof:'Depois de fazer o pagamento, envie o comprovativo neste bot. A validação é feita manualmente pelo Administrador.', choose:'💳 Escolha o método de pagamento:', emola:'📱 e-Mola', mpesa:'📱 M-Pesa', binance:'🟡 Binance — USDT', selected:'Método selecionado.', amount:'Valor', lifetime:'Lifetime', number:'Número', sendProof:'Depois de fazer o pagamento, envie o comprovativo aqui.', network:'Rede', address:'Endereço', warning:'⚠️ Envie pela rede', copyNumber:'📋 Copiar número', copyAddress:'📋 Copiar endereço USDT', ref:'🔖 Referência do pedido', received:'📨 Comprovativo recebido. Aguarde a validação do pagamento.', confirmed:'✅ Pagamento confirmado!', password:'🔐 Senha de acesso ao curso:', keep:'Guarde esta senha. Ela será usada para desbloquear o curso.', rejected:'❌ O comprovativo não foi validado. Se acha que houve um engano, envie um novo comprovativo.', language:'🌐 Escolha o idioma:', portuguese:'🇵🇹 Português', english:'🇬🇧 English', spanish:'🇪🇸 Español' },
  en: { welcome:'Welcome', course:'Complete Course', intro:'📚 The course teaches, step by step, how to use the platform in an advanced way, understand its tools, and work with risk management and approved strategies.', proof:'After making the payment, send the proof in this bot. Validation is performed manually by the Administrator.', choose:'💳 Choose your payment method:', emola:'📱 e-Mola', mpesa:'📱 M-Pesa', binance:'🟡 Binance — USDT', selected:'Payment method selected.', amount:'Amount', lifetime:'Lifetime', number:'Number', sendProof:'After making the payment, send the proof here.', network:'Network', address:'Address', warning:'⚠️ Send using the network', copyNumber:'📋 Copy number', copyAddress:'📋 Copy USDT address', ref:'🔖 Order reference', received:'📨 Payment proof received. Please wait for validation.', confirmed:'✅ Payment confirmed!', password:'🔐 Course access password:', keep:'Keep this password. It will be used to unlock the course.', rejected:'❌ The payment proof was not validated. If you believe this was a mistake, send a new proof.', language:'🌐 Choose your language:', portuguese:'🇵🇹 Português', english:'🇬🇧 English', spanish:'🇪🇸 Español' },
  es: { welcome:'Bienvenido', course:'Curso Completo', intro:'📚 El curso enseña, paso a paso, cómo utilizar la plataforma de forma avanzada, comprender sus herramientas y trabajar con gestión de riesgo y estrategias aprobadas.', proof:'Después de realizar el pago, envía el comprobante en este bot. La validación la realiza manualmente el Administrador.', choose:'💳 Elige tu método de pago:', emola:'📱 e-Mola', mpesa:'📱 M-Pesa', binance:'🟡 Binance — USDT', selected:'Método de pago seleccionado.', amount:'Importe', lifetime:'Lifetime', number:'Número', sendProof:'Después de realizar el pago, envía el comprobante aquí.', network:'Red', address:'Dirección', warning:'⚠️ Envía usando la red', copyNumber:'📋 Copiar número', copyAddress:'📋 Copiar dirección USDT', ref:'🔖 Referencia del pedido', received:'📨 Comprobante recibido. Espera la validación.', confirmed:'✅ ¡Pago confirmado!', password:'🔐 Contraseña de acceso al curso:', keep:'Guarda esta contraseña. Se utilizará para desbloquear el curso.', rejected:'❌ El comprobante no fue validado. Si crees que hubo un error, envía un nuevo comprobante.', language:'🌐 Elige tu idioma:', portuguese:'🇵🇹 Português', english:'🇬🇧 English', spanish:'🇪🇸 Español' }
} as const;
function courseIntro(firstName?: string, lang: Lang = 'pt') { const t=texts[lang]; const name=String(firstName||'').trim(); return [`👋 ${t.welcome}${name ? `, ${name}` : ''} — ${t.course}!`, '', t.intro, '', t.proof].join(String.fromCharCode(10)); }
async function sendLanguageMenu(chatId:number){ return telegram('sendMessage',{chat_id:chatId,text:texts.pt.language,reply_markup:{inline_keyboard:[[{text:texts.pt.portuguese,callback_data:'course_lang:pt'},{text:texts.pt.english,callback_data:'course_lang:en'},{text:texts.pt.spanish,callback_data:'course_lang:es'}]]}}); }
async function sendCourse(chatId:number,firstName?:string,lang:Lang='pt'){const t=texts[lang];return telegram('sendMessage',{chat_id:chatId,text:courseIntro(firstName,lang)+String.fromCharCode(10,10)+t.choose,reply_markup:{inline_keyboard:[[{text:t.emola,callback_data:`course_method:${lang}:emola`}],[{text:t.mpesa,callback_data:`course_method:${lang}:mpesa`}],[{text:t.binance,callback_data:`course_method:${lang}:binance`}],[{text:'🌐 Language / Idioma',callback_data:'course_language'}]]}});}

async function handleCallback(query: any) {
  const callbackId = String(query.id || '');
  const data = String(query.data || '');
  const fromId = String(query.from?.id || '');
  const message = query.message;
  const chatId = Number(message?.chat?.id);

  if (data === 'course_language') { if (Number.isFinite(chatId)) await sendLanguageMenu(chatId); await telegram('answerCallbackQuery',{callback_query_id:callbackId}); return; }
  const langMatch=data.match(/^course_lang:(pt|en|es)$/); if(langMatch){if(!Number.isFinite(chatId))return;const lang=langMatch[1] as Lang;await setCourseLanguage(chatId,lang);await telegram('answerCallbackQuery',{callback_query_id:callbackId,text:texts[lang].language});await sendCourse(chatId,message?.chat?.first_name||query.from?.first_name,lang);return;}
  const methodMatch = data.match(/^course_method:(pt|en|es):(emola|mpesa|binance)$/);
  if (methodMatch) {
    if (!Number.isFinite(chatId)) return;
    const lang=methodMatch[1] as Lang;
    const method=methodMatch[2];
    await setCourseLanguage(chatId,lang);
    const t=texts[lang];
    const details = method === 'emola'
      ? `📱 e-Mola\n\n💰 ${t.amount}: ${price()} MT (${t.lifetime})\n📱 ${t.number}: ${emola()} — MJM\n\n${t.sendProof}`
      : method === 'mpesa'
        ? `📱 M-Pesa\n\n💰 ${t.amount}: ${price()} MT (${t.lifetime})\n📱 ${t.number}: ${mpesa()} — MJM\n\n${t.sendProof}`
        : `🟡 Binance — USDT\n\n💰 ${t.amount}: ${binanceAmount()} USDT\n🌐 ${t.network}: ${binanceNetwork()}\n📍 ${t.address}: ${binanceAddress()}\n\n${t.warning} ${binanceNetwork()} exactly.`;
    const copyText = method === 'emola' ? emola() : method === 'mpesa' ? mpesa() : binanceAddress();
    const copyLabel = method === 'binance' ? texts[lang].copyAddress : texts[lang].copyNumber;
    const request = await createPaymentRequest({
      telegramUserId: Number(query.from?.id),
      chatId,
      username: query.from?.username,
      firstName: query.from?.first_name,
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: texts[lang].selected });
    await telegram('sendMessage', {
      chat_id: chatId,
      text: details + `\n\n${texts[lang].ref}: #${request.id}`,
      reply_markup: {
        inline_keyboard: [[{
          text: copyLabel,
          copy_text: { text: copyText },
        }]],
      },
    });
    return;
  }

  if (data === 'course_pay') {
    if (!Number.isFinite(chatId)) return;
    const request = await createPaymentRequest({
      telegramUserId: Number(query.from?.id),
      chatId,
      username: query.from?.username,
      firstName: query.from?.first_name,
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Envie agora o comprovativo.' });
    await telegram('sendMessage', {
      chat_id: chatId,
      text: `📸 Envie o screenshot/comprovativo do pagamento aqui.

Referência do pedido: #${request.id}`,
    });
    return;
  }

  const match = data.match(/^course_(approve|reject):(\d+)$/);
  if (!match) return;
  if (fromId !== adminChatId()) {
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Sem autorização.', show_alert: true });
    return;
  }

  const paymentId = Number(match[2]);
  if (match[1] === 'approve') {
    const approved = await approvePayment(paymentId);
    if (!approved) {
      await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento já processado.', show_alert: true });
      return;
    }
    await telegram('sendMessage', {
      chat_id: Number(approved.payment.chat_id),
      text: `✅ Pagamento confirmado!

🔐 Senha de acesso ao curso:
${approved.code}

Guarde esta senha. Ela será usada para desbloquear o curso.`,
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento aprovado.' });
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await telegram('sendMessage', { chat_id: chatId, text: `✅ Pagamento #${paymentId} aprovado e senha enviada ao cliente.` });
  } else {
    const rejected = await rejectPayment(paymentId);
    if (!rejected) {
      await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento já processado.', show_alert: true });
      return;
    }
    await telegram('sendMessage', {
      chat_id: Number(rejected.chat_id),
      text: '❌ O comprovativo não foi validado. Se acha que houve um engano, envie um novo comprovativo.',
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento recusado.' });
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && request.headers.get('x-telegram-bot-api-secret-token') !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = Number(message.chat.id);
    const text = String(message.text || '');

    if (text.startsWith('/id')) {
      await telegram('sendMessage', { chat_id: chatId, text: `🆔 O teu Telegram Chat ID é: ${chatId}` });
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/start') || text.startsWith('/curso')) {
      const code=String(message.from?.language_code||'').toLowerCase();
      const fallback:Lang=code.startsWith('es')?'es':code.startsWith('en')?'en':'pt';
      const lang=await getCourseLanguage(chatId,fallback); await setCourseLanguage(chatId,lang);
      await sendCourse(chatId,message.from?.first_name,lang);
      return NextResponse.json({ ok: true });
    }

    if (message.photo?.length) {
      // Accept the proof even if the button callback was not persisted first.
      let pending = await getLatestAwaitingProof(chatId);
      if (!pending) {
        pending = await createPaymentRequest({
          telegramUserId: Number(message.from?.id || chatId),
          chatId,
          username: message.from?.username,
          firstName: message.from?.first_name,
        });
      }

      const photo = message.photo[message.photo.length - 1];
      const saved = await saveProof(Number(pending.id), String(photo.file_id));
      if (!saved) {
        const lang=await getCourseLanguage(chatId,'pt');
        await telegram('sendMessage', { chat_id: chatId, text: lang==='en'?'This payment proof was already received. Please wait for validation.':lang==='es'?'Este comprobante ya fue recibido. Espera la validación.':'Este comprovativo já foi recebido. Aguarde a validação.' });
        return NextResponse.json({ ok: true });
      }

      const username = pending.username ? `@${pending.username}` : 'sem username';
      await telegram('sendPhoto', {
        chat_id: adminChatId(),
        photo: String(photo.file_id),
        caption: [
          '🔔 NOVO PAGAMENTO — CURSO',
          '',
          `Pedido: #${saved.id}`,
          `Cliente: ${pending.first_name || '—'}`,
          `Telegram: ${username}`,
          `Telegram ID: ${pending.telegram_user_id}`,
          `Valor esperado: ${price()} MT`,
          '',
          'Valide o pagamento e escolha uma opção:',
        ].join('\n'),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ APROVAR', callback_data: `course_approve:${saved.id}` },
            { text: '❌ RECUSAR', callback_data: `course_reject:${saved.id}` },
          ]],
        },
      });
      await telegram('sendMessage', {
        chat_id: chatId,
        text: texts[await getCourseLanguage(chatId,'pt')].received,
      });
      return NextResponse.json({ ok: true });
    }

    const lang=await getCourseLanguage(chatId,'pt'); await telegram('sendMessage',{chat_id:chatId,text:courseIntro(message.from?.first_name,lang),reply_markup:{inline_keyboard:[[{text:texts[lang].choose,callback_data:'course_language'}]]}});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Course]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
