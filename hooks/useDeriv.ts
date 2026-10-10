'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance { balance:number; currency:string; loginid?:string }
interface Tick { symbol:string; quote:number; epoch:number }
interface Transaction { id:number; action:string; amount:number; currency:string; contract_id?:number }
interface ProfitTransaction { contract_id:number; buy_price:number; sell_price:number|null; payout:number; purchase_time:number; sell_time:number|null; contract_type:string; longcode?:string; profit_loss?:number; exit_tick?:number|string|null; exit_spot?:number|string|null; bot?:string; barrier?:number|null }
interface Proposal { id:string; ask_price:number; payout:number; stake:number; contract_type:string; symbol:string; duration:number; duration_unit:string; barrier?:number }
const TRADING_MIN_STAKE=0.35,SOROS_MIN=TRADING_MIN_STAKE,SOROS_MAX_WINS=3,SOROS_WIN_MULTIPLIER=1.95,SOROS_STORAGE='mozhyper-soros-state-v8',TRADING_SESSION_STORAGE='mozhyper-trading-session-v1',TRADING_CACHE_PREFIX='mozhyper-trading-cache-v2:',TRADING_CLEARED_AT_PREFIX='mozhyper-trading-cleared-at-v1:';
interface SorosState{level:number;stake:number;initialStake:number;accumulatedProfit:number;lossRetryCount:number;enabled:boolean;blocked:boolean}
const defaultSoros=(initialStake=SOROS_MIN):SorosState=>({level:0,stake:Math.max(SOROS_MIN,initialStake),initialStake:Math.max(SOROS_MIN,initialStake),accumulatedProfit:0,lossRetryCount:0,enabled:true,blocked:false});
function saveSoros(s:SorosState){if(typeof window==='undefined')return;try{sessionStorage.setItem(SOROS_STORAGE,JSON.stringify(s))}catch{}}
function loadSoros():SorosState|null{if(typeof window==='undefined')return null;try{const raw=sessionStorage.getItem(SOROS_STORAGE);if(!raw)return null;const s=JSON.parse(raw);if(!s||!Number.isFinite(Number(s.initialStake)))return null;const initial=Math.max(SOROS_MIN,Number(s.initialStake));const level=Math.max(0,Math.min(SOROS_MAX_WINS-1,Math.floor(Number(s.level)||0)));return{...defaultSoros(initial),...s,initialStake:initial,level,stake:level>0?Math.max(SOROS_MIN,Number(s.stake)||initial):initial,enabled:true,blocked:false,accumulatedProfit:0,lossRetryCount:0}}catch{return null}}
function clearSorosStorage(){if(typeof window==='undefined')return;try{sessionStorage.removeItem(SOROS_STORAGE);sessionStorage.removeItem('mozhyper-soros-state-v7');sessionStorage.removeItem('mozhyper-soros-state-v6')}catch{}}
function calculateProfitLoss(tx:Partial<ProfitTransaction>):number{const explicit=Number(tx.profit_loss);if(Number.isFinite(explicit)&&Math.abs(explicit)>0.000001)return explicit;const buy=Number(tx.buy_price),sell=Number(tx.sell_price);if(Number.isFinite(buy)&&Number.isFinite(sell))return sell-buy;return Number.isFinite(explicit)?explicit:0}
function cacheKey(accountType:'demo'|'real'){return `${TRADING_CACHE_PREFIX}${accountType}`}

