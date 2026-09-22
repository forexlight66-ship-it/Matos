'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'pt' | 'es';
interface Translations { [key: string]: string; }

const translations: Record<Language, Translations> = {
  en: {
    title:'Deriv Digits Dashboard',connection:'Connection',status:'Status',connected:'Connected',disconnected:'Disconnected',authorized:'Authorized',notAuthorized:'Not Authorized',balance:'Balance',lastTick:'Last Tick',digitsTrading:'Digits Trading',symbol:'Symbol',contractType:'Contract Type',amount:'Amount (USD)',duration:'Duration',digit:'Digit (0-9)',currentPrice:'Current Price',proposalQuote:'Proposal Quote',askPrice:'Ask Price',payout:'Payout',stake:'Stake',buy:'Buy',buying:'Buying...',profitTable:'Profit Table',contractId:'Contract ID',type:'Type',buyPrice:'Buy Price',sellPrice:'Sell Price',profitLoss:'Profit/Loss',purchaseTime:'Purchase Time',total:'Total',closedOperations:'Closed operations',transactions:'transactions',page:'Page',previous:'Previous',next:'Next',noTransactions:'No transactions found.',loading:'Loading...',error:'Error',tokenMissing:'No API token found.',over:'Over',under:'Under',match:'Match',differs:'Differs',even:'Even',odd:'Odd',volatility:'Volatility',open:'Open',waitingTick:'Waiting for tick...',waitingBalance:'Loading...',unauthorizedWarning:'⚠️ Not authorized. Please check your account.',loginSubtitle:'Sign in with your Deriv account to start trading.',loginWithDeriv:'Login with Deriv',loginDisclaimer:'Your credentials are securely handled via OAuth 2.0.',logout:'Logout',tutorialTitle:'How to trade Digits – Tutorial',video:'Video',guide:'Written Guide',guideTitle:'Step-by-Step Guide',step1:'1. Choose a symbol (e.g., Volatility 100).',step2:'2. Select a contract type: Over, Under, Match, Differs, Even or Odd.',step3:'3. Set your investment amount and duration.',step4:'4. Pick your target digit (0-9).',step5:'5. Click "Buy" to open the contract.',language:'Language',theme:'Theme',meta:'Goals',goalReached:'Goal reached',goalReachedText:'You reached your goal of',result:'Result',win:'WIN',loss:'LOSS',chosen:'Chosen',cameOut:'Came out',lost:'Lost',lastDigit:'Last digit',finalTick:'Final Tick',recentHistory:'Recent history',videoTutorial:'Tutorial',contractClosed:'Contract closed',dailyGoal:'Goal',profit:'Profit',lossGoal:'Loss goal',save:'Save',support:'Support',real:'Real',demo:'Demo',account:'Account',strategy:'Strategy',running:'Running',stopped:'Stopped',start:'START ROBOT',stop:'STOP ROBOT',riskManagement:'Risk management',slogan:'Trade faster',lastDigits:'Last Digits:',analyzing:'Analyzing',contractOpen:'Open',contractClosing:'Closing',contractClosedStage:'Closed',currency:'Currency',completeCourse:'Complete Course',riskSheet:'Risk Calculator',riskSheetDesc:'Calculate risk per operation.',course:'Course',courseDesc:'MozHyper learning modules.',back:'Back',riskBalance:'Balance',riskPerTrade:'Risk per operation (%)',numberTrades:'Number of operations',riskPerOperation:'Risk/operation',estimatedExposure:'Estimated exposure',riskWarning:'⚠️ Risk management tool. It does not guarantee profit.',courseMozHyper:'MozHyper Course',accessCourse:'Course access',accessDesc:'Enter the password you received after payment confirmation.',validate:'Unlock course',validating:'Validating...',buyReceive:'💳 Buy / receive password via Telegram',unlocked:'Course unlocked',sessionAccess:'Access authorized for this session.',module1:'Module 1 — Platform introduction',module2:'Module 2 — Risk management',module3:'Module 3 — Reading the last digits',module4:'Module 4 — Strategies',module5:'Module 5 — Configuration and execution',module6:'Module 6 — Demo account and practice',module7:'Module 7 — Discipline and exposure control',courseContent:'Content to be filled with official lessons and materials.',unlockedNotice:'✅ Course unlocked successfully.',invalidPassword:'Invalid password or payment not approved.',validationError:'Could not validate the password.',telegramNotConfigured:'Course Telegram is not configured yet.',riskSheetTitle:'📊 Risk Calculator',maxMartingale:'Max. Martingale',maxMartingaleHelp:'Maximum levels after consecutive losses.'
  },
  pt: {
    title:'Painel Deriv Digits',connection:'Conexão',status:'Estado',connected:'Conectado',disconnected:'Desconectado',authorized:'Autorizado',notAuthorized:'Não autorizado',balance:'Saldo',lastTick:'Último Tick',digitsTrading:'Negociação de Dígitos',symbol:'Símbolo',contractType:'Tipo de Contrato',amount:'Valor (USD)',duration:'Duração',digit:'Dígito (0-9)',currentPrice:'Preço Atual',proposalQuote:'Cotação da Proposta',askPrice:'Preço de Venda',payout:'Pagamento',stake:'Aposta',buy:'Comprar',buying:'Comprando...',profitTable:'Tabela de Lucros',contractId:'ID do Contrato',type:'Tipo',buyPrice:'Preço de Compra',sellPrice:'Preço de Venda',profitLoss:'Lucro/Perda',purchaseTime:'Hora da Compra',total:'Total',closedOperations:'Operações fechadas',transactions:'transações',page:'Página',previous:'Anterior',next:'Próximo',noTransactions:'Nenhuma transação encontrada.',loading:'Carregando...',error:'Erro',tokenMissing:'Token de API não encontrado.',over:'Acima',under:'Abaixo',match:'Igual',differs:'Diferente',even:'Par',odd:'Ímpar',volatility:'Volatilidade',open:'Aberto',waitingTick:'Aguardando tick...',waitingBalance:'Carregando...',unauthorizedWarning:'⚠️ Não autorizado. Verifique a sua conta.',loginSubtitle:'Entre com a sua conta Deriv para começar a negociar.',loginWithDeriv:'Entrar com Deriv',loginDisclaimer:'As suas credenciais são tratadas com segurança através do OAuth 2.0.',logout:'Sair',tutorialTitle:'Como negociar Dígitos – Aula',video:'Vídeo',guide:'Guia Escrito',guideTitle:'Guia Passo a Passo',step1:'1. Escolha um símbolo (ex: Volatilidade 100).',step2:'2. Selecione o tipo de contrato: Acima, Abaixo, Igual, Diferente, Par ou Ímpar.',step3:'3. Defina o valor do investimento e a duração.',step4:'4. Escolha o dígito alvo (0-9).',step5:'5. Clique em "Comprar" para abrir o contrato.',language:'Idioma',theme:'Tema',meta:'Metas',goalReached:'Meta atingida',goalReachedText:'Atingiu sua meta de',result:'Resultado',win:'WIN',loss:'LOSS',chosen:'Escolhido',cameOut:'Saiu',lost:'Perdeu',lastDigit:'Último dígito',finalTick:'Tick Final',recentHistory:'Histórico recente',videoTutorial:'Aula',contractClosed:'Contrato fechado',dailyGoal:'Meta',profit:'Lucro',lossGoal:'Meta de perdas',save:'Guardar',support:'Suporte',real:'Real',demo:'Demo',account:'Conta',strategy:'Estratégia',running:'Em execução',stopped:'Parado',start:'INICIAR ROBÔ',stop:'PARAR ROBÔ',riskManagement:'Gestão de risco',slogan:'Negocia mais rápido',lastDigits:'Últimos Dígitos:',analyzing:'Analisando',contractOpen:'Aberto',contractClosing:'Fechando',contractClosedStage:'Fechado',currency:'Moeda',completeCourse:'Curso Completo',riskSheet:'Planilha de Risco',riskSheetDesc:'Calcule o risco por operação.',course:'Curso',courseDesc:'Módulos de aprendizagem MozHyper.',back:'Voltar',riskBalance:'Saldo',riskPerTrade:'Risco por operação (%)',numberTrades:'Número de operações',riskPerOperation:'Risco/operação',estimatedExposure:'Exposição estimada',riskWarning:'⚠️ Ferramenta de gestão de risco. Não garante lucro.',courseMozHyper:'Curso MozHyper',accessCourse:'Acesso ao curso',accessDesc:'Digite a senha que recebeu após a confirmação do pagamento.',validate:'Desbloquear curso',validating:'A validar...',buyReceive:'💳 Comprar / receber senha pelo Telegram',unlocked:'Curso desbloqueado',sessionAccess:'Acesso autorizado para esta sessão.',module1:'Módulo 1 — Introdução à plataforma',module2:'Módulo 2 — Gestão de risco',module3:'Módulo 3 — Leitura dos últimos dígitos',module4:'Módulo 4 — Estratégias',module5:'Módulo 5 — Configuração e execução',module6:'Módulo 6 — Conta demo e prática',module7:'Módulo 7 — Disciplina e controlo de exposição',courseContent:'Conteúdo a preencher com as aulas e materiais oficiais.',unlockedNotice:'✅ Curso desbloqueado com sucesso.',invalidPassword:'Senha inválida ou pagamento não aprovado.',validationError:'Não foi possível validar a senha.',telegramNotConfigured:'Telegram do curso ainda não está configurado.',riskSheetTitle:'📊 Planilha de Risco',maxMartingale:'Máx. Martingale',maxMartingaleHelp:'Níveis máximos após perdas consecutivas.'
  },
  es: {
    title:'Panel Deriv Digits',connection:'Conexión',status:'Estado',connected:'Conectado',disconnected:'Desconectado',authorized:'Autorizado',notAuthorized:'No autorizado',balance:'Saldo',lastTick:'Último Tick',digitsTrading:'Negociación de Dígitos',symbol:'Símbolo',contractType:'Tipo de Contrato',amount:'Cantidad (USD)',duration:'Duración',digit:'Dígito (0-9)',currentPrice:'Precio Actual',proposalQuote:'Cotización de Propuesta',askPrice:'Precio de Venta',payout:'Pago',stake:'Apuesta',buy:'Comprar',buying:'Comprando...',profitTable:'Tabla de Ganancias',contractId:'ID del Contrato',type:'Tipo',buyPrice:'Precio de Compra',sellPrice:'Precio de Venta',profitLoss:'Ganancia/Pérdida',purchaseTime:'Hora de Compra',total:'Total',closedOperations:'Operaciones cerradas',transactions:'transacciones',page:'Página',previous:'Anterior',next:'Siguiente',noTransactions:'No se encontraron transacciones.',loading:'Cargando...',error:'Error',tokenMissing:'No se encontró el token de API.',over:'Superior',under:'Inferior',match:'Igual',differs:'Diferente',even:'Par',odd:'Impar',volatility:'Volatilidad',open:'Abierto',waitingTick:'Esperando tick...',waitingBalance:'Cargando...',unauthorizedWarning:'⚠️ No autorizado. Verifica tu cuenta.',loginSubtitle:'Inicia sesión con tu cuenta Deriv para comenzar a operar.',loginWithDeriv:'Iniciar sesión con Deriv',loginDisclaimer:'Tus credenciales se gestionan de forma segura mediante OAuth 2.0.',logout:'Cerrar sesión',tutorialTitle:'Cómo operar Dígitos – Aula',video:'Video',guide:'Guía Escrita',guideTitle:'Guía Paso a Paso',step1:'1. Elige un símbolo (ej: Volatilidad 100).',step2:'2. Selecciona el tipo de contrato: Superior, Inferior, Igual, Diferente, Par o Impar.',step3:'3. Establece el monto de inversión y la duración.',step4:'4. Elige el dígito objetivo (0-9).',step5:'5. Haz clic en "Comprar" para abrir el contrato.',language:'Idioma',theme:'Tema',meta:'Metas',goalReached:'Meta alcanzada',goalReachedText:'Has alcanzado tu meta de',result:'Resultado',win:'WIN',loss:'LOSS',chosen:'Elegido',cameOut:'Salió',lost:'Perdió',lastDigit:'Último dígito',finalTick:'Tick Final',recentHistory:'Historial reciente',videoTutorial:'Aula',contractClosed:'Contrato cerrado',dailyGoal:'Meta',profit:'Ganancia',lossGoal:'Meta de pérdidas',save:'Guardar',support:'Soporte',real:'Real',demo:'Demo',account:'Cuenta',strategy:'Estrategia',running:'En ejecución',stopped:'Detenido',start:'INICIAR ROBOT',stop:'DETENER ROBOT',riskManagement:'Gestión de riesgo',slogan:'Opera más rápido',lastDigits:'Últimos Dígitos:',analyzing:'Analizando',contractOpen:'Abierto',contractClosing:'Cerrando',contractClosedStage:'Cerrado',currency:'Moneda',completeCourse:'Curso Completo',riskSheet:'Calculadora de Riesgo',riskSheetDesc:'Calcula el riesgo por operación.',course:'Curso',courseDesc:'Módulos de aprendizaje de MozHyper.',back:'Volver',riskBalance:'Saldo',riskPerTrade:'Riesgo por operación (%)',numberTrades:'Número de operaciones',riskPerOperation:'Riesgo/operación',estimatedExposure:'Exposición estimada',riskWarning:'⚠️ Herramienta de gestión de riesgo. No garantiza ganancias.',courseMozHyper:'Curso MozHyper',accessCourse:'Acceso al curso',accessDesc:'Introduce la contraseña que recibiste tras la confirmación del pago.',validate:'Desbloquear curso',validating:'Validando...',buyReceive:'💳 Comprar / recibir contraseña por Telegram',unlocked:'Curso desbloqueado',sessionAccess:'Acceso autorizado para esta sesión.',module1:'Módulo 1 — Introducción a la plataforma',module2:'Módulo 2 — Gestión de riesgo',module3:'Módulo 3 — Lectura de los últimos dígitos',module4:'Módulo 4 — Estrategias',module5:'Módulo 5 — Configuración y ejecución',module6:'Módulo 6 — Cuenta demo y práctica',module7:'Módulo 7 — Disciplina y control de exposición',courseContent:'Contenido por completar con las lecciones y materiales oficiales.',unlockedNotice:'✅ Curso desbloqueado correctamente.',invalidPassword:'Contraseña inválida o pago no aprobado.',validationError:'No fue posible validar la contraseña.',telegramNotConfigured:'El Telegram del curso todavía no está configurado.',riskSheetTitle:'📊 Calculadora de Riesgo',maxMartingale:'Máx. Martingala',maxMartingaleHelp:'Niveles máximos después de pérdidas consecutivas.'
  }
};

