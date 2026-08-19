'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance { balance: number; currency: string; loginid?: string; }
interface Tick { symbol: string; quote: number; epoch: number; }
interface Transaction { id: number; action: string; amount: number; currency: string; contract_id?: number; }
interface ProfitTransaction { contract_id: number; buy_price: number; sell_price: number | null; payout: number; purchase_time: number; sell_time: number | null; contract_type: string; longcode?: string; profit_loss?: number; exit_tick?: number | string | null; exit_spot?: number | string | null; }
interface Proposal { id: string; ask_price: number; payout: number; stake: number; contract_type: string; symbol: string; duration: number; duration_unit: string; barrier?: number; }

function calculateProfitLoss(tx: Partial<ProfitTransaction>): number {
  const explicit = Number(tx.profit_loss);
  if (Number.isFinite(explicit)) return explicit;
  const buyPrice = Number(tx.buy_price);
  const sellPrice = Number(tx.sell_price);
  if (Number.isFinite(buyPrice) && Number.isFinite(sellPrice)) return sellPrice - buyPrice;
  return 0;
}

export function useDeriv(accountType:'demo'|'real'='demo') {
  const wsRef = useRef<DerivWebSocket | null>(null);
  const activeContractRef = useRef<number | null>(null);
  const latestProposalReqRef = useRef<number | null>(null);
  const closedContractsRef = useRef<Map<number, ProfitTransaction>>(new Map());
  const sessionStartedAtRef = useRef<number>(Math.floor(Date.now() / 1000));
  const [balance,setBalance]=useState<Balance|null>(null);
  const [tick,setTick]=useState<Tick|null>(null);
  const [transaction,setTransaction]=useState<Transaction|null>(null);
  const [isConnected,setIsConnected]=useState(false);
  const [isAuthorized,setIsAuthorized]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [profitTransactions,setProfitTransactions]=useState<ProfitTransaction[]>([]);
  const [profitCount,setProfitCount]=useState(0);
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [loadingProfit,setLoadingProfit]=useState(false);
  const [buying,setBuying]=useState(false);
  const [contractClosedSeq,setContractClosedSeq]=useState(0);
  const [activeContractId,setActiveContractId]=useState<number|null>(null);

  const mergeProfitTransactions=useCallback((incoming:ProfitTransaction[])=>{
    for(const tx of incoming){
      const id=Number(tx.contract_id);
      const purchaseTime=Number(tx.purchase_time ?? 0);
      if(!Number.isFinite(id)||id<=0||!purchaseTime||purchaseTime<sessionStartedAtRef.current) continue;
      const previous=closedContractsRef.current.get(id);
      const mergedRaw:Partial<ProfitTransaction>={...previous,...tx};
      const normalized:ProfitTransaction={
        contract_id:id,buy_price:Number(mergedRaw.buy_price??0),sell_price:mergedRaw.sell_price==null?null:Number(mergedRaw.sell_price),payout:Number(mergedRaw.payout??0),purchase_time:Number(mergedRaw.purchase_time??purchaseTime),sell_time:mergedRaw.sell_time==null?null:Number(mergedRaw.sell_time),contract_type:String(mergedRaw.contract_type??''),longcode:mergedRaw.longcode,profit_loss:calculateProfitLoss(mergedRaw),exit_tick:mergedRaw.exit_tick??null,exit_spot:mergedRaw.exit_spot??null,
      };
      closedContractsRef.current.set(id,normalized);
    }
    const merged=Array.from(closedContractsRef.current.values()).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,50);
    setProfitTransactions(merged);setProfitCount(merged.length);
  },[]);

  const refreshProfitTable=useCallback(()=>{wsRef.current?.getProfitTable({limit:50,offset:0,sort:'DESC',description:1})},[]);

  useEffect(()=>{
    let cancelled=false; let connectionCheck:ReturnType<typeof setInterval>|null=null; let initialProfitLoaded=false; let lastProfitRefresh=0;
    sessionStartedAtRef.current=Math.floor(Date.now()/1000);
    closedContractsRef.current.clear();setProfitTransactions([]);setProfitCount(0);setBalance(null);setProposal(null);setError(null);setBuying(false);setContractClosedSeq(0);setActiveContractId(null);
    const refreshProfitThrottled=(force=false)=>{const now=Date.now();if(!force&&now-lastProfitRefresh<1500)return;lastProfitRefresh=now;setLoadingProfit(true);refreshProfitTable()};
    const start=async()=>{
      try{
        const response=await fetch(`/api/deriv/ws-url?account_type=${accountType}`,{cache:'no-store',credentials:'same-origin'});const session=await response.json().catch(()=>null);
        if(!response.ok||!session?.wsUrl)throw new Error(session?.error||`Unable to create Deriv WebSocket session (${response.status})`);if(cancelled)return;
        const ws=new DerivWebSocket(session.wsUrl);wsRef.current=ws;
        ws.subscribe('*',(data)=>{if(!data.error)return;const message=data.error.message||'Unknown Deriv error';if(data.error.code==='RateLimit'||/rate.?limit/i.test(message)){setLoadingProfit(false);return}if(/unknown contract/i.test(message)&&(data.echo_req?.profit_table||data.echo_req?.proposal_open_contract)){setLoadingProfit(false);return}if(data.echo_req?.buy){setBuying(false);setProposal(null);activeContractRef.current=null;setActiveContractId(null);latestProposalReqRef.current=null;}setError(message);if(data.error.code==='AuthorizationRequired'||data.error.code==='Unauthorized')setIsAuthorized(false)});
        ws.subscribe('authorize',data=>{if(data.authorize)setIsAuthorized(true)});
        ws.subscribe('balance',data=>{if(data.balance)setBalance(data.balance)});
        ws.subscribe('tick',data=>{if(data.tick)setTick(data.tick)});
        ws.subscribe('transaction',data=>{if(data.transaction)setTransaction(data.transaction)});
        ws.subscribe('profit_table',data=>{if(data.profit_table){mergeProfitTransactions(data.profit_table.transactions||[]);setLoadingProfit(false)}});
        ws.subscribe('proposal_open_contract',data=>{
          const c=data.proposal_open_contract;if(!c)return;const contractId=Number(c.contract_id);if(!Number.isFinite(contractId)||contractId<=0||activeContractRef.current!==contractId)return;
          const buyPrice=Number(c.buy_price??0);const sellPrice=c.sell_price==null?null:Number(c.sell_price);const payout=Number(c.payout??0);const profitLoss=calculateProfitLoss({buy_price:buyPrice,sell_price:sellPrice,profit_loss:c.profit_loss});const purchaseTime=Number(c.purchase_time||Math.floor(Date.now()/1000));const sellTime=c.sell_time?Number(c.sell_time):null;
          if(c.is_sold||c.status==='won'||c.status==='lost'){
            mergeProfitTransactions([{contract_id:contractId,buy_price:buyPrice,sell_price:sellPrice,payout,purchase_time:purchaseTime,sell_time:sellTime,contract_type:c.contract_type||'',longcode:c.longcode,profit_loss:profitLoss,exit_tick:c.exit_tick??null,exit_spot:c.exit_spot??null}]);
            setLoadingProfit(false);
            activeContractRef.current=null;
            setActiveContractId(null);
            latestProposalReqRef.current=null;
            setProposal(null);
            setBuying(false);
            setContractClosedSeq(v=>v+1);
            window.setTimeout(()=>{if(!cancelled)refreshProfitThrottled()},500);
          }
        });
        ws.subscribe('proposal',data=>{if(!data.proposal||activeContractRef.current!==null)return;const responseReqId=Number(data.req_id??data.echo_req?.req_id);if(latestProposalReqRef.current!==null&&responseReqId!==latestProposalReqRef.current)return;setProposal({id:data.proposal.id,ask_price:Number(data.proposal.ask_price),payout:Number(data.proposal.payout),stake:Number(data.proposal.stake),contract_type:data.proposal.contract_type,symbol:data.proposal.symbol||data.proposal.underlying_symbol,duration:Number(data.proposal.duration),duration_unit:data.proposal.duration_unit,barrier:data.proposal.barrier});setError(null)});
        ws.subscribe('buy',data=>{if(!data.buy)return;setBuying(false);const contractId=Number(data.buy.contract_id);if(Number.isFinite(contractId)&&contractId>0){activeContractRef.current=contractId;setActiveContractId(contractId);latestProposalReqRef.current=null;setProposal(null);ws.subscribeContract(contractId)}});
        ws.connect();
        connectionCheck=setInterval(()=>{if(cancelled)return;const connected=ws.isConnected();setIsConnected(connected);if(connected){setIsAuthorized(true);setError(prev=>prev==='Not authorized'?null:prev);ws.subscribeBalance();ws.subscribeTicks('R_100');if(!initialProfitLoaded){initialProfitLoaded=true;refreshProfitThrottled(true)}if(connectionCheck){clearInterval(connectionCheck);connectionCheck=null}}else setIsAuthorized(false)},250);
      }catch(err){if(!cancelled){setIsConnected(false);setIsAuthorized(false);setError(err instanceof Error?err.message:'Unable to initialize Deriv connection')}}
    };
    start();
    return()=>{cancelled=true;if(connectionCheck)clearInterval(connectionCheck);wsRef.current?.disconnect();wsRef.current=null;activeContractRef.current=null;latestProposalReqRef.current=null;closedContractsRef.current.clear();setActiveContractId(null)};
  },[accountType,refreshProfitTable,mergeProfitTransactions]);

  const subscribeTicks=useCallback((symbol:string)=>wsRef.current?.subscribeTicks(symbol),[]);
  const fetchProfitTable=useCallback((options?:{limit?:number;offset?:number;sort?:'ASC'|'DESC'})=>{setLoadingProfit(true);wsRef.current?.getProfitTable({description:1,...options})},[]);
  const getProposal=useCallback((symbol:string,contractType:string,amount:number,duration:number,barrier=5)=>{if(activeContractRef.current!==null)return false;setProposal(null);setError(null);const reqId=wsRef.current?.getProposal(symbol,contractType,Math.max(.5,amount),duration,barrier);if(reqId!==undefined)latestProposalReqRef.current=reqId;return reqId!==undefined},[]);
  const buy=useCallback((proposalId:string,price:number)=>{if(!proposalId||buying||activeContractRef.current!==null)return false;setBuying(true);const sent=wsRef.current?.buyContract(proposalId,price);if(!sent)setBuying(false);return !!sent},[buying]);
  const sell=useCallback((contractId:number)=>wsRef.current?.sellContract(contractId),[]);
  return {balance,tick,transaction,isConnected,isAuthorized,error,profitTransactions,profitCount,proposal,loadingProfit,buying,activeContractId,contractClosedSeq,subscribeTicks,fetchProfitTable,getProposal,buy,sell};
}