export function useDeriv(accountType:'demo'|'real'='demo',onContractClosed?: (tx:ProfitTransaction)=>void,onContractBought?: (contractId:number)=>void,onBuyRejected?:()=>void){
 const wsRef=useRef<DerivWebSocket|null>(null),activeContractRef=useRef<number|null>(null),pendingBuyBotRef=useRef<string|null>(null),pendingBuyBarrierRef=useRef<number|null>(null),contractBotRef=useRef<Map<number,string>>(new Map()),contractBarrierRef=useRef<Map<number,number>>(new Map()),latestProposalReqRef=useRef<number|null>(null),proposalRequestRef=useRef<{symbol:string;contractType:string;amount:number;duration:number;barrier:number}|null>(null),staleBuyRetryRef=useRef(false),closedContractsRef=useRef<Map<number,ProfitTransaction>>(new Map()),sessionStartedAtRef=useRef(0),sessionContractIdsRef=useRef<Set<number>>(new Set()),emittedClosedContractsRef=useRef<Set<number>>(new Set()),sorosRef=useRef<SorosState>(defaultSoros()),processedSorosContractsRef=useRef<Set<number>>(new Set()),balanceCacheRef=useRef<Balance|null>(null),originalSorosEnabledRef=useRef(true);
 const[balance,setBalance]=useState<Balance|null>(null),[tick,setTick]=useState<Tick|null>(null),[transaction,setTransaction]=useState<Transaction|null>(null),[isConnected,setIsConnected]=useState(false),[isAuthorized,setIsAuthorized]=useState(false),[error,setError]=useState<string|null>(null),[profitTransactions,setProfitTransactions]=useState<ProfitTransaction[]>([]),[profitCount,setProfitCount]=useState(0),[proposal,setProposal]=useState<Proposal|null>(null),[loadingProfit,setLoadingProfit]=useState(false),[buying,setBuying]=useState(false),[contractClosedSeq,setContractClosedSeq]=useState(0),[lastClosedTransaction,setLastClosedTransaction]=useState<ProfitTransaction|null>(null),[activeContractId,setActiveContractId]=useState<number|null>(null),[contractStage,setContractStage]=useState<'analisando'|'aberto'|'fechado'>('analisando'),[soros,setSoros]=useState<SorosState>(()=>defaultSoros());
 const onContractClosedRef=useRef<((tx:ProfitTransaction)=>void)|undefined>(onContractClosed);
 onContractClosedRef.current=onContractClosed;
 const onContractBoughtRef=useRef<((contractId:number)=>void)|undefined>(onContractBought);
 onContractBoughtRef.current=onContractBought;
 const onBuyRejectedRef=useRef<(()=>void)|undefined>(onBuyRejected);
 onBuyRejectedRef.current=onBuyRejected;
 const saveTradingCache=useCallback(()=>{if(typeof window==='undefined'||!sessionStartedAtRef.current)return;try{const txs=Array.from(closedContractsRef.current.values()).filter(x=>x.sell_time&&Number(x.sell_time)>0).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,600);localStorage.setItem(cacheKey(accountType),JSON.stringify({sessionStartedAt:sessionStartedAtRef.current,balance:balanceCacheRef.current,transactions:txs,savedAt:Date.now()}))}catch{}},[accountType]);
 const restoreTradingCache=useCallback(()=>{if(typeof window==='undefined')return;try{const raw=localStorage.getItem(cacheKey(accountType));if(!raw)return;const cached=JSON.parse(raw);if(Number(cached?.sessionStartedAt)!==sessionStartedAtRef.current)return;if(cached.balance){balanceCacheRef.current=cached.balance;setBalance(cached.balance)}const txs=Array.isArray(cached.transactions)?cached.transactions:[];for(const tx of txs){const id=Number(tx.contract_id);if(Number.isFinite(id)&&id>0){closedContractsRef.current.set(id,tx);emittedClosedContractsRef.current.add(id)}}if(txs.length){const merged=Array.from(closedContractsRef.current.values()).filter(x=>x.sell_time&&Number(x.sell_time)>0).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time));setProfitTransactions(merged);setProfitCount(merged.length)}}catch{}},[accountType]);
 const syncSoros=useCallback((next:SorosState)=>{const initial=Math.max(SOROS_MIN,Number(next.initialStake)||SOROS_MIN);const level=Math.max(0,Math.min(SOROS_MAX_WINS-1,Math.floor(Number(next.level)||0)));const stake=level>0?Math.max(SOROS_MIN,Number(next.stake)||initial):initial;const normalized={...next,initialStake:initial,stake,accumulatedProfit:0,lossRetryCount:0,level,enabled:Boolean(next.enabled),blocked:false};sorosRef.current=normalized;setSoros(normalized);saveSoros(normalized)},[]);
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

  if(pnl<=0){
   // Uma perda encerra o ciclo Soros normal e volta à stake base.
   syncSoros(defaultSoros(base));
   return;
  }

  if(currentLevel<SOROS_MAX_WINS-1){
   const nextLevel=currentLevel+1;
   const nextStake=Number(executedStake.toFixed(2));
   syncSoros({
    level:nextLevel,
    stake:nextStake,
    initialStake:base,
    accumulatedProfit:Number((nextStake-base).toFixed(2)),
    lossRetryCount:0,
    enabled:true,
    blocked:false
   });
   return;
  }

  // Terceira vitória conclui o ciclo Soros; não altera o valor base.
  syncSoros(defaultSoros(base));
 },[syncSoros]);

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
    barrier:raw.barrier!=null&&Number.isFinite(Number(raw.barrier))?Number(raw.barrier):(contractBarrierRef.current.get(id)??previous?.barrier??null)
   };

   closedContractsRef.current.set(id,normalized);

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

   // Fallback de encerramento: o profit_table pode confirmar que o contrato
   // fechou mesmo quando o evento proposal_open_contract de encerramento
   // foi perdido durante uma atualização/reconexão do WebSocket.
   if(activeContractRef.current===Number(tx.contract_id)){
    activeContractRef.current=null;
    setActiveContractId(null);
    latestProposalReqRef.current=null;
    setProposal(null);
    setBuying(false);
    setContractClosedSeq(v=>v+1);
    setContractStage('fechado');
    window.setTimeout(()=>{
     if(activeContractRef.current===null)setContractStage('analisando');
    },1800);
    wsRef.current?.unsubscribeContract(Number(tx.contract_id));
   }
  }

  const merged=Array.from(closedContractsRef.current.values())
   .filter(x=>x.sell_time&&Number(x.sell_time)>0)
   .sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time));

  setProfitTransactions(merged);
  setProfitCount(merged.length);
  saveTradingCache();
 },[accountType,notifyClosedTransaction,saveTradingCache]);

 const refreshProfitTable=useCallback(()=>wsRef.current?.getProfitTable({limit:2000,offset:0,sort:'DESC',description:1}),[]);
 const resetTradingSession=useCallback(()=>{const now=Math.floor(Date.now()/1000);sessionStartedAtRef.current=now;closedContractsRef.current.clear();sessionContractIdsRef.current.clear();emittedClosedContractsRef.current.clear();processedSorosContractsRef.current.clear();balanceCacheRef.current=null;setBalance(null);setProfitTransactions([]);setProfitCount(0);setContractClosedSeq(0);clearSorosStorage();try{localStorage.removeItem(cacheKey(accountType));localStorage.setItem(TRADING_CLEARED_AT_PREFIX+accountType,String(now));sessionStorage.setItem(TRADING_SESSION_STORAGE,String(now))}catch{};const fresh=defaultSoros(sorosRef.current.initialStake||SOROS_MIN);sorosRef.current=fresh;setSoros(fresh);wsRef.current?.subscribeBalance()},[accountType]);















































 useEffect(()=>{let cancelled=false;let connectionCheck:ReturnType<typeof setInterval>|null=null;let initialProfitLoaded=false;let lastProfitRefresh=0;let storedStart=0;try{storedStart=Number(sessionStorage.getItem(TRADING_SESSION_STORAGE)||0)}catch{};sessionStartedAtRef.current=Number.isFinite(storedStart)&&storedStart>0?storedStart:Math.floor(Date.now()/1000);try{sessionStorage.setItem(TRADING_SESSION_STORAGE,String(sessionStartedAtRef.current))}catch{};closedContractsRef.current.clear();sessionContractIdsRef.current.clear();processedSorosContractsRef.current.clear();setProfitTransactions([]);setProfitCount(0);setLastClosedTransaction(null);setBalance(null);balanceCacheRef.current=null;restoreTradingCache();for(const id of closedContractsRef.current.keys())processedSorosContractsRef.current.add(id);setProposal(null);setError(null);setBuying(false);setContractClosedSeq(0);setActiveContractId(null);setContractStage('analisando');const restoredSoros=loadSoros()||defaultSoros();sorosRef.current=restoredSoros;setSoros(restoredSoros);
   const refresh=(force=false)=>{const now=Date.now();if(!force&&now-lastProfitRefresh<2000)return;lastProfitRefresh=now;setLoadingProfit(true);refreshProfitTable()};

   // Android/iOS suspendem timers e WebSockets quando a aplicação fica
   // minimizada. Ao voltar ao foreground, recriar a ligação e sincronizar
   // imediatamente o saldo e as operações fechadas.
   const resumeApp=()=>{
     if(cancelled)return;
     wsRef.current?.resumeConnection();
     setIsConnected(false);
     setIsAuthorized(false);
     setBuying(false);
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
     ws.subscribe('*',(data)=>{if(!data.error)return;const message=data.error.message||'Unknown Deriv error';if(data.echo_req?.forget!==undefined)return;if(data.error.code==='RateLimit'||/rate.?limit/i.test(message)){setLoadingProfit(false);return}if(/unknown contract/i.test(message)&&(data.echo_req?.profit_table||data.echo_req?.proposal_open_contract)){setLoadingProfit(false);return}if(data.echo_req?.buy){onBuyRejectedRef.current?.();setBuying(false);setProposal(null);activeContractRef.current=null;setActiveContractId(null);latestProposalReqRef.current=null;console.error('[Deriv buy rejected]',{message,code:data.error.code,proposal_id:data.echo_req.buy,price:data.echo_req.price});const expiredProposal=String(data.error.code||'').toLowerCase().includes('contractproposal')||/unknown contract proposal|proposal.{0,35}(expired|no longer available|not valid|not found)|(?:expired|invalid).{0,35}proposal/i.test(message);const previousRequest=proposalRequestRef.current;if(expiredProposal&&!staleBuyRetryRef.current&&previousRequest&&ws.isConnected()){staleBuyRetryRef.current=true;const freshReqId=ws.getProposal(previousRequest.symbol,previousRequest.contractType,previousRequest.amount,previousRequest.duration,previousRequest.barrier);if(typeof freshReqId==='number'){latestProposalReqRef.current=freshReqId;setError('A proposta expirou. A obter uma cotação nova e a tentar novamente.');return;}staleBuyRetryRef.current=false;}}if(data.echo_req?.proposal){setBuying(false);setProposal(null);latestProposalReqRef.current=null;const req=data.echo_req;console.error('[Deriv proposal rejected]',{message,code:data.error.code,contract_type:req.contract_type,symbol:req.underlying_symbol,duration:req.duration,duration_unit:req.duration_unit,barrier:req.barrier,amount:req.amount});}setError(data.echo_req?.proposal?'Proposta rejeitada pela Deriv: '+message:data.echo_req?.buy&&/unknown contract proposal/i.test(message)?'A proposta expirou ou deixou de ser válida. A tentar obter uma nova proposta.':message);if(data.error.code==='AuthorizationRequired'||data.error.code==='Unauthorized')setIsAuthorized(false)});
     ws.subscribe('authorize',data=>{if(data.authorize)setIsAuthorized(true)});ws.subscribe('balance',data=>{if(data.balance){balanceCacheRef.current=data.balance;setBalance(data.balance);saveTradingCache()}});ws.subscribe('tick',data=>{if(data.tick)setTick(data.tick)});ws.subscribe('transaction',data=>{if(data.transaction)setTransaction(data.transaction)});ws.subscribe('profit_table',data=>{if(data.profit_table){mergeProfitTransactions(data.profit_table.transactions||[]);setLoadingProfit(false)}});
     ws.subscribe('proposal_open_contract',data=>{const c=data.proposal_open_contract;if(!c)return;const contractId=Number(c.contract_id);if(!Number.isFinite(contractId)||contractId<=0)return;const buyPrice=Number(c.buy_price??0),sellPrice=c.sell_price==null?null:Number(c.sell_price),payout=Number(c.payout??0),profitLoss=calculateProfitLoss({buy_price:buyPrice,sell_price:sellPrice,profit_loss:c.profit_loss}),purchaseTime=Number(c.purchase_time||Math.floor(Date.now()/1000)),sellTime=c.sell_time?Number(c.sell_time):null;if(c.is_sold||c.status==='won'||c.status==='lost'){const closedTx:ProfitTransaction={contract_id:contractId,buy_price:buyPrice,sell_price:sellPrice,payout,purchase_time:purchaseTime,sell_time:sellTime,contract_type:c.contract_type||'',longcode:c.longcode,profit_loss:profitLoss,exit_tick:c.exit_tick??null,exit_spot:c.exit_spot??null,bot:contractBotRef.current.get(contractId)||undefined,barrier:contractBarrierRef.current.get(contractId)??(c.barrier!=null&&Number.isFinite(Number(c.barrier))?Number(c.barrier):null)};mergeProfitTransactions([closedTx]);setLoadingProfit(false);if(activeContractRef.current===contractId){activeContractRef.current=null;setActiveContractId(null);latestProposalReqRef.current=null;setProposal(null);setBuying(false);setContractClosedSeq(v=>v+1);setContractStage('fechado');window.setTimeout(()=>{if(activeContractRef.current===null)setContractStage('analisando')},1800)}ws.unsubscribeContract(contractId)}});
      ws.subscribe('proposal',data=>{if(!data.proposal||activeContractRef.current!==null)return;const responseReqId=Number(data.req_id??data.echo_req?.req_id);if(latestProposalReqRef.current===null||responseReqId!==latestProposalReqRef.current)return;setProposal({id:data.proposal.id,ask_price:Number(data.proposal.ask_price),payout:Number(data.proposal.payout),stake:Number(data.proposal.stake),contract_type:data.proposal.contract_type,symbol:data.proposal.symbol||data.proposal.underlying_symbol,duration:Number(data.proposal.duration),duration_unit:data.proposal.duration_unit,barrier:data.proposal.barrier});setError(null)});
     ws.subscribe('buy',data=>{if(!data.buy)return;staleBuyRetryRef.current=false;setBuying(false);const contractId=Number(data.buy.contract_id);if(Number.isFinite(contractId)&&contractId>0){sessionContractIdsRef.current.add(contractId);if(pendingBuyBotRef.current)contractBotRef.current.set(contractId,pendingBuyBotRef.current);pendingBuyBotRef.current=null;if(pendingBuyBarrierRef.current!==null)contractBarrierRef.current.set(contractId,pendingBuyBarrierRef.current);pendingBuyBarrierRef.current=null;activeContractRef.current=contractId;onContractBoughtRef.current?.(contractId);setActiveContractId(contractId);setContractStage('aberto');latestProposalReqRef.current=null;setProposal(null);ws.subscribeContract(contractId)}});ws.connect();
     connectionCheck=setInterval(()=>{if(cancelled)return;const connected=ws.isConnected();setIsConnected(connected);if(connected){
       // A WebSocket can remain OPEN while market-data delivery is silently dead.
       // Reconnect proactively so the trading loop cannot remain frozen waiting
       // forever for the next tick/proposal.
       if(ws.isStale(12000)){
         console.warn('[DerivWS] Stale tick stream detected; reconnecting.');
         ws.resumeConnection();
         setIsConnected(false);
         setIsAuthorized(false);
         setBuying(false);
         return;
       }
       setIsAuthorized(true);setError(prev=>prev==='Not authorized'?null:prev);ws.subscribeBalance();if(!initialProfitLoaded){initialProfitLoaded=true;refresh(true)}else refresh(false)
     }else setIsAuthorized(false)},500);
   }catch(err){if(!cancelled){setIsConnected(false);setIsAuthorized(false);setError(err instanceof Error?err.message:'Unable to initialize Deriv connection')}}};
   start();
   return()=>{cancelled=true;if(connectionCheck)clearInterval(connectionCheck);document.removeEventListener('visibilitychange',handleVisibility);window.removeEventListener('pageshow',handlePageShow);wsRef.current?.disconnect();wsRef.current=null;activeContractRef.current=null;pendingBuyBotRef.current=null;contractBotRef.current.clear();latestProposalReqRef.current=null;closedContractsRef.current.clear();sessionContractIdsRef.current.clear();emittedClosedContractsRef.current.clear();processedSorosContractsRef.current.clear();setActiveContractId(null)};
 },[accountType,refreshProfitTable,mergeProfitTransactions,processSorosResult,restoreTradingCache]);
 const subscribeTicks=useCallback((symbol:string)=>wsRef.current?.subscribeTicks(symbol),[]);
 const fetchProfitTable=useCallback((options?:{limit?:number;offset?:number;sort?:'ASC'|'DESC'})=>{setLoadingProfit(true);wsRef.current?.getProfitTable({description:1,...options})},[]);
 const getTicksHistory=useCallback((symbol:string,count=5)=>wsRef.current?.getTicksHistory(symbol,count)??Promise.reject(new Error('WebSocket not connected')),[]);
 const getProposal=useCallback((symbol:string,contractType:string,amount:number,duration:number,barrier=0,useOriginalSoros=true)=>{if(activeContractRef.current!==null)return false;const s=sorosRef.current;const fallback=Math.max(TRADING_MIN_STAKE,Number(amount)||TRADING_MIN_STAKE);const effectiveAmount=useOriginalSoros&&originalSorosEnabledRef.current?Math.max(TRADING_MIN_STAKE,Number(s.level>0?s.stake:s.initialStake)):fallback;if(useOriginalSoros&&originalSorosEnabledRef.current&&s.level===0&&Math.abs(s.initialStake-effectiveAmount)>0.000001){const next={...s,stake:effectiveAmount,initialStake:effectiveAmount,enabled:true};sorosRef.current=next;setSoros(next);saveSoros(next)}setProposal(null);setError(null);proposalRequestRef.current={symbol,contractType,amount:effectiveAmount,duration,barrier};staleBuyRetryRef.current=false;const reqId=wsRef.current?.getProposal(symbol,contractType,effectiveAmount,duration,barrier);if(typeof reqId==='number')latestProposalReqRef.current=reqId;return typeof reqId==='number'},[]);
 const clearProposal=useCallback(()=>{latestProposalReqRef.current=null;setProposal(null)},[]);
 const buy=useCallback((proposalId:string,price:number,bot?:string,barrier?:number)=>{if(!proposalId||buying||activeContractRef.current!==null)return false;pendingBuyBotRef.current=bot?String(bot):null;pendingBuyBarrierRef.current=Number.isFinite(Number(barrier))?Number(barrier):null;setBuying(true);const sent=wsRef.current?.buyContract(proposalId,price);if(!sent){pendingBuyBotRef.current=null;pendingBuyBarrierRef.current=null;setBuying(false);setProposal(null);setError('Não foi possível enviar a compra à Deriv.')}return!!sent},[buying]);
 const sell=useCallback((contractId:number)=>wsRef.current?.sellContract(contractId),[]);
 return{balance,tick,transaction,isConnected,isAuthorized,error,profitTransactions,profitCount,proposal,loadingProfit,buying,activeContractId,contractClosedSeq,lastClosedTransaction,contractStage,subscribeTicks,fetchProfitTable,getTicksHistory,getProposal,clearProposal,buy,sell,soros,resetSoros,setSorosEnabled,setSorosStake,resetTradingSession};
}
