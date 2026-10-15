'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance { balance:number; currency:string; loginid?:string }
interface Tick { symbol:string; quote:number; epoch:number }
interface Transaction { id:number; action:string; amount:number; currency:string; contract_id?:number }
interface ProfitTransaction { contract_id:number; buy_price:number; sell_price:number|null; payout:number; purchase_time:number; sell_time:number|null; contract_type:string; longcode?:string; profit_loss?:number; profit?:number|string; exit_tick?:number|string|null; exit_spot?:number|string|null; bot?:string; status?:string; barrier?:number|null; symbol?:string }
interface Proposal { id:string; ask_price:number; payout:number; stake:number; contract_type:string; symbol:string; duration:number; duration_unit:string; barrier?:number; requested_contract_type?:string; requested_barrier?:number }
const TRADING_MIN_STAKE=0.35,SOROS_MIN=TRADING_MIN_STAKE,SOROS_MAX_WINS=3,SOROS_WIN_MULTIPLIER=1.95,SOROS_STORAGE='mozhyper-soros-state-v8',TRADING_SESSION_STORAGE='mozhyper-trading-session-v1',TRADING_CACHE_PREFIX='mozhyper-trading-cache-v2:',TRADING_CLEARED_AT_PREFIX='mozhyper-trading-cleared-at-v1:';
interface SorosState{level:number;stake:number;initialStake:number;accumulatedProfit:number;lossRetryCount:number;recoveryDeficit:number;enabled:boolean;blocked:boolean}
const defaultSoros=(initialStake=SOROS_MIN):SorosState=>({level:0,stake:Math.max(SOROS_MIN,initialStake),initialStake:Math.max(SOROS_MIN,initialStake),accumulatedProfit:0,lossRetryCount:0,recoveryDeficit:0,enabled:true,blocked:false});
function saveSoros(s:SorosState){if(typeof window==='undefined')return;try{sessionStorage.setItem(SOROS_STORAGE,JSON.stringify(s))}catch{}}
function loadSoros():SorosState|null{if(typeof window==='undefined')return null;try{const raw=sessionStorage.getItem(SOROS_STORAGE);if(!raw)return null;const s=JSON.parse(raw);if(!s||!Number.isFinite(Number(s.initialStake)))return null;const initial=Math.max(SOROS_MIN,Number(s.initialStake));const level=Math.max(0,Math.min(SOROS_MAX_WINS-1,Math.floor(Number(s.level)||0)));return{...defaultSoros(initial),...s,initialStake:initial,level,stake:level>0?Math.max(SOROS_MIN,Number(s.stake)||initial):initial,enabled:true,blocked:false,accumulatedProfit:Number.isFinite(Number(s.accumulatedProfit))?Number(s.accumulatedProfit):0,lossRetryCount:Math.max(0,Math.floor(Number(s.lossRetryCount)||0)),recoveryDeficit:Math.max(0,Number(s.recoveryDeficit)||0)}}catch{return null}}
function clearSorosStorage(){if(typeof window==='undefined')return;try{sessionStorage.removeItem(SOROS_STORAGE);sessionStorage.removeItem('mozhyper-soros-state-v7');sessionStorage.removeItem('mozhyper-soros-state-v6')}catch{}}
type DirectBuyRequest=Parameters<DerivWebSocket['buyContractWithParameters']>[0];
function directBuy(ws:DerivWebSocket,req:DirectBuyRequest,price:number,onFail:()=>void){let tries=0;const attempt=()=>{if(ws.isConnected()&&ws.buyContractWithParameters(req,price))return;if(++tries>=16){onFail();return}setTimeout(attempt,500)};attempt()}
function calculateProfitLoss(tx:Partial<ProfitTransaction>):number{const explicit=Number(tx.profit_loss);if(Number.isFinite(explicit)&&Math.abs(explicit)>0.000001)return explicit;const apiProfit=Number(tx.profit);if(Number.isFinite(apiProfit)&&Math.abs(apiProfit)>0.000001)return apiProfit;const buy=Number(tx.buy_price),sell=Number(tx.sell_price);if(Number.isFinite(buy)&&Number.isFinite(sell))return sell-buy;if(Number.isFinite(explicit))return explicit;return Number.isFinite(apiProfit)?apiProfit:0}
function cacheKey(accountType:'demo'|'real'){return `${TRADING_CACHE_PREFIX}${accountType}`}