const LanguageContext = createContext<{language:Language;setLanguage:(lang:Language)=>void;t:(key:string)=>string}>({language:'pt',setLanguage:()=>{},t:key=>key});

function translateAutoBotStaticText(language:Language){
  const tr=translations[language]||translations.en;
  const replacements:Record<string,string>={
    'Negocia mais rápido':tr.slogan,'Trade faster':tr.slogan,'Opera más rápido':tr.slogan,
    'Últimos Dígitos:':tr.lastDigits,'Last Digits:':tr.lastDigits,
    'Analisando':tr.analyzing,'Analyzing':tr.analyzing,'Analizando':tr.analyzing,
    'Aberto':tr.contractOpen,'Open':tr.contractOpen,'Abierto':tr.contractOpen,
    'Fechando':tr.contractClosing,'Closing':tr.contractClosing,'Cerrando':tr.contractClosing,
    'Fechado':tr.contractClosedStage,'Closed':tr.contractClosedStage,'Cerrado':tr.contractClosedStage,
    'Moeda':tr.currency,'Currency':tr.currency,'Moneda':tr.currency,
  };
  const root=document.querySelector('.av4')||document.body;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node:Node|null;
  while((node=walker.nextNode())){
    const value=node.nodeValue||'';
    const trimmed=value.trim();
    if(!trimmed) continue;
    const replacement=replacements[trimmed];
    if(replacement && replacement!==trimmed) node.nodeValue=value.replace(trimmed,replacement);
  }
}