export function useDeriv(accountType:'demo'|'real'='demo',onContractClosed?: (tx:ProfitTransaction)=>void){
 const wsRef=useRef<DerivWebSocket|null>(null),activeContractRef=useRef<number|null>(null),activeContractStateRef=useRef<number|null>(null),pendingBuyBotRef=useRef<string|null>(null),pendingBuyBarrierRef=useRef<number|null>(null),contractBotRef=useRef<Map<number,string>>(new Map()),contractBarrierRef=useRef<Map<number,number>>(new Map()),contractSymbolRef=useRef<Map<number,string>>(new Map()),latestProposalReqRef=useRef<number|null>(null),proposalRequestRef=useRef<{symbol:string;contractType:string;amount:number;duration:number;barrier:number}|null>(null),staleBuyRetryRef=useRef(false),closedContractsRef=useRef<Map<number,ProfitTransaction>>(new Map()),sessionStartedAtRef=useRef(0),sessionContractIdsRef=useRef<Set<number>>(new Set()),emittedClosedContractsRef=useRef<Set<number>>(new Set()),sorosRef=useRef<SorosState>(defaultSoros()),processedSorosContractsRef=useRef<Set<number>>(new Set()),balanceCacheRef=useRef<Balance|null>(null),originalSorosEnabledRef=useRef(true),activeContractStartedAtRef=useRef(0),lastActiveContractUpdateAtRef=useRef(0),lastContractReconcileAtRef=useRef(0),lastPortfolioRequestAtRef=useRef(0),portfolioRequestIdRef=useRef<number|null>(null),portfolioAbsenceCountRef=useRef(0),pendingBuyAbsenceCountRef=useRef(0),connectionWasUpRef=useRef(false),pendingBuyStartedAtRef=useRef(0),pendingBuyLastRecoveryAtRef=useRef(0);
 const[balance,setBalance]=useState<Balance|null>(null),[tick,setTick]=useState<Tick|null>(null),[transaction,setTransaction]=useState<Transaction|null>(null),[isConnected,setIsConnected]=useState(false),[isAuthorized,setIsAuthorized]=useState(false),[error,setError]=useState<string|null>(null),[profitTransactions,setProfitTransactions]=useState<ProfitTransaction[]>([]),[profitCount,setProfitCount]=useState(0),[proposal,setProposal]=useState<Proposal|null>(null),[loadingProfit,setLoadingProfit]=useState(false),[buying,setBuying]=useState(false),[contractClosedSeq,setContractClosedSeq]=useState(0),[lastClosedTransaction,setLastClosedTransaction]=useState<ProfitTransaction|null>(null),[activeContractId,setActiveContractId]=useState<number|null>(null),[contractStage,setContractStage]=useState<'analisando'|'aberto'|'fechado'>('analisando'),[soros,setSoros]=useState<SorosState>(()=>defaultSoros());
 activeContractStateRef.current=activeContractId;
 const onContractClosedRef=useRef<((tx:ProfitTransaction)=>void)|undefined>(onContractClosed);
 onContractClosedRef.current=onContractClosed;
 const saveTradingCache=useCallback(()=>{if(typeof window==='undefined'||!sessionStartedAtRef.current)return;try{const txs=Array.from(closedContractsRef.current.values()).filter(x=>x.sell_time&&Number(x.sell_time)>0).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,600);localStorage.setItem(cacheKey(accountType),JSON.stringify({sessionStartedAt:sessionStartedAtRef.current,balance:balanceCacheRef.current,transactions:txs,savedAt:Date.now()}))}catch{}},[accountType]);
 const restoreTradingCache=useCallback(()=>{if(typeof window==='undefined')return;try{const raw=localStorage.getItem(cacheKey(accountType));if(!raw)return;const cached=JSON.parse(raw);if(Number(cached?.sessionStartedAt)!==sessionStartedAtRef.current)return;if(cached.balance){balanceCacheRef.current=cached.balance;setBalance(cached.balance)}const txs=Array.isArray(cached.transactions)?cached.transactions:[];for(const tx of txs){const id=Number(tx.contract_id);if(Number.isFinite(id)&&id>0){closedContractsRef.current.set(id,tx);emittedClosedContractsRef.current.add(id)}}if(txs.length){const merged=Array.from(closedContractsRef.current.values()).filter(x=>x.sell_time&&Number(x.sell_time)>0).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time));setProfitTransactions(merged);setProfitCount(merged.length)}}catch{}},[accountType]);
 const syncSoros=useCallback((next:SorosState)=>{const initial=Math.max(SOROS_MIN,Number(next.initialStake)||SOROS_MIN);const level=Math.max(0,Math.min(SOROS_MAX_WINS-1,Math.floor(Number(next.level)||0)));const recoveryDeficit=Math.max(0,Number(next.recoveryDeficit)||0);const stake=(level>0||recoveryDeficit>0.01)?Math.max(SOROS_MIN,Number(next.stake)||initial):initial;const normalized={...next,initialStake:initial,stake,accumulatedProfit:Number.isFinite(Number(next.accumulatedProfit))?Number(Number(next.accumulatedProfit).toFixed(2)):0,lossRetryCount:Math.max(0,Math.floor(Number(next.lossRetryCount)||0)),level,enabled:Boolean(next.enabled),blocked:false};sorosRef.current=normalized;setSoros(normalized);saveSoros(normalized)},[]);
 const resetSoros=useCallback((initialStake=sorosRef.current.initialStake)=>syncSoros(defaultSoros(initialStake)),[syncSoros]);
 const setSorosEnabled=useCallback((enabled:boolean)=>{originalSorosEnabledRef.current=enabled;if(enabled)syncSoros({...sorosRef.current,enabled:true});else syncSoros({...sorosRef.current,enabled:false})},[syncSoros]);
 const setSorosStake=useCallback((initialStake:number)=>{if(!originalSorosEnabledRef.current)return;const value=Math.max(SOROS_MIN,Number(initialStake)||SOROS_MIN);syncSoros(defaultSoros(value))},[syncSoros]);
 const processSorosResult=useCallback((tx:ProfitTransaction)=>{
  if(!originalSorosEnabledRef.current)return;
  const id=Number(tx.contract_id);
  if(!Number.isFinite(id)||id<=0)return;
  if(processedSorosContractsRef.current.has(id))return;

  const pnl=calculateProfitLoss(tx);
  if(!Number.isFinite(pnl)||Math.abs(pnl)<0.000001)return;
  processedSorosContractsRef.current.add(id);

  const base=Math.max(
   SOROS_MIN,
   Number(sorosRef.current.initialStake)||SOROS_MIN,
  );
  const currentLevel=Math.max(
   0,
   Math.min(SOROS_MAX_WINS-1,Math.floor(Number(sorosRef.current.level)||0)),
  );
  const executedStake=Math.max(
   SOROS_MIN,
   Number(tx.buy_price)>0
    ?Number(tx.buy_price)
    :Number(sorosRef.current.stake)||base,
  );

  const previousDeficit=Math.max(0,Number(sorosRef.current.recoveryDeficit)||0);
  if(pnl<=0){
   // Após uma perda Soros, a próxima operação tenta recuperar todo o défice acumulado.
   const deficit=Number((previousDeficit+Math.abs(pnl)).toFixed(2));
   const recoveryStake=Number(Math.max(SOROS_MIN,deficit/Math.max(0.01,SOROS_WIN_MULTIPLIER-1)).toFixed(2));
   syncSoros({level:0,stake:recoveryStake,initialStake:base,accumulatedProfit:0,lossRetryCount:Math.max(0,Number(sorosRef.current.lossRetryCount)||0)+1,recoveryDeficit:deficit,enabled:true,blocked:false});
   return;
  }

  if(previousDeficit>0.01){
   const remaining=Number(Math.max(0,previousDeficit-pnl).toFixed(2));
   if(remaining<=0.01){syncSoros(defaultSoros(base));return}
   const recoveryStake=Number(Math.max(SOROS_MIN,remaining/Math.max(0.01,SOROS_WIN_MULTIPLIER-1)).toFixed(2));
   syncSoros({level:0,stake:recoveryStake,initialStake:base,accumulatedProfit:0,lossRetryCount:Math.max(0,Number(sorosRef.current.lossRetryCount)||0),recoveryDeficit:remaining,enabled:true,blocked:false});
   return;
  }

  if(currentLevel<SOROS_MAX_WINS-1){
   const nextLevel=currentLevel+1;
   // Soros reinveste a stake executada MAIS o lucro líquido real desta vitória.
   // Não repetir apenas a stake anterior: isso eliminava o crescimento do ciclo.
   const nextStake=Number(Math.max(SOROS_MIN,executedStake+pnl).toFixed(2));
   syncSoros({
    level:nextLevel,
    stake:nextStake,
    initialStake:base,
    accumulatedProfit:Number((Number(sorosRef.current.accumulatedProfit||0)+pnl).toFixed(2)),
    lossRetryCount:0,
    recoveryDeficit:0,
    enabled:true,
    blocked:false
   });
   return;
  }

  // Terceira vitória conclui o ciclo Soros; não altera o valor base.
  syncSoros(defaultSoros(base));
 },[syncSoros]);

 // One settlement path for the live contract stream and profit_table fallback.
 // Keep the contract lifecycle explicit: release the active contract exactly once,
 // then allow AutoBotV4 to prepare the next signal after React sees null.
 const settleActiveContract=useCallback((contractIdInput:number,source:'proposal_open_contract'|'profit_table')=>{
  const id=Number(contractIdInput);
  if(!Number.isFinite(id)||id<=0)return false;
  const trackedByRef=activeContractRef.current===id;
  const trackedByState=activeContractStateRef.current===id;
  if(!trackedByRef&&(!trackedByState||(activeContractRef.current!==null&&activeContractRef.current!==id)))return false;
  console.info('[Deriv contract lifecycle] Settling active contract',{contract_id:id,source,trackedByRef,trackedByState});
  if(trackedByRef)activeContractRef.current=null;
  if(trackedByState)activeContractStateRef.current=null;
  activeContractStartedAtRef.current=0;lastActiveContractUpdateAtRef.current=0;lastContractReconcileAtRef.current=0;portfolioAbsenceCountRef.current=0;
  latestProposalReqRef.current=null;
  staleBuyRetryRef.current=false;
  pendingBuyBotRef.current=null;
  pendingBuyBarrierRef.current=null;
  setActiveContractId(null);
  setProposal(null);
  setBuying(false);
  setLoadingProfit(false);
  setContractClosedSeq(v=>v+1);
  setContractStage('fechado');
  wsRef.current?.unsubscribeContract(id);
  window.setTimeout(()=>{if(activeContractRef.current===null)setContractStage('analisando')},1800);
  return true;
 },[]);

 const notifyClosedTransaction=useCallback((tx:ProfitTransaction)=>{
  const id=Number(tx.contract_id);
  const purchaseTime=Number(tx.purchase_time??0);
  if(!Number.isFinite(id)||id<=0||!purchaseTime)return false;

  let clearedAt=0;
  try{clearedAt=Number(localStorage.getItem(TRADING_CLEARED_AT_PREFIX+accountType)||0)}catch{}

  const ownedByCurrentSession=
    sessionContractIdsRef.current.has(id) ||
    activeContractRef.current===id ||
    (purchaseTime>=sessionStartedAtRef.current&&purchaseTime>clearedAt);

  if(!ownedByCurrentSession||emittedClosedContractsRef.current.has(id))return false;

  emittedClosedContractsRef.current.add(id);
  onContractClosedRef.current?.(tx);
  processSorosResult(tx);
  setLastClosedTransaction(tx);
  return true;
 },[accountType,processSorosResult]);

 const mergeProfitTransactions=useCallback((incoming:ProfitTransaction[])=>{
  const newlyClosed:ProfitTransaction[]=[];

  for(const tx of incoming){
   const id=Number(tx.contract_id),purchaseTime=Number(tx.purchase_time??0);
   if(!Number.isFinite(id)||id<=0||!purchaseTime)continue;

   let clearedAt=0;
   try{clearedAt=Number(localStorage.getItem(TRADING_CLEARED_AT_PREFIX+accountType)||0)}catch{}

   const belongsToSession=
     sessionContractIdsRef.current.has(id) ||
     activeContractRef.current===id ||
     (purchaseTime>=sessionStartedAtRef.current&&purchaseTime>clearedAt);

   if(!belongsToSession)continue;

   const previous=closedContractsRef.current.get(id);
   const wasClosed=Boolean(previous?.sell_time&&Number(previous.sell_time)>0);
   const raw:any={...previous,...tx};
   // A buy acknowledgement can be lost during a reconnect even though Deriv
   // completed the one-tick contract. Match the recovered history row to the
   // outstanding buy request so the result is attributed to the correct bot.
   const pendingRequest=proposalRequestRef.current;
   const pendingAtSeconds=Math.floor(pendingBuyStartedAtRef.current/1000);
   const rawSymbol=String(raw.underlying_symbol??raw.symbol??'');
   const rawSymbolLooksLikeCode=/^[A-Za-z0-9_]+$/.test(rawSymbol);
   const samePendingSymbol=!rawSymbol||!rawSymbolLooksLikeCode||!pendingRequest?.symbol||rawSymbol===pendingRequest.symbol;
   const normalizeType=(value:unknown)=>{const type=String(value??'').trim().toUpperCase();return type==='OVER'?'DIGITOVER':type==='UNDER'?'DIGITUNDER':type==='EVEN'?'DIGITEVEN':type==='ODD'?'DIGITODD':type};
   const samePendingType=!raw.contract_type||!pendingRequest?.contractType||normalizeType(raw.contract_type)===normalizeType(pendingRequest.contractType);
   const rawBuyPrice=Number(raw.buy_price);
   const samePendingStake=!Number.isFinite(rawBuyPrice)||!pendingRequest?.amount||Math.abs(rawBuyPrice-Number(pendingRequest.amount))<=0.03;
   const matchesPendingBuy=Boolean(pendingBuyStartedAtRef.current>0&&pendingBuyBotRef.current&&purchaseTime>=pendingAtSeconds-15&&purchaseTime<=Math.floor(Date.now()/1000)+10&&samePendingSymbol&&samePendingType&&samePendingStake);
   if(matchesPendingBuy){
    raw.bot=raw.bot||pendingBuyBotRef.current||undefined;
    raw.barrier=raw.barrier??pendingBuyBarrierRef.current;
    raw.symbol=raw.symbol||pendingRequest?.symbol;
    sessionContractIdsRef.current.add(id);
    if(raw.bot)contractBotRef.current.set(id,String(raw.bot));
    if(raw.barrier!=null&&Number.isFinite(Number(raw.barrier)))contractBarrierRef.current.set(id,Number(raw.barrier));
    if(raw.symbol)contractSymbolRef.current.set(id,String(raw.symbol));
   }
   const normalized:ProfitTransaction={
    contract_id:id,
    buy_price:Number(raw.buy_price??0),
    sell_price:raw.sell_price==null?null:Number(raw.sell_price),
    payout:Number(raw.payout??0),
    purchase_time:Number(raw.purchase_time??purchaseTime),
    sell_time:raw.sell_time==null?null:Number(raw.sell_time),
    contract_type:String(raw.contract_type??''),
    longcode:raw.longcode,
    profit_loss:calculateProfitLoss(raw),
    exit_tick:raw.exit_tick??null,
    exit_spot:raw.exit_spot??null,
    bot:raw.bot?String(raw.bot):undefined,
    status:raw.status?String(raw.status).toLowerCase():undefined,
    barrier:raw.barrier!=null&&Number.isFinite(Number(raw.barrier))?Number(raw.barrier):(contractBarrierRef.current.get(id)??previous?.barrier??null),
    symbol:String(raw.symbol??raw.underlying_symbol??contractSymbolRef.current.get(id)??previous?.symbol??'')||undefined
   };

   closedContractsRef.current.set(id,normalized);
   if(matchesPendingBuy&&normalized.sell_time&&Number(normalized.sell_time)>0){
    console.warn('[Deriv reconciliation] Recovered closed trade after buy acknowledgement was lost',{contract_id:id,bot:normalized.bot,contract_type:normalized.contract_type,purchase_time:normalized.purchase_time,profit_loss:normalized.profit_loss});
    pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;
    latestProposalReqRef.current=null;setBuying(false);setProposal(null);setError(null);
   }

   if(normalized.sell_time&&Number(normalized.sell_time)>0&&!wasClosed){
    newlyClosed.push(normalized);
   }
  }

  // Risk state is sequential. Process missed closes oldest -> newest,
  // never in Deriv's DESC display order.
  newlyClosed.sort((a,b)=>{
   const ta=Number(a.sell_time??a.purchase_time);
   const tb=Number(b.sell_time??b.purchase_time);
   return ta-tb;
  });

  for(const tx of newlyClosed){
   notifyClosedTransaction(tx);

   // Same settlement path as the live stream if profit_table is the first
   // source that confirms this contract has closed.
   settleActiveContract(Number(tx.contract_id),'profit_table');
  }

  // Also settle if the close was already present in local history but the active
  // contract ref somehow remained set. This avoids depending on a single event.
  for(const tx of incoming){
   const id=Number(tx.contract_id);
   const current=closedContractsRef.current.get(id);
   if(current?.sell_time&&Number(current.sell_time)>0)settleActiveContract(id,'profit_table');
  }

  const merged=Array.from(closedContractsRef.current.values())
   .filter(x=>x.sell_time&&Number(x.sell_time)>0)
   .sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time));

  setProfitTransactions(merged);
  setProfitCount(merged.length);
  saveTradingCache();
 },[accountType,notifyClosedTransaction,saveTradingCache,settleActiveContract]);

 const refreshProfitTable=useCallback(()=>wsRef.current?.getProfitTable({limit:2000,offset:0,sort:'DESC',description:1}),[]);
 const resetTradingSession=useCallback(()=>{const now=Math.floor(Date.now()/1000);sessionStartedAtRef.current=now;closedContractsRef.current.clear();sessionContractIdsRef.current.clear();emittedClosedContractsRef.current.clear();processedSorosContractsRef.current.clear();balanceCacheRef.current=null;setBalance(null);setProfitTransactions([]);setProfitCount(0);setContractClosedSeq(0);clearSorosStorage();try{localStorage.removeItem(cacheKey(accountType));localStorage.setItem(TRADING_CLEARED_AT_PREFIX+accountType,String(now));sessionStorage.setItem(TRADING_SESSION_STORAGE,String(now))}catch{};const fresh=defaultSoros(sorosRef.current.initialStake||SOROS_MIN);sorosRef.current=fresh;setSoros(fresh);wsRef.current?.subscribeBalance()},[accountType]);















































 useEffect(()=>{let cancelled=false;let connectionCheck:ReturnType<typeof setInterval>|null=null;let contractWatchdog:number|null=null;let initialProfitLoaded=false;let lastProfitRefresh=0;let storedStart=0;try{storedStart=Number(sessionStorage.getItem(TRADING_SESSION_STORAGE)||0)}catch{};sessionStartedAtRef.current=Number.isFinite(storedStart)&&storedStart>0?storedStart:Math.floor(Date.now()/1000);try{sessionStorage.setItem(TRADING_SESSION_STORAGE,String(sessionStartedAtRef.current))}catch{};closedContractsRef.current.clear();sessionContractIdsRef.current.clear();processedSorosContractsRef.current.clear();setProfitTransactions([]);setProfitCount(0);setLastClosedTransaction(null);setBalance(null);balanceCacheRef.current=null;restoreTradingCache();for(const id of closedContractsRef.current.keys())processedSorosContractsRef.current.add(id);setProposal(null);setError(null);setBuying(false);setContractClosedSeq(0);setActiveContractId(null);setContractStage('analisando');const restoredSoros=loadSoros()||defaultSoros();sorosRef.current=restoredSoros;setSoros(restoredSoros);
   const refresh=(force=false)=>{const now=Date.now();if(!force&&now-lastProfitRefresh<2000)return;lastProfitRefresh=now;setLoadingProfit(true);refreshProfitTable()};

   // Android/iOS suspendem timers e WebSockets quando a aplicação fica
   // minimizada. Ao voltar ao foreground, recriar a ligação e sincronizar
   // imediatamente o saldo e as operações fechadas.
   const resumeApp=()=>{
     if(cancelled)return;
     connectionWasUpRef.current=false;
     wsRef.current?.resumeConnection();
     setIsConnected(false);
     setIsAuthorized(false);
     // Do not clear buying while a buy acknowledgement may have been lost.
     // The portfolio/history reconciliation below must identify that trade first.
     if(pendingBuyStartedAtRef.current===0&&activeContractRef.current===null)setBuying(false);
     refresh(true);
     window.setTimeout(()=>{
       if(cancelled)return;
       wsRef.current?.subscribeBalance();
       refresh(true);
     },1200);
   };
   const handleVisibility=()=>{
     if(document.visibilityState==='visible')resumeApp();
   };
   const handlePageShow=()=>resumeApp();
   document.addEventListener('visibilitychange',handleVisibility);
   window.addEventListener('pageshow',handlePageShow);
   const start=async()=>{try{const response=await fetch(`/api/deriv/ws-url?account_type=${accountType}`,{cache:'no-store',credentials:'same-origin'});const session=await response.json().catch(()=>null);if(!response.ok||!session?.wsUrl)throw new Error(session?.error||`Unable to create Deriv WebSocket session (${response.status})`);if(cancelled)return;const ws=new DerivWebSocket(session.wsUrl);wsRef.current=ws;
     // Every reconnect gets a fresh authenticated WebSocket URL. Deriv OTP
     // URLs are short-lived, so reusing the original URL can cause a silent
     // freeze after a network interruption.
     ws.setReconnectUrlProvider(async()=>{
       const response=await fetch(`/api/deriv/ws-url?account_type=${accountType}`,{cache:'no-store',credentials:'same-origin'});
       const refreshed=await response.json().catch(()=>null);
       if(!response.ok||!refreshed?.wsUrl)throw new Error(refreshed?.error||`Unable to refresh Deriv WebSocket session (${response.status})`);
       return String(refreshed.wsUrl);
     });
     ws.subscribe('*',(data)=>{if(!data.error)return;const message=data.error.message||'Unknown Deriv error';if(data.echo_req?.forget!==undefined)return;if(data.error.code==='RateLimit'||/rate.?limit/i.test(message)){setLoadingProfit(false);return}if(/unknown contract/i.test(message)&&(data.echo_req?.profit_table||data.echo_req?.proposal_open_contract)){console.warn('[Deriv reconciliation] Contract/history lookup returned unknown contract',{message,code:data.error.code,request:data.echo_req,activeContractId:activeContractRef.current});setLoadingProfit(false);return}if(data.echo_req?.buy){const expiredProposal=String(data.error.code||'').toLowerCase().includes('contractproposal')||/unknown contract proposal|proposal.{0,35}(expired|no longer available|not valid|not found)|(?:expired|invalid).{0,35}proposal/i.test(message);const previousRequest=proposalRequestRef.current;const retryPrice=Number(data.echo_req?.price);if(expiredProposal&&!staleBuyRetryRef.current&&previousRequest&&Number.isFinite(retryPrice)&&retryPrice>0){staleBuyRetryRef.current=true;pendingBuyStartedAtRef.current=Date.now();pendingBuyLastRecoveryAtRef.current=0;console.warn('[Deriv buy fallback] Proposal ID rejected; retrying with direct contract parameters.',{code:data.error.code,price:retryPrice});setError(null);directBuy(ws,previousRequest,retryPrice,()=>{staleBuyRetryRef.current=false;pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;setBuying(false);setProposal(null);activeContractRef.current=null;activeContractStartedAtRef.current=0;lastActiveContractUpdateAtRef.current=0;setActiveContractId(null);latestProposalReqRef.current=null;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;setError('Sem ligação à Deriv. Tente novamente.')});return;}pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;setBuying(false);setProposal(null);activeContractRef.current=null;activeContractStartedAtRef.current=0;lastActiveContractUpdateAtRef.current=0;setActiveContractId(null);latestProposalReqRef.current=null;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;console.error('[Deriv buy rejected]',{message,code:data.error.code,proposal_id:data.echo_req.buy,price:data.echo_req.price});}if(data.echo_req?.proposal){setBuying(false);setProposal(null);latestProposalReqRef.current=null;const req=data.echo_req;console.error('[Deriv proposal rejected]',{message,code:data.error.code,contract_type:req.contract_type,symbol:req.underlying_symbol,duration:req.duration,duration_unit:req.duration_unit,barrier:req.barrier,amount:req.amount});}setError(data.echo_req?.proposal?'Proposta rejeitada pela Deriv: '+message:data.echo_req?.buy&&/unknown contract proposal/i.test(message)?'A proposta expirou ou deixou de ser válida. A tentar obter uma nova proposta.':message);if(data.error.code==='AuthorizationRequired'||data.error.code==='Unauthorized')setIsAuthorized(false)});
     ws.subscribe('authorize',data=>{if(data.authorize)setIsAuthorized(true)});ws.subscribe('balance',data=>{if(data.balance){balanceCacheRef.current=data.balance;setBalance(data.balance);saveTradingCache()}});ws.subscribe('tick',data=>{if(data.tick)setTick(data.tick)});ws.subscribe('transaction',data=>{if(data.transaction)setTransaction(data.transaction)});ws.subscribe('profit_table',data=>{if(data.profit_table){
      mergeProfitTransactions(data.profit_table.transactions||[]);
      // Two empty portfolio checks plus a fresh closed-history response are required
      // before releasing a pending buy whose acknowledgement was lost.
      const pendingAge=pendingBuyStartedAtRef.current?Date.now()-pendingBuyStartedAtRef.current:0;
      if(pendingBuyStartedAtRef.current>0&&pendingAge>=20000&&pendingBuyAbsenceCountRef.current>=2){
       console.error('[Deriv reconciliation] Releasing unconfirmed buy lock after two portfolio checks and a fresh profit_table response found no matching trade',{pendingAge,absenceChecks:pendingBuyAbsenceCountRef.current,symbol:proposalRequestRef.current?.symbol,contractType:proposalRequestRef.current?.contractType,amount:proposalRequestRef.current?.amount});
       pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;
       latestProposalReqRef.current=null;setBuying(false);setProposal(null);setError('A Deriv não confirmou a compra nem devolveu uma posição aberta ou resultado correspondente após várias verificações. O bloqueio foi libertado; confirme o histórico antes de continuar.');
       
      }
      setLoadingProfit(false)
     }});
     ws.subscribe('portfolio',data=>{
      const portfolio=data.portfolio;
      if(!portfolio)return;
      portfolioRequestIdRef.current=null;
      const contracts:any[]=Array.isArray(portfolio.contracts)?portfolio.contracts:[];
      const now=Date.now();
      const activeId=activeContractRef.current??activeContractStateRef.current;
      if(activeId!==null){
       const activeListed=contracts.some((item:any)=>Number(item?.contract_id)===activeId);
       if(activeListed){
        portfolioAbsenceCountRef.current=0;
        // Keep React state and the internal contract reference in sync. A stale
        // null UI state must not permit another buy while a contract is open.
        activeContractRef.current=activeId;activeContractStateRef.current=activeId;
        setActiveContractId(activeId);setContractStage('aberto');setBuying(false);setProposal(null);setError(null);
        console.info('[Deriv reconciliation] Active contract confirmed in portfolio',{contract_id:activeId,ageMs:now-(activeContractStartedAtRef.current||now)});
       }else{
        portfolioAbsenceCountRef.current+=1;
        console.warn('[Deriv reconciliation] Active contract absent from open portfolio; checking status/history before releasing lock',{contract_id:activeId,absenceChecks:portfolioAbsenceCountRef.current,ageMs:now-(activeContractStartedAtRef.current||now)});
        const knownClosed=closedContractsRef.current.get(activeId);
        if(knownClosed?.sell_time&&Number(knownClosed.sell_time)>0){
         notifyClosedTransaction(knownClosed);
         settleActiveContract(activeId,'profit_table');
         return;
        }
        ws.requestContractStatus(activeId);
        refresh(true);
        // A one-tick contract cannot remain open indefinitely. If two portfolio
        // snapshots confirm it is absent and its close stream never returns,
        // clear the stale active-contract lock after 20 seconds. History remains
        // monitored so a delayed financial result can still be processed.
        const activeAge=now-(activeContractStartedAtRef.current||now);
        if(portfolioAbsenceCountRef.current>=2&&activeAge>=20000){
         console.error('[Deriv reconciliation] Releasing stale active-contract lock after two portfolio snapshots showed no open position',{contract_id:activeId,activeAge,absenceChecks:portfolioAbsenceCountRef.current});
         setError('O contrato já não aparece na carteira aberta após duas verificações, mas o resultado ainda não chegou. O bloqueio foi libertado e o histórico continua a ser sincronizado.');
         settleActiveContract(activeId,'profit_table');
         return;
        }
       }
      }
      const pendingAt=pendingBuyStartedAtRef.current;
      const pendingRequest=proposalRequestRef.current;
      if(pendingAt>0&&pendingRequest&&pendingBuyBotRef.current){
       const atSeconds=Math.floor(pendingAt/1000);
       const candidates=contracts.filter((item:any)=>{
        const id=Number(item?.contract_id);
        const purchaseTime=Number(item?.purchase_time??item?.date_start??0);
        const type=String(item?.contract_type??'').toUpperCase();
        const underlying=String(item?.underlying??item?.underlying_symbol??item?.symbol??'');
        const buyPrice=Number(item?.buy_price);
        return Number.isFinite(id)&&id>0&&purchaseTime>0&&purchaseTime>=atSeconds-15&&purchaseTime<=Math.floor(now/1000)+10&&(!type||type===String(pendingRequest.contractType).toUpperCase())&&(!underlying||underlying===pendingRequest.symbol)&&(!Number.isFinite(buyPrice)||Math.abs(buyPrice-Number(pendingRequest.amount))<=0.03);
       });
       if(candidates.length===1){
        const recovered=candidates[0];
        const recoveredId=Number(recovered.contract_id);
        const bot=String(pendingBuyBotRef.current);
        console.warn('[Deriv reconciliation] Recovered a buy acknowledgement from open portfolio',{contract_id:recoveredId,bot,contract_type:recovered.contract_type,symbol:recovered.underlying??recovered.underlying_symbol??recovered.symbol});
        sessionContractIdsRef.current.add(recoveredId);contractBotRef.current.set(recoveredId,bot);
        if(pendingBuyBarrierRef.current!==null)contractBarrierRef.current.set(recoveredId,pendingBuyBarrierRef.current);
        contractSymbolRef.current.set(recoveredId,String(recovered.underlying??recovered.underlying_symbol??recovered.symbol??pendingRequest.symbol));
        activeContractRef.current=recoveredId;activeContractStartedAtRef.current=now;lastActiveContractUpdateAtRef.current=now;lastContractReconcileAtRef.current=now;portfolioAbsenceCountRef.current=0;
        pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;
        latestProposalReqRef.current=null;setBuying(false);setProposal(null);setError(null);setActiveContractId(recoveredId);setContractStage('aberto');
        ws.reconcileContract(recoveredId);return;
       }
       if(now-pendingAt>8000){
        pendingBuyAbsenceCountRef.current+=1;
        console.warn('[Deriv reconciliation] No matching open position found for unacknowledged buy; checking closed history',{ageMs:now-pendingAt,absenceChecks:pendingBuyAbsenceCountRef.current,symbol:pendingRequest.symbol,contractType:pendingRequest.contractType,amount:pendingRequest.amount,candidates:candidates.length});
        refresh(true);
       }
      }
     });
     ws.subscribe('proposal_open_contract',data=>{
      const c=data.proposal_open_contract;
      if(!c)return;
      const contractId=Number(c.contract_id);
      if(!Number.isFinite(contractId)||contractId<=0)return;
      if(activeContractRef.current===contractId)lastActiveContractUpdateAtRef.current=Date.now();
      const buyPrice=Number(c.buy_price??0);
      const sellPrice=c.sell_price==null?null:Number(c.sell_price);
      const payout=Number(c.payout??0);
      const profitLoss=calculateProfitLoss({buy_price:buyPrice,sell_price:sellPrice,profit_loss:c.profit_loss,profit:c.profit});
      const purchaseTime=Number(c.purchase_time||Math.floor(Date.now()/1000));
      const sellTime=c.sell_time?Number(c.sell_time):null;
      const status=String(c.status||'').trim().toLowerCase();
      const sold=c.is_sold===true||c.is_sold===1||String(c.is_sold)==='1'||String(c.is_sold).toLowerCase()==='true';
      const closed=sold||['sold','won','lost','expired','closed'].includes(status);
      if(!closed)return;
      const closedTx:ProfitTransaction={
       contract_id:contractId,buy_price:buyPrice,sell_price:sellPrice,payout,
       purchase_time:purchaseTime,sell_time:sellTime??(closed?Math.floor(Date.now()/1000):null),contract_type:c.contract_type||'',
       longcode:c.longcode,profit:c.profit==null?undefined:Number(c.profit),profit_loss:profitLoss,status:status||undefined,
       exit_tick:c.exit_tick??null,exit_spot:c.exit_spot??null,
       bot:contractBotRef.current.get(contractId)||undefined,
       barrier:c.barrier!=null&&Number.isFinite(Number(c.barrier))?Number(c.barrier):(contractBarrierRef.current.get(contractId)??null),
       symbol:String(c.underlying??c.underlying_symbol??c.symbol??contractSymbolRef.current.get(contractId)??'')||undefined
      };
      // Persist/emit result first, then settle even if this message omitted sell_time.
      mergeProfitTransactions([closedTx]);
      const settled=settleActiveContract(contractId,'proposal_open_contract');
      if(!settled)ws.unsubscribeContract(contractId);
      setLoadingProfit(false);
     });
      ws.subscribe('proposal',data=>{if(!data.proposal||activeContractRef.current!==null)return;const responseReqId=Number(data.req_id??data.echo_req?.req_id);if(latestProposalReqRef.current===null||responseReqId!==latestProposalReqRef.current)return;const requested=proposalRequestRef.current;setProposal({id:String(data.proposal.id||''),ask_price:Number(data.proposal.ask_price),payout:Number(data.proposal.payout),stake:Number(data.proposal.stake),contract_type:String(data.proposal.contract_type||''),symbol:data.proposal.symbol||data.proposal.underlying_symbol||requested?.symbol||'',duration:Number(data.proposal.duration),duration_unit:data.proposal.duration_unit,barrier:data.proposal.barrier,requested_contract_type:requested?.contractType,requested_barrier:requested?.barrier});setError(null)});
     ws.subscribe('buy',data=>{if(!data.buy)return;staleBuyRetryRef.current=false;setError(null);setBuying(false);const contractId=Number(data.buy.contract_id);if(Number.isFinite(contractId)&&contractId>0){pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;activeContractStartedAtRef.current=Date.now();lastActiveContractUpdateAtRef.current=Date.now();lastContractReconcileAtRef.current=0;portfolioAbsenceCountRef.current=0;sessionContractIdsRef.current.add(contractId);if(pendingBuyBotRef.current)contractBotRef.current.set(contractId,pendingBuyBotRef.current);pendingBuyBotRef.current=null;if(pendingBuyBarrierRef.current!==null)contractBarrierRef.current.set(contractId,pendingBuyBarrierRef.current);pendingBuyBarrierRef.current=null;const requestedSymbol=proposalRequestRef.current?.symbol;if(requestedSymbol)contractSymbolRef.current.set(contractId,requestedSymbol);activeContractRef.current=contractId;setActiveContractId(contractId);setContractStage('aberto');latestProposalReqRef.current=null;setProposal(null);ws.subscribeContract(contractId)}});ws.connect();
     connectionCheck=setInterval(()=>{if(cancelled)return;const connected=ws.isConnected();if(!connected)connectionWasUpRef.current=false;if(connected&&!connectionWasUpRef.current){connectionWasUpRef.current=true;const activeId=activeContractRef.current??activeContractStateRef.current;console.info('[DerivWS] Connection became available; reconciling pending trading state',{activeContractId:activeId,pendingBuyAgeMs:pendingBuyStartedAtRef.current?Date.now()-pendingBuyStartedAtRef.current:0});if(activeId!==null){lastContractReconcileAtRef.current=Date.now();ws.reconcileContract(activeId);lastPortfolioRequestAtRef.current=Date.now();portfolioRequestIdRef.current=ws.requestPortfolio();refresh(true);}if(pendingBuyStartedAtRef.current>0){lastPortfolioRequestAtRef.current=Date.now();portfolioRequestIdRef.current=ws.requestPortfolio();refresh(true);}}setIsConnected(connected);if(connected){
       // A WebSocket can remain OPEN while market-data delivery is silently dead.
       // Reconnect proactively so the trading loop cannot remain frozen waiting
       // forever for the next tick/proposal.
       if(ws.isStale(30000)){
         console.warn('[DerivWS] Stale tick stream detected; reconnecting.');
         connectionWasUpRef.current=false;
         ws.resumeConnection();
         setIsConnected(false);
         setIsAuthorized(false);
         if(pendingBuyStartedAtRef.current===0&&activeContractRef.current===null)setBuying(false);
         return;
       }
       setIsAuthorized(true);setError(prev=>prev==='Not authorized'?null:prev);ws.subscribeBalance();if(!initialProfitLoaded){initialProfitLoaded=true;refresh(true)}else refresh(false)
     }else setIsAuthorized(false)},500);
     contractWatchdog=window.setInterval(()=>{
      if(cancelled)return;
      const currentWs=wsRef.current;
      if(!currentWs?.isConnected())return;
      const now=Date.now();
      const activeId=activeContractRef.current??activeContractStateRef.current;
      if(activeId!==null){
       const age=now-(activeContractStartedAtRef.current||now);
       const silence=now-(lastActiveContractUpdateAtRef.current||activeContractStartedAtRef.current||now);
       if((age>=10000||silence>=8000)&&now-lastContractReconcileAtRef.current>=8000){
        lastContractReconcileAtRef.current=now;
        console.warn('[Deriv contract watchdog] No timely contract update; requesting contract status, portfolio and closed history',{contract_id:activeId,ageMs:age,silenceMs:silence,portfolioAbsenceChecks:portfolioAbsenceCountRef.current});
        currentWs.reconcileContract(activeId);currentWs.requestContractStatus(activeId);
        if(now-lastPortfolioRequestAtRef.current>=8000){lastPortfolioRequestAtRef.current=now;portfolioRequestIdRef.current=currentWs.requestPortfolio();}
        refresh(true);
       }
      }
      const pendingAge=pendingBuyStartedAtRef.current?now-pendingBuyStartedAtRef.current:0;
      if(pendingBuyStartedAtRef.current>0&&pendingAge>=8000&&now-pendingBuyLastRecoveryAtRef.current>=8000){
       pendingBuyLastRecoveryAtRef.current=now;
       console.warn('[Deriv buy acknowledgement watchdog] Buy acknowledgement missing; reconciling against portfolio and profit table',{ageMs:pendingAge,symbol:proposalRequestRef.current?.symbol,contractType:proposalRequestRef.current?.contractType,amount:proposalRequestRef.current?.amount,bot:pendingBuyBotRef.current});
       if(now-lastPortfolioRequestAtRef.current>=4000){lastPortfolioRequestAtRef.current=now;portfolioRequestIdRef.current=currentWs.requestPortfolio();}
       refresh(true);
      }
     },1000);
   }catch(err){if(!cancelled){setIsConnected(false);setIsAuthorized(false);setError(err instanceof Error?err.message:'Unable to initialize Deriv connection')}}};
   start();
   return()=>{cancelled=true;if(connectionCheck)clearInterval(connectionCheck);if(contractWatchdog)clearInterval(contractWatchdog);document.removeEventListener('visibilitychange',handleVisibility);window.removeEventListener('pageshow',handlePageShow);wsRef.current?.disconnect();wsRef.current=null;activeContractRef.current=null;activeContractStartedAtRef.current=0;lastActiveContractUpdateAtRef.current=0;lastContractReconcileAtRef.current=0;lastPortfolioRequestAtRef.current=0;portfolioRequestIdRef.current=null;portfolioAbsenceCountRef.current=0;connectionWasUpRef.current=false;pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyBotRef.current=null;contractBotRef.current.clear();contractBarrierRef.current.clear();contractSymbolRef.current.clear();latestProposalReqRef.current=null;closedContractsRef.current.clear();sessionContractIdsRef.current.clear();emittedClosedContractsRef.current.clear();processedSorosContractsRef.current.clear();setActiveContractId(null)};
 },[accountType,refreshProfitTable,mergeProfitTransactions,processSorosResult,restoreTradingCache]);
 const subscribeTicks=useCallback((symbol:string)=>wsRef.current?.subscribeTicks(symbol),[]);
 const fetchProfitTable=useCallback((options?:{limit?:number;offset?:number;sort?:'ASC'|'DESC'})=>{setLoadingProfit(true);wsRef.current?.getProfitTable({description:1,...options})},[]);
 const getTicksHistory=useCallback((symbol:string,count=5)=>wsRef.current?.getTicksHistory(symbol,count)??Promise.reject(new Error('WebSocket not connected')),[]);
 const getProposal=useCallback((symbol:string,contractType:string,amount:number,duration:number,barrier=0,useOriginalSoros=true)=>{if(activeContractRef.current!==null)return false;const s=sorosRef.current;const fallback=Math.max(TRADING_MIN_STAKE,Number(amount)||TRADING_MIN_STAKE);const recoveryDeficit=useOriginalSoros&&originalSorosEnabledRef.current?Math.max(0,Number(s.recoveryDeficit)||0):0;const effectiveAmount=useOriginalSoros&&originalSorosEnabledRef.current?(recoveryDeficit>0.01?Math.max(TRADING_MIN_STAKE,Number(s.stake)||Number((recoveryDeficit/Math.max(0.01,SOROS_WIN_MULTIPLIER-1)).toFixed(2))):Math.max(TRADING_MIN_STAKE,Number(s.level>0?s.stake:s.initialStake))):fallback;if(useOriginalSoros&&originalSorosEnabledRef.current&&s.level===0&&Math.abs(s.initialStake-effectiveAmount)>0.000001){const next={...s,stake:effectiveAmount,initialStake:effectiveAmount,enabled:true};sorosRef.current=next;setSoros(next);saveSoros(next)}setProposal(null);setError(null);proposalRequestRef.current={symbol,contractType,amount:effectiveAmount,duration,barrier};staleBuyRetryRef.current=false;const reqId=wsRef.current?.getProposal(symbol,contractType,effectiveAmount,duration,barrier);if(typeof reqId==='number')latestProposalReqRef.current=reqId;return typeof reqId==='number'},[]);
 const clearProposal=useCallback(()=>{latestProposalReqRef.current=null;setProposal(null)},[]);
 const buyDirect=useCallback((request:{symbol:string;contractType:string;amount:number;duration:number;barrier?:number;currency?:string},price:number,bot?:string,barrier?:number)=>{
   if(buying||activeContractRef.current!==null){const reason=buying?'buy acknowledgement already pending':'another active contract exists';console.warn('[Deriv buyDirect] Refused locally',{reason,buying,activeContractId:activeContractRef.current,requestedSymbol:request?.symbol,contractType:request?.contractType,amount:request?.amount});return false;}
   const ws=wsRef.current;
   const amount=Number(request?.amount),maxPrice=Number(price);
   if(!ws||!request?.symbol||!request?.contractType||!Number.isFinite(amount)||amount<=0||!Number.isFinite(maxPrice)||maxPrice<=0){
    setError('Parâmetros inválidos para compra directa na Deriv.');return false;
   }
   const normalized={...request,amount,currency:String(request.currency||'USD').toUpperCase()};
   proposalRequestRef.current={symbol:normalized.symbol,contractType:normalized.contractType,amount:normalized.amount,duration:normalized.duration,barrier:Number(normalized.barrier??0)};
   pendingBuyBotRef.current=bot?String(bot):null;
   pendingBuyBarrierRef.current=Number.isFinite(Number(barrier??normalized.barrier))?Number(barrier??normalized.barrier):null;
   pendingBuyStartedAtRef.current=Date.now();pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;
   staleBuyRetryRef.current=false;setProposal(null);setError(null);setBuying(true);
   const sent=ws.buyContractWithParameters(normalized,maxPrice);
   if(!sent){
    console.warn('[Deriv buyDirect] WebSocket refused to send direct buy',{connected:ws.isConnected(),symbol:normalized.symbol,contractType:normalized.contractType,amount:normalized.amount,currency:normalized.currency,duration:normalized.duration,barrier:normalized.barrier,price:maxPrice,bot});
    pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;setBuying(false);
    setError('Não foi possível enviar a compra directa à Deriv.');
   }
   return Boolean(sent);
  },[buying]);
 const buy=useCallback((proposalId:string,price:number,bot?:string,barrier?:number)=>{
   if(!proposalId||buying||activeContractRef.current!==null)return false;
   const ws=wsRef.current;
   if(!ws){setError('Não foi possível enviar a compra à Deriv.');return false;}
   pendingBuyBotRef.current=bot?String(bot):null;
   pendingBuyBarrierRef.current=Number.isFinite(Number(barrier))?Number(barrier):null;
   pendingBuyStartedAtRef.current=Date.now();pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;
   setBuying(true);
   // Match Izidro's execution cycle: purchase the exact proposal returned by
   // Deriv, using its proposal ID and ask_price as the maximum buy price.
   // Only the expired-proposal error handler above may fall back to parameters.
   staleBuyRetryRef.current=false;
   const sent=ws.buyContract(proposalId,price);
   if(!sent){
    console.warn('[Deriv buy] WebSocket refused to send proposal buy',{connected:ws.isConnected(),proposalId,price,bot,activeContractId:activeContractRef.current});
    pendingBuyStartedAtRef.current=0;pendingBuyLastRecoveryAtRef.current=0;pendingBuyAbsenceCountRef.current=0;pendingBuyBotRef.current=null;
    pendingBuyBarrierRef.current=null;
    setBuying(false);
    setProposal(null);
    setError('Não foi possível enviar a compra à Deriv.');
   }
   return Boolean(sent);
  },[buying]);
 const sell=useCallback((contractId:number)=>wsRef.current?.sellContract(contractId),[]);
 return{balance,tick,transaction,isConnected,isAuthorized,error,profitTransactions,profitCount,proposal,loadingProfit,buying,activeContractId,trackedContractId:activeContractRef.current??activeContractStateRef.current,contractClosedSeq,lastClosedTransaction,contractStage,subscribeTicks,fetchProfitTable,getTicksHistory,getProposal,clearProposal,buy,buyDirect,sell,soros,resetSoros,setSorosEnabled,setSorosStake,resetTradingSession};
}