export function LanguageProvider({children}:{children:ReactNode}) {
  const [language,setLanguageState] = useState<Language>('pt');
  const [invertAccountNames,setInvertAccountNames] = useState(false);

  useEffect(()=>{
    const stored=localStorage.getItem('lang') as Language;
    if(stored && ['en','pt','es'].includes(stored)) setLanguageState(stored);
  },[]);

  useEffect(()=>{
    fetch('/api/auth/me',{cache:'no-store'})
      .then(res=>res.ok?res.json():null)
      .then(data=>{
        const email=String(data?.user?.email||'').trim().toLowerCase();
        setInvertAccountNames(email==='khatangana@gmail.com');
      })
      .catch(()=>setInvertAccountNames(false));
  },[]);

  useEffect(()=>{
    const run=()=>translateAutoBotStaticText(language);
    run();
    const observer=new MutationObserver(()=>{
      if((observer as any).__frame) return;
      (observer as any).__frame=requestAnimationFrame(()=>{
        (observer as any).__frame=0;
        run();
      });
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    const interval=window.setInterval(run,500);
    return()=>{observer.disconnect();clearInterval(interval)};
  },[language]);

  const setLanguage=(lang:Language)=>{setLanguageState(lang);localStorage.setItem('lang',lang);};
  const t=(key:string)=>{
    const value=translations[language][key] || translations.en[key] || key;
    if(invertAccountNames && key==='demo') return translations[language].real || translations.en.real || 'Real';
    if(invertAccountNames && key==='real') return translations[language].demo || translations.en.demo || 'Demo';
    return value;
  };
  return <LanguageContext.Provider value={{language,setLanguage,t}}>{children}</LanguageContext.Provider>;
}
export const useLanguage=()=>useContext(LanguageContext);
